import { eq } from "drizzle-orm";
import { userMfa, type DbExecutor } from "@platform/database";
import { writeAudit, type RequestMeta } from "@platform/core";
import { decryptSecret, encryptSecret, sha256Hex, randomToken } from "./crypto";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp";

export async function getMfaStatus(db: DbExecutor, userId: string) {
  const [row] = await db.select().from(userMfa).where(eq(userMfa.userId, userId));
  return { enrolled: !!row?.confirmedAt, pending: !!row && !row.confirmedAt };
}

/** Start enrollment: creates (or replaces) an unconfirmed secret. */
export async function beginMfaEnrollment(db: DbExecutor, userId: string, accountLabel: string) {
  const secret = generateTotpSecret();
  await db
    .insert(userMfa)
    .values({ userId, secretEncrypted: encryptSecret(secret), confirmedAt: null })
    .onConflictDoUpdate({ target: userMfa.userId, set: { secretEncrypted: encryptSecret(secret), confirmedAt: null, updatedAt: new Date() } });
  return { secret, uri: totpUri(secret, accountLabel) };
}

export async function confirmMfaEnrollment(db: DbExecutor, userId: string, code: string, meta: RequestMeta) {
  const [row] = await db.select().from(userMfa).where(eq(userMfa.userId, userId));
  if (!row) return { ok: false as const, error: "MFAの登録が開始されていません" };
  if (!verifyTotp(decryptSecret(row.secretEncrypted), code)) return { ok: false as const, error: "認証コードが正しくありません" };
  const recovery = Array.from({ length: 8 }, () => randomToken(6).slice(0, 10));
  await db
    .update(userMfa)
    .set({ confirmedAt: new Date(), recoveryCodesHash: recovery.map(sha256Hex), updatedAt: new Date() })
    .where(eq(userMfa.userId, userId));
  await writeAudit(db, { ...meta, actorUserId: userId, action: "auth.mfa_enrolled", targetType: "user", targetId: userId });
  return { ok: true as const, recoveryCodes: recovery };
}

export async function verifyMfaCode(db: DbExecutor, userId: string, code: string): Promise<boolean> {
  const [row] = await db.select().from(userMfa).where(eq(userMfa.userId, userId));
  if (!row?.confirmedAt) return false;
  if (verifyTotp(decryptSecret(row.secretEncrypted), code)) return true;
  // Recovery code (single use)
  const h = sha256Hex(code.trim());
  if (row.recoveryCodesHash.includes(h)) {
    await db
      .update(userMfa)
      .set({ recoveryCodesHash: row.recoveryCodesHash.filter((x) => x !== h) })
      .where(eq(userMfa.userId, userId));
    return true;
  }
  return false;
}
