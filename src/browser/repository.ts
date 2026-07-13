import { balancedSides } from "@/domain/matchmaking";
import {
  exactRankingProgress,
  type ExactDecision,
  type ExactRankingProgress,
} from "@/domain/exact-ranking";
import { replayRatings, effectiveEvents } from "@/domain/rating";
import { detectTensions, type TensionSuggestion } from "@/domain/tensions";
import type { Rating, RatingEvent } from "@/domain/types";
import {
  adjacentDecisions,
  portraitQuestionBudget,
  rapidQuestionBudget,
  selectRapidGroup,
} from "@/domain/rapid-ranking";
import { deriveScenario, type GeneratedScenario } from "@/domain/scenarios";
import { convergenceDiagnostics, type ConvergenceDiagnostics } from "@/domain/convergence";
import { valueSetImportSchema } from "@/domain/import";
import { DEFAULT_SETTINGS } from "@/db/defaults";
import type { BrowserDatabase } from "./database";
import { z } from "zod";
import schwartz10 from "../../data/presets/schwartz-10.json";
import schwartz19 from "../../data/presets/schwartz-19.json";
import rokeachTerminal from "../../data/presets/rokeach-terminal.json";
import rokeachInstrumental from "../../data/presets/rokeach-instrumental.json";
import cardSort from "../../data/presets/card-sort.json";
import emptyCustom from "../../data/presets/empty-custom.json";
import broad100 from "../../data/presets/broad-100.json";
import millerPersonalValues from "../../data/presets/miller-personal-values.json";
import scottJeffreyCoreValues from "../../data/presets/scott-jeffrey-core-values.json";

