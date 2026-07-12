import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { DEFAULT_CONTEXTS, DEFAULT_SETTINGS } from "./defaults";

function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_URL ?? "./data/values.db";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function createDatabase() {
  const filename = resolveDatabasePath();
  mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  const migrationLock = `${filename}.migration-lock`;
  while (true) {
    try { mkdirSync(migrationLock); break; }
    catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
  }
  try { migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") }); }
  finally { rmdirSync(migrationLock); }
  bootstrap(db);
  return { db, sqlite };
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

function bootstrap(db: Db): void {
  const now = new Date();
  db.transaction((tx) => {
    for (const [id, name, description] of DEFAULT_CONTEXTS) tx.insert(schema.contexts).values({ id, name, description, isDefault: true, archived: false, createdAt: now, updatedAt: now }).onConflictDoNothing().run();
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) tx.insert(schema.applicationSettings).values({ key, value, updatedAt: now }).onConflictDoNothing().run();
    const directory = path.join(process.cwd(), "data", "presets");
    if (!existsSync(directory)) return;
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".json")).sort()) {
      const preset = JSON.parse(readFileSync(path.join(directory, file), "utf8")) as { slug: string; name: string; citation: string; licenseNote: string; [key: string]: unknown };
      tx.insert(schema.presets).values({ id: preset.slug, slug: preset.slug, name: preset.name, version: "1", citation: preset.citation, licenseNote: preset.licenseNote, data: preset, createdAt: now }).onConflictDoUpdate({ target: schema.presets.slug, set: { name: preset.name, citation: preset.citation, licenseNote: preset.licenseNote, data: preset } }).run();
    }
  });
}

const globalDatabase = globalThis as unknown as { valuesDatabase?: ReturnType<typeof createDatabase> };
const instance = globalDatabase.valuesDatabase ?? createDatabase();
if (process.env.NODE_ENV !== "production") globalDatabase.valuesDatabase = instance;

export const db = instance.db;
export const sqlite = instance.sqlite;

export function getSettings() {
  const rows = db.select().from(schema.applicationSettings).all();
  const entries = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    rating: { ...DEFAULT_SETTINGS.rating, ...(entries.rating as object | undefined) },
    selection: { ...DEFAULT_SETTINGS.selection, ...(entries.selection as object | undefined) },
    convergence: { ...DEFAULT_SETTINGS.convergence, ...(entries.convergence as object | undefined) },
    display: { ...DEFAULT_SETTINGS.display, ...(entries.display as object | undefined) },
    export: { ...DEFAULT_SETTINGS.export, ...(entries.export as object | undefined) },
  };
}

export function setSetting(key: keyof typeof DEFAULT_SETTINGS, value: unknown): void {
  db.insert(schema.applicationSettings).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.applicationSettings.key, set: { value, updatedAt: new Date() } }).run();
}

export function hasValueSets(): boolean {
  return Boolean(db.select({ id: schema.valueSets.id }).from(schema.valueSets).limit(1).get());
}

export function getPreset(slug: string) {
  return db.select().from(schema.presets).where(eq(schema.presets.slug, slug)).get();
}
