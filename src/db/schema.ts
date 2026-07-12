import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const valueSets = sqliteTable("value_sets", {
  id: text("id").primaryKey(), name: text("name").notNull(), description: text("description").notNull().default(""),
  sourceType: text("source_type", { enum: ["preset", "import", "custom", "merged", "clone"] }).notNull(),
  sourceMetadata: text("source_metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false), ...timestamps,
});

export const values = sqliteTable("values", {
  id: text("id").primaryKey(), name: text("name").notNull(), shortDefinition: text("short_definition").notNull().default(""),
  sourceDefinition: text("source_definition").notNull().default(""), personalDefinition: text("personal_definition").notNull().default(""),
  sourceTaxonomy: text("source_taxonomy").notNull().default(""), sourceIdentifier: text("source_identifier").notNull().default(""),
  parentCategory: text("parent_category").notNull().default(""), tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  active: integer("active", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, (table) => [index("values_name_idx").on(table.name), index("values_taxonomy_idx").on(table.sourceTaxonomy)]);

export const valueAliases = sqliteTable("value_aliases", {
  id: text("id").primaryKey(), valueId: text("value_id").notNull().references(() => values.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(), source: text("source").notNull().default("user"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("value_alias_unique").on(table.valueId, table.alias), index("value_alias_text_idx").on(table.alias)]);

export const valueSetMemberships = sqliteTable("value_set_memberships", {
  valueSetId: text("value_set_id").notNull().references(() => valueSets.id, { onDelete: "cascade" }),
  valueId: text("value_id").notNull().references(() => values.id, { onDelete: "cascade" }),
  sourceMetadata: text("source_metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [primaryKey({ columns: [table.valueSetId, table.valueId] }), index("membership_value_idx").on(table.valueId)]);

export const contexts = sqliteTable("contexts", {
  id: text("id").primaryKey(), name: text("name").notNull(), description: text("description").notNull().default(""),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false), archived: integer("archived", { mode: "boolean" }).notNull().default(false), ...timestamps,
}, (table) => [uniqueIndex("contexts_name_unique").on(table.name)]);

export const comparisonSessions = sqliteTable("comparison_sessions", {
  id: text("id").primaryKey(), name: text("name").notNull(), description: text("description").notNull().default(""),
  valueSetId: text("value_set_id").notNull().references(() => valueSets.id), status: text("status", { enum: ["active", "paused", "completed"] }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(), endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  completedCount: integer("completed_count").notNull().default(0), notes: text("notes").notNull().default(""),
  beforeSnapshotId: text("before_snapshot_id"), afterSnapshotId: text("after_snapshot_id"), ...timestamps,
}, (table) => [index("sessions_status_idx").on(table.status), index("sessions_set_idx").on(table.valueSetId)]);

export const sessionContexts = sqliteTable("session_contexts", {
  sessionId: text("session_id").notNull().references(() => comparisonSessions.id, { onDelete: "cascade" }),
  contextId: text("context_id").notNull().references(() => contexts.id),
}, (table) => [primaryKey({ columns: [table.sessionId, table.contextId] })]);

export const comparisonEvents = sqliteTable("comparison_events", {
  id: text("id").primaryKey(), sessionId: text("session_id").references(() => comparisonSessions.id),
  valueSetId: text("value_set_id").notNull().references(() => valueSets.id), leftValueId: text("left_value_id").notNull().references(() => values.id),
  rightValueId: text("right_value_id").notNull().references(() => values.id),
  result: text("result", { enum: ["left", "right", "tie", "incomparable", "skip", "malformed"] }).notNull(),
  strength: text("strength", { enum: ["slight", "moderate", "strong"] }).notNull().default("moderate"),
  confidence: text("confidence", { enum: ["uncertain", "somewhat", "confident", "highly"] }).notNull().default("confident"),
  consideration: text("consideration", { enum: ["intrinsic", "obligation", "instrumental", "uncertainty"] }).notNull().default("intrinsic"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]), relatedEventIds: text("related_event_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  supersedesEventId: text("supersedes_event_id"), correctionReason: text("correction_reason").notNull().default(""),
  erroneous: integer("erroneous", { mode: "boolean" }).notNull().default(false), selectionReason: text("selection_reason").notNull().default("manual"),
  leftPresentedFirst: integer("left_presented_first", { mode: "boolean" }).notNull().default(true),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("events_set_time_idx").on(table.valueSetId, table.occurredAt), index("events_pair_idx").on(table.leftValueId, table.rightValueId), index("events_session_idx").on(table.sessionId), index("events_supersedes_idx").on(table.supersedesEventId)]);

export const comparisonEventContexts = sqliteTable("comparison_event_contexts", {
  eventId: text("event_id").notNull().references(() => comparisonEvents.id, { onDelete: "cascade" }), contextId: text("context_id").notNull().references(() => contexts.id),
}, (table) => [primaryKey({ columns: [table.eventId, table.contextId] }), index("event_context_context_idx").on(table.contextId)]);

export const comparisonNotes = sqliteTable("comparison_notes", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => comparisonEvents.id, { onDelete: "cascade" }),
  noteType: text("note_type", { enum: ["reasoning", "winner_mattered", "loser_protects", "reversal", "general"] }).notNull(),
  text: text("text").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("notes_event_idx").on(table.eventId)]);

export const ratings = sqliteTable("ratings", {
  id: text("id").primaryKey(), valueSetId: text("value_set_id").notNull().references(() => valueSets.id, { onDelete: "cascade" }),
  valueId: text("value_id").notNull().references(() => values.id, { onDelete: "cascade" }), contextId: text("context_id").references(() => contexts.id),
  scopeKey: text("scope_key").notNull(), mu: real("mu").notNull(), sigma: real("sigma").notNull(), comparisons: integer("comparisons").notNull().default(0),
  wins: integer("wins").notNull().default(0), losses: integer("losses").notNull().default(0), ties: integer("ties").notNull().default(0),
  incomparable: integer("incomparable").notNull().default(0), lastComparedAt: integer("last_compared_at", { mode: "timestamp_ms" }), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("rating_scope_unique").on(table.valueSetId, table.valueId, table.scopeKey), index("rating_scope_idx").on(table.valueSetId, table.scopeKey)]);

export const ratingSnapshots = sqliteTable("rating_snapshots", {
  id: text("id").primaryKey(), valueSetId: text("value_set_id").notNull().references(() => valueSets.id, { onDelete: "cascade" }),
  contextId: text("context_id").references(() => contexts.id), scopeKey: text("scope_key").notNull(), reason: text("reason").notNull(),
  eventId: text("event_id").references(() => comparisonEvents.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("snapshots_set_time_idx").on(table.valueSetId, table.createdAt)]);

export const ratingSnapshotEntries = sqliteTable("rating_snapshot_entries", {
  snapshotId: text("snapshot_id").notNull().references(() => ratingSnapshots.id, { onDelete: "cascade" }), valueId: text("value_id").notNull().references(() => values.id),
  mu: real("mu").notNull(), sigma: real("sigma").notNull(), rank: integer("rank").notNull(), comparisons: integer("comparisons").notNull(),
}, (table) => [primaryKey({ columns: [table.snapshotId, table.valueId] })]);

export const definitionRevisions = sqliteTable("definition_revisions", {
  id: text("id").primaryKey(), valueId: text("value_id").notNull().references(() => values.id, { onDelete: "cascade" }),
  shortDefinition: text("short_definition").notNull(), sourceDefinition: text("source_definition").notNull(), personalDefinition: text("personal_definition").notNull(),
  changeNote: text("change_note").notNull().default(""), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("revisions_value_time_idx").on(table.valueId, table.createdAt)]);

export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(), valueId: text("value_id").references(() => values.id), text: text("text").notNull(),
  claimType: text("claim_type").notNull(), confidence: text("confidence", { enum: ["low", "medium", "high"] }).notNull(),
  status: text("status", { enum: ["draft", "accepted", "rejected", "superseded"] }).notNull(), creationMethod: text("creation_method", { enum: ["manual", "rule", "ai"] }).notNull(),
  supersedesClaimId: text("supersedes_claim_id"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("claims_value_idx").on(table.valueId), index("claims_status_idx").on(table.status)]);

export const claimSources = sqliteTable("claim_sources", {
  claimId: text("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }), eventId: text("event_id").notNull().references(() => comparisonEvents.id),
  relationship: text("relationship", { enum: ["supports", "contradicts"] }).notNull(),
}, (table) => [primaryKey({ columns: [table.claimId, table.eventId, table.relationship] })]);

export const tensions = sqliteTable("tensions", {
  id: text("id").primaryKey(), title: text("title").notNull(), description: text("description").notNull(),
  severity: text("severity", { enum: ["low", "medium", "high"] }).notNull(), status: text("status", { enum: ["suggested", "accepted", "dismissed", "resolved"] }).notNull(),
  detectionType: text("detection_type").notNull(), userNotes: text("user_notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("tensions_status_idx").on(table.status)]);

export const tensionValues = sqliteTable("tension_values", {
  tensionId: text("tension_id").notNull().references(() => tensions.id, { onDelete: "cascade" }), valueId: text("value_id").notNull().references(() => values.id),
}, (table) => [primaryKey({ columns: [table.tensionId, table.valueId] })]);

export const tensionContexts = sqliteTable("tension_contexts", {
  tensionId: text("tension_id").notNull().references(() => tensions.id, { onDelete: "cascade" }), contextId: text("context_id").notNull().references(() => contexts.id),
}, (table) => [primaryKey({ columns: [table.tensionId, table.contextId] })]);

export const tensionSources = sqliteTable("tension_sources", {
  tensionId: text("tension_id").notNull().references(() => tensions.id, { onDelete: "cascade" }), eventId: text("event_id").notNull().references(() => comparisonEvents.id),
  relationship: text("relationship", { enum: ["supports", "contradicts"] }).notNull(),
}, (table) => [primaryKey({ columns: [table.tensionId, table.eventId, table.relationship] })]);

export const presets = sqliteTable("presets", {
  id: text("id").primaryKey(), slug: text("slug").notNull().unique(), name: text("name").notNull(), version: text("version").notNull(),
  citation: text("citation").notNull(), licenseNote: text("license_note").notNull(), data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const applicationSettings = sqliteTable("application_settings", {
  key: text("key").primaryKey(), value: text("value", { mode: "json" }).$type<unknown>().notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const comparisonQueue = sqliteTable("comparison_queue", {
  id: text("id").primaryKey(), sessionId: text("session_id").notNull().references(() => comparisonSessions.id, { onDelete: "cascade" }),
  leftValueId: text("left_value_id").notNull().references(() => values.id), rightValueId: text("right_value_id").notNull().references(() => values.id),
  reason: text("reason").notNull(), score: real("score").notNull(), position: integer("position").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("queue_position_unique").on(table.sessionId, table.position)]);

export const manualTiers = sqliteTable("manual_tiers", {
  id: text("id").primaryKey(), valueSetId: text("value_set_id").notNull().references(() => valueSets.id, { onDelete: "cascade" }),
  contextId: text("context_id").references(() => contexts.id), name: text("name").notNull(), position: integer("position").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const manualTierValues = sqliteTable("manual_tier_values", {
  tierId: text("tier_id").notNull().references(() => manualTiers.id, { onDelete: "cascade" }), valueId: text("value_id").notNull().references(() => values.id), position: integer("position").notNull(),
}, (table) => [primaryKey({ columns: [table.tierId, table.valueId] })]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), action: text("action").notNull(),
  before: text("before", { mode: "json" }).$type<unknown>(), after: text("after", { mode: "json" }).$type<unknown>(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("audit_entity_idx").on(table.entityType, table.entityId)]);
