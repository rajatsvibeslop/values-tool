"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import Papa from "papaparse";
import { db, getSettings, setSetting } from "@/db";
import * as s from "@/db/schema";
import { createSnapshot, createValueSet, importPreset, cloneOrMergeSets, recomputeRatings, refreshTensionSuggestions, regenerateQueue } from "@/db/services";
import { DEFAULT_SETTINGS } from "@/db/defaults";
import { valueSetImportSchema } from "@/domain/import";
import { restoreBackup } from "@/db/transfer";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const uuid = z.string().uuid();

export async function createSetAction(form: FormData) {
  const input = z.object({ name: z.string().min(1), description: z.string() }).parse({ name: text(form, "name"), description: text(form, "description") });
  const id = createValueSet(input); revalidatePath("/"); redirect(`/values?set=${id}`);
}

export async function updateSetAction(form: FormData) {
  const input = z.object({ id: uuid, name: z.string().min(1), description: z.string(), archived: z.boolean() }).parse({ id: text(form, "id"), name: text(form, "name"), description: text(form, "description"), archived: form.get("archived") === "on" });
  const before = db.select().from(s.valueSets).where(eq(s.valueSets.id, input.id)).get(); if (!before) throw new Error("Value set not found"); const now = new Date();
  db.transaction((tx) => { tx.update(s.valueSets).set({ name: input.name, description: input.description, archived: input.archived, updatedAt: now }).where(eq(s.valueSets.id, input.id)).run(); tx.insert(s.auditEvents).values({ id: randomUUID(), entityType: "value_set", entityId: input.id, action: "updated", before, after: input, createdAt: now }).run(); }); revalidatePath("/");
}

export async function importPresetAction(form: FormData) {
  const slug = z.string().min(1).parse(text(form, "slug")); const id = importPreset(slug);
  revalidatePath("/"); redirect(`/values?set=${id}`);
}

export async function mergeSetsAction(form: FormData) {
  const ids = form.getAll("setIds").map(String).filter(Boolean); const name = z.string().min(1).parse(text(form, "name"));
  const result = cloneOrMergeSets(ids, name); revalidatePath("/"); redirect(`/values?set=${result.id}&duplicates=${encodeURIComponent(result.duplicates.join("; "))}`);
}

export async function addValueAction(form: FormData) {
  const input = z.object({ valueSetId: uuid, name: z.string().min(1), shortDefinition: z.string(), parentCategory: z.string() }).parse({ valueSetId: text(form, "valueSetId"), name: text(form, "name"), shortDefinition: text(form, "shortDefinition"), parentCategory: text(form, "parentCategory") });
  const id = randomUUID(); const now = new Date();
  db.transaction((tx) => {
    tx.insert(s.values).values({ id, name: input.name, shortDefinition: input.shortDefinition, sourceDefinition: "", personalDefinition: input.shortDefinition, sourceTaxonomy: "Custom", sourceIdentifier: "", parentCategory: input.parentCategory, tags: [], active: true, createdAt: now, updatedAt: now }).run();
    tx.insert(s.valueSetMemberships).values({ valueSetId: input.valueSetId, valueId: id, sourceMetadata: {}, sortOrder: 9999, createdAt: now }).run();
    tx.insert(s.definitionRevisions).values({ id: randomUUID(), valueId: id, shortDefinition: input.shortDefinition, sourceDefinition: "", personalDefinition: input.shortDefinition, changeNote: "Value created", createdAt: now }).run();
  });
  recomputeRatings(input.valueSetId); revalidatePath("/");
}

