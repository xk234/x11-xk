import { describe, it, expect } from "vitest";
import { encodeV2, decodeAny, isLocked } from "./codec2";
import { encodePayload } from "./codec";

const bytes = new Uint8Array([0, 1, 2, 250, 255, 7, 7, 7, 7, 7]);

describe("codec v2", () => {
  it("still opens legacy v1 links", async () => {
    const d = await decodeAny(encodePayload("text/css", "a{b:c}"));
    expect(d.status === "ok" && d.text).toBe("a{b:c}");
  });
  it("legacy link with ! prefix is instant", async () => {
    const d = await decodeAny("!" + encodePayload("text/html", "<p>hi</p>"));
    expect(d.status === "ok" && d.instant).toBe(true);
  });
  it("round-trips binary bytes, mime and meta", async () => {
    const p = await encodeV2({ mime: "image/png", bytes, meta: { name: "a.png" }, level: "ultra" });
    const d = await decodeAny(p);
    expect(d.status).toBe("ok");
    if (d.status === "ok") {
      expect([...d.bytes]).toEqual([...bytes]);
      expect(d.mime).toBe("image/png");
      expect(d.meta.name).toBe("a.png");
      expect(d.instant).toBe(false);
    }
  });
  it("needs the right password when encrypted", async () => {
    const p = await encodeV2({ mime: "text/plain", bytes: new TextEncoder().encode("secret"), password: "pw", instant: true });
    expect(isLocked(p)).toBe(true);
    expect((await decodeAny(p)).status).toBe("locked");
    expect((await decodeAny(p, "nope")).status).toBe("error");
    const d = await decodeAny(p, "pw");
    expect(d.status === "ok" && d.text).toBe("secret");
  });
  it("compresses repetitive text smaller than legacy LZ", async () => {
    const text = "<div class='row'>hello world</div>\n".repeat(400);
    const v2 = await encodeV2({ mime: "text/html", bytes: new TextEncoder().encode(text) });
    expect(v2.length).toBeLessThan(encodePayload("text/html", text).length);
  });
});
