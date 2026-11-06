# Cloudflare Pages deployment

The Studio is a client-only TanStack Start SPA, with one optional Cloudflare Pages Function for raw resource delivery. It does not need Supabase, a database, server secrets, or a separate always-on server. The SPA shell is emitted as `dist/client/index.html`; do not add a catch-all `_redirects` rule for `/_shell.html`. Cloudflare Pages canonicalizes `.html` URLs, while its default SPA fallback serves the root `index.html` for unknown paths.

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


## Raw resource URLs

The Studio can also copy a URL in this form:

`https://x11-xk.pages.dev/r?data=PAYLOAD`

Cloudflare Pages detects the repository-level `functions/r/[[path]].ts` route and runs it at the edge. It decodes unencrypted x11 v1/v2 payloads and serves only allowlisted passive media, fonts and PDF/octet-stream resources with permissive CORS headers. This is intended for remote services that fetch an image URL, such as slide editors.

Important differences:
- A fragment URL such as `/#PAYLOAD` cannot be fetched by another service: URL fragments are never included in HTTP requests.
- Raw mode rejects HTML, CSS, JavaScript and password-protected links; SVG is served with a restrictive sandbox CSP.
- Raw responses are capped at 25 MiB and query payloads at 1.5 million characters (subject to browser, proxy and Cloudflare URL-size limits).
- The Pages Function means deployment is no longer strictly static-only, although the editor and decoder remain static client code.
- Keep the Pages project root at the repository root so Cloudflare can discover the `functions/` directory while publishing `dist/client`.


The raw endpoint now uses a query parameter rather than a catch-all path segment. This avoids catch-all route parameter ambiguity, but does not remove URL length limits. Large binary resources need a future upload/storage-backed short-ID mode; a single static URL cannot safely carry arbitrarily large files.
