# Cloudflare Pages deployment

This branch is configured as a client-only TanStack Start SPA. It does not need a Worker, Pages Function, Supabase project, database, server secrets, or server runtime. The SPA shell is emitted as `dist/client/index.html`; do not add a catch-all `_redirects` rule for `/_shell.html`. Cloudflare Pages canonicalizes `.html` URLs, while its default SPA fallback serves the root `index.html` for unknown paths.

## Build settings

- Framework preset: None (or Vite if the dashboard requires a preset)
- Build command: `bun install --frozen-lockfile && bun run build`
- Build output directory: `dist/client`
- Root directory: `/`
- Environment variables: none required

Connect `xk234/x11-xk` and select the `x11-recovery` branch. The build workflow also runs TypeScript and production-build checks for that branch.

## Root-fragment links and previews

Every share link has this form:

`https://x11-xk.pages.dev/#PAYLOAD`

The app reads the fragment on the root route and decodes it entirely in the browser. There is no `/doc.write` route. The payload is not sent to Cloudflare as part of the HTTP request.

- `#~...` and legacy x11 fragments decode locally.
- `#blob:...` can only be read while that object URL remains valid in the creating browser context.
- URL imports from `http(s)` are fetched in the browser; cross-origin reads require the source server to permit CORS.
- A static site cannot bypass CORS or change another server's response headers.
- Live HTML/SVG, CSS, and JavaScript previews run in a sandboxed browser frame. CSS is applied to a small preview document; JavaScript runs in that isolated document. Other languages are shown as source because the browser cannot execute them natively.

All payload encoding, compression, password encryption, decoding, previews, and local history run in the browser. Site-wide visit counts and IP/network analytics are not available in a static-only deployment; no IP or network identifiers are collected.

