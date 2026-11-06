const ACTIVE_DOCUMENTS = new Set(["text/html", "application/xhtml+xml", "image/svg+xml"]);

/**
 * Launches content as a top-level Blob URL. X11 intentionally does not use
 * iframes (sandboxed or otherwise) for previews or decoded documents.
 *
 * Blob documents inherit the creator's origin. Only open content you trust:
 * same-page execution is deliberately not an isolation boundary.
 */
export function createLaunchUrlFromBlob(content: Blob, _mime: string): string {
  return URL.createObjectURL(content);
}

/** Creates a local object URL without embedding bytes in the URL. */
export function createLaunchUrl(bytes: Uint8Array, mime: string): string {
  const normalized = (mime.toLowerCase().split(";")[0] || "").trim() || "application/octet-stream";
  let content = new Blob([bytes as BlobPart], { type: normalized });

  if (normalized.includes("css")) {
    const css = new TextDecoder().decode(bytes).replace(/<\/style/gi, "<\\/style");
    content = new Blob([
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main><h1>x11 CSS preview</h1><p>Stylesheet preview</p><button>Example button</button></main></body></html>`,
    ], { type: "text/html" });
  } else if (normalized.includes("javascript") || normalized.includes("ecmascript")) {
    const js = new TextDecoder().decode(bytes).replace(/<\/script/gi, "<\\/script");
    content = new Blob([
      `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script>try{\n${js}\n}catch(e){const n=document.createElement("pre");n.textContent=e.stack||String(e);document.body.append(n)}</script></body></html>`,
    ], { type: "text/html" });
  }

  return createLaunchUrlFromBlob(content, ACTIVE_DOCUMENTS.has(normalized) ? normalized : content.type);
}