export async function updateValueAction(form: FormData) {
  const input = z.object({ id: uuid, name: z.string().min(1), shortDefinition: z.string(), personalDefinition: z.string(), parentCategory: z.string(), aliases: z.string(), changeNote: z.string() }).parse({ id: text(form, "id"), name: text(form, "name"), shortDefinition: text(form, "shortDefinition"), personalDefinition: text(form, "personalDefinition"), parentCategory: text(form, "parentCategory"), aliases: text(form, "aliases"), changeNote: text(form, "changeNote") });
  const before = db.select().from(s.values).where(eq(s.values.id, input.id)).get(); if (!before) throw new Error("Value not found"); const now = new Date();
  db.transaction((tx) => {
    tx.update(s.values).set({ name: input.name, shortDefinition: input.shortDefinition, personalDefinition: input.personalDefinition, parentCategory: input.parentCategory, updatedAt: now }).where(eq(s.values.id, input.id)).run();
    tx.delete(s.valueAliases).where(eq(s.valueAliases.valueId, input.id)).run();
    for (const alias of input.aliases.split(",").map((item) => item.trim()).filter(Boolean)) tx.insert(s.valueAliases).values({ id: randomUUID(), valueId: input.id, alias, source: "user", createdAt: now }).onConflictDoNothing().run();
    tx.insert(s.definitionRevisions).values({ id: randomUUID(), valueId: input.id, shortDefinition: input.shortDefinition, sourceDefinition: before.sourceDefinition, personalDefinition: input.personalDefinition, changeNote: input.changeNote, createdAt: now }).run();
    tx.insert(s.auditEvents).values({ id: randomUUID(), entityType: "value", entityId: input.id, action: "definition_updated", before, after: input, createdAt: now }).run();
  });
  revalidatePath("/");
}

export async function archiveValueAction(form: FormData) {
  const id = uuid.parse(text(form, "id")); const current = db.select().from(s.values).where(eq(s.values.id, id)).get(); if (!current) throw new Error("Value not found");
  db.update(s.values).set({ active: !current.active, updatedAt: new Date() }).where(eq(s.values.id, id)).run(); revalidatePath("/");
}

export async function createContextAction(form: FormData) {
  const input = z.object({ name: z.string().min(1), description: z.string() }).parse({ name: text(form, "name"), description: text(form, "description") }); const now = new Date();
  db.insert(s.contexts).values({ id: randomUUID(), ...input, isDefault: false, archived: false, createdAt: now, updatedAt: now }).run(); revalidatePath("/");
}

export async function updateContextAction(form: FormData) {
  const input = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string(), archived: z.boolean() }).parse({ id: text(form, "id"), name: text(form, "name"), description: text(form, "description"), archived: form.get("archived") === "on" });
  db.update(s.contexts).set({ name: input.name, description: input.description, archived: input.archived, updatedAt: new Date() }).where(eq(s.contexts.id, input.id)).run(); revalidatePath("/");
}

export async function startSessionAction(form: FormData) {
  const input = z.object({ name: z.string().min(1), description: z.string(), valueSetId: uuid, notes: z.string() }).parse({ name: text(form, "name"), description: text(form, "description"), valueSetId: text(form, "valueSetId"), notes: text(form, "notes") });
  const id = randomUUID(); const now = new Date(); const before = createSnapshot(input.valueSetId, "session-before"); const contextIds = form.getAll("contextIds").map(String);
  db.transaction((tx) => {
    tx.insert(s.comparisonSessions).values({ id, ...input, status: "active", startedAt: now, endedAt: null, completedCount: 0, beforeSnapshotId: before, afterSnapshotId: null, createdAt: now, updatedAt: now }).run();
    for (const contextId of contextIds) tx.insert(s.sessionContexts).values({ sessionId: id, contextId }).run();
  });
  regenerateQueue(id); revalidatePath("/"); redirect(`/compare?session=${id}`);
}

export async function setSessionStatusAction(form: FormData) {
  const id = uuid.parse(text(form, "id")); const status = z.enum(["active", "paused", "completed"]).parse(text(form, "status")); const session = db.select().from(s.comparisonSessions).where(eq(s.comparisonSessions.id, id)).get(); if (!session) throw new Error("Session not found");
  const after = status === "completed" ? createSnapshot(session.valueSetId, "session-after") : session.afterSnapshotId;
  db.update(s.comparisonSessions).set({ status, endedAt: status === "completed" ? new Date() : null, afterSnapshotId: after, updatedAt: new Date() }).where(eq(s.comparisonSessions.id, id)).run(); revalidatePath("/");
}

export async function regenerateQueueAction(form: FormData) { const sessionId = uuid.parse(text(form, "sessionId")); regenerateQueue(sessionId); revalidatePath("/queue"); revalidatePath("/compare"); }

export async function addManualQueueAction(form: FormData) {
  const sessionId = uuid.parse(text(form, "sessionId")); const leftValueId = uuid.parse(text(form, "leftValueId")); const rightValueId = uuid.parse(text(form, "rightValueId"));
  if (leftValueId === rightValueId) throw new Error("Choose two different values");
  const position = db.select().from(s.comparisonQueue).where(eq(s.comparisonQueue.sessionId, sessionId)).all().length;
  db.insert(s.comparisonQueue).values({ id: randomUUID(), sessionId, leftValueId, rightValueId, reason: "Manual comparison", score: 0, position, createdAt: new Date() }).run(); revalidatePath("/queue"); revalidatePath("/compare");
}

