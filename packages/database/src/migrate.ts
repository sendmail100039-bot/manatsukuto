import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./client";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(databaseUrl?: string) {
  const { db, sql } = createDatabase(databaseUrl, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: path.resolve(here, "../migrations") });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
