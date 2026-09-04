import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { scrypt as scryptCb, randomBytes } from "node:crypto";
import { createDatabase, type Database } from "./client";
import * as s from "./schema";
import { PERMISSIONS, ROLES, DEFAULT_SETTINGS, type RoleCode } from "./catalog";

const scrypt = (password: string, salt: Buffer, keyLen: number, opts: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key))));

/**
 * Password hashing (same format as @platform/auth):
 *   scrypt$N$r$p$saltBase64$hashBase64
 * Duplicated here on purpose so the seed does not depend on the auth package.
 */
async function hashPassword(password: string): Promise<string> {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const hash = (await scrypt(password.normalize("NFKC"), salt, 64, { N, r, p }));
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export interface SeedOptions {
  /** Seed demo organization, locations, employees and users (development only). */
  demo?: boolean;
  /** Initial system_admin login (created only if no users exist). */
  adminLoginId?: string;
  adminPassword?: string;
  log?: (msg: string) => void;
}

export async function seedDatabase(db: Database, options: SeedOptions = {}) {
  const log = options.log ?? (() => {});

  // --- permissions -------------------------------------------------------
  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await db
      .insert(s.permissions)
      .values({ code, description })
      .onConflictDoUpdate({ target: s.permissions.code, set: { description } });
  }
  const permRows = await db.select().from(s.permissions);
  const permByCode = new Map(permRows.map((p) => [p.code, p.id]));

  // --- roles -------------------------------------------------------------
  for (const [code, def] of Object.entries(ROLES)) {
    await db
      .insert(s.roles)
      .values({ code, name: def.name, description: def.description })
      .onConflictDoUpdate({ target: s.roles.code, set: { name: def.name, description: def.description } });
  }
  const roleRows = await db.select().from(s.roles);
  const roleByCode = new Map(roleRows.map((r) => [r.code, r.id]));
  for (const [code, def] of Object.entries(ROLES)) {
    const roleId = roleByCode.get(code)!;
    for (const perm of def.permissions) {
      const permissionId = permByCode.get(perm);
      if (!permissionId) throw new Error(`Unknown permission in catalog: ${perm}`);
      await db.insert(s.rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
    }
  }
  log("roles & permissions seeded");

  // --- settings ----------------------------------------------------------
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .insert(s.systemSettings)
      .values({ key, value: def.value, description: def.description })
      .onConflictDoNothing();
  }
  log("system settings seeded");

  // --- default leave types & shift patterns (Phase 2) ----------------------
  for (const lt of [
    { code: "ANNUAL", name: "年次有給休暇", paid: true, requiresBalance: true, allowHalfDay: true },
    { code: "SPECIAL", name: "特別休暇(慶弔等)", paid: true, requiresBalance: false, allowHalfDay: false },
    { code: "UNPAID", name: "欠勤・無給休暇", paid: false, requiresBalance: false, allowHalfDay: true },
  ]) {
    await db.insert(s.leaveTypes).values(lt).onConflictDoNothing();
  }
  for (const sp of [
    { code: "EARLY", name: "早番", startTime: "07:00", endTime: "16:00", breakMinutes: 60, color: "#2e7d5b" },
    { code: "DAY", name: "日勤", startTime: "09:00", endTime: "18:00", breakMinutes: 60, color: "#175cd3" },
    { code: "LATE", name: "遅番", startTime: "13:00", endTime: "22:00", breakMinutes: 60, color: "#b54708" },
    { code: "NIGHT", name: "夜勤", startTime: "21:00", endTime: "07:00", breakMinutes: 120, color: "#5f6b7a" },
  ]) {
    await db.insert(s.shiftPatterns).values(sp).onConflictDoNothing();
  }
  log("leave types & shift patterns seeded");

  // --- initial admin -----------------------------------------------------
  const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(s.users);
  if (count === 0) {
    const loginId = options.adminLoginId ?? process.env.SEED_ADMIN_LOGIN ?? "admin";
    const password = options.adminPassword ?? process.env.SEED_ADMIN_PASSWORD;
    if (!password) {
      throw new Error("No users exist. Set SEED_ADMIN_PASSWORD (or adminPassword) to create the initial system_admin.");
    }
    const [org] = await db
      .insert(s.organizations)
      .values({ code: "HQ", name: "本社", kind: "corporation" })
      .onConflictDoUpdate({ target: s.organizations.code, set: { name: "本社" } })
      .returning();
    const [emp] = await db
      .insert(s.employees)
      .values({ employeeNumber: "ADMIN", name: "システム管理者", organizationId: org!.id })
      .onConflictDoNothing()
      .returning();
    const employeeId = emp?.id ?? (await db.select().from(s.employees).where(eq(s.employees.employeeNumber, "ADMIN")))[0]!.id;
    const [user] = await db
      .insert(s.users)
      .values({ loginId, employeeId, mfaRequired: true })
      .returning();
    await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: await hashPassword(password), mustChangePassword: true });
    await db.insert(s.userRoles).values({ userId: user!.id, roleId: roleByCode.get("system_admin")! });
    log(`initial system_admin created: ${loginId}`);
  }

  if (options.demo) {
    await seedDemo(db, roleByCode, log);
  }
}

