import { beforeAll, describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hashPassword,
  isTrustedOrigin,
  totpCode,
  validatePasswordPolicy,
  verifyPassword,
  verifyTotp,
} from "@platform/auth";

beforeAll(() => {
  process.env.APP_SECRET = "unit-test-secret-that-is-long-enough";
});

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords", async () => {
    const hash = await hashPassword("CorrectHorse1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("CorrectHorse1", hash)).toBe(true);
    expect(await verifyPassword("correcthorse1", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("uses a fresh salt every time", async () => {
    expect(await hashPassword("Same1234567")).not.toBe(await hashPassword("Same1234567"));
  });
  it("enforces the password policy", () => {
    expect(validatePasswordPolicy("short1")).not.toBeNull();
    expect(validatePasswordPolicy("onlyletterslong")).not.toBeNull();
    expect(validatePasswordPolicy("Good-Password-42")).toBeNull();
  });
});

describe("TOTP (RFC 6238)", () => {
  it("base32 round-trips", () => {
    const buf = Buffer.from("hello world, totp!");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
  it("matches the RFC 6238 SHA-1 test vector", () => {
    // Secret "12345678901234567890", T=59 -> 94287082 (8 digits) ; 6-digit suffix 287082
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpCode(secret, 59_000, 30, 8)).toBe("94287082");
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1111111109_000, 30, 8)).toBe("07081804");
  });
  it("verifies within ±1 step and rejects otherwise", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1111111109_000;
    const code = totpCode(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, now + 120_000)).toBe(false);
    expect(verifyTotp(secret, "abc", now)).toBe(false);
  });
});

describe("secret encryption", () => {
  it("round-trips with AES-GCM and detects tampering", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
    const [iv, tag, data] = enc.split(".");
    const tampered = `${iv}.${tag}.${Buffer.from(Buffer.from(data!, "base64").map((b) => b ^ 1)).toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("origin check (CSRF)", () => {
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
  it("accepts the configured app origin", () => {
    expect(isTrustedOrigin(headers({ origin: "https://kintai.example.com" }), "https://kintai.example.com")).toBe(true);
  });
  it("rejects a foreign origin and missing origin", () => {
    expect(isTrustedOrigin(headers({ origin: "https://evil.example" }), "https://kintai.example.com")).toBe(false);
    expect(isTrustedOrigin(headers({}), "https://kintai.example.com")).toBe(false);
  });
  it("falls back to the forwarded host", () => {
    expect(isTrustedOrigin(headers({ origin: "https://a.example", "x-forwarded-host": "a.example", "x-forwarded-proto": "https" }), undefined)).toBe(true);
  });
});
