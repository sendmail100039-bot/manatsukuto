import { describe, expect, it } from "vitest";
import { toCsv } from "@platform/attendance";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines and prefixes a BOM", () => {
    const out = toCsv([["a", "b,c", 'say "hi"', "line\nbreak"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('a,"b,c","say ""hi""","line\nbreak"\r\n');
  });
});
