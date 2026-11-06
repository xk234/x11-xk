import { inflateSync } from "fflate";

const F_ENC = 1;
const F_DEFLATE = 4;
const F_CODEC_GZIP = 8;
const F_CODEC_DEFLATE = 16;
const MAX_INLINE_BYTES = 25 * 1024 * 1024;
const MAX_PAYLOAD_CHARS = 1_500_000;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

interface StoredObject {
  size: number;
  body: ReadableStream<Uint8Array> | null;
  httpMetadata?: { contentType?: string; contentDisposition?: string };
  writeHttpMetadata(headers: Headers): void;
}
interface MultipartPart { partNumber: number; etag: string; sha256?: string }
interface R2MultipartUploadLike {
  uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream<Uint8Array> | ArrayBuffer): Promise<{ etag: string }>;
  complete(parts: MultipartPart[]): Promise<unknown>;
  abort(): Promise<void>;
}
interface R2BucketLike {
  put(key: string, value: ReadableStream<Uint8Array> | ArrayBuffer, options?: { httpMetadata?: { contentType?: string; contentDisposition?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<StoredObject | null>;
  createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string; contentDisposition?: string }; customMetadata?: Record<string, string> }): R2MultipartUploadLike;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUploadLike;
}
interface Env { X11_R2?: R2BucketLike; X11_UPLOAD_KEY?: string }

