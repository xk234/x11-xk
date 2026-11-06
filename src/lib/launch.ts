const ACTIVE_DOCUMENTS = new Set(["text/html", "application/xhtml+xml", "image/svg+xml"]);

function htmlShell(innerUrl: string, title: string) {
  const safeTitle = title.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${safeTitle}</title><style>html,body{margin:0;width:100%;height:100%;background:#101116;color:#eee}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe title="${safeTitle}" sandbox="allow-scripts allow-forms allow-downloads allow-modals" src="${innerUrl}"></iframe></body></html>`;
}

/**
 * Creates a local object URL without embedding bytes in the URL.
 * Active documents execute only inside a sandboxed opaque-origin iframe.
 */
export function createLaunchUrl(bytes: Uint8Array, mime: string): string {
  const normalized = mime.toLowerCase().split(";")[0].trim() || "application/octet-stream";
  let content = new Blob([bytes as BlobPart], { type: normalized });
  if (normalized.includes("css")) {
    const css = new TextDecoder().decode(bytes).replace(/<\/style/gi, "<\\/style");
    content = new Blob([`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main><h1>x11 CSS preview</h1><p>Stylesheet preview</p><button>Example button</button></main></body></html>`], { type: "text/html" });
  } else if (normalized.includes("javascript") || normalized.includes("ecmascript")) {
    const js = new TextDecoder().decode(bytes).replace(/<\/script/gi, "<\\/script");
    content = new Blob([`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script>try{\n${js}\n}catch(e){const n=document.createElement("pre");n.textContent=e.stack||String(e);document.body.append(n)}</script></body></html>`], { type: "text/html" });
  }
  const innerUrl = URL.createObjectURL(content);
  if (ACTIVE_DOCUMENTS.has(normalized) || normalized.includes("css") || normalized.includes("javascript") || normalized.includes("ecmascript")) {
    return URL.createObjectURL(new Blob([htmlShell(innerUrl, "x11 isolated preview")], { type: "text/html" }));
  }
  return innerUrl;
}
