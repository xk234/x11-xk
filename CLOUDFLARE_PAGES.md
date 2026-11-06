# Cloudflare Pages deployment

This branch is configured as a client-only TanStack Start SPA. It does not need a Worker, Pages Function, Supabase project, database, server secrets, or server runtime. The SPA shell is emitted as `dist/client/index.html`; do not add a catch-all `_redirects` rule for `/_shell.html`. Cloudflare Pages canonicalizes `.html` URLs, while its default SPA fallback serves the root `index.html` for unknown paths.

## Build settings

- Framework preset: None (or Vite if the dashboard requires a preset)
- Build command: `bun install --frozen-lockfile && bun run build`
- Build output directory: `dist/client`
- Root directory: `/`
- Environment variables: none required

Connect `xk234/x11-xk` and select the `x11-recovery` branch. The build workflow also runs TypeScript and production-build checks for that branch.

## URL import behavior

- `#~...` and legacy x11 fragments decode locally.
- `#blob:...` is fetched only if the browser still has access to that object URL in the current browser context.
- `#https://host/path`, `#http://host/path`, `#//host/path`, and `#host/path` are fetched by the browser. A scheme-less URL defaults to HTTPS.
- Cross-origin fetches require the source server to send permissive CORS headers. A static site cannot bypass CORS; there is deliberately no proxy.
- The `/doc.write#https://host/path` route can display a remote page in a sandboxed frame without reading its response, so CORS is not needed just to display it. The remote site can still block framing with its own security headers. HTTP frames are blocked as mixed content when the x11 site is HTTPS.
- Blob URLs are temporary browser references, not durable share URLs. `blob:null/...` may not be readable outside the context that created it.

All payload encoding, compression, password encryption, decoding, previews, and local history run in the browser. Site-wide visit counts and IP/network analytics are not available in a static-only deployment; no IP or network identifiers are collected.


## Isolated document URL

A decoded document can be opened at:

`https://x11-xk.pages.dev/doc.write#PAYLOAD`

The route decodes the fragment locally and renders HTML/SVG inside a sandboxed iframe with an opaque origin. This is the safe static equivalent of opening a document in a separate tab. The opener cannot use `window.open(url).document.write(...)` against a cross-origin window; browser same-origin rules prohibit that. A static Pages site also cannot alter another site's response headers or bypass its CORS policy.
