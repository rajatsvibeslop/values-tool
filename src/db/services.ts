import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, getPreset, getSettings } from "./index";
import * as s from "./schema";
import type { Rating, RatingEvent } from "@/domain/types";
import { effectiveEvents, replayRatings } from "@/domain/rating";
import { balancedSides } from "@/domain/matchmaking";
import { exactRankingProgress, toExactDecisions } from "@/domain/exact-ranking";
import { detectTensions } from "@/domain/tensions";

export function listValueSets() {
  const sets = db.select().from(s.valueSets).where(eq(s.valueSets.archived, false)).orderBy(asc(s.valueSets.name)).all();
  const memberships = db.select().from(s.valueSetMemberships).all();
  return sets.map((set) => ({ ...set, valueCount: memberships.filter((membership) => membership.valueSetId === set.id).length }));
}

export function valuesForSet(valueSetId: string, includeArchived = false) {
  const memberships = db.select().from(s.valueSetMemberships).where(eq(s.valueSetMemberships.valueSetId, valueSetId)).orderBy(asc(s.valueSetMemberships.sortOrder)).all();
  if (!memberships.length) return [];
  const rows = db.select().from(s.values).where(inArray(s.values.id, memberships.map((membership) => membership.valueId))).all();
  const aliases = db.select().from(s.valueAliases).where(inArray(s.valueAliases.valueId, memberships.map((membership) => membership.valueId))).all();
  return memberships.map((membership) => rows.find((row) => row.id === membership.valueId)!).filter((row) => row && (includeArchived || row.active)).map((row) => ({ ...row, aliases: aliases.filter((alias) => alias.valueId === row.id).map((alias) => alias.alias) }));
}

export function importPreset(slug: string): string {
  const presetRow = getPreset(slug);
  if (!presetRow) throw new Error("Preset not found");
  const preset = presetRow.data as { name: string; description: string; taxonomy: string; citation: string; licenseNote?: string; sourceUrl?: string; values: { id: string; name: string; definition: string; category: string }[] };
  const id = randomUUID(); const now = new Date();
  db.transaction((tx) => {
    tx.insert(s.valueSets).values({ id, name: preset.name, description: preset.description, sourceType: "preset", sourceMetadata: { preset: slug, citation: preset.citation, licenseNote: preset.licenseNote, sourceUrl: preset.sourceUrl }, archived: false, createdAt: now, updatedAt: now }).run();
    preset.values.forEach((item, sortOrder) => {
      const valueId = randomUUID();
      tx.insert(s.values).values({ id: valueId, name: item.name, shortDefinition: item.definition, sourceDefinition: item.definition, personalDefinition: "", sourceTaxonomy: preset.taxonomy, sourceIdentifier: item.id, parentCategory: item.category, tags: [], active: true, createdAt: now, updatedAt: now }).run();
      tx.insert(s.valueSetMemberships).values({ valueSetId: id, valueId, sourceMetadata: { preset: slug, sourceIdentifier: item.id }, sortOrder, createdAt: now }).run();
      tx.insert(s.definitionRevisions).values({ id: randomUUID(), valueId, shortDefinition: item.definition, sourceDefinition: item.definition, personalDefinition: "", changeNote: "Imported from preset", createdAt: now }).run();
    });
    tx.insert(s.auditEvents).values({ id: randomUUID(), entityType: "value_set", entityId: id, action: "import_preset", after: { slug }, createdAt: now }).run();
  });
  recomputeRatings(id);
  return id;
}

