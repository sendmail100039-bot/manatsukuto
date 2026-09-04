import { eq } from "drizzle-orm";
import { systemSettings, DEFAULT_SETTINGS, type DbExecutor } from "@platform/database";
import { writeAudit } from "./audit";
import type { RequestMeta } from "./context";

export async function getSetting<T = unknown>(db: DbExecutor, key: string): Promise<T> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
  if (row) return row.value as T;
  const def = DEFAULT_SETTINGS[key];
  if (def) return def.value as T;
  throw new Error(`Unknown setting: ${key}`);
}

export async function listSettings(db: DbExecutor) {
  return db.select().from(systemSettings).orderBy(systemSettings.key);
}

export async function updateSetting(
  db: DbExecutor,
  key: string,
  value: unknown,
  actor: { userId: string } & RequestMeta,
) {
  await db
    .insert(systemSettings)
    .values({ key, value, updatedByUserId: actor.userId, updatedAt: new Date(), description: DEFAULT_SETTINGS[key]?.description })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedByUserId: actor.userId, updatedAt: new Date() } });
  await writeAudit(db, {
    actorUserId: actor.userId,
    action: "settings.updated",
    targetType: "system_settings",
    targetId: key,
    details: { value },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}
