import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  Copy, ExternalLink, Download, Upload, Link2, Trash2, Wand2, WrapText, Eye, EyeOff,
  History, QrCode, Sparkles, X,
} from "lucide-react";
import type { OnMount } from "@monaco-editor/react";

import { Button } from "@/components/ui/button";
import { DecodeScreen } from "@/components/x11/DecodeScreen";
import { InfoDialog } from "@/components/x11/InfoDialog";
import { UrlToolDialog } from "@/components/x11/UrlToolDialog";
import { decodePayload, formatBytes, payloadFromUrl } from "@/lib/codec";
import { encodeV2, processImage, type Level, type RewriteOptions } from "@/lib/codec2";
import { EXAMPLES, LANGS, MIMES, langFromFilename } from "@/lib/examples";

const CodeEditor = lazy(() => import("@/components/x11/CodeEditor"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "x11 Decompiler — Share code inside a link" },
      { name: "description", content: "Compress HTML, SVG or any code into a single shareable URL. Live preview, QR codes, history and instant decoding." },
      { property: "og:title", content: "x11 Decompiler — Share code inside a link" },
      { property: "og:description", content: "Compress any page or snippet into a self-contained URL that opens instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type HistoryItem = { url: string; mime: string; size: number; at: number; title: string };
const DRAFT_KEY = "x11:draft";
const HIST_KEY = "x11:history";

function Index() {
  const [mode, setMode] = useState<"loading" | "decode" | "studio">("loading");
  const [payload, setPayload] = useState("");

  useEffect(() => {
    const currentPayload = location.hash.slice(1);
    if (currentPayload) {
      setPayload(currentPayload);
      setMode("decode");
    } else setMode("studio");
  }, []);

  if (mode === "loading") return <div className="min-h-screen" />;
  if (mode === "decode")
    return (
      <DecodeScreen
        payload={payload}
        onEdit={(d) => {
          if (d && d.text !== null) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ code: d.text, mime: d.mime }));
          }
          history.replaceState(null, "", location.pathname);
          setMode("studio");
        }}
      />
    );
  return <Studio />;
}

function previewDocument(code: string, mime: string) {
  if (mime.includes("css")) {
    const safeCss = code.replace(/<\/style/gi, "<\\/style");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${safeCss}</style></head><body><main id="x11-css-preview"><h1>CSS preview</h1><p>Your stylesheet is running in this isolated preview.</p><button>Example button</button></main></body></html>`;
  }
  if (mime.includes("javascript") || mime.includes("ecmascript")) {
    const safeCode = code.replace(/<\/script/gi, "<\\/script");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui;padding:20px;color:#ddd;background:#111}</style></head><body><div id="app"></div><script>addEventListener("error",e=>{const n=document.createElement("pre");n.style.cssText="white-space:pre-wrap;color:#ff8b8b";n.textContent=e.message+" ("+e.lineno+")";document.body.append(n)});try{\n${safeCode}\n}catch(e){const n=document.createElement("pre");n.style.cssText="white-space:pre-wrap;color:#ff8b8b";n.textContent=e.stack||String(e);document.body.append(n)}</script></body></html>`;
  }
  return code;
}

function guessLang(mime: string) {
  if (mime.includes("html")) return "html";
  if (mime.includes("svg") || mime.includes("xml")) return "xml";
  if (mime.includes("javascript")) return "javascript";
  if (mime.includes("json")) return "json";
  if (mime.includes("css")) return "css";
  if (mime.includes("markdown")) return "markdown";
  if (mime.includes("yaml")) return "yaml";
  return "plaintext";
}

