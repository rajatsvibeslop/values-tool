import initSqlJs, { type Database, type QueryExecResult } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import migration from "../../drizzle/0000_optimal_thing.sql?raw";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import * as schema from "@/db/schema";
import { DEFAULT_CONTEXTS, DEFAULT_SETTINGS } from "@/db/defaults";

const DB_NAME = "values-tool";
const STORE = "sqlite";
const KEY = "main";
const BACKUP_TABLES = {
  valueSets: "value_sets",
  values: "values",
  valueAliases: "value_aliases",
  valueSetMemberships: "value_set_memberships",
  contexts: "contexts",
  sessions: "comparison_sessions",
  sessionContexts: "session_contexts",
  comparisons: "comparison_events",
  comparisonContexts: "comparison_event_contexts",
  comparisonNotes: "comparison_notes",
  ratings: "ratings",
  ratingSnapshots: "rating_snapshots",
  ratingSnapshotEntries: "rating_snapshot_entries",
  definitionRevisions: "definition_revisions",
  claims: "claims",
  claimSources: "claim_sources",
  tensions: "tensions",
  tensionValues: "tension_values",
  tensionContexts: "tension_contexts",
  tensionSources: "tension_sources",
  settings: "application_settings",
} as const;

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadBytes(): Promise<Uint8Array | undefined> {
  const idb = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const request = idb.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess = () =>
      resolve(
        request.result
          ? new Uint8Array(request.result as ArrayBuffer)
          : undefined,
      );
    request.onerror = () => reject(request.error);
  });
}

async function saveBytes(bytes: Uint8Array): Promise<void> {
  const idb = await openIndexedDb();
  const copy = bytes.slice().buffer;
  return new Promise((resolve, reject) => {
    const transaction = idb.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(copy, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export class BrowserDatabase {
  readonly orm: SQLJsDatabase<typeof schema>;
  private constructor(readonly sqlite: Database) {
    this.orm = drizzle(sqlite, { schema });
  }

  static async create(): Promise<BrowserDatabase> {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const bytes = await loadBytes();
    const sqlite = bytes ? new SQL.Database(bytes) : new SQL.Database();
    const instance = new BrowserDatabase(sqlite);
    sqlite.run("PRAGMA foreign_keys = ON");
    if (!bytes) {
      sqlite.exec(migration.replaceAll("--> statement-breakpoint", ""));
      instance.bootstrap();
      await instance.persist();
    }
    return instance;
  }

  private bootstrap() {
    const now = Date.now();
    for (const [id, name, description] of DEFAULT_CONTEXTS)
      this.run(
        "INSERT OR IGNORE INTO contexts (id,name,description,is_default,archived,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        [id, name, description, 1, 0, now, now],
      );
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS))
      this.run(
        "INSERT OR IGNORE INTO application_settings (key,value,updated_at) VALUES (?,?,?)",
        [key, JSON.stringify(value), now],
      );
  }

  query<T extends object = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): T[] {
    const statement = this.sqlite.prepare(sql);
    statement.bind(params as never[]);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as unknown as T);
    statement.free();
    return rows;
  }

  one<T extends object = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): T | undefined {
    return this.query<T>(sql, params)[0];
  }
  run(sql: string, params: unknown[] = []): void {
    this.sqlite.run(sql, params as never[]);
  }

  async transaction(work: () => void): Promise<void> {
    this.run("BEGIN IMMEDIATE");
    try {
      work();
      this.run("COMMIT");
      await this.persist();
    } catch (error) {
      this.run("ROLLBACK");
      throw error;
    }
  }

  async persist(): Promise<void> {
    await saveBytes(this.sqlite.export());
  }
  async replace(bytes: Uint8Array): Promise<void> {
    const statements = this.sqlite.iterateStatements(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    for (const statement of statements) statement.free();
    await saveBytes(bytes);
    location.reload();
  }

  exportJson(): Record<string, unknown> {
    return {
      applicationVersion: "1.0.0",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: Object.fromEntries(
        Object.entries(BACKUP_TABLES).map(([key, table]) => [
          key,
          this.query(`SELECT * FROM "${table}"`),
        ]),
      ),
    };
  }

  async restoreJson(input: unknown): Promise<void> {
    if (
      !input ||
      typeof input !== "object" ||
      !("data" in input) ||
      typeof (input as { data: unknown }).data !== "object"
    )
      throw new Error("Backup must contain a data object");
    const data = (input as { data: Record<string, Record<string, unknown>[]> })
      .data;
    const allowed = new Set(
      this.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'",
      ).map((row) => row.name),
    );
    await this.transaction(() => {
      this.run("PRAGMA defer_foreign_keys = ON");
      const entries = Object.entries(data)
        .map(
          ([key, rows]) =>
            [
              BACKUP_TABLES[key as keyof typeof BACKUP_TABLES] ?? key,
              rows,
            ] as const,
        )
        .filter(([table, rows]) => allowed.has(table) && Array.isArray(rows));
      for (const [table] of [...entries].reverse())
        this.run(`DELETE FROM "${table}"`);
      for (const [table, rows] of entries)
        for (const row of rows) {
          const columns = Object.keys(row);
          if (columns.length)
            this.run(
              `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
              columns.map((column) => row[column]),
            );
        }
    });
  }

  rawResult(sql: string): QueryExecResult[] {
    return this.sqlite.exec(sql);
  }
}