export function createValueSet(input: { name: string; description: string; values?: { name: string; shortDefinition?: string }[] }): string {
  const id = randomUUID(); const now = new Date();
  db.transaction((tx) => {
    tx.insert(s.valueSets).values({ id, name: input.name, description: input.description, sourceType: "custom", sourceMetadata: {}, archived: false, createdAt: now, updatedAt: now }).run();
    for (const [sortOrder, item] of (input.values ?? []).entries()) {
      const valueId = randomUUID(); const definition = item.shortDefinition ?? "";
      tx.insert(s.values).values({ id: valueId, name: item.name, shortDefinition: definition, sourceDefinition: "", personalDefinition: definition, sourceTaxonomy: "Custom", sourceIdentifier: "", parentCategory: "", tags: [], active: true, createdAt: now, updatedAt: now }).run();
      tx.insert(s.valueSetMemberships).values({ valueSetId: id, valueId, sourceMetadata: {}, sortOrder, createdAt: now }).run();
      tx.insert(s.definitionRevisions).values({ id: randomUUID(), valueId, shortDefinition: definition, sourceDefinition: "", personalDefinition: definition, changeNote: "Initial definition", createdAt: now }).run();
    }
  });
  recomputeRatings(id);
  return id;
}

export function cloneOrMergeSets(setIds: string[], name: string): { id: string; duplicates: string[] } {
  if (!setIds.length) throw new Error("Select at least one set");
  const id = randomUUID(); const now = new Date(); const duplicates: string[] = [];
  const sourceValues = setIds.flatMap((setId) => valuesForSet(setId, true));
  const unique = new Map<string, (typeof sourceValues)[number]>();
  for (const value of sourceValues) {
    const keys = [value.name, ...value.aliases].map((text) => text.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const existing = [...unique.entries()].find(([key]) => keys.includes(key));
    if (existing) { duplicates.push(`${value.name} matched ${existing[1].name}`); continue; }
    unique.set(keys[0]!, value);
  }
  db.transaction((tx) => {
    tx.insert(s.valueSets).values({ id, name, description: setIds.length === 1 ? "Cloned value set" : "Merged value sets", sourceType: setIds.length === 1 ? "clone" : "merged", sourceMetadata: { sourceSetIds: setIds, duplicateReview: duplicates }, archived: false, createdAt: now, updatedAt: now }).run();
    [...unique.values()].forEach((value, sortOrder) => {
      const valueId = randomUUID();
      tx.insert(s.values).values({ ...value, id: valueId, createdAt: now, updatedAt: now }).run();
      tx.insert(s.valueSetMemberships).values({ valueSetId: id, valueId, sourceMetadata: { clonedFrom: value.id }, sortOrder, createdAt: now }).run();
      for (const alias of value.aliases) tx.insert(s.valueAliases).values({ id: randomUUID(), valueId, alias, source: "clone", createdAt: now }).run();
    });
  });
  recomputeRatings(id);
  return { id, duplicates };
}

export function ratingEventsForSet(valueSetId: string): RatingEvent[] {
  const events = db.select().from(s.comparisonEvents).where(eq(s.comparisonEvents.valueSetId, valueSetId)).orderBy(asc(s.comparisonEvents.occurredAt), asc(s.comparisonEvents.id)).all();
  if (!events.length) return [];
  const links = db.select().from(s.comparisonEventContexts).where(inArray(s.comparisonEventContexts.eventId, events.map((event) => event.id))).all();
  return events.map((event) => ({ ...event, contextIds: links.filter((link) => link.eventId === event.id).map((link) => link.contextId) }));
}

function insertRatingRows(valueSetId: string, scopeKey: string, contextId: string | null, ratings: Map<string, Rating>, now: Date) {
  for (const [valueId, rating] of ratings) db.insert(s.ratings).values({ id: randomUUID(), valueSetId, valueId, contextId, scopeKey, ...rating, updatedAt: now }).run();
}

export function recomputeRatings(valueSetId: string): void {
  const settings = getSettings(); const values = valuesForSet(valueSetId, true); const valueIds = values.map((value) => value.id);
  const events = ratingEventsForSet(valueSetId); const contextRows = db.select().from(s.contexts).all(); const now = new Date();
  const global = replayRatings(valueIds, events, settings.rating);
  db.transaction((tx) => tx.delete(s.ratings).where(eq(s.ratings.valueSetId, valueSetId)).run());
  insertRatingRows(valueSetId, "global", null, global, now);
  for (const context of contextRows) {
    insertRatingRows(valueSetId, `context:${context.id}`, context.id, replayRatings(valueIds, events, settings.rating, context.id), now);
    const combinedEvents = events.filter((event) => event.contextIds.length === 0 || event.contextIds.includes(context.id));
    insertRatingRows(valueSetId, `combined:${context.id}`, context.id, replayRatings(valueIds, combinedEvents, settings.rating), now);
  }
}

export function createSnapshot(valueSetId: string, reason: string, eventId?: string): string {
  const id = randomUUID(); const now = new Date();
  const ratings = db.select().from(s.ratings).where(and(eq(s.ratings.valueSetId, valueSetId), eq(s.ratings.scopeKey, "global"))).all().sort((a, b) => b.mu - a.mu);
  db.transaction((tx) => {
    tx.insert(s.ratingSnapshots).values({ id, valueSetId, contextId: null, scopeKey: "global", reason, eventId, createdAt: now }).run();
    ratings.forEach((rating, index) => tx.insert(s.ratingSnapshotEntries).values({ snapshotId: id, valueId: rating.valueId, mu: rating.mu, sigma: rating.sigma, rank: index + 1, comparisons: rating.comparisons }).run());
  });
  return id;
}

export function rankings(valueSetId: string, scopeKey = "global") {
  const values = valuesForSet(valueSetId, true); const rows = db.select().from(s.ratings).where(and(eq(s.ratings.valueSetId, valueSetId), eq(s.ratings.scopeKey, scopeKey))).all();
  const exact = db.select().from(s.applicationSettings).where(eq(s.applicationSettings.key, `exact-ranking:${valueSetId}:${scopeKey}`)).get()?.value as { complete?: boolean; ordered?: string[] } | undefined;
  const rank = new Map(exact?.complete ? exact.ordered?.map((id, index) => [id, index]) : []);
  return rows.map((rating) => ({ ...rating, value: values.find((value) => value.id === rating.valueId)! })).filter((row) => row.value).sort((a, b) => exact?.complete ? (rank.get(a.valueId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.valueId) ?? Number.MAX_SAFE_INTEGER) : b.mu - a.mu || a.value.name.localeCompare(b.value.name));
}

export function regenerateQueue(sessionId: string): void {
  const session = db.select().from(s.comparisonSessions).where(eq(s.comparisonSessions.id, sessionId)).get(); if (!session) throw new Error("Session not found");
  const values = valuesForSet(session.valueSetId);
  const contextIds = db.select().from(s.sessionContexts).where(eq(s.sessionContexts.sessionId, sessionId)).all().map((row) => row.contextId).sort();
  const scope = contextIds.length === 0 ? "global" : contextIds.length === 1 ? `context:${contextIds[0]}` : `contexts:${contextIds.join("+")}`;
  const relevant = effectiveEvents(ratingEventsForSet(session.valueSetId)).filter((event) => !contextIds.length || contextIds.every((id) => event.contextIds.includes(id)));
  const byPair = new Map<string, (RatingEvent & { sessionId?: string })[]>();
  for (const event of relevant) {
    const key = [event.leftValueId, event.rightValueId].sort().join(":");
    byPair.set(key, [...(byPair.get(key) ?? []), event]);
  }
  const decisions = [...byPair.values()].flatMap((events) => {
    const latest = events.filter((event) => event.sessionId === sessionId).at(-1);
    if (latest) return toExactDecisions([latest]);
    const outcomes = new Set(events.map((event) => event.result === "tie" ? "tie" : event.result === "left" ? event.leftValueId : event.result === "right" ? event.rightValueId : event.result));
    return outcomes.size === 1 ? toExactDecisions([events.at(-1)!]) : [];
  });
  const progress = exactRankingProgress({ valueIds: values.map((value) => value.id), seed: `${session.valueSetId}:${scope}`, decisions });
  const candidate = progress.nextPair ? balancedSides({ ...progress.nextPair, reason: `Exact ordering · ${progress.placed}/${progress.total} placed`, score: progress.worstCase - progress.reusedComparisons, details: ["Binary search of the remaining insertion interval"] }, `${sessionId}:${session.completedCount}`) : null;
  const afterSnapshotId = candidate ? session.afterSnapshotId : createSnapshot(session.valueSetId, "exact-order-complete");
  db.transaction((tx) => {
    tx.delete(s.comparisonQueue).where(and(eq(s.comparisonQueue.sessionId, sessionId), ne(s.comparisonQueue.reason, "Manual comparison"))).run();
    if (candidate) tx.insert(s.comparisonQueue).values({ id: randomUUID(), sessionId, leftValueId: candidate.leftValueId, rightValueId: candidate.rightValueId, reason: candidate.reason, score: candidate.score, position: 0, createdAt: new Date() }).run();
    else {
      const stored = { ...progress, sessionId, scope, updatedAt: Date.now() };
      tx.insert(s.applicationSettings).values({ key: `exact-ranking:${session.valueSetId}:${scope}`, value: stored, updatedAt: new Date() }).onConflictDoUpdate({ target: s.applicationSettings.key, set: { value: stored, updatedAt: new Date() } }).run();
      tx.update(s.comparisonSessions).set({ status: "completed", endedAt: new Date(), afterSnapshotId, updatedAt: new Date() }).where(eq(s.comparisonSessions.id, sessionId)).run();
    }
  });
}

export function refreshTensionSuggestions(valueSetId: string): void {
  const suggestions = detectTensions(effectiveEvents(ratingEventsForSet(valueSetId)));
  const existing = db.select().from(s.tensions).where(eq(s.tensions.status, "suggested")).all(); const now = new Date();
  for (const suggestion of suggestions) {
    const signature = `${suggestion.type}:${[...suggestion.valueIds].sort().join(":")}`;
    if (existing.some((item) => item.detectionType === signature)) continue;
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(s.tensions).values({ id, title: suggestion.title, description: suggestion.description, severity: suggestion.severity, status: "suggested", detectionType: signature, userNotes: "", createdAt: now, updatedAt: now }).run();
      for (const valueId of suggestion.valueIds) tx.insert(s.tensionValues).values({ tensionId: id, valueId }).run();
      for (const contextId of suggestion.contextIds) tx.insert(s.tensionContexts).values({ tensionId: id, contextId }).run();
      for (const eventId of suggestion.eventIds) tx.insert(s.tensionSources).values({ tensionId: id, eventId, relationship: "supports" }).onConflictDoNothing().run();
    });
  }
}

