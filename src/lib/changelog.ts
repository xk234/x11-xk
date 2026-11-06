export const CHANGELOG: { version: string; date: string; title: string; items: string[] }[] = [
  {
    version: "2.0",
    date: "Nov 2026",
    title: "Compression 2.0 & Liquid Glass",
    items: [
      "Compression 2.0 mode: maximum-strength Deflate with Fast / Max / Ultra levels, stores raw bytes (no text overhead)",
      "Any file type: images, video, audio, PDFs, zips — drop it in and it goes inside the link",
      "Image tools: resize, quality slider and WebP / JPEG / PNG re-encoding",
      "Password lock: AES-256 encryption with a password, decrypted only in the viewer's browser",
      "Instant run: shared links skip the countdown screen and open right away",
      "Fetch a page or file from any URL, or build an iframe embed with tab title, allow= rules and sandbox options",
      "Static mode: no server analytics or IP/network collection; recent history stays local",
      "New Liquid Glass look with seven glowing themes",
      "Share links now use the site root plus a fragment; CSS and JavaScript can run in the isolated live preview",
    ],
  },
  {
    version: "1.1",
    date: "Nov 2026",
    title: "Studio rebuild",
    items: [
      "Code editor with live preview",
      "Link builds itself as you type, with size stats and a length meter",
      "QR codes, downloads, recent links, decode-a-link, drag & drop",
      "Countdown screen with Run now / Pause / Open in editor",
    ],
  },
  { version: "1.0", date: "Earlier", title: "Original x11", items: ["LZ-compressed HTML inside a link"] },
];

export const TODO: { text: string; done: boolean }[] = [
  { text: "Compression 2.0 for large files", done: true },
  { text: "Password-protected links", done: true },
  { text: "Video / audio / any file support", done: true },
  { text: "Iframe embed builder", done: true },
  { text: "Video re-encoding (shrink videos before sharing)", done: false },
  { text: "Multi-file static projects: package an entire site (HTML, CSS, JS, assets and folders) into one root-fragment link", done: false },
  { text: "Project-wide compression: shared dictionaries, cross-file deduplication, minification and per-asset best-codec selection", done: false },
  { text: "Advanced codec experiments: Brotli / Zstandard / LZMA WASM candidates with size-vs-speed benchmarks and backward-compatible decoding", done: false },
  { text: "Resource optimization pipeline: SVG cleanup, image format selection, font subsetting and optional media transcoding", done: false },
  { text: "Streaming / chunked payload format for very large projects, with integrity checks and resumable local processing", done: false },
  { text: "Mobile layout for the link panel", done: false },
  { text: "Custom themes / your own accent color", done: true },
];
