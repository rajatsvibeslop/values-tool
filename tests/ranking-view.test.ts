import { describe, expect, it } from "vitest";
import { rankRelation, stableTiers } from "@/domain/ranking-view";

const row = (value_id: string, mu: number, sigma: number) => ({
  value_id, mu, sigma, comparisons: 10, wins: 0, losses: 0, ties: 0,
  incomparable: 0, lastComparedAt: null,
});

describe("ranking presentation", () => {
  it("distinguishes separated and overlapping posteriors", () => {
    expect(rankRelation(row("a", 30, 1), row("b", 20, 1))).toBe("above");
    expect(rankRelation(row("a", 20, 5), row("b", 19, 5))).toBe("overlap");
    expect(rankRelation(row("b", 20, 1), row("a", 30, 1))).toBe("below");
  });

  it("keeps unresolved neighbors together and exposes clear breaks", () => {
    const tiers = stableTiers([
      row("a", 30, 1), row("b", 29.8, 1), row("c", 20, 1), row("d", 19.8, 1),
    ]);
    expect(tiers.map((tier) => tier.map((item) => item.value_id))).toEqual([
      ["a", "b"], ["c", "d"],
    ]);
  });
});
