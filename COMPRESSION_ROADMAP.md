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
