import LZString from "lz-string";

// Payload format (compatible with the original x11 tool): "<mime>\n<content>"
export function encodePayload(mime: string, content: string): string {
  return LZString.compressToEncodedURIComponent(`${mime}\n${content}`);
}

export function decodePayload(payload: string): { mime: string; content: string } | null {
  const decoded = LZString.decompressFromEncodedURIComponent(payload);
  if (decoded == null || decoded === "") return null;
  const nl = decoded.indexOf("\n");
  if (nl === -1) return { mime: "text/html", content: decoded };
  return { mime: decoded.slice(0, nl).trim() || "text/html", content: decoded.slice(nl + 1) };
}

/** Everything after the FIRST "#" is the payload. */
export function payloadFromUrl(url: string): string {
  const i = url.indexOf("#");
  return i === -1 ? url.trim() : url.slice(i + 1).trim();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
