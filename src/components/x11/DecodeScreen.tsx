import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/codec";
import { decodeAny, type Decoded } from "@/lib/codec2";

export type OkDecoded = Extract<Decoded, { status: "ok" }>;

function run(d: OkDecoded) {
  let bytes = d.bytes;
  let mime = d.mime;

  // CSS and JavaScript are source resources, not standalone browser documents.
  // Wrap them in a tiny HTML document so a root-fragment link actually runs them.
  if (mime.includes("css")) {
    const css = new TextDecoder().decode(bytes).replace(/<\/style/gi, "<\\/style");
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main><h1>x11 CSS document</h1><p>The linked stylesheet is active on this page.</p><button>Example button</button></main></body></html>`;
    bytes = new TextEncoder().encode(html);
    mime = "text/html";
  } else if (mime.includes("javascript") || mime.includes("ecmascript")) {
    const js = new TextDecoder().decode(bytes).replace(/<\/script/gi, "<\\/script");
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script>try{\n${js}\n}catch(e){const n=document.createElement("pre");n.style.cssText="white-space:pre-wrap;color:#b00020";n.textContent=e.stack||String(e);document.body.append(n)}</script></body></html>`;
    bytes = new TextEncoder().encode(html);
    mime = "text/html";
  }

  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  location.replace(url);
}

export function DecodeScreen({ payload, onEdit }: { payload: string; onEdit: (d: OkDecoded | null) => void }) {
  const [res, setRes] = useState<Decoded | null>(null);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [count, setCount] = useState(3);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let active = true;
    decodeAny(payload).then((d) => {
      if (!active) return;
      if (d.status === "ok" && d.instant) return run(d);
      setRes(d);
    }).catch((error) => {
      if (active) setRes({ status: "error", reason: error instanceof Error ? error.message : "Unable to decode this link" });
    });
    return () => { active = false; };
  }, [payload]);

  const ok = res?.status === "ok" ? res : null;
  useEffect(() => {
    if (!ok || paused) return;
    if (count <= 0) return run(ok);
    const timer = setTimeout(() => setCount((c) => c - 1), 600);
    return () => clearTimeout(timer);
  }, [count, paused, ok]);

  const unlock = async () => {
    const d = await decodeAny(payload, pw);
    if (d.status === "ok") { if (d.instant) return run(d); setRes(d); }
    else setPwError(d.status === "error" ? d.reason : "Wrong password");
  };

  if (!res) return <div className="grid min-h-screen place-items-center"><div className="bg-gradient-primary shadow-glow size-10 animate-pulse rounded-2xl" /></div>;
  const failed = res.status === "error";
  const locked = res.status === "locked";
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="liquid animate-fade-up w-full max-w-md rounded-3xl p-8 text-center">
        <div className={`mx-auto mb-6 grid size-16 place-items-center rounded-2xl font-mono-ui text-lg font-bold ${failed ? "bg-destructive/15 text-destructive" : "bg-gradient-primary text-primary-foreground animate-pulse-ring shadow-glow"}`}>
          {failed ? "!" : locked ? <Lock className="size-6" /> : paused ? "x11" : count}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{failed ? "This link couldn’t be opened" : locked ? "This link is password protected" : "Opening shared content"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{failed ? res.reason : locked ? "Enter the password to unlock it. It is checked only in your browser." : ok && `${ok.meta.name ? ok.meta.name + " · " : ""}${ok.mime} · ${formatBytes(ok.bytes.length)}`}</p>
        {locked && <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); void unlock(); }}>
          <input autoFocus type="password" value={pw} onChange={(e) => { setPw(e.target.value); setPwError(""); }} placeholder="Password" className="liquid h-10 flex-1 rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <Button variant="hero" type="submit" disabled={!pw}>Unlock</Button>
        </form>}
        {pwError && <p className="mt-2 text-xs text-destructive">{pwError}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {ok && <Button variant="hero" onClick={() => run(ok)}>Run now</Button>}
          {ok && !paused && <Button variant="outline" onClick={() => setPaused(true)}>Pause</Button>}
          {!locked && <Button variant="outline" onClick={() => onEdit(ok)}>{failed ? "Go to editor" : "Open in editor"}</Button>}
        </div>
      </div>
    </div>
  );
}