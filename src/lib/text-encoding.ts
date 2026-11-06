export type TextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "iso-8859-1" | "windows-1252" | "us-ascii";

const CP1252: Record<number, number> = {
  0x20ac:0x80,0x201a:0x82,0x0192:0x83,0x201e:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,
  0x02c6:0x88,0x2030:0x89,0x0160:0x8a,0x2039:0x8b,0x0152:0x8c,0x017d:0x8e,0x2018:0x91,
  0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02dc:0x98,
  0x2122:0x99,0x0161:0x9a,0x203a:0x9b,0x0153:0x9c,0x017e:0x9e,0x0178:0x9f,
};

export function encodeText(source: string, encoding: TextEncoding): Uint8Array {
  if (encoding === "utf-8") return new TextEncoder().encode(source);
  if (encoding === "utf-16le" || encoding === "utf-16be") {
    const out = new Uint8Array(source.length * 2);
    const view = new DataView(out.buffer);
    for (let i = 0; i < source.length; i++) view.setUint16(i * 2, source.charCodeAt(i), encoding === "utf-16le");
    return out;
  }
  const values: number[] = [];
  for (const char of source) {
    const cp = char.codePointAt(0)!;
    if (encoding === "windows-1252") values.push(cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff) ? cp : (CP1252[cp] ?? 0x3f));
    else values.push(cp <= (encoding === "us-ascii" ? 0x7f : 0xff) ? cp : 0x3f);
  }
  return new Uint8Array(values);
}

export function decodeText(bytes: Uint8Array, encoding: TextEncoding): string {
  try { return new TextDecoder(encoding).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

export function detectTextEncoding(bytes: Uint8Array): TextEncoding {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return "utf-8";
}
