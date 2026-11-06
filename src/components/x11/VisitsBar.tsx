import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { recordVisit, type VisitStats } from "@/lib/server.functions";

let pending: Promise<VisitStats | null> | null = null;

function deviceId() {
  let id = localStorage.getItem("x11:device");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("x11:device", id); }
  return id;
}

/** Records the visit once per page load (StrictMode-safe) and returns stats. */
export function trackVisit(kind: "main" | "shared") {
  if (!pending) pending = recordVisit({ data: { deviceId: deviceId(), kind } }).catch(() => null);
  return pending;
}

export function VisitsBar() {
  const [s, setS] = useState<VisitStats | null | undefined>(undefined);
  useEffect(() => { trackVisit("main").then(setS); }, []);

  const items: [string, string | number][] = s
    ? [
        ["Total visits", s.total], ["Main site", s.main], ["Shared opens", s.shared], ["Last 24h", s.today],
        ["Devices", s.devices], ["IPs", s.ips], ["Networks", s.networks],
        ["This device", `${s.thisDevice} · #${s.deviceHash.slice(0, 6)}`],
        ["This IP", `${s.thisIp} · #${s.ipHash.slice(0, 6)}`],
        ["This network", `${s.thisNetwork} · #${s.networkHash.slice(0, 6)}`],
      ]
    : [];

  return (
    <div className="liquid z-10 mx-3 mt-2 flex shrink-0 items-center gap-3 overflow-x-auto rounded-full px-4 py-1.5 text-[11px]">
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-primary">
        <Activity className="size-3.5" /> Visits
      </span>
      {s === undefined && <span className="text-muted-foreground">Counting…</span>}
      {s === null && <span className="text-muted-foreground">Stats unavailable right now</span>}
      {items.map(([k, v]) => (
        <span key={k} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-mono-ui text-foreground">{typeof v === "number" ? v.toLocaleString() : v}</span>
        </span>
      ))}
      <span className="ml-auto shrink-0 text-muted-foreground/70" title="IP addresses are never stored, only salted one-way hashes.">hashed · anonymous</span>
    </div>
  );
}
