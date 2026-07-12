import { describe, expect, it } from "vitest";
import { convergenceDiagnostics } from "@/domain/convergence";
import { estimateRanks } from "@/domain/statistics";
import {
  detectCycles,
  detectLowConfidenceRepeats,
  detectReversals,
} from "@/domain/tensions";
import { initialRating } from "@/domain/types";
import { config, event } from "./helpers";

describe("analysis diagnostics", () => {
  it("computes deterministic rank intervals and top-k probabilities", () => {
    const ratings = new Map([
      ["a", { ...initialRating(config), mu: 35, sigma: 2 }],
      ["b", { ...initialRating(config), mu: 25, sigma: 2 }],
      ["c", { ...initialRating(config), mu: 15, sigma: 2 }],
    ]);
    const first = estimateRanks(ratings, 1, 1000, 42);
    const second = estimateRanks(ratings, 1, 1000, 42);
    expect(first).toEqual(second);
    expect(first.get("a")!.topKProbability).toBeGreaterThan(0.99);
    expect(first.get("a")!.low).toBe(1);
  });

  it("reports stable tiers without pretending exact order is settled", () => {
    const values = ["a", "b", "c"].map((id, index) => ({
      id,
      name: id,
      parentCategory: index ? "x" : "y",
      aliases: [],
      rating: {
        ...initialRating(config),
        mu: 30 - index * 0.2,
        sigma: 2,
        comparisons: 8,
      },
    }));
    const result = convergenceDiagnostics({
      values,
      recentRankings: [
        ["a", "b", "c"],
        ["b", "a", "c"],
        ["a", "b", "c"],
      ],
      config: {
        topK: 2,
        minimumComparisons: 5,
        stabilityWindow: 3,
        uncertaintyThreshold: 3,
        tiersSufficient: true,
      },
      suspectedContradictions: 0,
    });
    expect(result.unresolvedNearTies).toBeGreaterThan(0);
    expect(result.state).toBe("tiers-stable");
    expect(result.explanation).toContain("tiers");
  });

  it("keeps collecting evidence when exact order is requested and tiers overlap", () => {
    const values = ["a", "b", "c"].map((id, index) => ({
      id,
      name: id,
      parentCategory: "x",
      aliases: [],
      rating: {
        ...initialRating(config),
        mu: 30 - index * 0.2,
        sigma: 2,
        comparisons: 8,
      },
    }));
    const result = convergenceDiagnostics({
      values,
      recentRankings: [
        ["a", "b", "c"],
        ["a", "b", "c"],
      ],
      config: {
        topK: 2,
        minimumComparisons: 5,
        stabilityWindow: 2,
        uncertaintyThreshold: 3,
        tiersSufficient: false,
      },
      suspectedContradictions: 0,
    });
    expect(result.unresolvedNearTies).toBeGreaterThan(0);
    expect(result.state).toBe("more-needed");
  });

  it("detects preference cycles", () => {
    const events = [
      event({ id: "ab", leftValueId: "a", rightValueId: "b", result: "left" }),
      event({ id: "bc", leftValueId: "b", rightValueId: "c", result: "left" }),
      event({ id: "ca", leftValueId: "c", rightValueId: "a", result: "left" }),
    ];
    const cycles = detectCycles(events);
    expect(cycles).toHaveLength(1);
    expect(new Set(cycles[0]!.valueIds)).toEqual(new Set(["a", "b", "c"]));
    expect(cycles[0]!.eventIds).toHaveLength(3);
  });

  it("distinguishes temporal reversals from context-dependent reversals", () => {
    const temporal = detectReversals([
      event({ id: "1", result: "left" }),
      event({ id: "2", result: "right", occurredAt: new Date("2026-02-01") }),
    ]);
    expect(temporal[0]!.type).toBe("reversal");
    const contextual = detectReversals([
      event({ id: "1", result: "left", contextIds: ["work"] }),
      event({ id: "2", result: "right", contextIds: ["home"] }),
    ]);
    expect(contextual[0]!.type).toBe("context");
  });

  it("surfaces repeated low-confidence comparisons as suggestions", () => {
    const suggestions = detectLowConfidenceRepeats([
      event({ id: "1", confidence: "uncertain" }),
      event({
        id: "2",
        confidence: "somewhat",
        occurredAt: new Date("2026-02-01"),
      }),
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.type).toBe("low-confidence");
    expect(suggestions[0]!.eventIds).toEqual(["1", "2"]);
  });
});