export async function moveQueueItemAction(form: FormData) {
  const id = uuid.parse(text(form, "id")); const direction = z.enum(["up", "down"]).parse(text(form, "direction")); const item = db.select().from(s.comparisonQueue).where(eq(s.comparisonQueue.id, id)).get(); if (!item) return;
  const target = db.select().from(s.comparisonQueue).where(and(eq(s.comparisonQueue.sessionId, item.sessionId), eq(s.comparisonQueue.position, item.position + (direction === "up" ? -1 : 1)))).get(); if (!target) return;
  db.transaction((tx) => { tx.update(s.comparisonQueue).set({ position: -1 }).where(eq(s.comparisonQueue.id, item.id)).run(); tx.update(s.comparisonQueue).set({ position: item.position }).where(eq(s.comparisonQueue.id, target.id)).run(); tx.update(s.comparisonQueue).set({ position: target.position }).where(eq(s.comparisonQueue.id, item.id)).run(); }); revalidatePath("/queue");
}

const comparisonSchema = z.object({ sessionId: uuid, valueSetId: uuid, leftValueId: uuid, rightValueId: uuid, result: z.enum(["left", "right", "tie", "incomparable", "skip", "malformed"]), strength: z.enum(["slight", "moderate", "strong"]), confidence: z.enum(["uncertain", "somewhat", "confident", "highly"]), consideration: z.enum(["intrinsic", "obligation", "instrumental", "uncertainty"]), selectionReason: z.string() });

export async function submitComparisonAction(form: FormData) {
  const input = comparisonSchema.parse(Object.fromEntries(["sessionId", "valueSetId", "leftValueId", "rightValueId", "result", "strength", "confidence", "consideration", "selectionReason"].map((key) => [key, text(form, key)])));
  if (input.leftValueId === input.rightValueId) throw new Error("A value cannot be compared with itself");
  const id = randomUUID(); const now = new Date(); createSnapshot(input.valueSetId, "before-comparison");
  const noteTypes = ["reasoning", "winner_mattered", "loser_protects", "reversal"] as const; const contextIds = form.getAll("contextIds").map(String); const tags = text(form, "tags").split(",").map((tag) => tag.trim()).filter(Boolean);
  db.transaction((tx) => {
    tx.insert(s.comparisonEvents).values({ id, ...input, tags, relatedEventIds: form.getAll("relatedEventIds").map(String), supersedesEventId: null, correctionReason: "", erroneous: false, leftPresentedFirst: true, occurredAt: now, createdAt: now }).run();
    for (const contextId of contextIds) tx.insert(s.comparisonEventContexts).values({ eventId: id, contextId }).run();
    for (const noteType of noteTypes) { const note = text(form, noteType); if (note) tx.insert(s.comparisonNotes).values({ id: randomUUID(), eventId: id, noteType, text: note, createdAt: now }).run(); }
    tx.update(s.comparisonSessions).set({ completedCount: sql`${s.comparisonSessions.completedCount} + 1`, updatedAt: now }).where(eq(s.comparisonSessions.id, input.sessionId)).run();
    tx.delete(s.comparisonQueue).where(and(eq(s.comparisonQueue.sessionId, input.sessionId), eq(s.comparisonQueue.leftValueId, input.leftValueId), eq(s.comparisonQueue.rightValueId, input.rightValueId))).run();
  });
  recomputeRatings(input.valueSetId); createSnapshot(input.valueSetId, "after-comparison", id); refreshTensionSuggestions(input.valueSetId);
  if (db.select().from(s.comparisonQueue).where(eq(s.comparisonQueue.sessionId, input.sessionId)).all().length < 5) regenerateQueue(input.sessionId);
  revalidatePath("/");
}

