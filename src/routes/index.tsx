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
import { decodeAny, encodeV2, processImage, type Level, type RewriteOptions } from "@/lib/codec2";
import { createLaunchUrl, createLaunchUrlFromBlob } from "@/lib/launch";
import { decodeText, detectTextEncoding, encodeText, type TextEncoding } from "@/lib/text-encoding";
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

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("x11 offline worker registration failed", error);
    });
  }, []);

  if (mode === "loading") return <div className="min-h-screen" />;
  if (mode === "decode")
    return (
      <DecodeScreen
        payload={payload}
        onEdit={(d) => {
          if (d && d.text !== null) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ code: d.text, mime: d.mime, encoding: d.meta.encoding || "utf-8" }));
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
  const [textEncoding, setTextEncoding] = useState<TextEncoding>("utf-8");
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
  const [dynamicRewrite, setDynamicRewrite] = useState(false);
  const [password, setPassword] = useState("");
  const [instant, setInstant] = useState(false);
  const [urlToolOpen, setUrlToolOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [uploadKey, setUploadKey] = useState("");
  const [uploadedRawUrl, setUploadedRawUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [theme, setTheme] = useState("crimson");
  const [binaryData, setBinaryData] = useState<Uint8Array | null>(null);
  const [largeFile, setLargeFile] = useState<File | null>(null);
  const [binaryName, setBinaryName] = useState("");
  const [imageOptimize, setImageOptimize] = useState(true);
  const [imageMaxSide, setImageMaxSide] = useState(4096);
  const [imageQuality, setImageQuality] = useState(0.68);
  const [imageFormat, setImageFormat] = useState<"auto" | "original" | "image/webp" | "image/avif" | "image/jpeg" | "image/png">("auto");
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
        setTextEncoding((d.encoding || "utf-8") as TextEncoding);
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
    document.documentElement.dataset["theme"] = theme;
    localStorage.setItem("x11:theme", theme);
  }, [theme]);

  // autosave + debounced preview
  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ code, mime, encoding: textEncoding }));
      setPreviewCode(code);
    }, 350);
    return () => clearTimeout(t);
  }, [code, mime, textEncoding, mounted]);

  const base = mounted ? `${location.origin}/` : "";
  const [payload, setPayload] = useState("");
  const sourceBytes = useMemo(() => largeFile ? new Uint8Array(0) : (binaryData ?? encodeText(previewCode, textEncoding)), [largeFile, binaryData, previewCode, textEncoding]);
  useEffect(() => {
    let active = true;
    if (largeFile || !sourceBytes.length) { setPayload(""); return; }
    encodeV2({ mime, bytes: sourceBytes, meta: { ...(binaryName ? { name: binaryName } : {}), encoding: textEncoding }, level: compression, instant, rewrite: textEncoding === "utf-8" ? rewrite : {}, dynamicRewrite, ...(password ? { password } : {}) })
      .then((value) => { if (active) setPayload(value); })
      .catch((error) => { console.error(error); if (active) setPayload(""); });
    return () => { active = false; };
  }, [sourceBytes, largeFile, mime, compression, instant, rewrite, dynamicRewrite, password, binaryName, textEncoding]);
  const url = payload ? `${base}#${payload}` : "";
  const rawUrl = payload ? `${base}r?data=${encodeURIComponent(payload)}` : "";
  const rawSupported = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test((mime.split(";")[0] || "").trim());
  const hasSource = !!largeFile || sourceBytes.length > 0;
  const origBytes = largeFile?.size ?? sourceBytes.length;
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

  const openBlob = () => {
    if (!hasSource) return;
    const objectUrl = largeFile ? createLaunchUrlFromBlob(largeFile, mime) : createLaunchUrl(sourceBytes, mime);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
  };

  const uploadRaw = async () => {
    if (!hasSource || !uploadKey) return;
    setUploadProgress(0);
    const sessionKey = "x11:r2-upload-session";
    const partSize = 8 * 1024 * 1024;
    const baseMime = (mime.split(";")[0] || "").trim();
    const uploadMime = (/^text\//i.test(baseMime) || /json|javascript|xml|svg|yaml|typescript/i.test(baseMime)) ? baseMime + "; charset=" + textEncoding : mime;
    try {
      const content = largeFile ?? new Blob([sourceBytes as BlobPart]);
      const contentSize = content.size;
      const fingerprint = largeFile ? [largeFile.name, largeFile.size, largeFile.lastModified, mime ].join(":") : Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer))).map((v) => v.toString(16).padStart(2, "0")).join("");
      type Session = { id: string; uploadId: string; mime: string; size: number; name: string; fingerprint: string; parts: { partNumber: number; etag: string; sha256: string }[] };
      let session = JSON.parse(localStorage.getItem(sessionKey) || "null") as Session | null;
      if (!session || session.fingerprint !== fingerprint || session.mime !== uploadMime || session.size !== contentSize) {
        const start = await fetch(base + "r?multipart=start", { method: "POST", headers: { "Content-Type": "application/json", "X-X11-Upload-Key": uploadKey }, body: JSON.stringify({ mime: uploadMime, name: binaryName || "x11-resource" }) });
        const created = await start.json() as { id?: string; uploadId?: string };
        if (!start.ok || !created.id || !created.uploadId) throw new Error("Could not start multipart upload (HTTP " + start.status + ")");
        session = { id: created.id, uploadId: created.uploadId, mime: uploadMime, size: contentSize, name: binaryName || "x11-resource", fingerprint, parts: [] };
        localStorage.setItem(sessionKey, JSON.stringify(session));
      }
      const blob = content;
      const completed = new Set(session.parts.map((part) => part.partNumber));
      const totalParts = Math.ceil(contentSize / partSize);
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const startOffset = (partNumber - 1) * partSize;
        const endOffset = Math.min(contentSize, startOffset + partSize);
        const partBlob = blob.slice(startOffset, endOffset);
        const partBytes = await partBlob.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", partBytes));
        const sha256 = Array.from(digest).map((v) => v.toString(16).padStart(2, "0")).join("");
        const previous = session.parts.find((part) => part.partNumber === partNumber);
        if (!completed.has(partNumber) || previous?.sha256 !== sha256) {
          const partResponse = await fetch(base + "r?multipart=part&id=" + session.id + "&uploadId=" + encodeURIComponent(session.uploadId) + "&partNumber=" + partNumber, { method: "POST", headers: { "X-X11-Upload-Key": uploadKey, "X-X11-SHA256": sha256, "Content-Type": "application/octet-stream" }, body: partBytes });
          const part = await partResponse.json() as { partNumber?: number; etag?: string; sha256?: string };
          if (!partResponse.ok || !part.etag || part.sha256 !== sha256) throw new Error("Upload part " + partNumber + " failed its integrity check (HTTP " + partResponse.status + ")");
          session.parts = session.parts.filter((item) => item.partNumber !== partNumber);
          session.parts.push({ partNumber, etag: part.etag, sha256 });
          localStorage.setItem(sessionKey, JSON.stringify(session));
        }
        setUploadProgress(Math.round(endOffset / contentSize * 100));
      }
      const finish = await fetch(base + "r?multipart=complete&id=" + session.id + "&uploadId=" + encodeURIComponent(session.uploadId), { method: "POST", headers: { "X-X11-Upload-Key": uploadKey, "Content-Type": "application/json" }, body: JSON.stringify({ parts: session.parts }) });
      const result = await finish.json() as { url?: string };
      if (!finish.ok || !result.url) throw new Error("Could not complete upload (HTTP " + finish.status + ")");
      setUploadedRawUrl(result.url);
      localStorage.removeItem(sessionKey);
      await navigator.clipboard.writeText(result.url);
      toast.success("Large raw link uploaded and copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. The session is saved so you can retry.");
    }
  };
  const download = () => {
    if (!hasSource) return;
    const ext = mime.includes("html") ? "html" : mime.includes("svg") ? "svg" : mime.includes("json") ? "json" : mime.includes("css") ? "css" : mime.includes("javascript") ? "js" : "bin";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(largeFile ?? new Blob([sourceBytes as BlobPart], { type: mime }));
    a.download = binaryName || `x11-export.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadFile = async (f: File) => {
    const l = langFromFilename(f.name);
    let detectedMime = (l !== "plaintext" ? LANGS.find((x) => x.value === l)?.mime : undefined) ?? (f.type || "text/plain");
    const textLike = /^text\//i.test(detectedMime) || /json|javascript|xml|svg|yaml|typescript/i.test(detectedMime);
    if (f.size > 20 * 1024 * 1024) {
      setLargeFile(f); setBinaryData(null); setCode(""); setPreviewCode(""); setMime(detectedMime);
      setCustomMimeOpen(false); setCustomMime(""); setBinaryName(f.name); setLang(textLike ? l : "plaintext"); setTextEncoding("utf-8");
      toast.success("Large file staged without loading it into memory", { description: "Use R2 multipart upload or Open Blob." });
      return;
    }
    setLargeFile(null);
    let bytes = new Uint8Array(await f.arrayBuffer());
    const fileEncoding = detectTextEncoding(bytes);
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
      setBinaryData(null); setTextEncoding(fileEncoding); setCode(decodeText(bytes, fileEncoding)); setLang(l);
    } else { setBinaryData(bytes); setCode(""); setLang("plaintext"); }
    toast.success(`Loaded ${f.name}`);
  };

  const importLink = async () => {
    const input = payloadFromUrl(importText);
    const decoded = await decodeAny(input);
    if (decoded.status === "locked") { toast.error("Password-protected links must be opened directly to unlock."); return; }
    if (decoded.status === "ok") {
      setLargeFile(null); setMime(decoded.mime); setBinaryName(decoded.meta.name || ""); setTextEncoding((decoded.meta.encoding || "utf-8") as TextEncoding);
      if (decoded.text !== null) { setBinaryData(null); setCode(decoded.text); setLang(guessLang(decoded.mime)); }
      else { setCode(""); setBinaryData(decoded.bytes); setLang("plaintext"); }
      setImportOpen(false); setImportText(""); toast.success("Content imported"); return;
    }
    const legacy = decodePayload(input);
    if (!legacy) { toast.error(decoded.reason || "Invalid x11 link or blocked URL"); return; }
    setLargeFile(null); setBinaryData(null); setBinaryName(""); setTextEncoding("utf-8"); setCode(legacy.content); setMime(legacy.mime); setLang(guessLang(legacy.mime));
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
              <Button key={ex.name} variant="ghost" size="sm" onClick={() => { setLargeFile(null); setBinaryData(null); setBinaryName(""); setCode(ex.code); setLang(ex.lang); setMime(ex.mime); }}>
                <Sparkles /> {ex.name}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload /> Open file</Button>
          <Button variant="outline" size="sm" onClick={() => setUrlToolOpen(true)}>URL tools</Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Link2 /> Decode link</Button>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowMobilePanel((v) => !v)}>Link panel</Button>
          <Button variant="ghost" size="icon" title="Update history and TODO" onClick={() => setInfoOpen(true)}>Info</Button>
          <Button variant="ghost" size="icon" title="Clear" onClick={() => { setCode(""); setLargeFile(null); setBinaryData(null); setBinaryName(""); }}><Trash2 /></Button>
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
                  <CodeEditor value={code} language={lang} wordWrap={wrap} onChange={(value) => { setLargeFile(null); setBinaryData(null); setBinaryName(""); setCode(value); }} onMount={(ed) => { editorRef.current = ed; }} />
                </Suspense>
              )}
              {binaryData && <div className="absolute inset-x-4 top-4 rounded-xl border bg-card/90 p-4 text-sm"><strong>{binaryName || "Binary file"}</strong><p className="mt-1 text-muted-foreground">{mime} · {formatBytes(binaryData.length)} · raw bytes</p></div>}
              {largeFile && <div className="absolute inset-x-4 top-4 rounded-xl border bg-card/90 p-4 text-sm"><strong>{largeFile.name}</strong><p className="mt-1 text-muted-foreground">{mime} · {formatBytes(largeFile.size)} · streamed from the selected local file</p></div>}
              {!code && !binaryData && !largeFile && (
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
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-5 text-center">
                    <div className="max-w-sm text-sm font-medium">No iframe preview</div>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      X11 launches HTML, SVG, CSS and JavaScript as a top-level Blob document instead of embedding it in an iframe.
                      The launched page shares this site's origin, so only run content you trust.
                    </p>
                    <Button
                      variant="hero"
                      onClick={() => {
                        const source = previewDocument(previewCode, mime);
                        const launchUrl = createLaunchUrl(encodeText(source, "utf-8"), "text/html");
                        window.open(launchUrl, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <ExternalLink /> Launch preview
                    </Button>
                  </div>
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
        <aside className={`glass z-30 min-h-0 flex-col overflow-y-auto rounded-2xl ${showMobilePanel ? "fixed inset-x-3 bottom-3 top-20 flex max-h-[calc(100dvh-6rem)] shadow-2xl" : "hidden"} lg:static lg:flex lg:max-h-none`}>
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
            <label className="mt-3 block text-xs text-muted-foreground">Text character encoding</label>
            <select value={textEncoding} onChange={(e) => setTextEncoding(e.target.value as TextEncoding)} className="mt-1 h-9 w-full rounded-md border bg-secondary px-2 text-xs">
              <option value="utf-8">UTF-8</option>
              <option value="utf-16le">UTF-16 Little Endian</option>
              <option value="utf-16be">UTF-16 Big Endian</option>
              <option value="windows-1252">Windows-1252</option>
              <option value="iso-8859-1">ISO-8859-1</option>
              <option value="us-ascii">US-ASCII</option>
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">UTF-7 is intentionally excluded: it is obsolete and has caused charset-based security problems. Unsupported characters in legacy single-byte encodings are replaced with ?.</p>
          </Section>

          <Section title="Appearance">
            <label className="mb-2 block text-xs text-muted-foreground">Glowing theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="h-9 w-full rounded-md border bg-secondary px-2 text-xs"><option value="crimson">Crimson glass</option><option value="violet">Ultraviolet</option><option value="cyan">Neon cyan</option><option value="amber">Solar amber</option><option value="emerald">Emerald glass</option><option value="ice">Arctic ice</option><option value="sunset">Afterglow</option></select>
          </Section>

          <Section title="Compression 2.0">
            <label className="mb-2 block text-xs text-muted-foreground">Compression strength</label>
            <select value={compression} onChange={(e) => setCompression(e.target.value as Level)} className="h-9 w-full rounded-md border bg-secondary px-2 text-xs"><option value="fast">Fast</option><option value="max">Max</option><option value="ultra">Ultra</option><option value="insane">Insane · codec search</option><option value="dynamic">Dynamic · smallest candidate</option></select>
            <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)} /> Instant run</label>
            <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={dynamicRewrite} onChange={(e) => setDynamicRewrite(e.target.checked)} /> Search rewrite combinations in Dynamic mode</label>
            <p className="mt-1 text-[10px] text-muted-foreground">Tests selected rewrite passes in different combinations and keeps the shortest final link. Search is capped to protect memory and CPU.</p>
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
            <select value={imageMaxSide} onChange={(e) => setImageMaxSide(Number(e.target.value))} className="mt-1 h-9 w-full rounded-md border bg-secondary px-2 text-xs"><option value={1024}>1024 px</option><option value={2048}>2048 px</option><option value={4096}>4096 px</option><option value={8192}>8192 px</option><option value={16384}>16384 px</option></select>
            <label className="mt-3 block text-xs text-muted-foreground">Compression quality: {Math.round(imageQuality * 100)}%</label>
            <input type="range" min="0.2" max="0.95" step="0.02" value={imageQuality} onChange={(e) => setImageQuality(Number(e.target.value))} className="w-full" />
            <label className="mt-3 block text-xs text-muted-foreground">Image output format</label>
            <select value={imageFormat} onChange={(e) => setImageFormat(e.target.value as typeof imageFormat)} className="mt-1 h-9 w-full rounded-md border bg-secondary px-2 text-xs"><option value="auto">Auto — smallest AVIF/WebP</option><option value="original">Re-encode original format</option><option value="image/avif">AVIF</option><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option></select>
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
              <Button variant="outline" size="sm" onClick={openBlob} disabled={!hasSource}><ExternalLink /> Open Blob</Button>
              <Button variant="outline" size="sm" onClick={async () => { if (!rawUrl) return; await navigator.clipboard.writeText(rawUrl); toast.success("Raw resource URL copied"); }} disabled={!rawUrl || !!password || !rawSupported}><Link2 /> Copy raw URL</Button>
              <Button variant="outline" size="sm" onClick={download} disabled={!hasSource}><Download /> Download</Button>
              <Button variant={showQr ? "secondary" : "outline"} size="sm" onClick={() => setShowQr(!showQr)} disabled={!url}><QrCode /> QR code</Button>
            </div>
            {showQr && url && (
              <div className="animate-fade-up mt-3 grid place-items-center rounded-lg border bg-foreground p-4">
                {url.length <= 2900 ? <QRCodeSVG value={url} size={180} bgColor="transparent" fgColor="currentColor" className="text-background" />
                  : <p className="text-center text-xs text-background">Too long for a QR code ({url.length.toLocaleString()} / 2,900 chars)</p>}
              </div>
            )}

            <div className="mt-3 space-y-2 rounded-lg border bg-background/40 p-3">
              <div className="text-xs font-medium">Large raw link · R2 storage</div>
              <input type="password" value={uploadKey} onChange={(e) => setUploadKey(e.target.value)} placeholder="Cloudflare X11_UPLOAD_KEY" className="h-9 w-full rounded-md border bg-background px-3 text-xs" />
              <Button variant="outline" size="sm" className="w-full" onClick={uploadRaw} disabled={!hasSource || !uploadKey.trim() || !rawSupported}><Upload /> Upload / resume large raw link</Button>
              {uploadProgress > 0 && uploadProgress < 100 && <p className="text-[10px] text-muted-foreground">Transfer progress: {uploadProgress}%</p>}
              {uploadProgress === 100 && <p className="text-[10px] text-success">All chunks sent; finalizing resource…</p>}
              {uploadedRawUrl && <p className="break-all text-[10px] text-muted-foreground">Stored link: {uploadedRawUrl}</p>}
              <p className="text-[10px] text-muted-foreground">Requires an R2 bucket binding named X11_R2 and a Pages environment secret named X11_UPLOAD_KEY. Uses 8 MiB resumable R2 multipart chunks. The Cloudflare Pages request-size and execution limits still apply to each request.</p>
            </div>
            {rawUrl && <p className="mt-2 text-[10px] text-muted-foreground">{rawSupported ? "Raw mode accepts any syntactically valid MIME type. Active HTML/XHTML/SVG responses receive a restrictive sandbox CSP. Inline query links are size-limited; use R2 storage for larger resources." : "Enter a valid MIME type to enable raw delivery."}</p>}
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
                          setLargeFile(null); setMime(d.mime); setBinaryName(d.meta.name || ""); setTextEncoding((d.meta.encoding || "utf-8") as TextEncoding);
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
            <div className="flex justify-end lg:hidden"><Button size="sm" variant="outline" onClick={() => setShowMobilePanel(false)}>Close panel</Button></div>
            <div className="flex flex-wrap gap-2">
              <Kbd>Ctrl S</Kbd> copy link <Kbd>Ctrl ↵</Kbd> open
            </div>
            <p>Your code is compressed into the part of the link after the first <code className="text-foreground">#</code>, so it never touches a server. Opening the link rebuilds the page right in the browser.</p>
          </div>
        </aside>
      </div>

      {urlToolOpen && <UrlToolDialog onClose={() => setUrlToolOpen(false)} onEmbed={(html) => { setLargeFile(null); setBinaryData(null); setBinaryName("embed.html"); setCode(html); setMime("text/html"); setLang("html"); }} onFetched={({ name, mime: fetchedMime, bytes }) => { setLargeFile(null); setMime(fetchedMime); setBinaryName(name); if (/^text\//i.test(fetchedMime) || /json|javascript|xml|svg|yaml/i.test(fetchedMime)) { setBinaryData(null); setTextEncoding("utf-8"); setCode(new TextDecoder().decode(bytes)); setLang(guessLang(fetchedMime)); } else { setCode(""); setBinaryData(bytes); setLang("plaintext"); } }} />}
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
