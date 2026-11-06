import { inflateSync } from "fflate";
import LZString from "lz-string";

const F_ENC = 1;
const F_DEFLATE = 4;
const F_CODEC_GZIP = 8;
const F_CODEC_DEFLATE = 16;
const MAX_BYTES = 25 * 1024 * 1024;

function decode64(input: string): Uint8Array {
  const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function unpack(payload: string): Promise<{ mime: string; bytes: Uint8Array }> {
  if (payload.startsWith("!")) payload = payload.slice(1);
  if (!payload.startsWith("~")) {
    const legacy = LZString.decompressFromEncodedURIComponent(payload);
    if (!legacy) throw new Error("Invalid legacy payload");
    const split = legacy.indexOf("\n");
    const mime = split < 0 ? "text/html" : legacy.slice(0, split).trim();
    const text = split < 0 ? legacy : legacy.slice(split + 1);
    return { mime, bytes: new TextEncoder().encode(text) };
  }

  const raw = decode64(payload.slice(1));
  if (raw[0] !== 2 || raw.length < 2) throw new Error("Unsupported payload version");
  const flags = raw[1];
  if (flags & F_ENC) throw new Error("Password-protected links cannot be served as raw resources");
  let body = raw.subarray(2);
  if (flags & F_DEFLATE) {
    const codec = flags & 24;
    if (codec === F_CODEC_GZIP || codec === F_CODEC_DEFLATE) {
      const format = codec === F_CODEC_GZIP ? "gzip" : "deflate";
      body = new Uint8Array(await new Response(new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());
    } else {
      body = inflateSync(body);
    }
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const mimeLength = view.getUint16(0);
  const mime = new TextDecoder().decode(body.subarray(2, 2 + mimeLength));
  const metaLength = view.getUint16(2 + mimeLength);
  const bytes = body.slice(4 + mimeLength + metaLength);
  return { mime, bytes };
}

function response(body: BodyInit | null, status: number, mime = "text/plain; charset=utf-8", extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  headers.set("Content-Type", mime);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Range, Content-Type");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(body, { status, headers });
}

export async function onRequest(context: { request: Request; params: Record<string, string | undefined> }) {
  const { request, params } = context;
  if (request.method === "OPTIONS") return response(null, 204);
  if (request.method !== "GET" && request.method !== "HEAD") return response("Method not allowed", 405, "text/plain; charset=utf-8", { Allow: "GET, HEAD, OPTIONS" });
  const payload = params.path ?? "";
  if (!payload || payload.length > 1_500_000) return response("Missing or oversized raw payload", 400);
  try {
    const { mime, bytes } = await unpack(payload);
    if (bytes.byteLength > MAX_BYTES) return response("Raw resource exceeds the 25 MB limit", 413);
    const safeMime = mime.toLowerCase().split(";")[0].trim();
    const allowed = /^(image\/(png|jpeg|webp|gif|avif|bmp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|font\/[a-z0-9.+-]+|application\/(pdf|font-woff|font-woff2|octet-stream)|application\/vnd\.ms-fontobject)$/;
    if (!allowed.test(safeMime)) return response("Raw mode only serves passive media, fonts and documents. HTML, SVG, CSS and scripts are not served here.", 415);
    const headers = { "Content-Length": String(bytes.byteLength), "Accept-Ranges": "bytes", "Content-Disposition": "inline" };
    return response(request.method === "HEAD" ? null : bytes as BodyInit, 200, safeMime, headers);
  } catch (error) {
    return response(error instanceof Error ? error.message : "Unable to decode raw payload", 400);
  }
}