export async function correctComparisonAction(form: FormData) {
  const originalId = uuid.parse(text(form, "eventId")); const original = db.select().from(s.comparisonEvents).where(eq(s.comparisonEvents.id, originalId)).get(); if (!original) throw new Error("Comparison not found");
  const result = z.enum(["left", "right", "tie", "incomparable", "skip", "malformed"]).parse(text(form, "result")); const reason = z.string().min(1).parse(text(form, "reason")); const id = randomUUID(); const now = new Date();
  db.transaction((tx) => {
    tx.insert(s.comparisonEvents).values({ ...original, id, result, supersedesEventId: original.id, correctionReason: reason, selectionReason: "correction", occurredAt: now, createdAt: now }).run();
    const contexts = tx.select().from(s.comparisonEventContexts).where(eq(s.comparisonEventContexts.eventId, original.id)).all(); for (const context of contexts) tx.insert(s.comparisonEventContexts).values({ eventId: id, contextId: context.contextId }).run();
    tx.insert(s.auditEvents).values({ id: randomUUID(), entityType: "comparison", entityId: original.id, action: "superseded", before: original, after: { id, result, reason }, createdAt: now }).run();
  });
  recomputeRatings(original.valueSetId); refreshTensionSuggestions(original.valueSetId); revalidatePath("/");
}

export async function createClaimAction(form: FormData) {
  const input = z.object({ valueId: z.string().optional(), text: z.string().min(1), claimType: z.string().min(1), confidence: z.enum(["low", "medium", "high"]), status: z.enum(["draft", "accepted", "rejected"]), creationMethod: z.enum(["manual", "rule", "ai"]) }).parse({ valueId: text(form, "valueId") || undefined, text: text(form, "text"), claimType: text(form, "claimType"), confidence: text(form, "confidence"), status: text(form, "status"), creationMethod: text(form, "creationMethod") });
  const id = randomUUID(); const now = new Date(); const supporting = form.getAll("supportingEventIds").map(String); const contradicting = form.getAll("contradictingEventIds").map(String);
  db.transaction((tx) => { tx.insert(s.claims).values({ id, ...input, supersedesClaimId: null, createdAt: now, updatedAt: now }).run(); for (const eventId of supporting) tx.insert(s.claimSources).values({ claimId: id, eventId, relationship: "supports" }).run(); for (const eventId of contradicting) tx.insert(s.claimSources).values({ claimId: id, eventId, relationship: "contradicts" }).run(); }); revalidatePath("/");
}

export async function setTensionStatusAction(form: FormData) { const id = uuid.parse(text(form, "id")); const status = z.enum(["suggested", "accepted", "dismissed", "resolved"]).parse(text(form, "status")); const current = db.select().from(s.tensions).where(eq(s.tensions.id, id)).get(); if (!current) throw new Error("Tension not found"); const update = { status, title: text(form, "title") || current.title, description: text(form, "description") || current.description, severity: (text(form, "severity") || current.severity) as typeof current.severity, userNotes: text(form, "userNotes"), updatedAt: new Date() }; db.transaction((tx) => { tx.update(s.tensions).set(update).where(eq(s.tensions.id, id)).run(); tx.insert(s.auditEvents).values({ id: randomUUID(), entityType: "tension", entityId: id, action: "updated", before: current, after: update, createdAt: new Date() }).run(); }); revalidatePath("/tensions"); }

export async function createTensionAction(form: FormData) {
  const input = z.object({ title: z.string().min(1), description: z.string().min(1), severity: z.enum(["low", "medium", "high"]), userNotes: z.string() }).parse({ title: text(form, "title"), description: text(form, "description"), severity: text(form, "severity"), userNotes: text(form, "userNotes") }); const id = randomUUID(); const now = new Date();
  db.transaction((tx) => { tx.insert(s.tensions).values({ id, ...input, status: "accepted", detectionType: "manual", createdAt: now, updatedAt: now }).run(); for (const valueId of form.getAll("valueIds").map(String)) tx.insert(s.tensionValues).values({ tensionId: id, valueId }).run(); for (const contextId of form.getAll("contextIds").map(String)) tx.insert(s.tensionContexts).values({ tensionId: id, contextId }).run(); for (const eventId of form.getAll("eventIds").map(String)) tx.insert(s.tensionSources).values({ tensionId: id, eventId, relationship: "supports" }).run(); }); revalidatePath("/tensions");
}

