import postgres from "postgres";
import { createDatabase, runMigrations, seedDatabase, type Database } from "@platform/database";

const BASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://platform:platform@127.0.0.1:5433/postgres";

export interface TestDb {
  db: Database;
  url: string;
  close: () => Promise<void>;
}

/** Creates a fresh database, runs migrations and the seed (with demo data). */
export async function createTestDatabase(name = `platform_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`): Promise<TestDb> {
  process.env.APP_SECRET ??= "integration-test-secret-0123456789";
  const admin = postgres(BASE_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database "${name}"`);
  await admin.end();
  const url = BASE_URL.replace(/\/[^/]*$/, `/${name}`);
  await runMigrations(url);
  const { db, sql } = createDatabase(url, { max: 4 });
  await seedDatabase(db, { demo: true, adminLoginId: "admin", adminPassword: "AdminPassword1!" });
  return {
    db,
    url,
    close: async () => {
      await sql.end({ timeout: 5 });
      const a = postgres(BASE_URL, { max: 1, onnotice: () => {} });
      await a.unsafe(`drop database if exists "${name}" with (force)`);
      await a.end();
    },
  };
}
