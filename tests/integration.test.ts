import { beforeEach, describe, expect, it } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import path from "node:path";
import migration from "../drizzle/0000_optimal_thing.sql?raw";
import { BrowserRepository } from "@/browser/repository";
import type { BrowserDatabase } from "@/browser/database";
import { DEFAULT_CONTEXTS, DEFAULT_SETTINGS } from "@/db/defaults";

class TestDatabase {
  constructor(readonly sqlite: Database) {}
  query<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] { const statement = this.sqlite.prepare(sql); statement.bind(params as never[]); const rows: T[] = []; while (statement.step()) rows.push(statement.getAsObject() as unknown as T); statement.free(); return rows; }
  one<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined { return this.query<T>(sql, params)[0]; }
  run(sql: string, params: unknown[] = []) { this.sqlite.run(sql, params as never[]); }
  async transaction(work: () => void) { this.run("BEGIN IMMEDIATE"); try { work(); this.run("COMMIT"); } catch (error) { this.run("ROLLBACK"); throw error; } }
}

let database: TestDatabase; let repo: BrowserRepository;
beforeEach(async () => {
  const SQL = await initSqlJs({ locateFile: (file) => path.resolve("node_modules/sql.js/dist", file) }); database = new TestDatabase(new SQL.Database()); database.run("PRAGMA foreign_keys=ON"); database.sqlite.exec(migration.replaceAll("--> statement-breakpoint", "")); const stamp = Date.now();
  for (const [id, name, description] of DEFAULT_CONTEXTS) database.run("INSERT INTO contexts VALUES (?,?,?,?,?,?,?)", [id, name, description, 1, 0, stamp, stamp]);
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) database.run("INSERT INTO application_settings VALUES (?,?,?)", [key, JSON.stringify(value), stamp]);
  repo = new BrowserRepository(database as unknown as BrowserDatabase);
});

