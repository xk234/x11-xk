export const LANGS: { value: string; label: string; mime: string }[] = [
  { value: "html", label: "HTML", mime: "text/html" },
  { value: "javascript", label: "JavaScript", mime: "application/javascript" },
  { value: "typescript", label: "TypeScript", mime: "text/plain" },
  { value: "css", label: "CSS", mime: "text/css" },
  { value: "json", label: "JSON", mime: "application/json" },
  { value: "markdown", label: "Markdown", mime: "text/markdown" },
  { value: "xml", label: "XML / SVG", mime: "image/svg+xml" },
  { value: "python", label: "Python", mime: "text/plain" },
  { value: "java", label: "Java", mime: "text/plain" },
  { value: "csharp", label: "C#", mime: "text/plain" },
  { value: "cpp", label: "C++", mime: "text/plain" },
  { value: "go", label: "Go", mime: "text/plain" },
  { value: "rust", label: "Rust", mime: "text/plain" },
  { value: "php", label: "PHP", mime: "text/plain" },
  { value: "ruby", label: "Ruby", mime: "text/plain" },
  { value: "sql", label: "SQL", mime: "text/plain" },
  { value: "shell", label: "Shell", mime: "text/plain" },
  { value: "yaml", label: "YAML", mime: "text/yaml" },
  { value: "plaintext", label: "Plain text", mime: "text/plain" },
];

export const MIMES = [
  "text/html",
  "text/plain",
  "text/css",
  "text/markdown",
  "text/yaml",
  "application/javascript",
  "application/json",
  "image/svg+xml",
  "application/xml",
];

export function langFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "html", htm: "html", js: "javascript", mjs: "javascript", ts: "typescript", tsx: "typescript",
    css: "css", json: "json", md: "markdown", svg: "xml", xml: "xml", py: "python", java: "java",
    cs: "csharp", cpp: "cpp", c: "cpp", go: "go", rs: "rust", php: "php", rb: "ruby", sql: "sql",
    sh: "shell", yml: "yaml", yaml: "yaml",
  };
  return map[ext] ?? "plaintext";
}

export const EXAMPLES: { name: string; lang: string; mime: string; code: string }[] = [
  {
    name: "Demo card",
    lang: "html",
    mime: "text/html",
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>x11 Demo</title>
  <style>
    * { box-sizing: border-box; margin: 0 }
    body { min-height: 100vh; display: grid; place-items: center;
      background: radial-gradient(circle at 50% 0%, #2a0a14, #07070b 60%);
      color: #e8e8ed; font-family: system-ui, sans-serif }
    .card { padding: 44px 52px; border-radius: 20px; text-align: center;
      background: #0e0e14; border: 1px solid #1f1f2a;
      box-shadow: 0 0 60px rgba(250,31,78,.2) }
    h1 { font-size: 2.2rem; background: linear-gradient(135deg,#FA1F4E,#ff8aa4);
      -webkit-background-clip: text; color: transparent }
    p { color: #8b8b9a; margin-top: 8px }
    button { margin-top: 24px; padding: 10px 20px; border: 0; border-radius: 999px;
      background: #FA1F4E; color: white; font-weight: 600; cursor: pointer }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello from a URL</h1>
    <p>This whole page lives inside the link.</p>
    <button onclick="this.textContent = 'Clicked ' + (++window.n || (window.n = 1)) + 'x'">Click me</button>
  </div>
</body>
</html>`,
  },
  {
    name: "Animated SVG",
    lang: "xml",
    mime: "image/svg+xml",
    code: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" style="background:#07070b">
  <defs>
    <linearGradient id="g" x1="0" x2="1">
      <stop offset="0" stop-color="#FA1F4E"/>
      <stop offset="1" stop-color="#ff9ab0"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="60" fill="none" stroke="url(#g)" stroke-width="10"
    stroke-dasharray="280 100" stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate"
      from="0 100 100" to="360 100 100" dur="1.6s" repeatCount="indefinite"/>
  </circle>
  <text x="100" y="108" text-anchor="middle" fill="#e8e8ed"
    font-family="monospace" font-size="22" font-weight="bold">x11</text>
</svg>`,
  },
  {
    name: "Mini game",
    lang: "html",
    mime: "text/html",
    code: `<!DOCTYPE html>
<html><head><style>
  body{margin:0;background:#07070b;display:grid;place-items:center;height:100vh;color:#eee;font-family:monospace}
  canvas{border:1px solid #1f1f2a;border-radius:10px}
</style></head><body>
<div><p>Score: <b id="s">0</b> — click the dots</p><canvas id="c" width="360" height="260"></canvas></div>
<script>
const c=document.getElementById('c'),x=c.getContext('2d');let d={x:180,y:130,r:18},s=0;
function draw(){x.fillStyle='#07070b';x.fillRect(0,0,360,260);x.fillStyle='#FA1F4E';
x.beginPath();x.arc(d.x,d.y,d.r,0,7);x.fill();}
c.onclick=e=>{const b=c.getBoundingClientRect(),dx=e.clientX-b.left-d.x,dy=e.clientY-b.top-d.y;
if(dx*dx+dy*dy<d.r*d.r){s++;document.getElementById('s').textContent=s;
d={x:20+Math.random()*320,y:20+Math.random()*220,r:Math.max(6,18-s/2)};draw();}};draw();
</script></body></html>`,
  },
];
