import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fetchRemote } from "@/lib/server.functions";
import { b64urlDecode } from "@/lib/codec2";

const ALLOW = ["fullscreen", "autoplay", "clipboard-read", "clipboard-write", "camera", "microphone", "geolocation", "display-capture", "encrypted-media", "picture-in-picture", "payment", "web-share", "gamepad", "midi", "usb", "xr-spatial-tracking"];
const SANDBOX = ["allow-scripts", "allow-same-origin", "allow-forms", "allow-popups", "allow-modals", "allow-downloads", "allow-top-navigation", "allow-pointer-lock", "allow-presentation", "allow-storage-access-by-user-activation"];

type Props = {
  onClose: () => void;
  onFetched: (r: { name: string; mime: string; bytes: Uint8Array }) => void;
  onEmbed: (html: string) => void;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function UrlToolDialog({ onClose, onFetched, onEmbed }: Props) {
  const [tab, setTab] = useState<"embed" | "fetch">("embed");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [useTitle, setUseTitle] = useState(true);
  const [favicon, setFavicon] = useState(true);
  const [allow, setAllow] = useState<string[]>(["fullscreen", "autoplay", "clipboard-write", "encrypted-media", "picture-in-picture"]);
  const [sandboxOn, setSandboxOn] = useState(false);
  const [sandbox, setSandbox] = useState<string[]>(["allow-scripts", "allow-same-origin", "allow-forms", "allow-popups"]);
  const [noReferrer, setNoReferrer] = useState(true);
  const [lazy, setLazy] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const normalized = () => {
    const u = url.trim();
    if (!u) return null;
    try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).toString(); } catch { return null; }
  };

  const doFetch = async () => {
    const u = normalized();
    if (!u) { toast.error("Enter a valid URL"); return; }
    setBusy(true);
    try {
      let mime = "", bytes: Uint8Array | null = null;
      try {
        const r = await fetch(u);
        if (r.ok) { mime = (r.headers.get("content-type") || "").split(";")[0] ?? ""; bytes = new Uint8Array(await r.arrayBuffer()); }
      } catch { /* CORS — fall back to server */ }
      if (!bytes) {
        const r = await fetchRemote({ data: { url: u } });
        if (!r.ok) throw new Error(r.error);
        mime = r.mime ?? "";
        bytes = b64urlDecode(r.b64.replace(/\+/g, "-").replace(/\//g, "_"));
      }
      const name = new URL(u).pathname.split("/").pop() || new URL(u).hostname;
      onFetched({ name, mime: mime || "application/octet-stream", bytes });
      onClose();
    } catch (e) {
      toast.error("Couldn't fetch that URL", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  };

  const doEmbed = () => {
    const u = normalized();
    if (!u) { toast.error("Enter a valid URL"); return; }
    const host = new URL(u).hostname;
    const t = useTitle ? (title.trim() || host) : "";
    const attrs = [
      `src="${esc(u)}"`,
      allow.length ? `allow="${allow.join("; ")}"` : "",
      allow.includes("fullscreen") ? "allowfullscreen" : "",
      sandboxOn ? `sandbox="${sandbox.join(" ")}"` : "",
      noReferrer ? `referrerpolicy="no-referrer"` : "",
      lazy ? `loading="lazy"` : "",
    ].filter(Boolean).join(" ");
    onEmbed(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${t ? `  <title>${esc(t)}</title>\n` : ""}${favicon ? `  <link rel="icon" href="https://www.google.com/s2/favicons?domain=${esc(host)}&sz=64">\n` : ""}  <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%;display:block}</style>
</head>
<body>
  <iframe ${attrs}></iframe>
</body>
</html>`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="liquid animate-fade-up max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="liquid inline-flex rounded-full p-1 text-sm">
          {(["embed", "fetch"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 transition ${tab === t ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "embed" ? "Display URL in iframe" : "Fetch from URL"}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {tab === "embed"
            ? "Builds a full-screen page that shows the website inside a frame. Some sites block being framed."
            : "Downloads the page or file and puts its contents into the link (up to 8 MB)."}
        </p>
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com"
          onKeyDown={(e) => e.key === "Enter" && (tab === "embed" ? doEmbed() : doFetch())}
          className="liquid mt-4 h-11 w-full rounded-xl px-4 font-mono-ui text-sm outline-none focus:ring-2 focus:ring-ring" />

        {tab === "embed" && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Set tab title" on={useTitle} set={setUseTitle} />
              <Row label="Use site's favicon" on={favicon} set={setFavicon} />
              <Row label="Hide referrer" on={noReferrer} set={setNoReferrer} />
              <Row label="Lazy load" on={lazy} set={setLazy} />
            </div>
            {useTitle && (
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tab title (defaults to the site name)"
                className="liquid h-10 w-full rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
            )}
            <Chips title="allow= permissions" all={ALLOW} on={allow} toggle={(v) => toggle(allow, setAllow, v)} />
            <div>
              <Row label="Sandbox the frame" on={sandboxOn} set={setSandboxOn} />
              {sandboxOn && <div className="mt-3"><Chips title="sandbox= rules" all={SANDBOX} on={sandbox} toggle={(v) => toggle(sandbox, setSandbox, v)} /></div>}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="hero" disabled={busy || !url.trim()} onClick={tab === "embed" ? doEmbed : doFetch}>
            {busy ? "Fetching…" : tab === "embed" ? "Create embed" : "Fetch"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="liquid flex cursor-pointer items-center justify-between rounded-xl px-4 py-2.5 text-sm">
      {label} <Switch checked={on} onCheckedChange={set} />
    </label>
  );
}

function Chips({ title, all, on, toggle }: { title: string; all: string[]; on: string[]; toggle: (v: string) => void }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {all.map((a) => (
          <button key={a} onClick={() => toggle(a)}
            className={`rounded-full border px-3 py-1 font-mono-ui text-[11px] transition ${on.includes(a) ? "border-primary/60 bg-primary/15 text-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"}`}>
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}
