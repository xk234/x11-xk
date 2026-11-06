import { inflateSync } from "fflate";

const F_ENC = 1;
const F_DEFLATE = 4;
const F_CODEC_GZIP = 8;
const F_CODEC_DEFLATE = 16;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PAYLOAD_CHARS = 1_500_000;

function decode64(input: string): Uint8Array {
  const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function unpack(payload: string): Promise<{ mime: string; bytes: Uint8Array }> {
  if (!payload.startsWith("~")) throw new Error("Raw mode currently requires an unencrypted v2 payload");
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
  const start = 4 + mimeLength + metaLength;
  if (start > body.length) throw new Error("Invalid metadata header");
  return { mime, bytes: body.slice(start) };
}

function reply(body: BodyInit | null, status: number, mime = "text/plain; charset=utf-8", extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  headers.set("Content-Type", mime);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Range, Content-Type");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(body, { status, headers });
}

export async function onRequest({ request }: { request: Request }) {
  if (request.method === "OPTIONS") return reply(null, 204);
  if (request.method !== "GET" && request.method !== "HEAD") return reply("Method not allowed", 405, undefined, { Allow: "GET, HEAD, OPTIONS" });
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") {
    return reply(JSON.stringify({ ok: true, endpoint: "/r", format: "x11-v2", range: true }), 200, "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  }
  const payload = url.searchParams.get("data") ?? "";
  if (!payload || payload.length > MAX_PAYLOAD_CHARS) return reply("Missing or oversized ?data= payload", 400);
  try {
    const { mime, bytes } = await unpack(payload);
    if (bytes.byteLength > MAX_BYTES) return reply("Raw resource exceeds the 25 MiB limit", 413);
    const safeMime = mime.toLowerCase().split(";")[0].trim();
    const allowed = /^(image\/(png|jpeg|webp|gif|avif|bmp|svg\+xml|x-icon)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|font\/[a-z0-9.+-]+|application\/(pdf|font-woff|font-woff2|font-sfnt|x-font-ttf|octet-stream)|application\/vnd\.ms-fontobject)$/;
    if (!allowed.test(safeMime)) return reply("Raw mode only serves passive images, audio, video, fonts and documents.", 415);
    const headers: Record<string, string> = {
      "Content-Disposition": "inline",
    };
    if (safeMime === "image/svg+xml") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:";
    const range = request.headers.get("Range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match || (!match[1] && !match[2])) return reply("Invalid byte range", 416, undefined, { "Content-Range": `bytes */${bytes.byteLength}` });
      let start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
      let end = match[2] ? Number(match[2]) : bytes.byteLength - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= bytes.byteLength) {
        return reply("Requested range is not satisfiable", 416, undefined, { "Content-Range": `bytes */${bytes.byteLength}` });
      }
      end = Math.min(end, bytes.byteLength - 1);
      const slice = bytes.subarray(start, end + 1);
      headers["Content-Length"] = String(slice.byteLength);
      headers["Content-Range"] = `bytes ${start}-${end}/${bytes.byteLength}`;
      return reply(request.method === "HEAD" ? null : slice as BodyInit, 206, safeMime, headers);
    }
    headers["Content-Length"] = String(bytes.byteLength);
    return reply(request.method === "HEAD" ? null : bytes as BodyInit, 200, safeMime, headers);
  } catch (error) {
    return reply(error instanceof Error ? error.message : "Unable to decode raw resource", 400);
  }
}