export const presetCatalog = [
  broad100,
  millerPersonalValues,
  scottJeffreyCoreValues,
  schwartz10,
  schwartz19,
  rokeachTerminal,
  rokeachInstrumental,
  cardSort,
  emptyCustom,
];
export const uid = () => crypto.randomUUID();
const now = () => Date.now();
const json = (value: unknown) => JSON.stringify(value);
const parsed = <T>(value: unknown, fallback: T): T => {
  try {
    return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

export interface SetRow {
  id: string;
  name: string;
  description: string;
  source_type: string;
  source_metadata: string;
  archived: number;
  created_at: number;
  updated_at: number;
  value_count?: number;
}
export interface ValueRow {
  id: string;
  name: string;
  short_definition: string;
  source_definition: string;
  personal_definition: string;
  source_taxonomy: string;
  source_identifier: string;
  parent_category: string;
  tags: string;
  active: number;
  created_at: number;
  updated_at: number;
  aliases?: string[];
}
export interface RatingRow extends Rating {
  value_id: string;
  value_set_id: string;
  scope_key: string;
  context_id: string | null;
  name: string;
  parent_category: string;
}
export interface ContextRow {
  id: string;
  name: string;
  description: string;
  archived: number;
}
export interface SessionRow {
  id: string;
  name: string;
  description: string;
  value_set_id: string;
  status: string;
  completed_count: number;
  notes: string;
  started_at: number;
  updated_at: number;
}
export interface QueueRow {
  id: string;
  session_id: string;
  left_value_id: string;
  right_value_id: string;
  reason: string;
  score: number;
  position: number;
}
export interface EventRow {
  id: string;
  session_id: string | null;
  value_set_id: string;
  left_value_id: string;
  right_value_id: string;
  result: RatingEvent["result"];
  strength: RatingEvent["strength"];
  confidence: RatingEvent["confidence"];
  consideration: string;
  tags: string;
  supersedes_event_id: string | null;
  correction_reason: string;
  selection_reason: string;
  occurred_at: number;
  left_name?: string;
  right_name?: string;
  notes?: { note_type: string; text: string }[];
  contextIds?: string[];
}

export interface StoredExactRanking extends ExactRankingProgress {
  sessionId: string;
  scope: string;
  updatedAt: number;
}

export interface RapidQuestion {
  id: string;
  sessionId: string;
  valueIds: string[];
  reason: string;
  question: number;
  budget: number;
  continuing?: boolean;
  scenario: GeneratedScenario;
}

export class BrowserRepository {
  constructor(readonly db: BrowserDatabase) {}

  settings() {
    const rows = this.db.query<{ key: string; value: string }>(
      "SELECT key,value FROM application_settings",
    );
    const values = Object.fromEntries(
      rows.map((row) => [row.key, parsed(row.value, {})]),
    );
    return {
      rating: { ...DEFAULT_SETTINGS.rating, ...(values.rating as object) },
      selection: {
        ...DEFAULT_SETTINGS.selection,
        ...(values.selection as object),
      },
      convergence: {
        ...DEFAULT_SETTINGS.convergence,
        ...(values.convergence as object),
      },
      display: { ...DEFAULT_SETTINGS.display, ...(values.display as object) },
      export: { ...DEFAULT_SETTINGS.export, ...(values.export as object) },
    };
  }

  sets(): SetRow[] {
    return this.db.query<SetRow>(
      "SELECT vs.*, COUNT(vsm.value_id) value_count FROM value_sets vs LEFT JOIN value_set_memberships vsm ON vsm.value_set_id=vs.id WHERE vs.archived=0 GROUP BY vs.id ORDER BY vs.name",
    );
  }
  contexts(): ContextRow[] {
    return this.db.query<ContextRow>(
      "SELECT id,name,description,archived FROM contexts WHERE archived=0 ORDER BY name",
    );
  }
  values(setId: string, archived = false): ValueRow[] {
    return this.db
      .query<ValueRow>(
        `SELECT v.* FROM "values" v JOIN value_set_memberships m ON m.value_id=v.id WHERE m.value_set_id=? ${archived ? "" : "AND v.active=1"} ORDER BY m.sort_order,v.name`,
        [setId],
      )
      .map((value) => ({
        ...value,
        aliases: this.db
          .query<{
            alias: string;
          }>("SELECT alias FROM value_aliases WHERE value_id=?", [value.id])
          .map((row) => row.alias),
      }));
  }
  sessions(): SessionRow[] {
    return this.db.query<SessionRow>(
      "SELECT * FROM comparison_sessions ORDER BY updated_at DESC",
    );
  }
  queue(sessionId: string): QueueRow[] {
    return this.db.query<QueueRow>(
      "SELECT * FROM comparison_queue WHERE session_id=? ORDER BY position",
      [sessionId],
    );
  }

  sessionMode(sessionId: string): "exact" | "rapid" | "portrait" {
    const row = this.db.one<{ value: string }>(
      "SELECT value FROM application_settings WHERE key=?",
      [`session-mode:${sessionId}`],
    );
    const mode = row
      ? parsed<"exact" | "rapid" | "portrait">(row.value, "exact")
      : "exact";
    return mode === "rapid" || mode === "portrait" ? mode : "exact";
  }

  rapidQuestion(sessionId: string): RapidQuestion | null {
    const row = this.db.one<{ value: string }>(
      "SELECT value FROM application_settings WHERE key=?",
      [`rapid-question:${sessionId}`],
    );
    return row ? parsed<RapidQuestion | null>(row.value, null) : null;
  }

  async updateRapidScenario(
    sessionId: string,
    scenario: GeneratedScenario,
    expectedQuestionId?: string,
  ): Promise<void> {
    const question = this.rapidQuestion(sessionId);
    if (!question) throw new Error("Rapid question not found");
    if (expectedQuestionId && question.id !== expectedQuestionId)
      throw new Error("The scenario question has already advanced");
    await this.db.transaction(() =>
      this.db.run(
        "UPDATE application_settings SET value=?,updated_at=? WHERE key=?",
        [json({ ...question, scenario }), now(), `rapid-question:${sessionId}`],
      ),
    );
  }

  preparedRapidQuestion(sessionId: string): RapidQuestion | null {
    return this.preparedRapidQuestions(sessionId)[0] ?? null;
  }

  preparedRapidQuestions(sessionId: string): RapidQuestion[] {
    const row = this.db.one<{ value: string }>(
      "SELECT value FROM application_settings WHERE key=?",
      [`rapid-prepared:${sessionId}`],
    );
    if (!row) return [];
    const stored = parsed<RapidQuestion | RapidQuestion[] | null>(row.value, null);
    return Array.isArray(stored) ? stored : stored ? [stored] : [];
  }

  async prepareNextRapidQuestion(sessionId: string): Promise<RapidQuestion | null> {
    return (await this.prepareRapidQuestions(sessionId, 1))[0] ?? null;
  }

  async prepareRapidQuestions(sessionId: string, count = 5): Promise<RapidQuestion[]> {
    const session = this.db.one<SessionRow>(
      "SELECT * FROM comparison_sessions WHERE id=?",
      [sessionId],
    );
    const current = this.rapidQuestion(sessionId);
    if (!session || !current) return [];
    const prepared = this.preparedRapidQuestions(sessionId)
      .filter((question) => question.question > current.question)
      .slice(0, count);
    while (prepared.length < count) {
      const previous = prepared.at(-1) ?? current;
      const next = this.buildRapidQuestion(
        session,
        current.question + prepared.length,
        previous.valueIds,
      );
      if (!next) break;
      prepared.push(next);
    }
    await this.db.transaction(() =>
      this.db.run(
        "INSERT INTO application_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        [`rapid-prepared:${sessionId}`, json(prepared), now()],
      ),
    );
    return prepared;
  }

  async updatePreparedRapidScenario(
    sessionId: string,
    expectedQuestionId: string,
    scenario: GeneratedScenario,
  ): Promise<void> {
    const prepared = this.preparedRapidQuestions(sessionId);
    const index = prepared.findIndex((question) => question.id === expectedQuestionId);
    if (index >= 0) {
      prepared[index] = { ...prepared[index]!, scenario };
      await this.db.transaction(() =>
        this.db.run("UPDATE application_settings SET value=?,updated_at=? WHERE key=?", [
          json(prepared),
          now(),
          `rapid-prepared:${sessionId}`,
        ]),
      );
      return;
    }
    await this.updateRapidScenario(sessionId, scenario, expectedQuestionId);
  }

  private sessionContexts(sessionId: string): string[] {
    return this.db
      .query<{ context_id: string }>(
        "SELECT context_id FROM session_contexts WHERE session_id=? ORDER BY context_id",
        [sessionId],
      )
      .map((row) => row.context_id);
  }

  private exactScope(sessionId: string): string {
    const contexts = this.sessionContexts(sessionId);
    return contexts.length === 0
      ? "global"
      : contexts.length === 1
        ? `context:${contexts[0]}`
        : `contexts:${contexts.join("+")}`;
  }

  private exactDecisions(session: SessionRow): ExactDecision[] {
    const contexts = this.sessionContexts(session.id);
    const revisions = new Map(
      this.db
        .query<{ value_id: string; revised_at: number }>(
          "SELECT value_id,MAX(created_at) revised_at FROM definition_revisions GROUP BY value_id",
        )
        .map((row) => [row.value_id, row.revised_at]),
    );
    const rows = this.history(session.value_set_id)
      .filter((event) => !contexts.length || contexts.every((id) => event.contextIds?.includes(id)))
      .filter(
        (event) =>
          event.occurred_at >= (revisions.get(event.left_value_id) ?? 0) &&
          event.occurred_at >= (revisions.get(event.right_value_id) ?? 0),
      )
      .sort((a, b) => a.occurred_at - b.occurred_at || a.id.localeCompare(b.id));
    const superseded = new Set(
      rows.map((event) => event.supersedes_event_id).filter(Boolean),
    );
    const effective = rows.filter(
      (event) => !superseded.has(event.id) && ["left", "right", "tie"].includes(event.result),
    );
    const byPair = new Map<string, EventRow[]>();
    for (const event of effective) {
      const key = [event.left_value_id, event.right_value_id].sort().join(":");
      const bucket = byPair.get(key) ?? [];
      bucket.push(event);
      byPair.set(key, bucket);
    }
    const decisions: ExactDecision[] = [];
    for (const bucket of byPair.values()) {
      const inSession = bucket.filter((event) => event.session_id === session.id);
      const chosen = inSession.at(-1);
      if (chosen) {
        decisions.push({ leftValueId: chosen.left_value_id, rightValueId: chosen.right_value_id, result: chosen.result });
        continue;
      }
      const normalized = new Set(
        bucket.map((event) => {
          if (event.result === "tie") return "tie";
          const winner = event.result === "left" ? event.left_value_id : event.right_value_id;
          return winner;
        }),
      );
      if (normalized.size === 1) {
        const event = bucket.at(-1)!;
        decisions.push({ leftValueId: event.left_value_id, rightValueId: event.right_value_id, result: event.result });
      }
    }
    return decisions;
  }

  exactProgress(sessionId: string): ExactRankingProgress | null {
    const session = this.db.one<SessionRow>(
      "SELECT * FROM comparison_sessions WHERE id=?",
      [sessionId],
    );
    if (!session) return null;
    return exactRankingProgress({
      valueIds: this.values(session.value_set_id).map((value) => value.id),
      seed: `${session.value_set_id}:${this.exactScope(session.id)}`,
      decisions: this.exactDecisions(session),
    });
  }

  exactRanking(setId: string, scope = "global"): StoredExactRanking | null {
    const row = this.db.one<{ value: string }>(
      "SELECT value FROM application_settings WHERE key=?",
      [`exact-ranking:${setId}:${scope}`],
    );
    return row ? parsed<StoredExactRanking | null>(row.value, null) : null;
  }

  rapidRanking(setId: string, scope = "global"):
    | { complete: boolean; questions: number; budget: number; sessionId: string }
    | null {
    const row = this.db.one<{ value: string }>(
      "SELECT value FROM application_settings WHERE key=?",
      [`rapid-ranking:${setId}:${scope}`],
    );
    return row
      ? parsed<{ complete: boolean; questions: number; budget: number; sessionId: string } | null>(row.value, null)
      : null;
  }

  orderedRatings(setId: string, scope = "global"): RatingRow[] {
    const rows = this.ratings(setId, scope);
    const exact = this.exactRanking(setId, scope);
    if (!exact?.complete) return rows;
    const rank = new Map(exact.ordered.map((id, index) => [id, index]));
    return [...rows].sort(
      (a, b) =>
        (rank.get(a.value_id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.value_id) ?? Number.MAX_SAFE_INTEGER) ||
        b.mu - a.mu,
    );
  }

  events(setId: string): RatingEvent[] {
    return this.db
      .query<EventRow>(
        "SELECT * FROM comparison_events WHERE value_set_id=? ORDER BY occurred_at,id",
        [setId],
      )
      .map((event) => ({
        id: event.id,
        leftValueId: event.left_value_id,
        rightValueId: event.right_value_id,
        result: event.result,
        strength: event.strength,
        confidence: event.confidence,
        contextIds: this.db
          .query<{
            context_id: string;
          }>(
            "SELECT context_id FROM comparison_event_contexts WHERE event_id=?",
            [event.id],
          )
          .map((row) => row.context_id),
        occurredAt: new Date(event.occurred_at),
        supersedesEventId: event.supersedes_event_id,
        erroneous: false,
      }));
  }

  history(setId?: string): EventRow[] {
    return this.db
      .query<EventRow>(
        `SELECT e.*,l.name left_name,r.name right_name FROM comparison_events e JOIN "values" l ON l.id=e.left_value_id JOIN "values" r ON r.id=e.right_value_id ${setId ? "WHERE e.value_set_id=?" : ""} ORDER BY e.occurred_at DESC`,
        setId ? [setId] : [],
      )
      .map((event) => ({
        ...event,
        notes: this.db.query<{ note_type: string; text: string }>(
          "SELECT note_type,text FROM comparison_notes WHERE event_id=?",
          [event.id],
        ),
        contextIds: this.db
          .query<{
            context_id: string;
          }>(
            "SELECT context_id FROM comparison_event_contexts WHERE event_id=?",
            [event.id],
          )
          .map((row) => row.context_id),
      }));
  }

  ratings(setId: string, scope = "global"): RatingRow[] {
    return this.db
      .query<
        Record<string, unknown>
      >('SELECT r.*,v.name,v.parent_category FROM ratings r JOIN "values" v ON v.id=r.value_id WHERE r.value_set_id=? AND r.scope_key=? ORDER BY r.mu DESC,v.name', [setId, scope])
      .map((row) => ({
        ...row,
        value_id: String(row.value_id),
        value_set_id: String(row.value_set_id),
        scope_key: String(row.scope_key),
        context_id: row.context_id ? String(row.context_id) : null,
        name: String(row.name),
        parent_category: String(row.parent_category),
        mu: Number(row.mu),
        sigma: Number(row.sigma),
        comparisons: Number(row.comparisons),
        wins: Number(row.wins),
        losses: Number(row.losses),
        ties: Number(row.ties),
        incomparable: Number(row.incomparable),
        lastComparedAt: row.last_compared_at
          ? new Date(Number(row.last_compared_at))
          : null,
      }));
  }

  async importPreset(slug: string): Promise<string> {
    const preset = presetCatalog.find((item) => item.slug === slug);
    if (!preset) throw new Error("Preset not found");
    const setId = uid();
    const stamp = now();
    await this.db.transaction(() => {
      this.db.run("INSERT INTO value_sets VALUES (?,?,?,?,?,?,?,?)", [
        setId,
        preset.name,
        preset.description,
        "preset",
        json({
          preset: slug,
          citation: preset.citation,
          licenseNote: preset.licenseNote,
          sourceUrl: "sourceUrl" in preset ? preset.sourceUrl : undefined,
        }),
        0,
        stamp,
        stamp,
      ]);
      preset.values.forEach((item, index) => {
        const valueId = uid();
        this.db.run('INSERT INTO "values" VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
          valueId,
          item.name,
          item.definition,
          item.definition,
          "",
          preset.taxonomy,
          item.id,
          item.category,
          "[]",
          1,
          stamp,
          stamp,
        ]);
        this.db.run("INSERT INTO value_set_memberships VALUES (?,?,?,?,?)", [
          setId,
          valueId,
          json({ preset: slug }),
          index,
          stamp,
        ]);
        this.db.run("INSERT INTO definition_revisions VALUES (?,?,?,?,?,?,?)", [
          uid(),
          valueId,
          item.definition,
          item.definition,
          "",
          "Imported from preset",
          stamp,
        ]);
      });
    });
    await this.recompute(setId);
    return setId;
  }

  exportValueSet(valueSetId: string): z.infer<typeof valueSetImportSchema> {
    const set = this.db.one<SetRow>(
      "SELECT * FROM value_sets WHERE id=?",
      [valueSetId],
    );
    if (!set) throw new Error("Value set not found");
    const values = this.values(valueSetId, true).map((value) => ({
      name: value.name,
      shortDefinition: value.short_definition,
      sourceDefinition: value.source_definition,
      personalDefinition: value.personal_definition,
      sourceTaxonomy: value.source_taxonomy,
      sourceIdentifier: value.source_identifier,
      parentCategory: value.parent_category,
      aliases: value.aliases ?? [],
      tags: parsed<string[]>(value.tags, []),
    }));
    return valueSetImportSchema.parse({
      format: "values-tool-value-set",
      version: 1,
      name: set.name,
      description: set.description,
      source: parsed<Record<string, unknown>>(set.source_metadata, {}),
      values,
    });
  }

  async replaceValueSet(valueSetId: string, input: unknown): Promise<void> {
    const parsedInput = valueSetImportSchema.parse(input);
    const current = this.db.one<SetRow>("SELECT * FROM value_sets WHERE id=?", [valueSetId]);
    if (!current) throw new Error("Value set not found");
    const stamp = now();
    const oldValues = this.values(valueSetId, true);
    const oldValueIds = oldValues.map((value) => value.id);
    await this.resetEvidence(valueSetId);
    await this.db.transaction(() => {
      if (oldValueIds.length) {
        const placeholders = oldValueIds.map(() => "?").join(",");
        this.db.run(`DELETE FROM value_aliases WHERE value_id IN (${placeholders})`, oldValueIds);
        this.db.run(`DELETE FROM definition_revisions WHERE value_id IN (${placeholders})`, oldValueIds);
        this.db.run(`DELETE FROM value_set_memberships WHERE value_set_id=?`, [valueSetId]);
        this.db.run(`DELETE FROM "values" WHERE id IN (${placeholders})`, oldValueIds);
      }
      this.db.run(
        "UPDATE value_sets SET name=?,description=?,source_type=?,source_metadata=?,archived=0,updated_at=? WHERE id=?",
        [
          parsedInput.name,
          parsedInput.description,
          "custom",
          json({ importedFrom: "json", source: parsedInput.source ?? {} }),
          stamp,
          valueSetId,
        ],
      );
      parsedInput.values.forEach((item, index) => {
        const valueId = uid();
        this.db.run('INSERT INTO "values" VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
          valueId,
          item.name,
          item.shortDefinition ?? "",
          item.sourceDefinition ?? "",
          item.personalDefinition ?? "",
          item.sourceTaxonomy ?? "",
          item.sourceIdentifier ?? "",
          item.parentCategory ?? "",
          json(item.tags ?? []),
          1,
          stamp,
          stamp,
        ]);
        this.db.run("INSERT INTO value_set_memberships VALUES (?,?,?,?,?)", [
          valueSetId,
          valueId,
          json({
            importedFrom: "json",
            sourceIdentifier: item.sourceIdentifier ?? "",
          }),
          index,
          stamp,
        ]);
        for (const alias of item.aliases ?? [])
          this.db.run("INSERT INTO value_aliases VALUES (?,?,?,?,?)", [
            uid(),
            valueId,
            alias,
            "user",
            stamp,
          ]);
        this.db.run("INSERT INTO definition_revisions VALUES (?,?,?,?,?,?,?)", [
          uid(),
          valueId,
          item.shortDefinition ?? "",
          item.sourceDefinition ?? "",
          item.personalDefinition ?? "",
          "Imported from JSON",
          stamp,
        ]);
      });
    });
    await this.recompute(valueSetId);
  }

  async createSet(name: string, description = ""): Promise<string> {
    const id = uid();
    const stamp = now();
    await this.db.transaction(() =>
      this.db.run("INSERT INTO value_sets VALUES (?,?,?,?,?,?,?,?)", [
        id,
        name,
        description,
        "custom",
        "{}",
        0,
        stamp,
        stamp,
      ]),
    );
    return id;
  }
  async addValue(
    setId: string,
    input: { name: string; definition: string; category?: string },
  ): Promise<void> {
    const id = uid();
    const stamp = now();
    await this.db.transaction(() => {
      this.db.run('INSERT INTO "values" VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
        id,
        input.name,
        input.definition,
        "",
        input.definition,
        "Custom",
        "",
        input.category ?? "",
        "[]",
        1,
        stamp,
        stamp,
      ]);
      this.db.run("INSERT INTO value_set_memberships VALUES (?,?,?,?,?)", [
        setId,
        id,
        "{}",
        9999,
        stamp,
      ]);
      this.db.run("INSERT INTO definition_revisions VALUES (?,?,?,?,?,?,?)", [
        uid(),
        id,
        input.definition,
        "",
        input.definition,
        "Value created",
        stamp,
      ]);
      this.db.run("DELETE FROM application_settings WHERE key LIKE ?", [
        `exact-ranking:${setId}:%`,
      ]);
    });
    await this.recompute(setId);
  }
  async updateValue(
    valueId: string,
    input: {
      name: string;
      definition: string;
      category: string;
      aliases?: string[];
      tags?: string[];
    },
  ): Promise<void> {
    const stamp = now();
    await this.db.transaction(() => {
      const before = this.db.one<ValueRow>(
        'SELECT * FROM "values" WHERE id=?',
        [valueId],
      );
      this.db.run(
        'UPDATE "values" SET name=?,personal_definition=?,short_definition=?,parent_category=?,tags=?,updated_at=? WHERE id=?',
        [
          input.name,
          input.definition,
          input.definition,
          input.category,
          json(input.tags ?? parsed(before?.tags, [])),
          stamp,
          valueId,
        ],
      );
      if (input.aliases) {
        this.db.run("DELETE FROM value_aliases WHERE value_id=?", [valueId]);
        for (const alias of input.aliases)
          this.db.run("INSERT INTO value_aliases VALUES (?,?,?,?,?)", [
            uid(),
            valueId,
            alias,
            "user",
            stamp,
          ]);
      }
      this.db.run("INSERT INTO definition_revisions VALUES (?,?,?,?,?,?,?)", [
        uid(),
        valueId,
        input.definition,
        before?.source_definition ?? "",
        input.definition,
        "User revision",
        stamp,
      ]);
      this.db.run("INSERT INTO audit_events VALUES (?,?,?,?,?,?,?)", [
        uid(),
        "value",
        valueId,
        "definition_updated",
        json(before),
        json(input),
        stamp,
      ]);
      this.db
        .query<{ value_set_id: string }>(
          "SELECT value_set_id FROM value_set_memberships WHERE value_id=?",
          [valueId],
        )
        .forEach((membership) =>
          this.db.run("DELETE FROM application_settings WHERE key LIKE ?", [
            `exact-ranking:${membership.value_set_id}:%`,
          ]),
        );
    });
  }

  async setValueActive(valueId: string, active: boolean): Promise<void> {
    const memberships = this.db.query<{ value_set_id: string }>(
      "SELECT value_set_id FROM value_set_memberships WHERE value_id=?",
      [valueId],
    );
    await this.db.transaction(() => {
      this.db.run('UPDATE "values" SET active=?,updated_at=? WHERE id=?', [
        active ? 1 : 0,
        now(),
        valueId,
      ]);
      for (const membership of memberships)
        this.db.run("DELETE FROM application_settings WHERE key LIKE ?", [
          `exact-ranking:${membership.value_set_id}:%`,
        ]);
    });
    for (const membership of memberships)
      await this.recompute(membership.value_set_id);
  }

  async updateSet(
    setId: string,
    input: { name: string; description: string; archived?: boolean },
  ): Promise<void> {
    await this.db.transaction(() =>
      this.db.run(
        "UPDATE value_sets SET name=?,description=?,archived=?,updated_at=? WHERE id=?",
        [input.name, input.description, input.archived ? 1 : 0, now(), setId],
      ),
    );
  }

  async cloneOrMergeSets(
    setIds: string[],
    name: string,
  ): Promise<{ id: string; duplicates: string[] }> {
    if (!setIds.length) throw new Error("Select at least one value set");
    const id = uid();
    const stamp = now();
    const duplicates: string[] = [];
    const unique = new Map<string, ValueRow>();
    for (const setId of setIds)
      for (const value of this.values(setId, true)) {
        const keys = [value.name, ...(value.aliases ?? [])].map((item) =>
          item.toLowerCase().replace(/[^a-z0-9]/g, ""),
        );
        const existing = [...unique.entries()].find(([key]) =>
          keys.includes(key),
        );
        if (existing) {
          duplicates.push(`${value.name} matched ${existing[1].name}`);
          continue;
        }
        unique.set(keys[0]!, value);
      }
    await this.db.transaction(() => {
      this.db.run("INSERT INTO value_sets VALUES (?,?,?,?,?,?,?,?)", [
        id,
        name,
        setIds.length === 1 ? "Cloned value set" : "Merged value sets",
        setIds.length === 1 ? "clone" : "merged",
        json({ sourceSetIds: setIds, duplicateReview: duplicates }),
        0,
        stamp,
        stamp,
      ]);
      [...unique.values()].forEach((value, position) => {
        const valueId = uid();
        this.db.run('INSERT INTO "values" VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
          valueId,
          value.name,
          value.short_definition,
          value.source_definition,
          value.personal_definition,
          value.source_taxonomy,
          value.source_identifier,
          value.parent_category,
          value.tags,
          value.active,
          stamp,
          stamp,
        ]);
        this.db.run("INSERT INTO value_set_memberships VALUES (?,?,?,?,?)", [
          id,
          valueId,
          json({ clonedFrom: value.id }),
          position,
          stamp,
        ]);
        for (const alias of value.aliases ?? [])
          this.db.run("INSERT INTO value_aliases VALUES (?,?,?,?,?)", [
            uid(),
            valueId,
            alias,
            "clone",
            stamp,
          ]);
      });
    });
    await this.recompute(id);
    return { id, duplicates };
  }

  async recompute(setId: string): Promise<void> {
    const config = this.settings().rating;
    const ids = this.values(setId, true).map((value) => value.id);
    const events = this.events(setId);
    const stamp = now();
    const contexts = this.contexts();
    const scopes: [string, string | null, Map<string, Rating>][] = [
      ["global", null, replayRatings(ids, events, config)],
    ];
    for (const context of contexts) {
      scopes.push([
        `context:${context.id}`,
        context.id,
        replayRatings(ids, events, config, context.id),
      ]);
      scopes.push([
        `combined:${context.id}`,
        context.id,
        replayRatings(
          ids,
          events.filter(
            (event) =>
              event.contextIds.length === 0 ||
              event.contextIds.includes(context.id),
          ),
          config,
        ),
      ]);
    }
    await this.db.transaction(() => {
      this.db.run("DELETE FROM ratings WHERE value_set_id=?", [setId]);
      for (const [scope, contextId, ratings] of scopes)
        for (const [valueId, rating] of ratings)
          this.db.run(
            "INSERT INTO ratings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              uid(),
              setId,
              valueId,
              contextId,
              scope,
              rating.mu,
              rating.sigma,
              rating.comparisons,
              rating.wins,
              rating.losses,
              rating.ties,
              rating.incomparable,
              rating.lastComparedAt?.getTime() ?? null,
              stamp,
            ],
          );
    });
  }

  private snapshot(setId: string, reason: string, eventId: string | null) {
    const id = uid();
    const stamp = now();
    const rows = this.ratings(setId);
    this.db.run("INSERT INTO rating_snapshots VALUES (?,?,?,?,?,?,?)", [
      id,
      setId,
      null,
      "global",
      reason,
      eventId,
      stamp,
    ]);
    rows.forEach((rating, rank) =>
      this.db.run("INSERT INTO rating_snapshot_entries VALUES (?,?,?,?,?,?)", [
        id,
        rating.value_id,
        rating.mu,
        rating.sigma,
        rank + 1,
        rating.comparisons,
      ]),
    );
    return id;
  }

  async startSession(
    setId: string,
    name: string,
    contextIds: string[],
    mode: "exact" | "rapid" | "portrait" = "exact",
  ): Promise<string> {
    const id = uid();
    const stamp = now();
    await this.db.transaction(() => {
      const before = this.snapshot(setId, "session-before", null);
      this.db.run(
        "INSERT INTO comparison_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          name,
          mode === "portrait"
            ? "Adaptive portrait choices"
            : mode === "rapid"
              ? "Rapid five-value ranking"
              : "Exact ordering session",
          setId,
          "active",
          stamp,
          null,
          0,
          "",
          before,
          null,
          stamp,
          stamp,
        ],
      );
      contextIds.forEach((contextId) =>
        this.db.run("INSERT INTO session_contexts VALUES (?,?)", [
          id,
          contextId,
        ]),
      );
      this.db.run(
        "INSERT INTO application_settings(key,value,updated_at) VALUES (?,?,?)",
        [`session-mode:${id}`, json(mode), stamp],
      );
    });
    await this.regenerateQueue(id);
    return id;
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = this.db.one<SessionRow>(
      "SELECT * FROM comparison_sessions WHERE id=?",
      [sessionId],
    );
    if (!session) throw new Error("Session not found");
    await this.db.transaction(() => {
      const stamp = now();
      this.db.run(
        "UPDATE comparison_sessions SET status='active',ended_at=NULL,after_snapshot_id=NULL,updated_at=? WHERE id=?",
        [stamp, sessionId],
      );
      this.db.run("DELETE FROM application_settings WHERE key=?", [
        `rapid-ranking:${session.value_set_id}:${this.exactScope(sessionId)}`,
      ]);
    });
    await this.regenerateQueue(sessionId);
  }

  async regenerateQueue(sessionId: string): Promise<void> {
    const session = this.db.one<SessionRow>(
      "SELECT * FROM comparison_sessions WHERE id=?",
      [sessionId],
    );
    if (!session) throw new Error("Session not found");
    if (this.sessionMode(sessionId) !== "exact") {
      await this.regenerateRapidQueue(session);
      return;
    }
    const progress = this.exactProgress(sessionId);
    if (!progress) throw new Error("Unable to calculate ordering progress");
    const candidate = progress.nextPair
      ? balancedSides(
          {
            ...progress.nextPair,
            reason: `Exact ordering · ${progress.placed}/${progress.total} placed`,
            score: progress.worstCase - progress.reusedComparisons,
            details: ["Binary search of the remaining insertion interval"],
          },
          `${sessionId}:${session.completed_count}`,
        )
      : null;
    await this.db.transaction(() => {
      this.db.run(
        "DELETE FROM comparison_queue WHERE session_id=? AND reason!='Manual comparison'",
        [sessionId],
      );
      if (candidate)
        this.db.run("INSERT INTO comparison_queue VALUES (?,?,?,?,?,?,?,?)", [
          uid(),
          sessionId,
          candidate.leftValueId,
          candidate.rightValueId,
          candidate.reason,
          candidate.score,
          0,
          now(),
        ]);
      else {
        const scope = this.exactScope(sessionId);
        const stored: StoredExactRanking = {
          ...progress,
          sessionId,
          scope,
          updatedAt: now(),
        };
        this.db.run(
          "INSERT INTO application_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
          [`exact-ranking:${session.value_set_id}:${scope}`, json(stored), now()],
        );
        this.db.run(
          "UPDATE comparison_sessions SET status='completed',ended_at=?,after_snapshot_id=?,updated_at=? WHERE id=?",
          [now(), this.snapshot(session.value_set_id, "exact-order-complete", null), now(), sessionId],
        );
      }
    });
  }

  private buildRapidQuestion(
    session: SessionRow,
    completedQuestions: number,
    avoidValueIds: string[] = [],
  ): RapidQuestion | null {
    const values = this.values(session.value_set_id);
    const portraitMode = this.sessionMode(session.id) === "portrait";
    const minimumBudget = portraitMode
      ? portraitQuestionBudget(values.length)
      : rapidQuestionBudget(values.length);
    const diagnostics = this.sessionConvergence(session.id);
    const targetReached =
      diagnostics.insufficientValues === 0 &&
      !["more-needed", "contexts-unresolved"].includes(diagnostics.state);
    const continuing = completedQuestions >= minimumBudget && !targetReached;
    const questionBudget = continuing ? completedQuestions + 1 : minimumBudget;
    const settings = this.settings();
    const ratings = this.ratings(session.value_set_id);
    const contexts = this.sessionContexts(session.id);
    const relevantEvents = effectiveEvents(this.events(session.value_set_id)).filter(
      (event) => !contexts.length || contexts.every((id) => event.contextIds.includes(id)),
    );
    const group = selectRapidGroup({
      values: values.map((value) => ({
        id: value.id,
        name: value.name,
        parentCategory: value.parent_category,
        aliases: value.aliases ?? [],
        rating:
          ratings.find((rating) => rating.value_id === value.id) ?? {
            mu: settings.rating.mu,
            sigma: settings.rating.sigma,
            comparisons: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            incomparable: 0,
            lastComparedAt: null,
          },
      })),
      events: relevantEvents,
      seed: `${session.value_set_id}:${this.exactScope(session.id)}`,
      completedQuestions,
      questionBudget,
      avoidValueIds,
    });
    if (!group) return null;
    const groupValues = group.valueIds.map((id) => values.find((value) => value.id === id)!);
    const contextNames = this.contexts()
      .filter((context) => contexts.includes(context.id))
      .map((context) => context.name);
    return {
      ...group,
      budget: minimumBudget,
      continuing,
      reason: continuing
        ? diagnostics.insufficientValues > 0
          ? `Close ${diagnostics.insufficientValues} evidence gap${diagnostics.insufficientValues === 1 ? "" : "s"}`
          : "Resolve remaining ranking uncertainty"
        : group.reason,
      sessionId: session.id,
      scenario: deriveScenario({
        values: groupValues.map((value) => ({
          id: value.id,
          name: value.name,
          definition: value.personal_definition || value.short_definition,
          category: value.parent_category,
        })),
        contexts: contextNames,
        purpose: session.name,
        question: group.question,
      }),
    };
  }

  private async regenerateRapidQueue(session: SessionRow): Promise<void> {
    const values = this.values(session.value_set_id);
    const portraitMode = this.sessionMode(session.id) === "portrait";
    const questionBudget = portraitMode
      ? portraitQuestionBudget(values.length)
      : rapidQuestionBudget(values.length);
    const prepared = this.preparedRapidQuestions(session.id);
    const promoted = prepared.find(
      (question) => question.question === session.completed_count + 1,
    );
    const remainingPrepared = promoted
      ? prepared.filter((question) => question.question > promoted.question)
      : [];
    const group = promoted
      ? promoted
      : this.buildRapidQuestion(session, session.completed_count);
    const stamp = now();
    if (!group) {
      await this.db.transaction(() => {
        this.db.run("DELETE FROM comparison_queue WHERE session_id=?", [session.id]);
        this.db.run("DELETE FROM application_settings WHERE key=?", [
          `rapid-question:${session.id}`,
        ]);
        this.db.run("DELETE FROM application_settings WHERE key=?", [
          `rapid-prepared:${session.id}`,
        ]);
        const scope = this.exactScope(session.id);
        this.db.run(
          "INSERT INTO application_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
          [
            `rapid-ranking:${session.value_set_id}:${scope}`,
            json({ complete: true, questions: session.completed_count, budget: questionBudget, sessionId: session.id }),
            stamp,
          ],
        );
        this.db.run(
          "UPDATE comparison_sessions SET status='completed',ended_at=?,after_snapshot_id=?,updated_at=? WHERE id=?",
          [stamp, this.snapshot(session.value_set_id, "rapid-ranking-complete", null), stamp, session.id],
        );
      });
      return;
    }
    const question = group;
    await this.db.transaction(() => {
      if (remainingPrepared.length)
        this.db.run(
          "UPDATE application_settings SET value=?,updated_at=? WHERE key=?",
          [json(remainingPrepared), stamp, `rapid-prepared:${session.id}`],
        );
      else
        this.db.run("DELETE FROM application_settings WHERE key=?", [
          `rapid-prepared:${session.id}`,
        ]);
      this.db.run("DELETE FROM comparison_queue WHERE session_id=?", [session.id]);
      this.db.run(
        "INSERT INTO comparison_queue VALUES (?,?,?,?,?,?,?,?)",
        [
          uid(),
          session.id,
          group.valueIds[0],
          group.valueIds[1],
          group.continuing
            ? `Targeted convergence · question ${group.question}`
            : `Rapid ranking · ${group.question}/${group.budget}`,
          0,
          0,
          stamp,
        ],
      );
      this.db.run(
        "INSERT INTO application_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        [`rapid-question:${session.id}`, json(question), stamp],
      );
    });
  }

  sessionConvergence(sessionId: string): ConvergenceDiagnostics {
    const session = this.db.one<SessionRow>(
      "SELECT * FROM comparison_sessions WHERE id=?",
      [sessionId],
    );
    if (!session) throw new Error("Session not found");
    const settings = this.settings();
    const scope = this.exactScope(sessionId);
    const scopedRatings = this.ratings(session.value_set_id, scope);
    const ratings = scopedRatings.length ? scopedRatings : this.ratings(session.value_set_id);
    const snapshots = this.db.query<{ id: string }>(
      "SELECT id FROM rating_snapshots WHERE value_set_id=? AND scope_key='global' ORDER BY created_at DESC LIMIT ?",
      [session.value_set_id, settings.convergence.stabilityWindow],
    );
    return convergenceDiagnostics({
      values: ratings.map((rating) => ({
        id: rating.value_id,
        name: rating.name,
        parentCategory: rating.parent_category,
        aliases: [],
        rating,
      })),
      recentRankings: snapshots.map((snapshot) =>
        this.db
          .query<{ value_id: string }>(
            "SELECT value_id FROM rating_snapshot_entries WHERE snapshot_id=? ORDER BY rank",
            [snapshot.id],
          )
          .map((entry) => entry.value_id),
      ),
      config: settings.convergence,
      suspectedContradictions: this.db.query(
        "SELECT id FROM tensions WHERE status='suggested'",
      ).length,
    });
  }

  async submitRapidRanking(input: {
    sessionId: string;
    setId: string;
    orderedValueIds: string[];
    contexts: string[];
    reasoning?: string;
  }): Promise<void> {
    const question = this.rapidQuestion(input.sessionId);
    if (!question) throw new Error("Rapid question not found");
    if (
      input.orderedValueIds.length !== question.valueIds.length ||
      [...input.orderedValueIds].sort().join(":") !== [...question.valueIds].sort().join(":")
    )
      throw new Error("The submitted order does not match the active question");
    const decisions = adjacentDecisions(input.orderedValueIds);
    const eventIds = decisions.map(() => uid());
    const stamp = now();
    await this.db.transaction(() => {
      this.snapshot(input.setId, "before-rapid-question", null);
      decisions.forEach((decision, index) => {
        const eventId = eventIds[index]!;
        this.db.run(
          "INSERT INTO comparison_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            eventId, input.sessionId, input.setId, decision.leftValueId,
            decision.rightValueId, "left", "moderate", "confident", "intrinsic",
            json(["multiway"]),
            json(eventIds.filter((id) => id !== eventId)),
            null, "", 0, `rapid-ranking:${question.id}:${index + 1}/${decisions.length}`,
            1, stamp + index, stamp + index,
          ],
        );
        input.contexts.forEach((contextId) =>
          this.db.run("INSERT INTO comparison_event_contexts VALUES (?,?)", [eventId, contextId]),
        );
        if (index === 0) {
          this.db.run("INSERT INTO comparison_notes VALUES (?,?,?,?,?)", [
            uid(), eventId, "general",
            `Scenario [${question.scenario.provider}/${question.scenario.model}]: ${question.scenario.text}`,
            stamp,
          ]);
          if (input.reasoning)
            this.db.run("INSERT INTO comparison_notes VALUES (?,?,?,?,?)", [
              uid(), eventId, "reasoning", input.reasoning, stamp,
            ]);
        }
      });
      this.db.run(
        "UPDATE comparison_sessions SET completed_count=completed_count+1,updated_at=? WHERE id=?",
        [stamp, input.sessionId],
      );
      this.db.run("DELETE FROM comparison_queue WHERE session_id=?", [input.sessionId]);
      this.db.run("DELETE FROM application_settings WHERE key=?", [
        `rapid-question:${input.sessionId}`,
      ]);
    });
    await this.recompute(input.setId);
    await this.db.transaction(() => this.snapshot(input.setId, "after-rapid-question", eventIds.at(-1)!));
    await this.refreshTensions(input.setId);
    await this.regenerateQueue(input.sessionId);
  }

  async submitScenarioPortrait(input: {
    sessionId: string;
    setId: string;
    contexts: string[];
    mostChoiceId: string;
    leastChoiceId: string;
  }): Promise<void> {
    const question = this.rapidQuestion(input.sessionId);
    if (!question) throw new Error("Scenario question not found");
    const choices = question.scenario.choices ?? [];
    const most = choices.find((choice) => choice.id === input.mostChoiceId);
    const least = choices.find((choice) => choice.id === input.leastChoiceId);
    if (!most || !least || most.id === least.id)
      throw new Error("Choose different most-like and least-like people");
    if (
      choices.length < 2 ||
      new Set(choices.map((choice) => choice.focalValueId)).size !== choices.length ||
      choices.some((choice) => !question.valueIds.includes(choice.focalValueId))
    )
      throw new Error("The generated portraits do not match this question");
    const decisions = [
      ...choices
        .filter((choice) => choice.id !== most.id)
        .map((choice) => ({
          leftValueId: most.focalValueId,
          rightValueId: choice.focalValueId,
          result: "left" as const,
        })),
      ...choices
        .filter((choice) => choice.id !== least.id && choice.id !== most.id)
        .map((choice) => ({
          leftValueId: choice.focalValueId,
          rightValueId: least.focalValueId,
          result: "left" as const,
        })),
    ];
    const eventIds = decisions.map(() => uid());
    const stamp = now();
    await this.db.transaction(() => {
      this.snapshot(input.setId, "before-portrait-question", null);
      decisions.forEach((decision, index) => {
        const eventId = eventIds[index]!;
        this.db.run(
          "INSERT INTO comparison_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            eventId, input.sessionId, input.setId, decision.leftValueId,
            decision.rightValueId, "left", "moderate", "somewhat", "intrinsic",
            json(["portrait-choice", "best-worst"]),
            json(eventIds.filter((id) => id !== eventId)),
            null, "", 0, `portrait-best-worst:${question.id}:${index + 1}/${decisions.length}`,
            1, stamp + index, stamp + index,
          ],
        );
        input.contexts.forEach((contextId) =>
          this.db.run("INSERT INTO comparison_event_contexts VALUES (?,?)", [eventId, contextId]),
        );
        if (index === 0) {
          this.db.run("INSERT INTO comparison_notes VALUES (?,?,?,?,?)", [
            uid(), eventId, "general",
            `Portrait scenario [${question.scenario.provider}/${question.scenario.model}]: ${question.scenario.text}\n${choices.map((choice) => `Person ${choice.id}: ${choice.text}`).join("\n")}`,
            stamp,
          ]);
          this.db.run("INSERT INTO comparison_notes VALUES (?,?,?,?,?)", [
            uid(), eventId, "portrait_most",
            `Most like me -- Person ${most.id}: ${most.text}`,
            stamp,
          ]);
          this.db.run("INSERT INTO comparison_notes VALUES (?,?,?,?,?)", [
            uid(), eventId, "portrait_least",
            `Least like me -- Person ${least.id}: ${least.text}`,
            stamp,
          ]);
        }
      });
      this.db.run(
        "UPDATE comparison_sessions SET completed_count=completed_count+1,updated_at=? WHERE id=?",
        [stamp, input.sessionId],
      );
      this.db.run("DELETE FROM comparison_queue WHERE session_id=?", [input.sessionId]);
      this.db.run("DELETE FROM application_settings WHERE key=?", [
        `rapid-question:${input.sessionId}`,
      ]);
    });
    await this.recompute(input.setId);
    await this.db.transaction(() =>
      this.snapshot(input.setId, "after-portrait-question", eventIds.at(-1)!),
    );
    await this.refreshTensions(input.setId);
    await this.regenerateQueue(input.sessionId);
  }

  async submit(input: {
    sessionId: string;
    setId: string;
    leftId: string;
    rightId: string;
    result: RatingEvent["result"];
    strength: RatingEvent["strength"];
    confidence: RatingEvent["confidence"];
    consideration?: "intrinsic" | "obligation" | "instrumental" | "uncertainty";
    tags?: string[];
    relatedEventIds?: string[];
    contexts: string[];
    reasoning: string;
    winner: string;
    loser: string;
    reversal: string;
  }): Promise<void> {
    const id = uid();
    const stamp = now();
    const queueItem = this.db.one<QueueRow>(
      "SELECT * FROM comparison_queue WHERE session_id=? AND ((left_value_id=? AND right_value_id=?) OR (left_value_id=? AND right_value_id=?)) ORDER BY position LIMIT 1",
      [input.sessionId, input.leftId, input.rightId, input.rightId, input.leftId],
    );
    await this.db.transaction(() => {
      this.db.run(
        "INSERT INTO comparison_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          input.sessionId,
          input.setId,
          input.leftId,
          input.rightId,
          input.result,
          input.strength,
          input.confidence,
          input.consideration ?? "intrinsic",
          json(input.tags ?? []),
          json(input.relatedEventIds ?? []),
          null,
          "",
          0,
          queueItem?.reason ?? "Manual comparison",
          1,
          stamp,
          stamp,
        ],
      );
      input.contexts.forEach((contextId) =>
        this.db.run("INSERT INTO comparison_event_contexts VALUES (?,?)", [
          id,
          contextId,
        ]),
      );
      for (const [type, note] of [
        ["reasoning", input.reasoning],
        ["winner_mattered", input.winner],
        ["loser_protects", input.loser],
        ["reversal", input.reversal],
      ])
        if (note)
          this.db.run("INSERT INTO comparison_notes VALUES (?,?,?,?,?)", [
            uid(),
            id,
            type,
            note,
            stamp,
          ]);
      this.snapshot(input.setId, "before-comparison", id);
      this.db.run(
        "UPDATE comparison_sessions SET completed_count=completed_count+1,updated_at=? WHERE id=?",
        [stamp, input.sessionId],
      );
      this.db.run(
        "DELETE FROM comparison_queue WHERE session_id=? AND ((left_value_id=? AND right_value_id=?) OR (left_value_id=? AND right_value_id=?))",
        [
          input.sessionId,
          input.leftId,
          input.rightId,
          input.rightId,
          input.leftId,
        ],
      );
    });
    await this.recompute(input.setId);
    await this.db.transaction(() =>
      this.snapshot(input.setId, "after-comparison", id),
    );
    await this.refreshTensions(input.setId);
    await this.regenerateQueue(input.sessionId);
  }

  async correct(
    eventId: string,
    result: RatingEvent["result"],
    reason: string,
  ): Promise<void> {
    const original = this.db.one<EventRow>(
      "SELECT * FROM comparison_events WHERE id=?",
      [eventId],
    );
    if (!original) throw new Error("Event not found");
    const id = uid();
    const stamp = now();
    await this.db.transaction(() => {
      this.db.run(
        "INSERT INTO comparison_events SELECT ?,session_id,value_set_id,left_value_id,right_value_id,?,strength,confidence,consideration,tags,related_event_ids,?,?,0,'correction',left_presented_first,?,? FROM comparison_events WHERE id=?",
        [id, result, eventId, reason, stamp, stamp, eventId],
      );
      this.db
        .query<{
          context_id: string;
        }>(
          "SELECT context_id FROM comparison_event_contexts WHERE event_id=?",
          [eventId],
        )
        .forEach((row) =>
          this.db.run("INSERT INTO comparison_event_contexts VALUES (?,?)", [
            id,
            row.context_id,
          ]),
        );
    });
    await this.recompute(original.value_set_id);
    if (original.session_id) await this.regenerateQueue(original.session_id);
  }

  async resetEvidence(setId?: string): Promise<void> {
    const targetSetIds = setId ? [setId] : this.sets().map((set) => set.id);
    const stamp = now();
    await this.db.transaction(() => {
      for (const targetSetId of targetSetIds) {
        const eventIds = this.db
          .query<{ id: string }>(
            "SELECT id FROM comparison_events WHERE value_set_id=?",
            [targetSetId],
          )
          .map((row) => row.id);
        const sessionIds = this.db
          .query<{ id: string }>(
            "SELECT id FROM comparison_sessions WHERE value_set_id=?",
            [targetSetId],
          )
          .map((row) => row.id);
        const valueIds = this.values(targetSetId, true).map((value) => value.id);
        const claimIds = new Set<string>();
        for (const valueId of valueIds)
          this.db
            .query<{ id: string }>("SELECT id FROM claims WHERE value_id=?", [valueId])
            .forEach((row) => claimIds.add(row.id));
        for (const eventId of eventIds)
          this.db
            .query<{ claim_id: string }>("SELECT claim_id FROM claim_sources WHERE event_id=?", [eventId])
            .forEach((row) => claimIds.add(row.claim_id));
        const tensionIds = new Set<string>();
        for (const valueId of valueIds)
          this.db
            .query<{ tension_id: string }>("SELECT tension_id FROM tension_values WHERE value_id=?", [valueId])
            .forEach((row) => tensionIds.add(row.tension_id));
        for (const eventId of eventIds)
          this.db
            .query<{ tension_id: string }>("SELECT tension_id FROM tension_sources WHERE event_id=?", [eventId])
            .forEach((row) => tensionIds.add(row.tension_id));

        for (const claimId of claimIds) this.db.run("DELETE FROM claims WHERE id=?", [claimId]);
        for (const tensionId of tensionIds) this.db.run("DELETE FROM tensions WHERE id=?", [tensionId]);
        this.db.run("DELETE FROM rating_snapshots WHERE value_set_id=?", [targetSetId]);
        this.db.run("DELETE FROM ratings WHERE value_set_id=?", [targetSetId]);
        this.db.run("DELETE FROM manual_tiers WHERE value_set_id=?", [targetSetId]);
        for (const eventId of eventIds) {
          this.db.run("DELETE FROM claim_sources WHERE event_id=?", [eventId]);
          this.db.run("DELETE FROM tension_sources WHERE event_id=?", [eventId]);
        }
        this.db.run("DELETE FROM comparison_events WHERE value_set_id=?", [targetSetId]);
        this.db.run("DELETE FROM comparison_sessions WHERE value_set_id=?", [targetSetId]);
        this.db.run("DELETE FROM application_settings WHERE key LIKE ?", [
          `exact-ranking:${targetSetId}:%`,
        ]);
        this.db.run("DELETE FROM application_settings WHERE key LIKE ?", [
          `rapid-ranking:${targetSetId}:%`,
        ]);
        for (const sessionId of sessionIds) {
          this.db.run("DELETE FROM application_settings WHERE key IN (?,?,?,?)", [
            `session-mode:${sessionId}`,
            `rapid-question:${sessionId}`,
            `rapid-prepared:${sessionId}`,
            `exact-ranking-session:${sessionId}`,
          ]);
        }
      }
      this.db.run("INSERT INTO audit_events VALUES (?,?,?,?,?,?,?)", [
        uid(),
        "ranking_evidence",
        setId ?? "all",
        "reset",
        null,
        json({ valueSetIds: targetSetIds }),
        stamp,
      ]);
    });
    for (const targetSetId of targetSetIds) await this.recompute(targetSetId);
  }

  async refreshTensions(setId: string): Promise<void> {
    const suggestions = detectTensions(effectiveEvents(this.events(setId)));
    const explicit = this.db.query<{
      event_id: string;
      left_value_id: string;
      right_value_id: string;
    }>(
      "SELECT n.event_id,e.left_value_id,e.right_value_id FROM comparison_notes n JOIN comparison_events e ON e.id=n.event_id WHERE e.value_set_id=? AND n.note_type='reversal' AND length(trim(n.text))>0",
      [setId],
    );
    for (const note of explicit)
      suggestions.push({
        type: "explicit-reversal",
        title: "Explicit reversal condition",
        description:
          "The user recorded circumstances that could reverse this priority.",
        valueIds: [note.left_value_id, note.right_value_id],
        contextIds: [],
        eventIds: [note.event_id],
        severity: "medium",
      } satisfies TensionSuggestion);
    await this.db.transaction(() => {
      for (const suggestion of suggestions) {
        const signature = `${suggestion.type}:${[...suggestion.valueIds].sort().join(":")}`;
        if (
          this.db.one("SELECT id FROM tensions WHERE detection_type=?", [
            signature,
          ])
        )
          continue;
        const id = uid();
        const stamp = now();
        this.db.run("INSERT INTO tensions VALUES (?,?,?,?,?,?,?,?,?)", [
          id,
          suggestion.title,
          suggestion.description,
          suggestion.severity,
          "suggested",
          signature,
          "",
          stamp,
          stamp,
        ]);
        suggestion.valueIds.forEach((valueId) =>
          this.db.run("INSERT INTO tension_values VALUES (?,?)", [id, valueId]),
        );
        suggestion.contextIds.forEach((contextId) =>
          this.db.run("INSERT INTO tension_contexts VALUES (?,?)", [
            id,
            contextId,
          ]),
        );
        suggestion.eventIds.forEach((eventId) =>
          this.db.run("INSERT INTO tension_sources VALUES (?,?,?)", [
            id,
            eventId,
            "supports",
          ]),
        );
      }
    });
  }
}
