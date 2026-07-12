import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";

const filename = path.resolve(process.env.DATABASE_URL ?? "./data/values.db");
mkdirSync(path.dirname(filename), { recursive: true });
const sqlite = new Database(filename);
sqlite.pragma("foreign_keys = ON");
migrate(drizzle(sqlite), { migrationsFolder: path.resolve("drizzle") });
sqlite.close();
console.log(`Migrated ${filename}`);
