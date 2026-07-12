import Papa from "papaparse";
import { backupSchema } from "@/domain/import";
import { sqlite } from "./index";

export const backupTables = {
  valueSets: "value_sets", values: "values", valueAliases: "value_aliases", valueSetMemberships: "value_set_memberships",
  contexts: "contexts", sessions: "comparison_sessions", sessionContexts: "session_contexts", comparisons: "comparison_events",
  comparisonContexts: "comparison_event_contexts", comparisonNotes: "comparison_notes", ratings: "ratings", ratingSnapshots: "rating_snapshots",
  ratingSnapshotEntries: "rating_snapshot_entries", definitionRevisions: "definition_revisions", claims: "claims", claimSources: "claim_sources",
  tensions: "tensions", tensionValues: "tension_values", tensionContexts: "tension_contexts", tensionSources: "tension_sources", settings: "application_settings",
} as const;

export function exportBackup() {
  return { applicationVersion: "1.0.0", schemaVersion: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(Object.entries(backupTables).map(([key, table]) => [key, sqlite.prepare(`SELECT * FROM ${table}`).all()])) };
}

export function restoreBackup(input: unknown): void {
  const backup = backupSchema.parse(input); const tables = Object.entries(backupTables);
  sqlite.transaction(() => {
    sqlite.pragma("defer_foreign_keys = ON");
    for (const [, table] of [...tables].reverse()) sqlite.prepare(`DELETE FROM ${table}`).run();
    for (const [key, table] of tables) {
      const rows = backup.data[key as keyof typeof backup.data] as Record<string, unknown>[];
      for (const row of rows) {
        const columns = Object.keys(row); if (!columns.length) continue;
        const statement = sqlite.prepare(`INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
        statement.run(...columns.map((column) => row[column] as string | number | bigint | Buffer | null));
      }
    }
  })();
}

export const csvExports = {
  values: "SELECT * FROM values",
  comparisons: "SELECT * FROM comparison_events",
  contexts: "SELECT * FROM contexts",
  sessions: "SELECT * FROM comparison_sessions",
  ratings: "SELECT * FROM ratings",
  rating_snapshots: "SELECT * FROM rating_snapshots",
  claims: "SELECT * FROM claims",
  claim_sources: "SELECT * FROM claim_sources",
  tensions: "SELECT * FROM tensions",
  tension_sources: "SELECT * FROM tension_sources",
} as const;

export function exportCsv(file: keyof typeof csvExports): string {
  return Papa.unparse(sqlite.prepare(csvExports[file]).all(), { newline: "\n" });
}
