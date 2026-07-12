import { balancedSides, selectMatches } from "@/domain/matchmaking";
import { replayRatings, effectiveEvents } from "@/domain/rating";
import { detectTensions } from "@/domain/tensions";
import { initialRating, type Rating, type RatingEvent } from "@/domain/types";
import { DEFAULT_SETTINGS } from "@/db/defaults";
import type { BrowserDatabase } from "./database";
import schwartz10 from "../../data/presets/schwartz-10.json";
import schwartz19 from "../../data/presets/schwartz-19.json";
import rokeachTerminal from "../../data/presets/rokeach-terminal.json";
import rokeachInstrumental from "../../data/presets/rokeach-instrumental.json";
import cardSort from "../../data/presets/card-sort.json";
import emptyCustom from "../../data/presets/empty-custom.json";

export const presetCatalog = [schwartz10, schwartz19, rokeachTerminal, rokeachInstrumental, cardSort, emptyCustom];
export const uid = () => crypto.randomUUID();
const now = () => Date.now();
const json = (value: unknown) => JSON.stringify(value);
const parsed = <T>(value: unknown, fallback: T): T => { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

export interface SetRow { id: string; name: string; description: string; source_type: string; source_metadata: string; archived: number; created_at: number; updated_at: number; value_count?: number }
export interface ValueRow { id: string; name: string; short_definition: string; source_definition: string; personal_definition: string; source_taxonomy: string; source_identifier: string; parent_category: string; tags: string; active: number; created_at: number; updated_at: number; aliases?: string[] }
export interface RatingRow extends Rating { value_id: string; value_set_id: string; scope_key: string; context_id: string | null; name: string; parent_category: string }
export interface ContextRow { id: string; name: string; description: string; archived: number }
export interface SessionRow { id: string; name: string; description: string; value_set_id: string; status: string; completed_count: number; notes: string; started_at: number; updated_at: number }
export interface QueueRow { id: string; session_id: string; left_value_id: string; right_value_id: string; reason: string; score: number; position: number }
export interface EventRow { id: string; session_id: string | null; value_set_id: string; left_value_id: string; right_value_id: string; result: RatingEvent["result"]; strength: RatingEvent["strength"]; confidence: RatingEvent["confidence"]; consideration: string; tags: string; supersedes_event_id: string | null; correction_reason: string; selection_reason: string; occurred_at: number; left_name?: string; right_name?: string; notes?: { note_type: string; text: string }[]; contextIds?: string[] }

export class BrowserRepository {
  constructor(readonly db: BrowserDatabase) {}

  settings() {
    const rows = this.db.query<{ key: string; value: string }>("SELECT key,value FROM application_settings"); const values = Object.fromEntries(rows.map((row) => [row.key, parsed(row.value, {})]));
    return { rating: { ...DEFAULT_SETTINGS.rating, ...(values.rating as object) }, selection: { ...DEFAULT_SETTINGS.selection, ...(values.selection as object) }, convergence: { ...DEFAULT_SETTINGS.convergence, ...(values.convergence as object) }, display: { ...DEFAULT_SETTINGS.display, ...(values.display as object) }, export: { ...DEFAULT_SETTINGS.export, ...(values.export as object) } };
  }

  sets(): SetRow[] { return this.db.query<SetRow>("SELECT vs.*, COUNT(vsm.value_id) value_count FROM value_sets vs LEFT JOIN value_set_memberships vsm ON vsm.value_set_id=vs.id WHERE vs.archived=0 GROUP BY vs.id ORDER BY vs.name"); }
  contexts(): ContextRow[] { return this.db.query<ContextRow>("SELECT id,name,description,archived FROM contexts WHERE archived=0 ORDER BY name"); }
  values(setId: string, archived = false): ValueRow[] { return this.db.query<ValueRow>(`SELECT v.* FROM "values" v JOIN value_set_memberships m ON m.value_id=v.id WHERE m.value_set_id=? ${archived ? "" : "AND v.active=1"} ORDER BY m.sort_order,v.name`, [setId]).map((value) => ({ ...value, aliases: this.db.query<{ alias: string }>("SELECT alias FROM value_aliases WHERE value_id=?", [value.id]).map((row) => row.alias) })); }
  sessions(): SessionRow[] { return this.db.query<SessionRow>("SELECT * FROM comparison_sessions ORDER BY updated_at DESC"); }
  queue(sessionId: string): QueueRow[] { return this.db.query<QueueRow>("SELECT * FROM comparison_queue WHERE session_id=? ORDER BY position", [sessionId]); }

  events(setId: string): RatingEvent[] {
    return this.db.query<EventRow>("SELECT * FROM comparison_events WHERE value_set_id=? ORDER BY occurred_at,id", [setId]).map((event) => ({ id: event.id, leftValueId: event.left_value_id, rightValueId: event.right_value_id, result: event.result, strength: event.strength, confidence: event.confidence, contextIds: this.db.query<{ context_id: string }>("SELECT context_id FROM comparison_event_contexts WHERE event_id=?", [event.id]).map((row) => row.context_id), occurredAt: new Date(event.occurred_at), supersedesEventId: event.supersedes_event_id, erroneous: false }));
  }

  history(setId?: string): EventRow[] {
    return this.db.query<EventRow>(`SELECT e.*,l.name left_name,r.name right_name FROM comparison_events e JOIN "values" l ON l.id=e.left_value_id JOIN "values" r ON r.id=e.right_value_id ${setId ? "WHERE e.value_set_id=?" : ""} ORDER BY e.occurred_at DESC`, setId ? [setId] : []).map((event) => ({ ...event, notes: this.db.query<{ note_type: string; text: string }>("SELECT note_type,text FROM comparison_notes WHERE event_id=?", [event.id]), contextIds: this.db.query<{ context_id: string }>("SELECT context_id FROM comparison_event_contexts WHERE event_id=?", [event.id]).map((row) => row.context_id) }));
  }

  ratings(setId: string, scope = "global"): RatingRow[] {
    return this.db.query<Record<string, unknown>>("SELECT r.*,v.name,v.parent_category FROM ratings r JOIN \"values\" v ON v.id=r.value_id WHERE r.value_set_id=? AND r.scope_key=? ORDER BY r.mu DESC,v.name", [setId, scope]).map((row) => ({ ...row, value_id: String(row.value_id), value_set_id: String(row.value_set_id), scope_key: String(row.scope_key), context_id: row.context_id ? String(row.context_id) : null, name: String(row.name), parent_category: String(row.parent_category), mu: Number(row.mu), sigma: Number(row.sigma), comparisons: Number(row.comparisons), wins: Number(row.wins), losses: Number(row.losses), ties: Number(row.ties), incomparable: Number(row.incomparable), lastComparedAt: row.last_compared_at ? new Date(Number(row.last_compared_at)) : null }));
  }

  async importPreset(slug: string): Promise<string> {
    const preset = presetCatalog.find((item) => item.slug === slug); if (!preset) throw new Error("Preset not found"); const setId = uid(); const stamp = now();
    await this.db.transaction(() => {
      this.db.run("INSERT INTO value_sets VALUES (?,?,?,?,?,?,?,?)", [setId, preset.name, preset.description, "preset", json({ preset: slug, citation: preset.citation }), 0, stamp, stamp]);
      preset.values.forEach((item, index) => { const valueId = uid(); this.db.run("INSERT INTO \"values\" VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [valueId, item.name, item.definition, item.definition, "", preset.taxonomy, item.id, item.category, "[]", 1, stamp, stamp]); this.db.run("INSERT INTO value_set_memberships VALUES (?,?,?,?,?)", [setId, valueId, json({ preset: slug }), index, stamp]); this.db.run("INSERT INTO definition_revisions VALUES (?,?,?,?,?,?,?)", [uid(), valueId, item.definition, item.definition, "", "Imported from preset", stamp]); });
    }); await this.recompute(setId); return setId;
  }

  async createSet(name: string, description = ""): Promise<string> { const id = uid(); const stamp = now(); await this.db.transaction(() => this.db.run("INSERT INTO value_sets VALUES (?,?,?,?,?,?,?,?)", [id, name, description, "custom", "{}", 0, stamp, stamp])); return id; }
  async addValue(setId: string, input: { name: string; definition: string; category?: string }): Promise<void> { const id = uid(); const stamp = now(); await this.db.transaction(() => { this.db.run("INSERT INTO \"values\" VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [id, input.name, input.definition, "", input.definition, "Custom", "", input.category ?? "", "[]", 1, stamp, stamp]); this.db.run("INSERT INTO value_set_memberships VALUES (?,?,?,?,?)", [setId, id, "{}", 9999, stamp]); this.db.run("INSERT INTO definition_revisions VALUES (?,?,?,?,?,?,?)", [uid(), id, input.definition, "", input.definition, "Value created", stamp]); }); await this.recompute(setId); }
  async updateValue(valueId: string, input: { name: string; definition: string; category: string }): Promise<void> { const stamp = now(); await this.db.transaction(() => { const before = this.db.one<ValueRow>("SELECT * FROM \"values\" WHERE id=?", [valueId]); this.db.run("UPDATE \"values\" SET name=?,personal_definition=?,short_definition=?,parent_category=?,updated_at=? WHERE id=?", [input.name, input.definition, input.definition, input.category, stamp, valueId]); this.db.run("INSERT INTO definition_revisions VALUES (?,?,?,?,?,?,?)", [uid(), valueId, input.definition, before?.source_definition ?? "", input.definition, "User revision", stamp]); this.db.run("INSERT INTO audit_events VALUES (?,?,?,?,?,?,?)", [uid(), "value", valueId, "definition_updated", json(before), json(input), stamp]); }); }

  async recompute(setId: string): Promise<void> {
    const config = this.settings().rating; const ids = this.values(setId, true).map((value) => value.id); const events = this.events(setId); const stamp = now(); const contexts = this.contexts();
    const scopes: [string, string | null, Map<string, Rating>][] = [["global", null, replayRatings(ids, events, config)]];
    for (const context of contexts) { scopes.push([`context:${context.id}`, context.id, replayRatings(ids, events, config, context.id)]); scopes.push([`combined:${context.id}`, context.id, replayRatings(ids, events.filter((event) => event.contextIds.length === 0 || event.contextIds.includes(context.id)), config)]); }
    await this.db.transaction(() => { this.db.run("DELETE FROM ratings WHERE value_set_id=?", [setId]); for (const [scope, contextId, ratings] of scopes) for (const [valueId, rating] of ratings) this.db.run("INSERT INTO ratings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [uid(), setId, valueId, contextId, scope, rating.mu, rating.sigma, rating.comparisons, rating.wins, rating.losses, rating.ties, rating.incomparable, rating.lastComparedAt?.getTime() ?? null, stamp]); });
  }

  private snapshot(setId: string, reason: string, eventId: string | null) { const id = uid(); const stamp = now(); const rows = this.ratings(setId); this.db.run("INSERT INTO rating_snapshots VALUES (?,?,?,?,?,?,?)", [id, setId, null, "global", reason, eventId, stamp]); rows.forEach((rating, rank) => this.db.run("INSERT INTO rating_snapshot_entries VALUES (?,?,?,?,?,?)", [id, rating.value_id, rating.mu, rating.sigma, rank + 1, rating.comparisons])); return id; }

  async startSession(setId: string, name: string, contextIds: string[]): Promise<string> { const id = uid(); const stamp = now(); await this.db.transaction(() => { const before = this.snapshot(setId, "session-before", null); this.db.run("INSERT INTO comparison_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, name, "Adaptive comparison session", setId, "active", stamp, null, 0, "", before, null, stamp, stamp]); contextIds.forEach((contextId) => this.db.run("INSERT INTO session_contexts VALUES (?,?)", [id, contextId])); }); await this.regenerateQueue(id); return id; }

  async regenerateQueue(sessionId: string): Promise<void> {
    const session = this.db.one<SessionRow>("SELECT * FROM comparison_sessions WHERE id=?", [sessionId]); if (!session) throw new Error("Session not found"); const values = this.values(session.value_set_id); const settings = this.settings(); const ratings = this.ratings(session.value_set_id); const events = this.events(session.value_set_id);
    const candidates = selectMatches({ values: values.map((value) => ({ id: value.id, name: value.name, parentCategory: value.parent_category, aliases: value.aliases ?? [], rating: ratings.find((rating) => rating.value_id === value.id) ?? initialRating(settings.rating) })), events, config: settings.rating, weights: settings.selection, topK: settings.convergence.topK, minimumCoverage: settings.convergence.minimumComparisons, count: 20 }).map((candidate, index) => balancedSides(candidate, `${sessionId}:${events.length}:${index}`));
    await this.db.transaction(() => { this.db.run("DELETE FROM comparison_queue WHERE session_id=?", [sessionId]); candidates.forEach((candidate, position) => this.db.run("INSERT INTO comparison_queue VALUES (?,?,?,?,?,?,?,?)", [uid(), sessionId, candidate.leftValueId, candidate.rightValueId, candidate.reason, candidate.score, position, now()])); });
  }

  async submit(input: { sessionId: string; setId: string; leftId: string; rightId: string; result: RatingEvent["result"]; strength: RatingEvent["strength"]; confidence: RatingEvent["confidence"]; contexts: string[]; reasoning: string; winner: string; loser: string; reversal: string }): Promise<void> {
    const id = uid(); const stamp = now();
    await this.db.transaction(() => { this.db.run("INSERT INTO comparison_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, input.sessionId, input.setId, input.leftId, input.rightId, input.result, input.strength, input.confidence, "intrinsic", "[]", "[]", null, "", 0, "adaptive queue", 1, stamp, stamp]); input.contexts.forEach((contextId) => this.db.run("INSERT INTO comparison_event_contexts VALUES (?,?)", [id, contextId])); for (const [type, note] of [["reasoning", input.reasoning], ["winner_mattered", input.winner], ["loser_protects", input.loser], ["reversal", input.reversal]]) if (note) this.db.run("INSERT INTO comparison_notes VALUES (?,?,?,?,?)", [uid(), id, type, note, stamp]); this.snapshot(input.setId, "before-comparison", id); this.db.run("UPDATE comparison_sessions SET completed_count=completed_count+1,updated_at=? WHERE id=?", [stamp, input.sessionId]); this.db.run("DELETE FROM comparison_queue WHERE session_id=? AND ((left_value_id=? AND right_value_id=?) OR (left_value_id=? AND right_value_id=?))", [input.sessionId, input.leftId, input.rightId, input.rightId, input.leftId]); });
    await this.recompute(input.setId); await this.db.transaction(() => this.snapshot(input.setId, "after-comparison", id)); await this.refreshTensions(input.setId); if (this.queue(input.sessionId).length < 5) await this.regenerateQueue(input.sessionId);
  }

  async correct(eventId: string, result: RatingEvent["result"], reason: string): Promise<void> { const original = this.db.one<EventRow>("SELECT * FROM comparison_events WHERE id=?", [eventId]); if (!original) throw new Error("Event not found"); const id = uid(); const stamp = now(); await this.db.transaction(() => { this.db.run("INSERT INTO comparison_events SELECT ?,session_id,value_set_id,left_value_id,right_value_id,?,strength,confidence,consideration,tags,related_event_ids,?,?,0,'correction',left_presented_first,?,? FROM comparison_events WHERE id=?", [id, result, eventId, reason, stamp, stamp, eventId]); this.db.query<{ context_id: string }>("SELECT context_id FROM comparison_event_contexts WHERE event_id=?", [eventId]).forEach((row) => this.db.run("INSERT INTO comparison_event_contexts VALUES (?,?)", [id, row.context_id])); }); await this.recompute(original.value_set_id); }

  async refreshTensions(setId: string): Promise<void> { const suggestions = detectTensions(effectiveEvents(this.events(setId))); await this.db.transaction(() => { for (const suggestion of suggestions) { const signature = `${suggestion.type}:${[...suggestion.valueIds].sort().join(":")}`; if (this.db.one("SELECT id FROM tensions WHERE detection_type=?", [signature])) continue; const id = uid(); const stamp = now(); this.db.run("INSERT INTO tensions VALUES (?,?,?,?,?,?,?,?,?)", [id, suggestion.title, suggestion.description, suggestion.severity, "suggested", signature, "", stamp, stamp]); suggestion.valueIds.forEach((valueId) => this.db.run("INSERT INTO tension_values VALUES (?,?)", [id, valueId])); suggestion.contextIds.forEach((contextId) => this.db.run("INSERT INTO tension_contexts VALUES (?,?)", [id, contextId])); suggestion.eventIds.forEach((eventId) => this.db.run("INSERT INTO tension_sources VALUES (?,?,?)", [id, eventId, "supports"])); } }); }
}
