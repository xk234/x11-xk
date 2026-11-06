# Cloudflare Pages deployment

The Studio is a client-only TanStack Start SPA, with one Cloudflare Pages Function for raw resource delivery and optional R2-backed large-resource storage. Normal editing and fragment-link decoding remain local. R2 uploads require a bucket binding and a shared upload-key secret. The SPA shell is emitted as `dist/client/index.html`; do not add a catch-all `_redirects` rule for `/_shell.html`. Cloudflare Pages canonicalizes `.html` URLs, while its default SPA fallback serves the root `index.html` for unknown paths.

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


## Raw resource URLs and large-file storage

The raw endpoint is `/r` and supports two forms:

- Inline: `/r?data=PAYLOAD` — decodes an unencrypted x11 v2 payload and returns its original bytes.
- Stored: `/r?id=32_HEX_ID` — streams an R2 object without putting its bytes in the URL.

Any syntactically valid MIME type is accepted for raw delivery. The endpoint includes CORS headers and byte-range responses for media clients. HTML, XHTML and SVG responses receive a restrictive sandbox Content-Security-Policy; this is not a CORS bypass or a promise that every consumer will execute every MIME type.

Inline limits remain finite: 1.5 million payload characters and 25 MiB decoded bytes. Query URLs are still subject to browser, proxy and Cloudflare URL limits. Use R2-backed stored links for larger files.

### Enable R2-backed links

1. Create a Cloudflare R2 bucket for x11 resources.
2. In the Cloudflare Pages project settings, add an R2 bucket binding named **`X11_R2`** pointing to that bucket.
3. Add a Pages environment secret named **`X11_UPLOAD_KEY`** with a long random value. The Studio's large-link panel asks the uploader to enter this same value; it is not embedded in the application.
4. Redeploy the Pages project so the binding and secret are available to the Function.
5. Test `/r?health=1`; its JSON should report `upload: true` and `multipart: true`.

The Studio uploads large local files in 8 MiB R2 multipart chunks. Each chunk is SHA-256 checked by the Function before it is accepted. Completed chunk ETags and the upload session are saved in localStorage so the same selected file can resume after a reload. The browser does not read a file larger than 20 MiB into a JavaScript byte array merely to stage it; it slices the original File into upload chunks. R2 multipart sessions expire after seven days if left incomplete. With 8 MiB chunks and R2’s 10,000-part ceiling, the theoretical part-count ceiling is about 80 GiB, but Cloudflare plan request/time limits may impose a lower practical limit.

### Important storage and privacy behavior

- Stored resource URLs are public to anyone who has the ID. The upload key authorizes writes; it does not encrypt or restrict reads.
- Do not upload private or sensitive files to this public raw endpoint.
- Anyone who knows the shared upload key can create uploads. Keep it private and rotate it if it is exposed.
- R2 objects use the `x11/` prefix. Configure an R2 lifecycle rule to expire that prefix after your desired retention period (for example, 30 days); the app does not yet implement deletion or automatic expiry. R2 automatically aborts incomplete multipart uploads after seven days.
- Multipart upload avoids one giant request, but it is still subject to Cloudflare Pages request, execution and R2 limits. It is not unlimited storage or a peer-to-peer transport.
- Password-protected x11 fragment links cannot be decoded by the raw endpoint. R2 raw uploads are public byte storage, not password-encrypted shares.

### Blob launch behavior

The Studio's **Open Blob** action and decoded links create local `blob:` URLs. They do not put the bytes into the URL or call `document.write`. HTML/XHTML/SVG previews are nested inside a sandboxed iframe without `allow-same-origin`; CSS and JavaScript source are wrapped for preview. Other MIME types open as their corresponding Blob resource. Blob URLs are local to the creating browser context and are not durable share links.

`/r?health=1` is a deployment diagnostic. It reports endpoint version/capabilities but does not prove that a stored resource is reachable until R2 is configured.
