import { describe, expect, it } from "vitest";
import { backupSchema, likelyDuplicate, valueSetImportSchema } from "@/domain/import";

describe("import validation", () => {
  it("accepts a documented value-set import and fills optional fields", () => { const parsed = valueSetImportSchema.parse({ name: "My values", values: [{ name: "Care" }] }); expect(parsed.version).toBe(1); expect(parsed.values[0]!.aliases).toEqual([]); });
  it("returns actionable field errors for invalid data", () => { const result = valueSetImportSchema.safeParse({ name: "", values: [] }); expect(result.success).toBe(false); if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["name", "values"])); });
  it("detects normalized names and aliases during merges", () => { expect(likelyDuplicate({ name: "Self Direction" }, { name: "Autonomy", aliases: ["self-direction"] })).toBe(true); expect(likelyDuplicate({ name: "Care" }, { name: "Mastery" })).toBe(false); });
  it("rejects incomplete backups before restore", () => { expect(backupSchema.safeParse({ applicationVersion: "1", schemaVersion: 1, exportedAt: new Date().toISOString(), data: {} }).success).toBe(false); });
});
