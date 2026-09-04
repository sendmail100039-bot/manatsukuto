import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keyLen: number, opts: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key))));

const PARAMS = { N: 16384, r: 8, p: 1, keyLen: 64 };

/** Format: scrypt$N$r$p$saltB64$hashB64 (no native modules; works on Windows). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password.normalize("NFKC"), salt, PARAMS.keyLen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p }));
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");
  const actual = (await scrypt(password.normalize("NFKC"), salt, expected.length, { N, r, p }));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 10) return "パスワードは10文字以上にしてください";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "英字と数字を含めてください";
  return null;
}
