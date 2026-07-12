import { z } from "zod";

export const valueImportSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1), shortDefinition: z.string().default(""),
  sourceDefinition: z.string().default(""), personalDefinition: z.string().default(""), sourceTaxonomy: z.string().default(""),
  sourceIdentifier: z.string().default(""), parentCategory: z.string().default(""), aliases: z.array(z.string()).default([]), tags: z.array(z.string()).default([]),
});

export const valueSetImportSchema = z.object({
  format: z.literal("values-tool-value-set").optional(), version: z.number().int().positive().default(1),
  name: z.string().trim().min(1), description: z.string().default(""), source: z.record(z.unknown()).default({}), values: z.array(valueImportSchema).min(1),
});

export const backupSchema = z.object({
  applicationVersion: z.string(), schemaVersion: z.number().int().positive(), exportedAt: z.string().datetime(),
  data: z.object({
    valueSets: z.array(z.record(z.unknown())), values: z.array(z.record(z.unknown())), valueAliases: z.array(z.record(z.unknown())),
    valueSetMemberships: z.array(z.record(z.unknown())), contexts: z.array(z.record(z.unknown())), sessions: z.array(z.record(z.unknown())),
    sessionContexts: z.array(z.record(z.unknown())), comparisons: z.array(z.record(z.unknown())), comparisonContexts: z.array(z.record(z.unknown())),
    comparisonNotes: z.array(z.record(z.unknown())), ratings: z.array(z.record(z.unknown())), ratingSnapshots: z.array(z.record(z.unknown())),
    ratingSnapshotEntries: z.array(z.record(z.unknown())), definitionRevisions: z.array(z.record(z.unknown())), claims: z.array(z.record(z.unknown())),
    claimSources: z.array(z.record(z.unknown())), tensions: z.array(z.record(z.unknown())), tensionValues: z.array(z.record(z.unknown())),
    tensionContexts: z.array(z.record(z.unknown())), tensionSources: z.array(z.record(z.unknown())), settings: z.array(z.record(z.unknown())),
  }),
});

export function likelyDuplicate(a: { name: string; aliases?: string[] }, b: { name: string; aliases?: string[] }): boolean {
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const left = new Set([a.name, ...(a.aliases ?? [])].map(normalize));
  return [b.name, ...(b.aliases ?? [])].map(normalize).some((name) => left.has(name));
}
