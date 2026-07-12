import { describe, expect, it } from "vitest";
import { selectMatches } from "@/domain/matchmaking";
import { initialRating } from "@/domain/types";
import { config, event } from "./helpers";

const weights = { uncertainty: 1, similarity: 1.2, topFocus: .8, boundary: 1, coverage: 1.1, retest: .5, crossCategory: .35, contradiction: .8, contextDisagreement: .8 };
const values = ["a", "b", "c", "d"].map((id, index) => ({ id, name: id.toUpperCase(), parentCategory: index % 2 ? "Social" : "Personal", aliases: [], rating: { ...initialRating(config), comparisons: index } }));

describe("adaptive match selection", () => {
  it("prioritizes uncertainty and sparse coverage with an inspectable reason", () => {
    values[3]!.rating.sigma = 3; const matches = selectMatches({ values, events: [], config, weights, topK: 2, minimumCoverage: 5, count: 4 });
    expect(matches).toHaveLength(4); expect(matches[0]!.reason).toBeTruthy(); expect(matches[0]!.details.length).toBeGreaterThan(0); expect(new Set([matches[0]!.leftValueId, matches[0]!.rightValueId]).size).toBe(2);
  });

  it("never proposes an immediate repeated pair", () => {
    const last = event({ leftValueId: "a", rightValueId: "b" }); const matches = selectMatches({ values, events: [last], config, weights, topK: 2, minimumCoverage: 5, count: 6 });
    expect(matches.some((match) => new Set([match.leftValueId, match.rightValueId]).has("a") && new Set([match.leftValueId, match.rightValueId]).has("b"))).toBe(false);
  });

  it("covers multiple values rather than repeating one pair", () => {
    const matches = selectMatches({ values, events: [], config, weights, topK: 2, minimumCoverage: 5, count: 6 }); const covered = new Set(matches.flatMap((match) => [match.leftValueId, match.rightValueId])); expect(covered.size).toBe(4); expect(new Set(matches.map((match) => [match.leftValueId, match.rightValueId].sort().join(":"))).size).toBe(matches.length);
  });
});
