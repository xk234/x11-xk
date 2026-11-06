# Compression and project-bundle roadmap

This is the next engineering track for x11. The target is a single shareable root-fragment URL that can reconstruct a complete static website locally, without a server or network fetches.

## Goals

- Optimize the complete payload, not just individual text files.
- Preserve exact bytes unless the user explicitly enables a lossy media optimization.
- Keep the decoder backward-compatible with legacy v1 and current v2 links.
- Compare actual encoded URL length, CPU time, peak memory, and decode time. The smallest compressed byte count is not always the most usable share link.
- Keep compression and decoding in a worker where practical so large projects do not freeze the editor.

## Planned pipeline

1. **Project intake:** accept multiple files and folders; detect entry HTML, CSS, JavaScript, fonts, images, and other assets; preserve relative paths.
2. **Safe project manifest:** compact path table, MIME identifiers, byte lengths, per-file hashes, and an entry-point field. Reject path traversal and ambiguous duplicate paths.
3. **Pre-compression optimization:** optional HTML/CSS/JS minification, SVG cleanup, metadata stripping where safe, and asset-specific optimizers. Never silently rewrite arbitrary binary files.
4. **Cross-file optimization:** deduplicate identical assets, factor repeated strings into shared dictionaries, and consider shared compression contexts for text assets.
5. **Codec competition:** benchmark Deflate against Brotli, Zstandard, and LZMA-family codecs compiled to WASM. Select per-project or per-file based on measured output size and configured speed/memory budget. Codec candidates must be bundled locally; no runtime CDN dependency.
6. **Container format:** versioned compact header, codec identifier, manifest, integrity hashes, and optional authenticated encryption. Decoder must validate lengths and hashes before creating files.
7. **Runtime reconstruction:** create a temporary in-memory project filesystem and serve the selected entry document from an isolated origin/context, preserving relative imports and asset paths as far as browser sandbox rules allow.
8. **Large payload handling:** chunked compression, bounded-memory decode, progress reporting, and explicit warnings when a URL is beyond practical browser/chat/QR limits.

## Benchmark matrix

Use representative projects rather than synthetic repeated text alone:

- small hand-written HTML/CSS/JS sites
- production-minified sites
- image-heavy static sites
- font-heavy sites
- SVG/icon collections
- mixed binary assets
- duplicate-heavy projects

Record source bytes, compressed bytes, final base64url characters, encode/decode time, peak memory, and browser compatibility on low-memory Chromebooks. A codec only becomes a selectable mode if its trade-off is measurably better.

## Current implementation boundary

Current v2 is a single-file container using fflate Deflate and base64url. Fast / Max / Ultra / Insane / Dynamic compare the currently available Deflate and browser-native gzip/deflate candidates. Parser-based HTML, CSS, JavaScript/TypeScript and JSON rewrite passes are wired as opt-in transformations. Charset metadata now supports UTF-8, UTF-16LE/BE, Windows-1252, ISO-8859-1 and US-ASCII. Large local files over 20 MiB are staged as File objects and can be streamed through 8 MiB R2 multipart chunks with per-chunk SHA-256 checks and local resume state. Brotli/Zstandard/LZMA and other specialized codecs, runtime packs, project bundle reconstruction and P2P are still not implemented.


## Expanded codec ladder (implementation targets)

"After Ultra" is a codec search ladder, not a promise that every algorithm wins on every input. The app should benchmark candidates against the final container size and discard any candidate that expands the payload.

| Tier | Candidate engines | Intended trade-off |
|---|---|---|
| Fast | Deflate level 1 | Lowest encode latency |
| Max | Deflate level 9 | Strong general-purpose compression |
| Ultra | Deflate level/memory sweep | More search within Deflate |
| Insane | Deflate sweep + browser-native gzip/deflate | More candidate testing |
| Dynamic | Select the smallest measured supported candidate | Best measured output, slower encode |
| Future: Deep | Brotli quality sweep, Zstandard levels, LZMA2/XZ, Zopfli/Deflate, LZ4/Snappy fast paths | WASM codec competition |
| Future: Research | BZip2, PPMd, LZHAM and dictionary-trained variants | Specialized workloads; only ship if benchmarks justify cost |

The browser currently has native CompressionStream support for gzip/deflate formats, not a universal built-in Brotli, Zstandard or LZMA interface. Future engines must be locally bundled WASM/JS modules, lazily loaded, and selected only after compatibility and memory checks.

## Compression toggles and rewrite pipeline

Current toggles are deliberately opt-in:
- strip ordinary HTML comments (preserves conditional comments)
- collapse whitespace between HTML tags
- strip CSS comments
- compact CSS punctuation/whitespace
- remove SVG comments and metadata elements
- raster image resize / quality / output format controls

