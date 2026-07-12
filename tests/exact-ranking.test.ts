import { describe, expect, it } from "vitest";
import {
  binaryInsertionWorstCase,
  deterministicOrder,
  exactRankingLowerBound,
  exactRankingProgress,
  type ExactDecision,
} from "@/domain/exact-ranking";

describe("finite exact ranking", () => {
  it("has the expected information and scheduler bounds for 100 values", () => {
    expect(exactRankingLowerBound(100)).toBe(525);
    expect(binaryInsertionWorstCase(100)).toBe(573);
  });

  it("is deterministic and completes a stable order within its bound", () => {
    const ids = Array.from({ length: 100 }, (_, index) => `value-${index}`);
    const truth = new Map(ids.map((id, index) => [id, index]));
    const decisions: ExactDecision[] = [];
    let progress = exactRankingProgress({ valueIds: ids, seed: "set", decisions });
    while (!progress.complete) {
      const pair = progress.nextPair!;
      decisions.push({
        ...pair,
        result:
          truth.get(pair.leftValueId)! < truth.get(pair.rightValueId)!
            ? "left"
            : "right",
      });
      progress = exactRankingProgress({ valueIds: ids, seed: "set", decisions });
    }
    expect(progress.ordered).toEqual(ids);
    expect(decisions.length).toBeLessThanOrEqual(binaryInsertionWorstCase(100));
    expect(exactRankingProgress({ valueIds: ids, seed: "set", decisions })).toEqual(progress);
  });

  it("reuses known comparisons and preserves ties", () => {
    const ids = ["a", "b", "c"];
    const sequence = deterministicOrder(ids, "ties");
    let progress = exactRankingProgress({ valueIds: ids, seed: "ties", decisions: [] });
    const first = progress.nextPair!;
    const decisions: ExactDecision[] = [{ ...first, result: "tie" }];
    progress = exactRankingProgress({ valueIds: ids, seed: "ties", decisions });
    expect(progress.ties).toContainEqual([first.leftValueId, first.rightValueId]);
    expect(progress.reusedComparisons).toBeGreaterThan(0);
    expect(sequence).toHaveLength(3);
  });

  it("does not turn skip or incomparability into ordering evidence", () => {
    const base = exactRankingProgress({ valueIds: ["a", "b"], seed: "x", decisions: [] });
    for (const result of ["skip", "incomparable", "malformed"] as const) {
      const next = exactRankingProgress({
        valueIds: ["a", "b"], seed: "x",
        decisions: [{ ...base.nextPair!, result }],
      });
      expect(next.nextPair).toEqual(base.nextPair);
      expect(next.complete).toBe(false);
    }
  });
});