describe("browser repository integration", () => {
  it("imports a preset, starts a session, compares, pauses, and resumes", async () => {
    const setId = await repo.importPreset("editable-card-sort"); expect(repo.values(setId)).toHaveLength(20); expect(repo.ratings(setId)).toHaveLength(20);
    const sessionId = await repo.startSession(setId, "Primary journey", ["general-life"]); expect(repo.queue(sessionId)).toHaveLength(1); const first = repo.queue(sessionId)[0]!;
    await repo.submit({ sessionId, setId, leftId: first.left_value_id, rightId: first.right_value_id, result: "left", strength: "moderate", confidence: "confident", contexts: ["general-life"], reasoning: "The left value is more fundamental here.", winner: "It protects the central goal.", loser: "It still protects continuity.", reversal: "A safety emergency could reverse this." });
    expect(repo.history(setId)).toHaveLength(1); expect(repo.ratings(setId).find((rating) => rating.value_id === first.left_value_id)!.wins).toBe(1); expect(database.query("SELECT * FROM comparison_notes")).toHaveLength(4); expect(database.query("SELECT * FROM rating_snapshots")).toHaveLength(3);
    await database.transaction(() => database.run("UPDATE comparison_sessions SET status='paused' WHERE id=?", [sessionId])); expect(repo.sessions()[0]!.status).toBe("paused"); await database.transaction(() => database.run("UPDATE comparison_sessions SET status='active' WHERE id=?", [sessionId])); expect(repo.sessions()[0]!.status).toBe("active");
  });

  it("finishes an exact-order session instead of replenishing the queue", async () => {
    const setId = await repo.createSet("Small order");
    for (const name of ["Alpha", "Beta", "Gamma", "Delta"])
      await repo.addValue(setId, { name, definition: name });
    const sessionId = await repo.startSession(setId, "Finite ordering", []);
    let guard = 0;
    while (repo.queue(sessionId).length) {
      expect(repo.queue(sessionId)).toHaveLength(1);
      const pair = repo.queue(sessionId)[0]!;
      const values = repo.values(setId);
      const left = values.find((value) => value.id === pair.left_value_id)!;
      const right = values.find((value) => value.id === pair.right_value_id)!;
      await repo.submit({
        sessionId, setId, leftId: left.id, rightId: right.id,
        result: left.name < right.name ? "left" : "right",
        strength: "moderate", confidence: "confident", contexts: [],
        reasoning: "", winner: "", loser: "", reversal: "",
      });
      expect(++guard).toBeLessThanOrEqual(5);
    }
    expect(repo.sessions().find((session) => session.id === sessionId)?.status).toBe("completed");
    expect(repo.exactRanking(setId)?.ordered.map((id) => repo.values(setId).find((value) => value.id === id)?.name)).toEqual([
      "Alpha", "Beta", "Delta", "Gamma",
    ]);
  });

  it("records a five-value rapid question as one question and four adjacent events", async () => {
    const setId = await repo.importPreset("editable-card-sort");
    const sessionId = await repo.startSession(setId, "Rapid ranking", [], "rapid");
    const question = repo.rapidQuestion(sessionId)!;
    expect(question.valueIds).toHaveLength(5);
    expect(question.budget).toBe(16);
    const choiceOrder = [...question.valueIds].reverse();
    await repo.updateRapidScenario(sessionId, {
      text: "A concrete choice with several reasonable actions.",
      provider: "openrouter",
      model: "test-model",
      generatedAt: new Date().toISOString(),
      choices: [{ id: "A", text: "Take the reversible path and learn from direct experience.", valueOrder: choiceOrder }],
    });
    await repo.submitRapidRanking({
      sessionId,
      setId,
      orderedValueIds: choiceOrder,
      contexts: [],
      scenarioChoiceId: "A",
    });
    expect(repo.sessions().find((session) => session.id === sessionId)?.completed_count).toBe(1);
    expect(repo.history(setId)).toHaveLength(4);
    expect(repo.history(setId)[0]?.tags).toContain("scenario-choice");
    expect(database.query<{ text: string }>("SELECT text FROM comparison_notes WHERE note_type='scenario_choice'")[0]?.text).toContain("Selected action A");
    expect(repo.rapidQuestion(sessionId)?.question).toBe(2);
    expect(repo.queue(sessionId)).toHaveLength(1);
  });

  it("resets one value set's evidence without deleting its values", async () => {
    const setId = await repo.importPreset("schwartz-10");
    const sessionId = await repo.startSession(setId, "Reset me", []);
    const pair = repo.queue(sessionId)[0]!;
    await repo.submit({ sessionId, setId, leftId: pair.left_value_id, rightId: pair.right_value_id, result: "left", strength: "moderate", confidence: "confident", contexts: [], reasoning: "", winner: "", loser: "", reversal: "" });
    expect(repo.history(setId)).toHaveLength(1);
    await repo.resetEvidence(setId);
    expect(repo.values(setId)).toHaveLength(10);
    expect(repo.history(setId)).toHaveLength(0);
    expect(repo.sessions().filter((session) => session.value_set_id === setId)).toHaveLength(0);
    expect(repo.ratings(setId).every((rating) => rating.comparisons === 0)).toBe(true);
  });

  it("resets evidence across every value set in one operation", async () => {
    const firstSet = await repo.importPreset("schwartz-10");
    const secondSet = await repo.importPreset("rokeach-terminal");
    for (const setId of [firstSet, secondSet]) {
      const sessionId = await repo.startSession(setId, "Reset all", []);
      const pair = repo.queue(sessionId)[0]!;
      await repo.submit({ sessionId, setId, leftId: pair.left_value_id, rightId: pair.right_value_id, result: "left", strength: "moderate", confidence: "confident", contexts: [], reasoning: "", winner: "", loser: "", reversal: "" });
    }
    expect(repo.history()).toHaveLength(2);
    await repo.resetEvidence();
    expect(repo.sets()).toHaveLength(2);
    expect(repo.history()).toHaveLength(0);
    expect(repo.sessions()).toHaveLength(0);
  });

  it("edits a definition, creates an evidence claim, and retains revision history", async () => {
    const setId = await repo.importPreset("schwartz-10"); const value = repo.values(setId)[0]!; await repo.updateValue(value.id, { name: value.name, definition: "My revised personal definition", category: value.parent_category });
    expect(database.query("SELECT * FROM definition_revisions WHERE value_id=?", [value.id])).toHaveLength(2); expect(database.query("SELECT * FROM audit_events WHERE entity_id=?", [value.id])).toHaveLength(1);
    const id = crypto.randomUUID(); const stamp = Date.now(); await database.transaction(() => database.run("INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?)", [id, value.id, "This value enables independent judgment.", "enables", "medium", "draft", "manual", null, stamp, stamp])); expect(database.one<{ status: string }>("SELECT status FROM claims WHERE id=?", [id])!.status).toBe("draft");
  });

  it("corrects an event through supersession and deterministically recomputes", async () => {
    const setId = await repo.importPreset("schwartz-10"); const session = await repo.startSession(setId, "Correction", []); const pair = repo.queue(session)[0]!; await repo.submit({ sessionId: session, setId, leftId: pair.left_value_id, rightId: pair.right_value_id, result: "left", strength: "strong", confidence: "highly", contexts: [], reasoning: "", winner: "", loser: "", reversal: "" }); const original = repo.history(setId)[0]!;
    await repo.correct(original.id, "right", "I selected the wrong side"); const sourceLog = repo.history(setId); expect(sourceLog).toHaveLength(2); expect(sourceLog[0]!.supersedes_event_id).toBe(original.id); const ratings = repo.ratings(setId); expect(ratings.find((row) => row.value_id === pair.right_value_id)!.wins).toBe(1); expect(ratings.find((row) => row.value_id === pair.left_value_id)!.wins).toBe(0);
  });

  it("detects and accepts a suggested reversal tension", async () => {
    const setId = await repo.importPreset("schwartz-10"); const session = await repo.startSession(setId, "Reversal", []); const pair = repo.queue(session)[0]!;
    await repo.submit({ sessionId: session, setId, leftId: pair.left_value_id, rightId: pair.right_value_id, result: "left", strength: "moderate", confidence: "uncertain", contexts: ["work"], reasoning: "", winner: "", loser: "", reversal: "" });
    await repo.submit({ sessionId: session, setId, leftId: pair.left_value_id, rightId: pair.right_value_id, result: "right", strength: "moderate", confidence: "uncertain", contexts: ["relationships"], reasoning: "", winner: "", loser: "", reversal: "" }); await repo.refreshTensions(setId);
    const tension = database.one<{ id: string; status: string }>("SELECT id,status FROM tensions"); expect(tension?.status).toBe("suggested"); await database.transaction(() => database.run("UPDATE tensions SET status='accepted' WHERE id=?", [tension!.id])); expect(database.one<{ status: string }>("SELECT status FROM tensions WHERE id=?", [tension!.id])!.status).toBe("accepted");
  });

  it("round-trips the complete SQLite dataset without losing records", async () => {
    const setId = await repo.importPreset("schwartz-10"); const session = await repo.startSession(setId, "Backup", []); const pair = repo.queue(session)[0]!; await repo.submit({ sessionId: session, setId, leftId: pair.left_value_id, rightId: pair.right_value_id, result: "tie", strength: "slight", confidence: "somewhat", contexts: [], reasoning: "Close call", winner: "", loser: "", reversal: "" });
    const bytes = database.sqlite.export(); const SQL = await initSqlJs({ locateFile: (file) => path.resolve("node_modules/sql.js/dist", file) }); const restored = new TestDatabase(new SQL.Database(bytes));
    expect(restored.query("SELECT * FROM value_sets")).toHaveLength(1); expect(restored.query("SELECT * FROM \"values\"")).toHaveLength(10); expect(restored.query("SELECT * FROM comparison_events")).toHaveLength(1); expect(restored.query("SELECT * FROM ratings").length).toBeGreaterThan(10); expect(restored.query("PRAGMA foreign_key_check")).toHaveLength(0);
  });
});
