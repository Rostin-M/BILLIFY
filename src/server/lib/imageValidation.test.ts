import { describe, expect, it } from "vitest";

import { detectImageType } from "./imageValidation";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

describe("detectImageType", () => {
  it("detecta PNG", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))?.ext).toBe("png");
  });

  it("detecta JPEG", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({
      kind: "jpeg",
      contentType: "image/jpeg",
      ext: "jpg",
    });
  });

  it("detecta WebP", () => {
    expect(detectImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")))?.kind).toBe("webp");
  });

  it("rechaza RIFF que no es WebP, SVG y buffers cortos", () => {
    expect(detectImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="x"></svg>'))).toBeNull();
    expect(detectImageType(bytes(0x89, 0x50))).toBeNull();
    expect(detectImageType(bytes())).toBeNull();
  });
});
