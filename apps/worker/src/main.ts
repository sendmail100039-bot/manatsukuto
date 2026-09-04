/**
 * Background worker (§42 "worker", §50 backup, §52 monitoring, session hygiene).
 *
 * Usage:
 *   pnpm --filter @platform/worker start        # run scheduler loop
 *   pnpm --filter @platform/worker once         # run all jobs once and exit
 *   pnpm --filter @platform/worker backup       # run a backup now and exit
 *
 * Runs on Windows (Task Scheduler / NSSM) and Linux (systemd / Docker).
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { lt, sql } from "drizzle-orm";
import { createDatabase, idempotencyKeys, loginAttempts, userSessions } from "@platform/database";

const log = (msg: string, extra?: unknown) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...(extra ? { extra } : {}) }));

const { db, sql: client } = createDatabase(undefined, { max: 2 });

async function cleanup() {
  const now = new Date();
  await db.delete(userSessions).where(lt(userSessions.expiresAt, now));
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, now));
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(now.getTime() - 30 * 86_400_000)));
  log("cleanup done");
}

async function healthCheck() {
  const [row] = (await db.execute(sql`select pg_database_size(current_database())::bigint as bytes, (select count(*) from pg_stat_activity) as connections`)) as unknown as { bytes: string; connections: string }[];
  const [audit] = (await db.execute(sql`select count(*)::int as n from audit_logs`)) as unknown as { n: number }[];
  log("health", { dbBytes: Number(row?.bytes), connections: Number(row?.connections), auditRows: audit?.n });
  await notify(`health ok db=${Math.round(Number(row?.bytes) / 1e6)}MB`);
}

/** pg_dump based backup (works with PostgreSQL client tools on Windows and Linux). */
async function backup() {
  const dir = path.resolve(process.env.BACKUP_DIR ?? "./backups");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `platform-${stamp}.dump`);
  const pgDump = process.env.PG_DUMP_PATH ?? "pg_dump";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pgDump, ["--format=custom", "--no-owner", `--file=${file}`, process.env.DATABASE_URL!], { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited with ${code}`))));
  });
  const size = (await stat(file)).size;
  if (size < 1024) throw new Error(`backup file suspiciously small: ${size} bytes`);
  log("backup written", { file, size });

  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const name of await readdir(dir)) {
    if (!name.startsWith("platform-") || !name.endsWith(".dump")) continue;
    const full = path.join(dir, name);
    if ((await stat(full)).mtimeMs < cutoff) {
      await unlink(full);
      log("old backup removed", { file: full });
    }
  }
  await notify(`backup ok ${path.basename(file)} (${Math.round(size / 1024)} KB)`);
}

/** NotificationProvider (§40): webhook if configured, otherwise log only. */
async function notify(text: string) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `[company-platform] ${text}` }) });
  } catch (err) {
    log("notify failed", { error: String(err) });
  }
}

async function runSafely(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    log(`${name} failed`, { error: String(err) });
    await notify(`${name} FAILED: ${String(err)}`);
  }
}

async function main() {
  const mode = process.argv[2] ?? "loop";
  if (mode === "backup") {
    await runSafely("backup", backup);
  } else if (mode === "once") {
    await runSafely("cleanup", cleanup);
    await runSafely("health", healthCheck);
    await runSafely("backup", backup);
  } else {
    log("worker started");
    const every = (ms: number, name: string, fn: () => Promise<void>) => {
      void runSafely(name, fn);
      setInterval(() => void runSafely(name, fn), ms).unref();
    };
    every(15 * 60_000, "cleanup", cleanup);
    every(60 * 60_000, "health", healthCheck);
    const backupHours = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24);
    if (backupHours > 0) every(backupHours * 3_600_000, "backup", backup);
    await new Promise(() => {}); // keep alive
  }
  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