function decode64(input: string): Uint8Array {
  const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function unpack(payload: string): Promise<{ mime: string; encoding?: string; bytes: Uint8Array }> {
  if (!payload.startsWith("~")) throw new Error("Raw mode requires an unencrypted v2 payload");
  const raw = decode64(payload.slice(1));
  if (raw.length < 2 || raw[0] !== 2) throw new Error("Unsupported x11 payload version");
  const flags = raw[1];
  if (flags & F_ENC) throw new Error("Password-protected payloads cannot be served as raw resources");
  let body = raw.subarray(2);
  if (flags & F_DEFLATE) {
    const codec = flags & 24;
    if (codec === F_CODEC_GZIP || codec === F_CODEC_DEFLATE) {
      const format = codec === F_CODEC_GZIP ? "gzip" : "deflate";
      body = new Uint8Array(await new Response(new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());
    } else body = inflateSync(body);
  }
  if (body.length < 4) throw new Error("Invalid x11 container");
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const mimeLength = view.getUint16(0);
  if (mimeLength > body.length - 4) throw new Error("Invalid MIME header");
  const mime = new TextDecoder().decode(body.subarray(2, 2 + mimeLength));
  const metaLength = view.getUint16(2 + mimeLength);
  const metaStart = 4 + mimeLength;
  const start = metaStart + metaLength;
  if (start > body.length) throw new Error("Invalid metadata header");
  let encoding: string | undefined;
  try {
    const meta = JSON.parse(new TextDecoder().decode(body.subarray(metaStart, start))) as { encoding?: string };
    if (meta.encoding && /^[a-z0-9._-]{1,40}$/i.test(meta.encoding)) encoding = meta.encoding.toLowerCase();
  } catch { /* metadata is optional for raw charset handling */ }
  return { mime, encoding, bytes: body.slice(start) };
}

function validMime(input: string): string | null {
  const parts = input.split(";");
  const mime = parts[0].toLowerCase().trim();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) return null;
  const charset = parts.slice(1).map((part) => part.trim()).find((part) => /^charset=/i.test(part));
  if (!charset) return mime;
  const value = charset.slice(charset.indexOf("=") + 1).replace(/^["\']|["\']$/g, "").toLowerCase();
  return /^[a-z0-9._-]{1,40}$/.test(value) ? mime + "; charset=" + value : mime;
}

function headersFor(mime: string, cache = "public, max-age=3600") {
  const headers = new Headers();
  headers.set("Content-Type", mime);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Range, Content-Type, X-X11-Upload-Key, X-X11-Name, X-X11-SHA256");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", cache);
  headers.set("Content-Disposition", "inline");
  // Active documents must not execute with the x11 Studio's origin.
  const baseMime = mime.split(";")[0].trim();
  if (baseMime === "text/html" || baseMime === "application/xhtml+xml" || baseMime === "image/svg+xml") {
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline' https:; font-src data: https:; media-src blob: https:; form-action 'none'; base-uri 'none'");
  }
  return headers;
}

function response(body: BodyInit | null, status: number, mime = "text/plain; charset=utf-8", extra: HeadersInit = {}) {
  const headers = headersFor(mime);
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(body, { status, headers });
}

function parseRange(value: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return "invalid";
  end = Math.min(end, size - 1);
  return { start, end };
}

async function authorized(request: Request, env: Env) {
  if (!env.X11_UPLOAD_KEY) return false;
  const supplied = request.headers.get("X-X11-Upload-Key") ?? "";
  const a = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied));
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.X11_UPLOAD_KEY));
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function handleMultipart(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.X11_R2) return response("R2 storage is not configured.", 503);
  if (!env.X11_UPLOAD_KEY) return response("Uploads are disabled until X11_UPLOAD_KEY is configured.", 503);
  if (!(await authorized(request, env))) return response("Upload key required or incorrect.", 401);
  const action = url.searchParams.get("multipart");
  if (action === "start") {
    const input = await request.json() as { mime?: string; name?: string };
    const mime = validMime(input.mime || "application/octet-stream");
    if (!mime) return response("Invalid Content-Type MIME value.", 415);
    const id = crypto.randomUUID().replace(/-/g, "");
    const name = String(input.name || "shared-resource").replace(/[\\r\\n"]/g, "_").slice(0, 180);
    const upload = env.X11_R2.createMultipartUpload("x11/" + id, {
      httpMetadata: { contentType: mime, contentDisposition: "inline" },
      customMetadata: { name, created: new Date().toISOString() },
    });
    return response(JSON.stringify({ ok: true, id, uploadId: upload.uploadId }), 201, "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  }
  const id = url.searchParams.get("id") || "";
  const uploadId = url.searchParams.get("uploadId") || "";
  if (!/^[a-f0-9]{32}$/.test(id) || !uploadId) return response("Invalid multipart session.", 400);
  const upload = env.X11_R2.resumeMultipartUpload("x11/" + id, uploadId);
  if (action === "part") {
    const partNumber = Number(url.searchParams.get("partNumber"));
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000 || !request.body) return response("Invalid multipart part.", 400);
    try {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > 8 * 1024 * 1024) return response("Multipart chunks are limited to 8 MiB.", 413);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const actualHash = Array.from(digest).map((value) => value.toString(16).padStart(2, "0")).join("");
      const expectedHash = request.headers.get("X-X11-SHA256") || "";
      if (!/^[a-f0-9]{64}$/.test(expectedHash) || expectedHash !== actualHash) return response("Chunk integrity check failed.", 422);
      const part = await upload.uploadPart(partNumber, bytes);
      return response(JSON.stringify({ ok: true, partNumber, etag: part.etag, sha256: actualHash }), 200, "application/json; charset=utf-8", { "Cache-Control": "no-store" });
    } catch (error) {
      return response(error instanceof Error ? error.message : "Multipart part failed.", 502);
    }
  }
  if (action === "complete") {
    const input = await request.json() as { parts?: MultipartPart[] };
    const parts = Array.isArray(input.parts) ? input.parts : [];
    if (!parts.length || parts.some((part) => !Number.isInteger(part.partNumber) || part.partNumber < 1 || typeof part.etag !== "string")) return response("Invalid multipart completion manifest.", 400);
    try {
      await upload.complete(parts.sort((a, b) => a.partNumber - b.partNumber).map(({ partNumber, etag }) => ({ partNumber, etag })));
      return response(JSON.stringify({ ok: true, id, url: new URL("/r?id=" + id, request.url).toString() }), 201, "application/json; charset=utf-8", { "Cache-Control": "no-store" });
    } catch (error) {
      return response(error instanceof Error ? error.message : "Multipart completion failed.", 502);
    }
  }
  if (action === "abort") {
    await upload.abort();
    return response(JSON.stringify({ ok: true }), 200, "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  }
  return response("Unknown multipart action.", 400);
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  if (!env.X11_R2) return response("R2 storage is not configured. Bind an R2 bucket as X11_R2.", 503);
  if (!env.X11_UPLOAD_KEY) return response("Uploads are disabled until X11_UPLOAD_KEY is configured.", 503);
  if (!(await authorized(request, env))) return response("Upload key required or incorrect.", 401);
  const mime = validMime(request.headers.get("Content-Type") || "application/octet-stream");
  if (!mime) return response("Invalid Content-Type MIME value.", 415);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_UPLOAD_BYTES) return response("Upload exceeds the current 100 MiB edge limit.", 413);
  if (!request.body) return response("Empty upload.", 400);
  const id = crypto.randomUUID().replace(/-/g, "");
  const name = (request.headers.get("X-X11-Name") || "shared-resource").replace(/[\r\n"]/g, "_").slice(0, 180);
  try {
    await env.X11_R2.put("x11/" + id, request.body, {
      httpMetadata: { contentType: mime, contentDisposition: "inline" },
      customMetadata: { name, created: new Date().toISOString() },
    });
    return response(JSON.stringify({ ok: true, id, url: new URL("/r?id=" + id, request.url).toString(), name }), 201, "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  } catch (error) {
    return response(error instanceof Error ? error.message : "R2 upload failed.", 502);
  }
}

async function handleStored(request: Request, env: Env, id: string): Promise<Response> {
  if (!env.X11_R2) return response("R2 storage is not configured.", 503);
  if (!/^[a-f0-9]{32}$/.test(id)) return response("Invalid resource ID.", 400);
  const object = await env.X11_R2.get("x11/" + id);
  if (!object) return response("Resource not found.", 404);
  const mime = validMime(object.httpMetadata?.contentType || "application/octet-stream") || "application/octet-stream";
  const range = parseRange(request.headers.get("Range"), object.size);
  if (range === "invalid") return response("Requested range is not satisfiable.", 416, mime, { "Content-Range": `bytes */${object.size}` });
  if (range) {
    const part = await env.X11_R2.get("x11/" + id, { range: { offset: range.start, length: range.end - range.start + 1 } });
    if (!part?.body) return response("Stored range unavailable.", 502, mime);
    const headers = headersFor(mime);
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
    return new Response(request.method === "HEAD" ? null : part.body, { status: 206, headers });
  }
  const headers = headersFor(mime);
  headers.set("Content-Length", String(object.size));
  object.writeHttpMetadata(headers);
  // Re-apply security and CORS headers after R2 metadata.
  const safe = headersFor(mime);
  headers.forEach((v, k) => { if (!["content-security-policy", "access-control-allow-origin", "x-content-type-options", "cross-origin-resource-policy"].includes(k.toLowerCase())) safe.set(k, v); });
  for (const key of ["Content-Security-Policy", "Access-Control-Allow-Origin", "X-Content-Type-Options", "Cross-Origin-Resource-Policy"]) {
    const value = headersFor(mime).get(key);
    if (value) safe.set(key, value);
  }
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers: safe });
}

export async function onRequest({ request, env }: { request: Request; env: Env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor("text/plain; charset=utf-8") });
  if (request.method === "POST") {
    const url = new URL(request.url);
    if (url.searchParams.has("multipart")) return handleMultipart(request, env, url);
    return handleUpload(request, env);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return response("Method not allowed.", 405, undefined, { Allow: "GET, HEAD, POST, OPTIONS" });
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") {
    return response(JSON.stringify({ ok: true, endpoint: "/r", inlineMime: "any-valid-mime", upload: !!env.X11_R2 && !!env.X11_UPLOAD_KEY, maxUploadBytes: MAX_UPLOAD_BYTES, multipart: !!env.X11_R2 && !!env.X11_UPLOAD_KEY, range: true }), 200, "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  }
  const id = url.searchParams.get("id");
  if (id) return handleStored(request, env, id);
  const payload = url.searchParams.get("data") ?? "";
  if (!payload || payload.length > MAX_PAYLOAD_CHARS) return response("Missing or oversized ?data= payload.", 400);
  try {
    const { mime: rawMime, encoding, bytes } = await unpack(payload);
    if (bytes.byteLength > MAX_INLINE_BYTES) return response("Inline raw resource exceeds the 25 MiB limit. Use the R2 upload mode for larger files.", 413);
    const mime = validMime(rawMime + (encoding ? "; charset=" + encoding : ""));
    if (!mime) return response("Payload contains an invalid MIME type.", 415);
    const range = parseRange(request.headers.get("Range"), bytes.byteLength);
    if (range === "invalid") return response("Requested range is not satisfiable.", 416, mime, { "Content-Range": `bytes */${bytes.byteLength}` });
    if (range) {
      const slice = bytes.subarray(range.start, range.end + 1);
      return response(request.method === "HEAD" ? null : slice as BodyInit, 206, mime, {
        "Content-Length": String(slice.byteLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${bytes.byteLength}`,
      });
    }
    return response(request.method === "HEAD" ? null : bytes as BodyInit, 200, mime, { "Content-Length": String(bytes.byteLength) });
  } catch (error) {
    return response(error instanceof Error ? error.message : "Unable to decode raw resource.", 400);
  }
}
