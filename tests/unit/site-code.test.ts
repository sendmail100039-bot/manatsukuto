import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret, generateTotpSecret } from "@platform/auth";
import { currentSiteCode, verifySiteCode, SITE_CODE_STEP_SECONDS } from "@platform/security";

process.env.APP_SECRET = "unit-test-secret-that-is-long-enough";

describe("dynamic site code", () => {
  let enc = "";
  const at = Date.UTC(2026, 8, 4, 8, 0, 0);
  beforeAll(() => {
    enc = encryptSecret(generateTotpSecret());
  });
  it("produces a 6 digit code that rotates every 60 s", () => {
    const a = currentSiteCode(enc, at);
    expect(a.code).toMatch(/^\d{6}$/);
    expect(a.expiresInSeconds).toBe(SITE_CODE_STEP_SECONDS);
    expect(currentSiteCode(enc, at + 59_000).code).toBe(a.code);
    expect(currentSiteCode(enc, at + 59_000).expiresInSeconds).toBe(1);
    expect(currentSiteCode(enc, at + 10 * 60_000).code).not.toBe(a.code);
  });
  it("verifies the current and adjacent codes only", () => {
    const { code } = currentSiteCode(enc, at);
    expect(verifySiteCode(enc, code, at)).toBe(true);
    expect(verifySiteCode(enc, code, at + 60_000)).toBe(true);
    expect(verifySiteCode(enc, `${code.slice(0, 3)} ${code.slice(3)}`, at)).toBe(true);
    expect(verifySiteCode(enc, code, at + 3 * 60_000)).toBe(false);
    expect(verifySiteCode(enc, "12345", at)).toBe(false);
    expect(verifySiteCode(enc, "000000", at)).toBe(code === "000000");
  });
  it("secrets differ per location", () => {
    const other = encryptSecret(generateTotpSecret());
    expect(currentSiteCode(other, at).code === currentSiteCode(enc, at).code).toBe(false);
  });
});
