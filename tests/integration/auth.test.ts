import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, userCredentials } from "@platform/database";
import {
  LocalPasswordProvider,
  createSession,
  resolveSession,
  revokeSession,
  beginMfaEnrollment,
  confirmMfaEnrollment,
  verifyMfaCode,
  totpCode,
  rolesRequireMfa,
  markSessionMfaVerified,
} from "@platform/auth";
import { createTestDatabase, type TestDb } from "./helpers";

let t: TestDb;
const meta = { ipAddress: "198.51.100.7", userAgent: "vitest" };

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

describe("local password provider (§30, §46)", () => {
  it("authenticates valid credentials", async () => {
    const p = new LocalPasswordProvider(t.db);
    const r = await p.authenticate({ loginId: "yamada", password: "Password123!", ipAddress: meta.ipAddress });
    expect(r.ok).toBe(true);
  });
  it("rejects unknown users and wrong passwords without leaking which", async () => {
    const p = new LocalPasswordProvider(t.db);
    expect(await p.authenticate({ loginId: "nobody", password: "x" })).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(await p.authenticate({ loginId: "yamada", password: "wrong" })).toEqual({ ok: false, reason: "invalid_credentials" });
  });
  it("locks the account after repeated failures (brute force)", async () => {
    const p = new LocalPasswordProvider(t.db);
    let last: Awaited<ReturnType<typeof p.authenticate>> | undefined;
    for (let i = 0; i < 5; i++) last = await p.authenticate({ loginId: "sato", password: "wrong" });
    expect(last?.ok).toBe(false);
    expect(last && !last.ok && last.reason).toBe("locked");
    // even the right password is refused while locked
    const again = await p.authenticate({ loginId: "sato", password: "Password123!" });
    expect(again.ok).toBe(false);
    // unlock by clearing lockedUntil (simulating time passing)
    const [u] = await t.db.select().from(users).where(eq(users.loginId, "sato"));
    await t.db.update(userCredentials).set({ lockedUntil: null }).where(eq(userCredentials.userId, u!.id));
    expect((await p.authenticate({ loginId: "sato", password: "Password123!" })).ok).toBe(true);
  });
});

describe("sessions", () => {
  it("creates, resolves and revokes a session; cookie token is not stored in clear", async () => {
    const [u] = await t.db.select().from(users).where(eq(users.loginId, "yamada"));
    const { token, sessionId } = await createSession(t.db, u!.id, meta);
    expect(sessionId).not.toBe(token);
    const principal = await resolveSession(t.db, token);
    expect(principal?.loginId).toBe("yamada");
    expect(principal?.roles).toEqual(["employee"]);
    expect(principal?.mfaVerified).toBe(false);
    await markSessionMfaVerified(t.db, sessionId);
    expect((await resolveSession(t.db, token))?.mfaVerified).toBe(true);
    await revokeSession(t.db, sessionId);
    expect(await resolveSession(t.db, token)).toBeNull();
    expect(await resolveSession(t.db, "garbage")).toBeNull();
  });
  it("requires MFA for privileged roles (§31)", () => {
    expect(rolesRequireMfa(["employee"], false)).toBe(false);
    expect(rolesRequireMfa(["manager"], false)).toBe(false);
    expect(rolesRequireMfa(["head_office"], false)).toBe(true);
    expect(rolesRequireMfa(["system_admin"], false)).toBe(true);
    expect(rolesRequireMfa(["employee"], true)).toBe(true);
  });
});

describe("MFA enrollment", () => {
  it("enrolls with TOTP and accepts a recovery code once", async () => {
    const [u] = await t.db.select().from(users).where(eq(users.loginId, "takahashi"));
    const { secret, uri } = await beginMfaEnrollment(t.db, u!.id, "takahashi");
    expect(uri).toContain("otpauth://totp/");
    expect(await confirmMfaEnrollment(t.db, u!.id, "000000", meta)).toMatchObject({ ok: false });
    const ok = await confirmMfaEnrollment(t.db, u!.id, totpCode(secret), meta);
    expect(ok.ok).toBe(true);
    const codes = ok.ok ? ok.recoveryCodes : [];
    expect(codes).toHaveLength(8);
    expect(await verifyMfaCode(t.db, u!.id, totpCode(secret))).toBe(true);
    expect(await verifyMfaCode(t.db, u!.id, "123456")).toBe(false);
    expect(await verifyMfaCode(t.db, u!.id, codes[0]!)).toBe(true);
    expect(await verifyMfaCode(t.db, u!.id, codes[0]!)).toBe(false); // single use
  });
});
