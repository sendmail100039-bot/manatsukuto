import { and, eq, gt, sql } from "drizzle-orm";
import { users, userCredentials, loginAttempts, type Database } from "@platform/database";
import { getSetting } from "@platform/core";
import { verifyPassword } from "./password";
import type { AuthProvider, AuthenticationResult, AuthenticationFailure } from "./provider";

interface LockoutSettings {
  maxFailedAttempts: number;
  lockMinutes: number;
  ipMaxAttemptsPer15Min: number;
}

/** Local password authentication with brute-force protection (§46). */
export class LocalPasswordProvider implements AuthProvider {
  readonly name = "local";
  constructor(private readonly db: Database) {}

  async authenticate(input: { loginId: string; password: string; ipAddress?: string | null }): Promise<AuthenticationResult | AuthenticationFailure> {
    const db = this.db;
    const loginId = input.loginId.trim();
    const settings = await getSetting<LockoutSettings>(db, "auth.lockout");
    const now = new Date();

    // Per-IP throttle (independent of login id, protects against credential stuffing)
    if (input.ipAddress) {
      const since = new Date(now.getTime() - 15 * 60_000);
      const [{ count } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.ipAddress, input.ipAddress), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
      if (count >= settings.ipMaxAttemptsPer15Min) {
        await this.record(loginId, input.ipAddress, false, "ip_throttled");
        return { ok: false, reason: "locked", lockedUntil: new Date(now.getTime() + 15 * 60_000) };
      }
    }

    const [row] = await db
      .select({ user: users, cred: userCredentials })
      .from(users)
      .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
      .where(eq(users.loginId, loginId));

    if (!row) {
      // Still run a hash to keep timing similar to a real user.
      await verifyPassword(input.password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
      await this.record(loginId, input.ipAddress, false, "unknown_user");
      return { ok: false, reason: "invalid_credentials" };
    }
    if (row.user.status === "disabled") {
      await this.record(loginId, input.ipAddress, false, "disabled");
      return { ok: false, reason: "disabled" };
    }
    if (row.cred.lockedUntil && row.cred.lockedUntil > now) {
      await this.record(loginId, input.ipAddress, false, "locked");
      return { ok: false, reason: "locked", lockedUntil: row.cred.lockedUntil };
    }

    const valid = await verifyPassword(input.password, row.cred.passwordHash);
    if (!valid) {
      const failed = row.cred.failedAttempts + 1;
      const lock = failed >= settings.maxFailedAttempts;
      await db
        .update(userCredentials)
        .set({
          failedAttempts: lock ? 0 : failed,
          lockedUntil: lock ? new Date(now.getTime() + settings.lockMinutes * 60_000) : null,
        })
        .where(eq(userCredentials.userId, row.user.id));
      await this.record(loginId, input.ipAddress, false, lock ? "locked_now" : "bad_password");
      return lock ? { ok: false, reason: "locked", lockedUntil: new Date(now.getTime() + settings.lockMinutes * 60_000) } : { ok: false, reason: "invalid_credentials" };
    }

    await db.update(userCredentials).set({ failedAttempts: 0, lockedUntil: null }).where(eq(userCredentials.userId, row.user.id));
    await db.update(users).set({ lastLoginAt: now, status: row.user.status === "locked" ? "active" : row.user.status }).where(eq(users.id, row.user.id));
    await this.record(loginId, input.ipAddress, true, null);
    return { ok: true, userId: row.user.id };
  }

  private async record(loginId: string, ip: string | null | undefined, success: boolean, reason: string | null) {
    await this.db.insert(loginAttempts).values({ loginId: loginId.slice(0, 200), ipAddress: ip ?? null, success, reason });
  }
}