export function dashboardData() {
  const sets = listValueSets(); const selected = sets[0]; const rank = selected ? rankings(selected.id) : [];
  const allEvents = selected ? ratingEventsForSet(selected.id) : [];
  const tensions = db.select().from(s.tensions).all(); const sessions = db.select().from(s.comparisonSessions).orderBy(desc(s.comparisonSessions.updatedAt)).all();
  return { sets, selected, ranking: rank, comparisons: effectiveEvents(allEvents).length, tensions, sessions, contexts: db.select().from(s.contexts).where(eq(s.contexts.archived, false)).all() };
}

export function fullHistory(valueSetId?: string) {
  const events = valueSetId ? db.select().from(s.comparisonEvents).where(eq(s.comparisonEvents.valueSetId, valueSetId)).orderBy(desc(s.comparisonEvents.occurredAt)).all() : db.select().from(s.comparisonEvents).orderBy(desc(s.comparisonEvents.occurredAt)).all();
  if (!events.length) return [];
  const valueRows = db.select().from(s.values).all(); const notes = db.select().from(s.comparisonNotes).where(inArray(s.comparisonNotes.eventId, events.map((event) => event.id))).all();
  const contextLinks = db.select().from(s.comparisonEventContexts).where(inArray(s.comparisonEventContexts.eventId, events.map((event) => event.id))).all(); const contextRows = db.select().from(s.contexts).all();
  return events.map((event) => ({ ...event, left: valueRows.find((value) => value.id === event.leftValueId)!, right: valueRows.find((value) => value.id === event.rightValueId)!, notes: notes.filter((note) => note.eventId === event.id), contexts: contextLinks.filter((link) => link.eventId === event.id).map((link) => contextRows.find((context) => context.id === link.contextId)!).filter(Boolean) }));
}
