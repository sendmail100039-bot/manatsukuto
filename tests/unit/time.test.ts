import { describe, expect, it } from "vitest";
import { parseLocalDateTime, toLocalInputValue, toWorkDate } from "@platform/core";

describe("business time (Asia/Tokyo)", () => {
  it("derives work_date in JST, not UTC", () => {
    // 2026-09-03 23:30 UTC = 2026-09-04 08:30 JST
    expect(toWorkDate(new Date("2026-09-03T23:30:00Z"))).toBe("2026-09-04");
  });
  it("parses datetime-local values as JST", () => {
    const d = parseLocalDateTime("2026-09-04T08:30");
    expect(d?.toISOString()).toBe("2026-09-03T23:30:00.000Z");
    expect(toLocalInputValue(d)).toBe("2026-09-04T08:30");
    expect(parseLocalDateTime("garbage")).toBeNull();
  });
});
