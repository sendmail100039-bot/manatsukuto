import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbExecutor = Database | Transaction;

let cached: { db: Database; sql: postgres.Sql } | undefined;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  }
  return url;
}

export function createDatabase(url = getDatabaseUrl(), options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    // Timestamps are stored with time zone; keep them as Date objects.
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  return { db, sql: client };
}

/** Process-wide singleton (Next.js route handlers, worker). */
export function getDb(): Database {
  if (!cached) {
    const g = globalThis as unknown as { __platformDb?: { db: Database; sql: postgres.Sql } };
    if (!g.__platformDb) {
      g.__platformDb = createDatabase();
    }
    cached = g.__platformDb;
  }
  return cached.db;
}

export async function closeDb() {
  if (cached) {
    await cached.sql.end({ timeout: 5 });
    cached = undefined;
    (globalThis as unknown as { __platformDb?: unknown }).__platformDb = undefined;
  }
}
