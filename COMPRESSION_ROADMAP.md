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

Current v2 is a single-file container using fflate Deflate and base64url. Fast / Max / Ultra currently vary Deflate settings; this is not yet the planned multi-codec competition. Multi-file static project packaging, Brotli/Zstandard/LZMA WASM, cross-file dictionaries, chunking, and full project reconstruction are roadmap items, not shipped features.


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

The Pages Function at /r/<payload> decodes an unencrypted x11 payload and serves a limited allowlist of passive media/document types with CORS headers. It is intended for remote consumers such as slide editors that fetch an image URL. The fragment form /#<payload> is client-side only: browsers never send URL fragments in HTTP requests, so it cannot be used as a server-fetchable asset URL. Raw mode currently rejects HTML, SVG, CSS, JavaScript and password-protected payloads, and caps decoded resources at 25 MiB. This endpoint means the project is no longer strictly static-only; the rest of the Studio remains static, while this one Pages Function supplies raw bytes.