function Studio() {
  const [code, setCode] = useState("");
  const [lang, setLang] = useState("html");
  const [mime, setMime] = useState("text/html");
  const [customMimeOpen, setCustomMimeOpen] = useState(false);
  const [customMime, setCustomMime] = useState("");
  const [wrap, setWrap] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewCode, setPreviewCode] = useState("");
  const [hist, setHist] = useState<HistoryItem[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [compression, setCompression] = useState<Level>("max");
  const [rewrite, setRewrite] = useState<RewriteOptions>({});
  const [password, setPassword] = useState("");
  const [instant, setInstant] = useState(false);
  const [urlToolOpen, setUrlToolOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [theme, setTheme] = useState("crimson");
  const [binaryData, setBinaryData] = useState<Uint8Array | null>(null);
  const [binaryName, setBinaryName] = useState("");
  const [imageOptimize, setImageOptimize] = useState(true);
  const [imageMaxSide, setImageMaxSide] = useState(4096);
  const [imageQuality, setImageQuality] = useState(0.86);
  const [imageFormat, setImageFormat] = useState<"original" | "image/webp" | "image/jpeg" | "image/png">("original");
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // restore draft, history, and theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("x11:theme");
    if (savedTheme) setTheme(savedTheme);
    setMounted(true);
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d?.code) {
        setCode(d.code);
        const m = d.mime || "text/html";
        setMime(m);
        setLang(guessLang(m));
      }
      setHist(JSON.parse(localStorage.getItem(HIST_KEY) || "[]"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("x11:theme", theme);
  }, [theme]);

  // autosave + debounced preview
  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ code, mime }));
      setPreviewCode(code);
    }, 350);
    return () => clearTimeout(t);
  }, [code, mime, mounted]);

  const base = mounted ? `${location.origin}/` : "";
  const [payload, setPayload] = useState("");
  const sourceBytes = useMemo(() => binaryData ?? new TextEncoder().encode(previewCode), [binaryData, previewCode]);
  useEffect(() => {
    let active = true;
    if (!sourceBytes.length) { setPayload(""); return; }
    encodeV2({ mime, bytes: sourceBytes, meta: binaryName ? { name: binaryName } : {}, level: compression, instant, rewrite, ...(password ? { password } : {}) })
      .then((value) => { if (active) setPayload(value); })
      .catch((error) => { console.error(error); if (active) setPayload(""); });
    return () => { active = false; };
  }, [sourceBytes, mime, compression, instant, rewrite, password, binaryName]);
  const url = payload ? `${base}#${payload}` : "";
  const rawUrl = payload ? `${base}r?data=${encodeURIComponent(payload)}` : "";
  const rawSupported = /^(image\/(png|jpeg|webp|gif|avif|bmp|svg\+xml|x-icon)|audio\/|video\/|font\/|application\/(pdf|font-woff|font-woff2|font-sfnt|x-font-ttf|octet-stream|vnd\.ms-fontobject))$/i.test(mime);
  const origBytes = sourceBytes.length;
  const ratio = origBytes ? Math.max(0, (1 - payload.length / origBytes) * 100) : 0;

  const limit =
    url.length === 0 ? null
    : url.length <= 2000 ? { label: "Works everywhere", tone: "text-success", pct: url.length / 2000 }
    : url.length <= 8000 ? { label: "Fine in browsers, too long for some chat apps", tone: "text-warning", pct: url.length / 8000 }
    : { label: "Very long — may break when shared", tone: "text-destructive", pct: 1 };

  const remember = useCallback(() => {
    if (!url) return;
    const title = previewCode.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || (previewCode.trim().split("\n")[0]?.slice(0, 48) ?? "");
    const item: HistoryItem = { url, mime, size: url.length, at: Date.now(), title };
    setHist((h) => {
      const next = [item, ...h.filter((x) => x.url !== url)].slice(0, 12);
      localStorage.setItem(HIST_KEY, JSON.stringify(next));
      return next;
    });
  }, [url, mime, previewCode, binaryName]);

  const copy = useCallback(async () => {
    if (!url) { toast.error("Nothing to share yet — write something first"); return; }
    await navigator.clipboard.writeText(url);
    remember();
    toast.success("Link copied", { description: `${url.length.toLocaleString()} characters` });
  }, [url, remember]);

  const open = useCallback(() => {
    if (!url) { toast.error("Nothing to open yet"); return; }
    remember();
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url, remember]);

  const download = () => {
    if (!sourceBytes.length) return;
    const ext = mime.includes("html") ? "html" : mime.includes("svg") ? "svg" : mime.includes("json") ? "json" : mime.includes("css") ? "css" : mime.includes("javascript") ? "js" : "bin";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sourceBytes as BlobPart], { type: mime }));
    a.download = binaryName || `x11-export.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadFile = async (f: File) => {
    let bytes = new Uint8Array(await f.arrayBuffer());
    const l = langFromFilename(f.name);
    let detectedMime = (l !== "plaintext" ? LANGS.find((x) => x.value === l)?.mime : undefined) ?? (f.type || "text/plain");
    if (imageOptimize && detectedMime.startsWith("image/")) {
      try {
        const processed = await processImage(new Blob([bytes as BlobPart], { type: detectedMime }), { maxSide: imageMaxSide, quality: imageQuality, format: imageFormat });
        if (processed) { bytes = new Uint8Array(await processed.blob.arrayBuffer()); detectedMime = processed.blob.type || detectedMime; }
      } catch (error) { console.warn("Image processing skipped", error); }
    }
    setMime(detectedMime);
    setCustomMimeOpen(false);
    setCustomMime("");
    setBinaryName(f.name);
    if (/^text\//i.test(detectedMime) || /json|javascript|xml|svg|yaml/i.test(detectedMime)) {
      setBinaryData(null); setCode(new TextDecoder().decode(bytes)); setLang(l);
    } else { setBinaryData(bytes); setCode(""); setLang("plaintext"); }
    toast.success(`Loaded ${f.name}`);
  };

  const importLink = async () => {
    const input = payloadFromUrl(importText);
    const decoded = await decodeAny(input);
    if (decoded.status === "locked") { toast.error("Password-protected links must be opened directly to unlock."); return; }
    if (decoded.status === "ok") {
      setMime(decoded.mime); setBinaryName(decoded.meta.name || "");
      if (decoded.text !== null) { setBinaryData(null); setCode(decoded.text); setLang(guessLang(decoded.mime)); }
      else { setCode(""); setBinaryData(decoded.bytes); setLang("plaintext"); }
      setImportOpen(false); setImportText(""); toast.success("Content imported"); return;
    }
    const legacy = decodePayload(input);
    if (!legacy) { toast.error(decoded.reason || "Invalid x11 link or blocked URL"); return; }
    setBinaryData(null); setBinaryName(""); setCode(legacy.content); setMime(legacy.mime); setLang(guessLang(legacy.mime));
    setImportOpen(false); setImportText(""); toast.success("Legacy link decoded");
  };

  const format = () => editorRef.current?.getAction("editor.action.formatDocument")?.run();

  // keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); copy(); }
      if (mod && e.key === "Enter") { e.preventDefault(); open(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [copy, open]);

  const previewable = !binaryData && (mime.includes("html") || mime.includes("svg") || mime.includes("css") || mime.includes("javascript") || mime.includes("ecmascript"));

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFile(f);
      }}
    >
      {/* Top bar */}
      <header className="glass z-20 flex shrink-0 items-center justify-between gap-4 border-b px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-primary shadow-glow grid size-9 place-items-center rounded-xl font-mono-ui text-sm font-bold text-primary-foreground">x11</div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Decompiler</div>
            <div className="text-[11px] text-muted-foreground">Your whole page, inside one link</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="mr-1 hidden items-center gap-1 md:flex">
            {EXAMPLES.map((ex) => (
              <Button key={ex.name} variant="ghost" size="sm" onClick={() => { setBinaryData(null); setBinaryName(""); setCode(ex.code); setLang(ex.lang); setMime(ex.mime); }}>
                <Sparkles /> {ex.name}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload /> Open file</Button>
          <Button variant="outline" size="sm" onClick={() => setUrlToolOpen(true)}>URL tools</Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Link2 /> Decode link</Button>
          <Button variant="ghost" size="icon" title="Update history and TODO" onClick={() => setInfoOpen(true)}>Info</Button>
          <Button variant="ghost" size="icon" title="Clear" onClick={() => { setCode(""); setBinaryData(null); setBinaryName(""); }}><Trash2 /></Button>
          <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_360px]">
        {/* Editor + preview */}
        <div className="glass flex min-h-0 min-w-0 flex-col rounded-2xl">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.025] px-3 py-2">
            <div className="flex items-center gap-2">
              <select
                aria-label="Language"
                value={lang}
                onChange={(e) => {
                  const next = LANGS.find((item) => item.value === e.target.value);
                  setLang(e.target.value);
                  if (next?.mime) setMime(next.mime);
                  setCustomMimeOpen(false);
                  setCustomMime("");
                }}
                className="h-8 rounded-md border bg-secondary px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <Button variant="ghost" size="sm" onClick={format}><Wand2 /> Format</Button>
              <Button variant={wrap ? "secondary" : "ghost"} size="sm" onClick={() => setWrap(!wrap)}><WrapText /> Wrap</Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden font-mono-ui text-[11px] text-muted-foreground sm:inline">
                {code.split("\n").length} lines · {formatBytes(new TextEncoder().encode(code).length)}
              </span>
              <Button variant={showPreview ? "secondary" : "ghost"} size="sm" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? <Eye /> : <EyeOff />} Preview
              </Button>
            </div>
          </div>

          <div className={`grid min-h-0 flex-1 ${showPreview ? "grid-rows-2 xl:grid-cols-2 xl:grid-rows-1" : ""}`}>
            <div className="relative min-h-0 bg-transparent">
              {mounted && (
                <Suspense fallback={null}>
                  <CodeEditor value={code} language={lang} wordWrap={wrap} onChange={(value) => { setBinaryData(null); setBinaryName(""); setCode(value); }} onMount={(ed) => { editorRef.current = ed; }} />
                </Suspense>
              )}
              {binaryData && <div className="absolute inset-x-4 top-4 rounded-xl border bg-card/90 p-4 text-sm"><strong>{binaryName || "Binary file"}</strong><p className="mt-1 text-muted-foreground">{mime} · {formatBytes(binaryData.length)} · raw bytes</p></div>}
              {!code && !binaryData && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Paste or type code here</p>
                    <p className="mt-1">…or drop a file anywhere, or try an example above.</p>
                  </div>
                </div>
              )}
            </div>
            {showPreview && (
              <div className="flex min-h-0 flex-col border-t border-white/10 xl:border-l xl:border-t-0">
                <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.025] px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span className="size-2 rounded-full bg-success" /> Live preview
                </div>
                {previewable ? (
                  <iframe
                    title="Live preview"
                    sandbox="allow-scripts allow-modals allow-forms"
                    srcDoc={previewDocument(previewCode, mime)}
                    className="min-h-0 w-full flex-1 bg-background"
                  />
                ) : (
                  <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono-ui text-xs text-muted-foreground">
                    {previewCode || "Nothing to show yet."}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <aside className="glass hidden min-h-0 flex-col overflow-y-auto rounded-2xl lg:flex">
          <Section title="Opens as">
            <select
              aria-label="File type"
              value={customMimeOpen || !MIMES.includes(mime) ? "custom" : mime}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setCustomMimeOpen(true);
                  setCustomMime(!MIMES.includes(mime) ? mime : "");
                } else {
                  setCustomMimeOpen(false);
                  setCustomMime("");
                  setMime(e.target.value);
                }
              }}
              className="h-9 w-full rounded-md border bg-secondary px-2 font-mono-ui text-xs outline-none focus:ring-2 focus:ring-ring"
            >
              {MIMES.map((m) => <option key={m}>{m}</option>)}
              <option value="custom">Custom…</option>
            </select>
            {(customMimeOpen || !MIMES.includes(mime)) && (
              <input aria-label="Custom MIME type" value={customMimeOpen ? customMime : mime} onChange={(e) => { setCustomMime(e.target.value); setMime(e.target.value); }} placeholder="e.g. application/wasm" className="mt-2 h-9 w-full rounded-md border bg-secondary px-2 font-mono-ui text-xs outline-none focus:ring-2 focus:ring-ring" />
            )}
          </Section>

          <Section title="Appearance">
            <label className="mb-2 block text-xs text-muted-foreground">Glowing theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="h-9 w-full rounded-md border bg-secondary px-2 text-xs"><option value="crimson">Crimson glass</option><option value="violet">Ultraviolet</option><option value="cyan">Neon cyan</option><option value="amber">Solar amber</option><option value="emerald">Emerald glass</option><option value="ice">Arctic ice</option><option value="sunset">Afterglow</option></select>
          </Section>

          <Section title="Compression 2.0">
            <label className="mb-2 block text-xs text-muted-foreground">Compression strength</label>
            <select value={compression} onChange={(e) => setCompression(e.target.value as Level)} className="h-9 w-full rounded-md border bg-secondary px-2 text-xs"><option value="fast">Fast</option><option value="max">Max</option><option value="ultra">Ultra</option><option value="insane">Insane · codec search</option><option value="dynamic">Dynamic · smallest candidate</option></select>
            <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)} /> Instant run</label>
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="mb-2 text-xs font-semibold">Source shrinking · opt-in</div>
              <p className="mb-2 text-[10px] text-muted-foreground">These use syntax-aware parsers for HTML, CSS, JavaScript and JSON. Comment removal strips all comment types in the selected language; minification can change formatting. Keep them off when exact source bytes matter.</p>
              {([
                ["htmlComments", "Strip HTML comments"],
                ["htmlWhitespace", "Collapse inter-tag whitespace"],
                ["cssComments", "Strip CSS comments"],
                ["cssWhitespace", "Compact CSS whitespace"],
                ["svgMetadata", "Remove SVG comments / metadata"],
                ["jsComments", "Strip JavaScript / TypeScript comments (AST-safe)"],
                ["jsMinify", "Minify JavaScript / TypeScript (AST-safe)"],
                ["jsonMinify", "Minify JSON safely"],
              ] as const).map(([key, label]) => (
                <label key={key} className="mt-2 flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={!!rewrite[key]} onChange={(e) => setRewrite((v) => ({ ...v, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={imageOptimize} onChange={(e) => setImageOptimize(e.target.checked)} /> Re-encode raster images on import</label>
            <label className="mt-3 block text-xs text-muted-foreground">Image maximum dimension (next import)</label>
            <select value={imageMaxSide} onChange={(e) => setImageMaxSide(Number(e.target.value))} className="mt-1 h-9 w-full rounded-md border bg-secondary px-2 text-xs"><option value={1024}>1024 px</option><option value={2048}>2048 px</option><option value={4096}>4096 px</option><option value={8192}>8192 px</option></select>
            <label className="mt-3 block text-xs text-muted-foreground">Image quality: {Math.round(imageQuality * 100)}%</label>
            <input type="range" min="0.2" max="1" step="0.05" value={imageQuality} onChange={(e) => setImageQuality(Number(e.target.value))} className="w-full" />
            <label className="mt-3 block text-xs text-muted-foreground">Image output format</label>
            <select value={imageFormat} onChange={(e) => setImageFormat(e.target.value as typeof imageFormat)} className="mt-1 h-9 w-full rounded-md border bg-secondary px-2 text-xs"><option value="original">Keep original format</option><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option></select>
            <label className="mt-3 block text-xs text-muted-foreground">Optional password encryption</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a link password" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-xs" />
            <p className="mt-2 text-[10px] text-muted-foreground">AES-GCM encryption runs locally. Share the password separately.</p>
            <p className="mt-2 text-[10px] text-muted-foreground">Dynamic and Insane compare available browser codecs. Brotli, Zstandard, LZMA and parser-grade minifiers remain planned WASM additions.</p>
          </Section>

          <Section title="Your link">
            <div className={`break-all rounded-lg border bg-background/60 p-3 font-mono-ui text-[11px] leading-relaxed ${url ? "" : "text-muted-foreground"}`}>
              {url ? (<><span className="text-primary">{base}#</span>{payload.slice(0, 140)}{payload.length > 140 && "…"}</>) : "Updates automatically as you type."}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="hero" onClick={copy} disabled={!url}><Copy /> Copy</Button>
              <Button variant="outline" onClick={open} disabled={!url}><ExternalLink /> Open</Button>
              <Button variant="outline" size="sm" onClick={async () => { if (!rawUrl) return; await navigator.clipboard.writeText(rawUrl); toast.success("Raw resource URL copied"); }} disabled={!rawUrl || !!password || !rawSupported}><Link2 /> Copy raw URL</Button>
              <Button variant="outline" size="sm" onClick={download} disabled={!sourceBytes.length}><Download /> Download</Button>
              <Button variant={showQr ? "secondary" : "outline"} size="sm" onClick={() => setShowQr(!showQr)} disabled={!url}><QrCode /> QR code</Button>
            </div>
            {showQr && url && (
              <div className="animate-fade-up mt-3 grid place-items-center rounded-lg border bg-foreground p-4">
                {url.length <= 2900 ? <QRCodeSVG value={url} size={180} bgColor="transparent" fgColor="currentColor" className="text-background" />
                  : <p className="text-center text-xs text-background">Too long for a QR code ({url.length.toLocaleString()} / 2,900 chars)</p>}
              </div>
            )}

            {rawUrl && <p className="mt-2 text-[10px] text-muted-foreground">{rawSupported ? "Raw URL serves this asset with cross-origin headers through the Cloudflare Pages /r function. Use it when another app needs to fetch an image or media URL. Password-protected links are not available in raw mode." : "Raw mode is available for supported images, audio, video, fonts and PDFs; this MIME type is not currently served as a raw resource."}</p>}
            {url && limit && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Original" value={formatBytes(origBytes)} />
                  <Stat label="Link" value={formatBytes(url.length)} />
                  <Stat label="Saved" value={`${ratio.toFixed(0)}%`} accent />
                </div>
                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="bg-gradient-primary h-full transition-all" style={{ width: `${Math.min(100, limit.pct * 100)}%` }} />
                  </div>
                  <p className={`mt-1.5 text-[11px] ${limit.tone}`}>{limit.label}</p>
                </div>
              </div>
            )}
          </Section>

          <Section title="Recent links" icon={<History className="size-3.5" />}>
            {hist.length === 0 ? (
              <p className="text-xs text-muted-foreground">Links you copy or open show up here.</p>
            ) : (
              <ul className="space-y-1">
                {hist.map((h) => (
                  <li key={h.at} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={async () => {
                        const d = await decodeAny(payloadFromUrl(h.url));
                        if (d.status === "ok") {
                          setMime(d.mime); setBinaryName(d.meta.name || "");
                          if (d.text !== null) { setBinaryData(null); setCode(d.text); setLang(guessLang(d.mime)); }
                          else { setCode(""); setBinaryData(d.bytes); setLang("plaintext"); }
                        }
                      }}
                    >
                      <div className="truncate text-xs">{h.title || "Untitled"}</div>
                      <div className="text-[10px] text-muted-foreground">{h.mime} · {formatBytes(h.size)} · {new Date(h.at).toLocaleDateString()}</div>
                    </button>
                    <button
                      aria-label="Remove"
                      className="opacity-0 transition group-hover:opacity-100"
                      onClick={() => setHist((all) => { const n = all.filter((x) => x.at !== h.at); localStorage.setItem(HIST_KEY, JSON.stringify(n)); return n; })}
                    >
                      <X className="size-3.5 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="mt-auto space-y-2 p-5 text-[11px] leading-relaxed text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <Kbd>Ctrl S</Kbd> copy link <Kbd>Ctrl ↵</Kbd> open
            </div>
            <p>Your code is compressed into the part of the link after the first <code className="text-foreground">#</code>, so it never touches a server. Opening the link rebuilds the page right in the browser.</p>
          </div>
        </aside>
      </div>

      {urlToolOpen && <UrlToolDialog onClose={() => setUrlToolOpen(false)} onEmbed={(html) => { setBinaryData(null); setBinaryName("embed.html"); setCode(html); setMime("text/html"); setLang("html"); }} onFetched={({ name, mime: fetchedMime, bytes }) => { setMime(fetchedMime); setBinaryName(name); if (/^text\//i.test(fetchedMime) || /json|javascript|xml|svg|yaml/i.test(fetchedMime)) { setBinaryData(null); setCode(new TextDecoder().decode(bytes)); setLang(guessLang(fetchedMime)); } else { setCode(""); setBinaryData(bytes); setLang("plaintext"); } }} />}
      {infoOpen && <InfoDialog onClose={() => setInfoOpen(false)} />}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary px-10 py-8 text-lg font-medium">Drop to load file</div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => setImportOpen(false)}>
          <div className="glass animate-fade-up w-full max-w-lg rounded-2xl border p-6 shadow-[var(--shadow-panel)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Decode a link</h2>
            <p className="mt-1 text-sm text-muted-foreground">Paste an x11 link to load its contents back into the editor.</p>
            <textarea
              autoFocus
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="https://…#N4Ig…"
              className="mt-4 h-28 w-full resize-none rounded-lg border bg-background/60 p-3 font-mono-ui text-xs outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button variant="hero" onClick={importLink} disabled={!importText.trim()}>Decode</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b p-5">
      <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{icon}{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-background/50 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono-ui text-xs font-medium ${accent ? "text-success" : ""}`}>{value}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-secondary px-1.5 py-0.5 font-mono-ui text-[10px] text-foreground">{children}</kbd>;
}
