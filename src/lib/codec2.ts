import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";
import { decodePayload } from "./codec";
import { parse as parseHtml, serialize as serializeHtml } from "parse5";
import { parse as parseJs } from "@babel/parser";
import generate from "@babel/generator";
import postcss from "postcss";

/*
 * Link formats after the first "#":
 *   <lz>      v1 (legacy, text only)          — "<mime>\n<content>" LZ-compressed
 *   !<lz>     v1 + instant-run flag
 *   ~<b64url> v2 binary container:
 *     [0]=2 version, [1]=flags (1 encrypted, 2 instant, 4 deflated)
 *     encrypted → salt(16) iv(12) AES-GCM(body)   else body
 *     body (maybe deflated) = u16 mimeLen, mime, u16 metaLen, meta JSON, raw bytes
 * "!" and "~" are not in the LZ alphabet, so old links keep decoding unchanged.
 */

export type Meta = { name?: string; title?: string };
export type Level = "fast" | "max" | "ultra" | "insane" | "dynamic";
export type RewriteOptions = { htmlComments?: boolean; htmlWhitespace?: boolean; cssComments?: boolean; cssWhitespace?: boolean; svgMetadata?: boolean; jsComments?: boolean; jsMinify?: boolean; jsonMinify?: boolean };

const F_CODEC_GZIP = 8, F_CODEC_DEFLATE = 16;
export type Decoded =
  | { status: "ok"; mime: string; bytes: Uint8Array; text: string | null; meta: Meta; instant: boolean; version: 1 | 2 }
  | { status: "locked"; instant: boolean }
  | { status: "error"; reason: string };

const F_ENC = 1, F_INSTANT = 2, F_DEFLATE = 4;

export function isTextMime(mime: string) {
  return /^text\/|json|javascript|xml|svg|yaml|x-sh|typescript/.test(mime);
}

