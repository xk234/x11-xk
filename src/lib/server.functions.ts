import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

async function sha(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export type VisitStats = {
  total: number; main: number; shared: number; today: number;
  devices: number; ips: number; networks: number;
  thisDevice: number; thisIp: number; thisNetwork: number;
  deviceHash: string; ipHash: string; networkHash: string;
};

/** Records one visit (IPs are only ever stored as salted hashes) and returns site-wide stats. */
export const recordVisit = createServerFn({ method: "POST" })
  .inputValidator((d: { deviceId: string; kind: "main" | "shared" }) => ({
    deviceId: String(d.deviceId).slice(0, 64),
    kind: d.kind === "shared" ? "shared" : "main",
  }))
  .handler(async ({ data }): Promise<VisitStats | null> => {
    try {
      const ip =
        getRequestHeader("cf-connecting-ip") ||
        getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const net = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip.split(".").slice(0, 3).join(".");
      const salt = "x11-visits:" + (process.env.SUPABASE_URL ?? "");
      const [deviceHash, ipHash, networkHash] = await Promise.all([
        sha(salt + "d:" + data.deviceId), sha(salt + "i:" + ip), sha(salt + "n:" + net),
      ]);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("visits").insert({ device_hash: deviceHash, ip_hash: ipHash, network_hash: networkHash, kind: data.kind });
      const { data: stats, error } = await supabaseAdmin.rpc("visit_stats", { p_device: deviceHash, p_ip: ipHash, p_net: networkHash });
      if (error) throw error;
      return { ...(stats as Omit<VisitStats, "deviceHash" | "ipHash" | "networkHash">), deviceHash, ipHash, networkHash };
    } catch (e) {
      console.error("recordVisit failed", e);
      return null;
    }
  });

/** Fetches a public http(s) URL server-side (avoids CORS) and returns it as base64. Max 8 MB. */
export const fetchRemote = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string }) => {
    const u = new URL(String(d.url));
    if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https links are supported");
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) throw new Error("Private addresses are not allowed");
    return { url: u.toString() };
  })
  .handler(async ({ data }) => {
    const res = await fetch(data.url, { redirect: "follow", headers: { "user-agent": "x11-fetch/2.0" } });
    if (!res.ok) return { ok: false as const, error: `Server answered ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return { ok: false as const, error: "File is larger than 8 MB" };
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { ok: true as const, mime: (res.headers.get("content-type") || "application/octet-stream").split(";")[0], b64: btoa(bin) };
  });