The current text rewrites are conservative regex passes, not parser-grade minifiers. They can alter unusual documents or whitespace-sensitive content; leave them disabled when byte-for-byte fidelity is required. Do not apply regex comment stripping to JavaScript: strings, template literals, regular expressions and source maps require a real parser/minifier.

Planned parser-grade stages:
- HTML: parse5-based tree minification with preserve-text/raw-text rules
- CSS: Lightning CSS or csso with syntax-aware minification
- JavaScript: esbuild or Terser with target/runtime settings and source-map controls
- SVG: SVGO with configurable plugins and preservation of accessibility/title/IDs
- Images: browser codecs plus locally bundled WebP/AVIF encoders where supported; optional metadata stripping and explicit lossy/lossless modes
- Fonts: WOFF2 conversion and optional font subsetting when a safe glyph set is supplied
- Dynamic pipeline: test rewrite combinations, verify parse/decode validity, then compare the final encoded link—not only intermediate compressed bytes

## Raw resource mode

The Pages Function at /r?data=<payload> decodes an unencrypted x11 payload and serves a limited allowlist of passive media/document types with CORS headers. It is intended for remote consumers such as slide editors that fetch an image URL. The fragment form /#<payload> is client-side only: browsers never send URL fragments in HTTP requests, so it cannot be used as a server-fetchable asset URL. Raw mode currently rejects HTML, CSS, JavaScript and password-protected payloads; SVG is served with a restrictive sandbox CSP, and caps decoded resources at 25 MiB. This endpoint means the project is no longer strictly static-only; the rest of the Studio remains static, while this one Pages Function supplies raw bytes.


## Runtime and execution roadmap

Execution is a separate subsystem from compression. A file being compressible does not mean the browser can execute it. Each runtime needs a local, version-pinned WASM build, a worker boundary, explicit resource limits, and a virtual filesystem.

### Web-native languages
- HTML, CSS, JavaScript, SVG, JSON: native browser parsing/rendering; JavaScript runs in a restricted preview worker/frame.
- TypeScript, JSX/TSX: compile with a locally bundled browser compiler (planned).
- WebAssembly modules: instantiate in a Worker with explicit imports and memory/fuel limits.

### WASM runtime targets
- Python: Pyodide (CPython + packages), plus a smaller MicroPython option for low-memory devices.
- C/C++: Clang/LLVM WASM toolchain, with WASI SDK output executed by a WASI runtime.
- Rust: rustc-to-wasm toolchain is too large for routine in-browser compilation; support running precompiled WASM/WASI artifacts first.
- Lua: Fengari (JS) or a Lua WASM/WASI build.
- Ruby: ruby.wasm.
- PHP: php-wasm.
- SQLite/SQL: SQLite WASM.
- Java: TeaVM-compiled apps or a WASM JVM experiment; full JVM is a heavyweight optional target.
- .NET: dotnet WASM runtime as an optional high-memory target.
- Go: precompiled WASM modules and WASI support; in-browser compilation is a separate heavyweight toolchain.
- Shell: WASI shell/coreutils bundle, not unrestricted host shell access.
- Game engines: Love2D/Lua WASM, Godot Web export, raylib/SDL WASM, and custom WebGPU/WebGL targets with graceful fallback.

### Runtime configuration controls
- Runtime selector and per-runtime version/build.
- Lazy-load runtime only after the user selects it; cache verified assets locally.
- Worker execution, memory ceiling, execution timeout/fuel budget, filesystem quota, network permission, and package allowlist.
- Low-memory preset for Chromebooks; balanced preset; high-memory preset.
- Console/stdout/stderr, virtual files, import/export, and reproducible project manifest.
- No arbitrary host filesystem, browser profile, or unrestricted network access. Network access is opt-in and origin-scoped.

### Packaging and offline rules
- All runtime JS/WASM assets must be self-hosted and version-pinned for offline use.
- Do not load toolchains from a CDN at runtime.
- Separate "run existing artifact" from "compile source"; compilation toolchains are much larger.
- Make optional runtime packs downloadable/cacheable individually instead of shipping every compiler in the initial page bundle.
- Provide explicit estimated download size and memory requirements before enabling a runtime.


## Expanded format and binary optimizer inventory

These are candidate local libraries / WASM packs to evaluate, not all shipped dependencies:

### Text and structured formats
- HTML: parse5 tree transforms; preserve script/style/pre/textarea raw text and conditional syntax only when configured.
- CSS: PostCSS AST comment removal; future Lightning CSS WASM/browser-compatible build for syntax-aware minification and compatibility transforms.
- JavaScript: Babel parser/generator for syntax-aware comment removal and compact output; future Terser or esbuild-wasm for deeper compression and target-aware transforms.
- TypeScript / JSX: Babel parser/generator; future SWC WASM or esbuild-wasm for transpilation and minification.
- JSON: native parse/stringify compact mode, with duplicate-key and number-format caveats.
- XML / SVG: XML parser + SVGO; do not run HTML regex rewrites over arbitrary XML.
- YAML / TOML: YAML/TOML parsers and canonical serializers; preserve comments option where required.
- Markdown: markdown-it/remark parse and render; source minification is not generally equivalent to preserving authored Markdown.
- SQL: SQL parser/minifier, optional whitespace/comment removal.
- Shell / Python / Lua / Rust / C-family: language-specific parsers or formatters; never generic regex comment stripping.

### Image, font, audio and video optimization
- PNG: oxipng, zopflipng, pngquant (lossy), optipng.
- JPEG: mozjpeg, jpegli, jpegoptim; keep metadata stripping separately configurable.
- WebP / AVIF / JPEG XL: Squoosh codecs or equivalent local WASM encoders, gated by browser and target support.
- GIF: gifsicle; preserve animation and disposal semantics.
- SVG: SVGO with per-plugin controls and ID/accessibility preservation.
- Fonts: WOFF2 encoder/decoder, fonttools WASM experiments, optional glyph subsetting.
- Audio: Opus, FLAC, MP3 encoders; preserve metadata and channel/sample-rate settings.
- Video: FFmpeg WASM or WebCodecs where available; high CPU/memory use means opt-in only.
- Archives: ZIP/Deflate, Zstandard, Brotli, LZMA2/XZ, BZip2 and 7z-compatible pack formats.

### Codec search controls to expose
- Engine allowlist, per-engine level/quality, dictionary mode, block size, window/memory cap, thread count where supported.
- Speed-vs-ratio target, maximum encode time, maximum memory, worker count and low-memory preset.
- Preserve original / lossless only / lossy allowed; max dimension, quality, chroma subsampling, metadata and animation toggles.
- Per-file vs shared dictionary, cross-file deduplication, solid archive mode, chunk size and integrity checks.
- Benchmark actual final URL length and decode cost; never choose a candidate just because its raw compressed stream is smaller.

## P2P transfer architecture (planned)

P2P is a transport subsystem, not another compression codec. The invite should contain a versioned session descriptor, not the file bytes. For an offline/no-signaling path, the sender creates an SDP offer after ICE gathering and shares it as an invite; the receiver creates an SDP answer and returns it out-of-band. This is naturally a two-step exchange, not a magic one-way invite. A WSS signaling service can automate offer/answer and trickle ICE, but must not relay file data.

- WebRTC DataChannels carry file chunks and live-stream packets; use bounded chunks, bufferedAmountLowThreshold, ACK windows, pause/resume, and SHA-256 verification.
- Default STUN candidates can include public Google STUN endpoints, with editable custom STUN/TURN lists. STUN only discovers candidates; symmetric NAT/firewalls may require TURN, which relays traffic and is not pure P2P.
- Password-protected invites encrypt and authenticate the session descriptor; WebRTC already encrypts the channel in transit with DTLS. Never put a plaintext password in the invite URL.
- Large-file transfer uses a manifest (name, MIME, byte length, chunk size, SHA-256), per-chunk sequence numbers and hashes, bounded memory, resumable chunk acknowledgements, and IndexedDB-backed local staging.
- Live streams use a separate ordered/unordered channel policy and timestamped frames; video/audio capture and encoding remain opt-in and device-capability dependent.
- A link may carry ICE server configuration, but embedding live ICE candidates can expose network metadata and makes links large. Show a privacy notice and allow relay-free mode explicitly.

## Browser window bridge and cross-origin boundaries

A postMessage bridge is supported only when both sides cooperate and validate event.origin, event.source, message type, and a per-session nonce. window.open(...).document.write(...) only works for a same-origin, script-created window before cross-origin navigation; it does not bypass CORS or the same-origin policy. For previews, use the existing sandboxed iframe with a narrow message protocol. For remote resource fetching, use a server-side proxy only for resources the operator is authorized to fetch, with destination allowlists, size/time limits, and SSRF protections. Never advertise this as a CORS bypass.

## Codec container compatibility contract

- v1 and v2 are immutable; decoders must continue to recognize them exactly.
- New codec families belong in a new container version with a dedicated codec-ID byte and explicit flags, not by consuming the remaining v2 flag bits ambiguously.
- Codec IDs are permanent once published. Unknown IDs return a clear unsupported-codec result; they must never be guessed or decoded as Deflate.
- Each codec module is lazy-loaded and locally hosted. Benchmark encode/decode time, peak memory, final URL length, and round-trip hash on representative files before making it selectable.