export function b64urlEncode(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlDecode(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function key(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", strToU8(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 250_000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

async function streamCompress(body: Uint8Array, format: "gzip" | "deflate"): Promise<Uint8Array> {
  const stream = new Blob([body as BlobPart]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function compress(body: Uint8Array, level: Level): Promise<{ bytes: Uint8Array; codec: number }> {
  const candidates: { bytes: Uint8Array; codec: number }[] = [];
  const add = (bytes: Uint8Array, codec = 0) => { if (bytes.length < body.length) candidates.push({ bytes, codec }); };
  if (level === "fast") add(deflateSync(body, { level: 1, mem: 8 }));
  else if (level === "max") add(deflateSync(body, { level: 9, mem: 12 }));
  else {
    const levels = level === "ultra" ? [9] : [7, 8, 9];
    const memories = level === "ultra" ? [9, 10, 11, 12] : [8, 9, 10, 11, 12];
    for (const l of levels) for (const mem of memories) add(deflateSync(body, { level: l as 7 | 8 | 9, mem: mem as 8 | 9 | 10 | 11 | 12 }));
  }
  if (level === "dynamic" || level === "insane") {
    for (const format of ["gzip", "deflate"] as const) {
      try { add(await streamCompress(body, format), format === "gzip" ? 1 : 2); } catch { /* codec unavailable */ }
    }
  }
  candidates.sort((a, b) => a.bytes.length - b.bytes.length);
  return candidates[0] ?? { bytes: body, codec: 0 };
}

export function rewriteText(bytes: Uint8Array, mime: string, options: RewriteOptions = {}): Uint8Array {
  if (!isTextMime(mime) || !Object.values(options).some(Boolean)) return bytes;
  const source = strFromU8(bytes);
  try {
    if (mime.includes("javascript") || /typescript|tsx/.test(mime)) {
      if (!options.jsComments && !options.jsMinify) return bytes;
      const ast = parseJs(source, {
        sourceType: "unambiguous",
        allowReturnOutsideFunction: true,
        attachComment: false,
        plugins: ["jsx", "typescript", "decorators-legacy", "classProperties", "dynamicImport", "importMeta", "topLevelAwait"],
      });
      return strToU8(generate(ast, {
        comments: false,
        compact: !!options.jsMinify,
        minified: !!options.jsMinify,
        jsescOption: { minimal: true },
      }).code);
    }
    if (mime.includes("json") && options.jsonMinify) {
      return strToU8(JSON.stringify(JSON.parse(source)));
    }
    if (mime.includes("css")) {
      if (!options.cssComments && !options.cssWhitespace) return bytes;
      const root = postcss.parse(source);
      if (options.cssComments) root.walkComments((comment) => comment.remove());
      if (options.cssWhitespace) {
        root.walk((node) => {
          node.raws.before = "";
          if (node.raws.between) node.raws.between = node.type === "decl" ? ":" : "";
          if (node.raws.after) node.raws.after = "";
        });
        root.raws.after = "";
      }
      return strToU8(root.toString());
    }
    if (mime.includes("html")) {
      if (!options.htmlComments && !options.htmlWhitespace) return bytes;
      const document = parseHtml(source) as any;
      const block = new Set(["address","article","aside","blockquote","body","dd","div","dl","dt","fieldset","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","head","header","hr","html","main","nav","ol","p","section","table","tbody","td","tfoot","th","thead","tr","ul"]);
      const walk = (node: any) => {
        if (!Array.isArray(node.childNodes)) return;
        if (options.htmlComments) node.childNodes = node.childNodes.filter((child: any) => {
          if (child.nodeName !== "#comment") return true;
          // Preserve legacy conditional comments such as <!--[if IE]>...<![endif]-->.
          const data = String(child.data ?? "").trimStart();
          return /^\\[if\\b|^\\[endif\\]/i.test(data);
        });
        if (options.htmlWhitespace && !["pre","textarea","script","style"].includes(node.tagName)) {
          node.childNodes = node.childNodes.filter((child: any, index: number, all: any[]) => {
            if (child.nodeName !== "#text" || !/^\s+$/.test(child.value ?? "")) return true;
            const prev = all[index - 1], next = all[index + 1];
            return !(prev?.tagName && next?.tagName && block.has(prev.tagName) && block.has(next.tagName));
          });
        }
        for (const child of node.childNodes) walk(child);
      };
      walk(document);
      return strToU8(serializeHtml(document));
    }
    if (mime.includes("svg")) {
      let text = source;
      if (options.svgMetadata) text = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, "");
      if (options.htmlWhitespace) text = text.replace(/>\s+</g, "><").trim();
      return strToU8(text);
    }
    return bytes;
  } catch {
    // A failed parse must never silently corrupt source. Keep original bytes.
    return bytes;
  }
}

export async function encodeV2(opts: {
  mime: string; bytes: Uint8Array; meta?: Meta; level?: Level; instant?: boolean; password?: string; rewrite?: RewriteOptions;
}): Promise<string> {
  const mimeB = strToU8(opts.mime);
  const metaB = strToU8(JSON.stringify(opts.meta ?? {}));
  const source = rewriteText(opts.bytes, opts.mime, opts.rewrite);
  const body = new Uint8Array(4 + mimeB.length + metaB.length + source.length);
  const dv = new DataView(body.buffer);
  dv.setUint16(0, mimeB.length);
  body.set(mimeB, 2);
  dv.setUint16(2 + mimeB.length, metaB.length);
  body.set(metaB, 4 + mimeB.length);
  body.set(source, 4 + mimeB.length + metaB.length);

  let flags = 0;
  let payload: Uint8Array = body;
  const packed = await compress(body, opts.level ?? "max");
  if (packed.bytes.length < body.length) {
    payload = packed.bytes; flags |= F_DEFLATE;
    if (packed.codec === 1) flags |= F_CODEC_GZIP;
    if (packed.codec === 2) flags |= F_CODEC_DEFLATE;
  }
  if (opts.instant) flags |= F_INSTANT;
  if (opts.password) {
    flags |= F_ENC;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(opts.password, salt), payload as BufferSource));
    const p = new Uint8Array(28 + ct.length);
    p.set(salt); p.set(iv, 16); p.set(ct, 28);
    payload = p;
  }
  const out = new Uint8Array(2 + payload.length);
  out[0] = 2; out[1] = flags; out.set(payload, 2);
  return "~" + b64urlEncode(out);
}

export function isUrlSource(value: string): boolean {
  const s = value.trim();
  return /^blob:/i.test(s) || /^https?:\/\//i.test(s) || /^\/\//.test(s) || /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:[/?#]|$)/i.test(s) || /^\[[0-9a-f:]+\](?::\d+)?(?:[/?#]|$)/i.test(s) || /^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(s);
}

/** Browser-only URL import. Cross-origin sources must allow CORS. */
async function decodeUrlSource(input: string): Promise<Decoded> {
  const raw = input.trim();
  const candidates: string[] = [];
  try {
    if (/^blob:/i.test(raw) || /^https?:\/\//i.test(raw)) candidates.push(raw);
    else if (raw.startsWith("//")) candidates.push(new URL(raw, location.href).toString());
    else {
      const host = raw.replace(/^\/+/, "");
      candidates.push(new URL("https://" + host).toString());
      if (location.protocol !== "https:") candidates.push(new URL("http://" + host).toString());
    }
  } catch { return { status: "error", reason: "Invalid URL. Use blob:, http:// or https://." }; }
  let lastError = "The browser could not read that URL.";
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) { lastError = "The URL returned HTTP " + response.status + "."; continue; }
      const maxBytes = 50 * 1024 * 1024;
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > maxBytes) return { status: "error", reason: "File exceeds the 50 MB browser import limit." };
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) return { status: "error", reason: "File exceeds the 50 MB browser import limit." };
      const mime = (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
      const parsed = new URL(candidate);
      return { status: "ok", mime, bytes, text: isTextMime(mime) ? strFromU8(bytes) : null, meta: { name: parsed.pathname.split("/").pop() || parsed.hostname }, instant: false, version: 2 };
    } catch (error) {
      lastError = error instanceof TypeError ? "Browser fetch was blocked (usually CORS), or this blob URL is no longer available in this tab." : (error instanceof Error ? error.message : lastError);
    }
  }
  return { status: "error", reason: lastError };
}

