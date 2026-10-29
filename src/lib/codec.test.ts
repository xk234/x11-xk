import { describe, it, expect } from "vitest";
import { encodePayload, decodePayload, payloadFromUrl } from "./codec";

describe("codec", () => {
  it("round-trips mime and content", () => {
    const p = encodePayload("text/css", "a{b:c}\n#x?y/z");
    expect(decodePayload(p)).toEqual({ mime: "text/css", content: "a{b:c}\n#x?y/z" });
  });
  it("uses only the first # as payload start", () => {
    expect(payloadFromUrl("https://x.io/p?q=1#ABC#d?e/f")).toBe("ABC#d?e/f");
  });
  it("returns null for garbage", () => {
    expect(decodePayload("!!!")).toBeNull();
  });
});