async function seedDemo(db: Database, roleByCode: Map<string, string>, log: (m: string) => void) {
  const [corp] = await db
    .insert(s.organizations)
    .values({ code: "DEMO", name: "デモ医療法人", kind: "corporation" })
    .onConflictDoUpdate({ target: s.organizations.code, set: { name: "デモ医療法人" } })
    .returning();
  const [office] = await db
    .insert(s.organizations)
    .values({ code: "DEMO-HIMEJI", name: "姫路事業所", kind: "office", parentId: corp!.id })
    .onConflictDoUpdate({ target: s.organizations.code, set: { name: "姫路事業所" } })
    .returning();

  const deptDefs = [
    { code: "NURSE", name: "看護部" },
    { code: "MEDICAL", name: "医事課" },
    { code: "GA", name: "総務部" },
  ];
  const depts: Record<string, string> = {};
  for (const d of deptDefs) {
    const [row] = await db
      .insert(s.departments)
      .values({ organizationId: office!.id, code: d.code, name: d.name })
      .onConflictDoUpdate({ target: [s.departments.organizationId, s.departments.code], set: { name: d.name } })
      .returning();
    depts[d.code] = row!.id;
  }

  const [loc] = await db
    .insert(s.locations)
    .values({
      organizationId: office!.id,
      code: "HIMEJI-MAIN",
      name: "姫路本院",
      address: "兵庫県姫路市",
      latitude: 34.8394,
      longitude: 134.6939,
      radiusMeters: 200,
    })
    .onConflictDoUpdate({ target: s.locations.code, set: { name: "姫路本院" } })
    .returning();
  await db
    .insert(s.locations)
    .values({
      organizationId: office!.id,
      code: "HIMEJI-CLINIC",
      name: "姫路駅前クリニック",
      address: "兵庫県姫路市駅前町",
      latitude: 34.8266,
      longitude: 134.6902,
      radiusMeters: 150,
    })
    .onConflictDoNothing();

  const people: { number: string; name: string; kana: string; dept: string; login: string; roles: RoleCode[] }[] = [
    { number: "E0001", name: "山田 花子", kana: "ヤマダ ハナコ", dept: "NURSE", login: "yamada", roles: ["employee"] },
    { number: "E0002", name: "佐藤 太郎", kana: "サトウ タロウ", dept: "MEDICAL", login: "sato", roles: ["employee"] },
    { number: "M0001", name: "鈴木 一郎", kana: "スズキ イチロウ", dept: "NURSE", login: "suzuki", roles: ["manager"] },
    { number: "H0001", name: "高橋 本部", kana: "タカハシ ホンブ", dept: "GA", login: "takahashi", roles: ["head_office"] },
  ];
  const password = await hashPassword(process.env.SEED_DEMO_PASSWORD ?? "Password123!");
  for (const p of people) {
    const [emp] = await db
      .insert(s.employees)
      .values({
        employeeNumber: p.number,
        name: p.name,
        nameKana: p.kana,
        organizationId: office!.id,
        departmentId: depts[p.dept],
        primaryLocationId: loc!.id,
        hiredOn: "2024-04-01",
      })
      .onConflictDoUpdate({ target: s.employees.employeeNumber, set: { name: p.name } })
      .returning();
    const existing = await db.select().from(s.users).where(eq(s.users.loginId, p.login));
    if (existing.length) continue;
    const [user] = await db
      .insert(s.users)
      .values({ loginId: p.login, employeeId: emp!.id, mfaRequired: p.roles.includes("head_office") })
      .returning();
    await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: password });
    for (const r of p.roles) {
      await db.insert(s.userRoles).values({ userId: user!.id, roleId: roleByCode.get(r)! }).onConflictDoNothing();
    }
  }
  log("demo data seeded (password: SEED_DEMO_PASSWORD or Password123!)");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { db, sql: client } = createDatabase(undefined, { max: 1 });
  const demo = process.argv.includes("--demo") || process.env.SEED_DEMO === "1";
  seedDatabase(db, { demo, log: (m) => console.log(m) })
    .then(async () => {
      await client.end({ timeout: 5 });
      console.log("Seed complete.");
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await client.end({ timeout: 5 });
      process.exit(1);
    });
}