export async function saveSettingsAction(form: FormData) {
  const current = getSettings();
  const number = (key: string, fallback: number) => { const parsed = Number(text(form, key)); return Number.isFinite(parsed) ? parsed : fallback; };
  const rating = { ...current.rating, mu: number("mu", current.rating.mu), sigma: number("sigma", current.rating.sigma), beta: number("beta", current.rating.beta), tau: number("tau", current.rating.tau), drawProbability: number("drawProbability", current.rating.drawProbability), conservativeK: number("conservativeK", current.rating.conservativeK), modifiersEnabled: form.get("modifiersEnabled") === "on" };
  const convergence = { ...current.convergence, topK: number("topK", current.convergence.topK), minimumComparisons: number("minimumComparisons", current.convergence.minimumComparisons), stabilityWindow: number("stabilityWindow", current.convergence.stabilityWindow), uncertaintyThreshold: number("uncertaintyThreshold", current.convergence.uncertaintyThreshold), retestFrequency: number("retestFrequency", current.convergence.retestFrequency), tiersSufficient: form.get("tiersSufficient") === "on" };
  setSetting("rating", rating); setSetting("convergence", convergence); setSetting("display", { ...current.display, showRatingsDuringComparison: form.get("showRatings") === "on" });
  for (const set of db.select().from(s.valueSets).all()) recomputeRatings(set.id); revalidatePath("/");
}

export async function saveManualTiersAction(form: FormData) {
  const valueSetId = uuid.parse(text(form, "valueSetId")); const contextId = text(form, "contextId") || null;
  const parsed = z.array(z.object({ name: z.string().min(1), valueIds: z.array(uuid) })).parse(JSON.parse(text(form, "tiers"))); const now = new Date();
  const existing = db.select().from(s.manualTiers).where(eq(s.manualTiers.valueSetId, valueSetId)).all().filter((tier) => tier.contextId === contextId);
  db.transaction((tx) => {
    for (const tier of existing) tx.delete(s.manualTiers).where(eq(s.manualTiers.id, tier.id)).run();
    parsed.forEach((tier, position) => { const tierId = randomUUID(); tx.insert(s.manualTiers).values({ id: tierId, valueSetId, contextId, name: tier.name, position, createdAt: now, updatedAt: now }).run(); tier.valueIds.forEach((valueId, valuePosition) => tx.insert(s.manualTierValues).values({ tierId, valueId, position: valuePosition }).run()); });
  }); revalidatePath("/rankings");
}

export async function resetAlgorithmSettingsAction() { setSetting("rating", DEFAULT_SETTINGS.rating); setSetting("selection", DEFAULT_SETTINGS.selection); setSetting("convergence", DEFAULT_SETTINGS.convergence); for (const set of db.select().from(s.valueSets).all()) recomputeRatings(set.id); revalidatePath("/"); }

export async function importValueSetAction(form: FormData) {
  const mode = z.enum(["json", "csv"]).parse(text(form, "mode")); const raw = z.string().min(1).parse(text(form, "data"));
  let parsed: z.infer<typeof valueSetImportSchema>;
  if (mode === "json") parsed = valueSetImportSchema.parse(JSON.parse(raw));
  else {
    const result = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true }); if (result.errors.length) throw new Error(result.errors.map((error) => `Row ${error.row}: ${error.message}`).join("; "));
    parsed = valueSetImportSchema.parse({ name: text(form, "name") || "Imported CSV", description: "Imported from CSV", values: result.data.map((row) => ({ name: row.name, shortDefinition: row.short_definition ?? row.definition ?? "", sourceDefinition: row.source_definition ?? "", personalDefinition: row.personal_definition ?? "", sourceTaxonomy: row.source_taxonomy ?? "", sourceIdentifier: row.source_identifier ?? "", parentCategory: row.parent_category ?? "", aliases: (row.aliases ?? "").split("|").filter(Boolean), tags: (row.tags ?? "").split("|").filter(Boolean) })) });
  }
  const id = createValueSet({ name: parsed.name, description: parsed.description, values: parsed.values.map((value) => ({ name: value.name, shortDefinition: value.personalDefinition || value.shortDefinition })) }); revalidatePath("/"); redirect(`/values?set=${id}`);
}

export async function restoreBackupAction(form: FormData) {
  const file = form.get("file"); let raw = text(form, "data");
  if (file instanceof File && file.size) raw = await file.text();
  if (!raw) throw new Error("Choose a backup file or paste backup JSON");
  restoreBackup(JSON.parse(raw)); revalidatePath("/"); redirect("/data?restored=1");
}