export async function decodeAny(payload: string, password?: string): Promise<Decoded> {
  payload = payload.trim();
  if (!payload) return { status: "error", reason: "Empty link" };
  if (isUrlSource(payload)) return decodeUrlSource(payload);
  if (payload[0] !== "~") {
    const instant = payload[0] === "!";
    const d = decodePayload(instant ? payload.slice(1) : payload);
    if (!d) return { status: "error", reason: "The link is incomplete or corrupted" };
    return { status: "ok", mime: d.mime, bytes: strToU8(d.content), text: d.content, meta: {}, instant, version: 1 };
  }
  let raw: Uint8Array;
  try { raw = b64urlDecode(payload.slice(1)); } catch { return { status: "error", reason: "The link is corrupted" }; }
  if (raw[0] !== 2) return { status: "error", reason: "Made by a newer x11 version" };
  const flags = raw[1] ?? 0;
  const instant = !!(flags & F_INSTANT);
  let body = raw.subarray(2);
  if (flags & F_ENC) {
    if (!password) return { status: "locked", instant };
    try {
      body = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: body.subarray(16, 28) as BufferSource }, await key(password, body.subarray(0, 16)), body.subarray(28) as BufferSource,
      ));
    } catch { return { status: "error", reason: "Wrong password" }; }
  }
  try {
    if (flags & F_DEFLATE) {
      const codec = flags & 24;
      if (codec === F_CODEC_GZIP || codec === F_CODEC_DEFLATE) {
        const format = codec === F_CODEC_GZIP ? "gzip" : "deflate";
        body = new Uint8Array(await new Response(new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());
      } else body = inflateSync(body);
    }
    const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const ml = dv.getUint16(0);
    const mime = strFromU8(body.subarray(2, 2 + ml));
    const tl = dv.getUint16(2 + ml);
    const meta = JSON.parse(strFromU8(body.subarray(4 + ml, 4 + ml + tl)) || "{}") as Meta;
    const bytes = body.slice(4 + ml + tl);
    return { status: "ok", mime, bytes, text: isTextMime(mime) ? strFromU8(bytes) : null, meta, instant, version: 2 };
  } catch {
    return { status: "error", reason: "The link is corrupted" };
  }
}

export function isLocked(payload: string): boolean {
  if (payload[0] !== "~") return false;
  try { return !!((b64urlDecode(payload.slice(1, 8))[1] ?? 0) & F_ENC); } catch { return false; }
}

/** Re-encode an image in the browser. Returns null if not resizable (e.g. GIF/SVG). */
export async function processImage(
  file: Blob, o: { maxSide: number; quality: number; format: "image/webp" | "image/jpeg" | "image/png" | "original" },
): Promise<{ blob: Blob; w: number; h: number } | null> {
  if (!/^image\/(png|jpeg|webp|bmp|avif)/.test(file.type)) return null;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, o.maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  const type = o.format === "original" ? file.type : o.format;
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, o.quality));
  return blob ? { blob, w, h } : null;
}
