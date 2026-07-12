import { normalCdf } from "./rating";
import type { Rating } from "./types";

export interface RankedEstimate extends Rating {
  value_id: string;
}

export type RankRelation = "above" | "below" | "overlap" | "same";

export function orderingProbability(a: Rating, b: Rating): number {
  const scale = Math.sqrt(a.sigma ** 2 + b.sigma ** 2);
  if (scale === 0) return a.mu === b.mu ? 0.5 : a.mu > b.mu ? 1 : 0;
  return normalCdf((a.mu - b.mu) / scale);
}

export function rankRelation(
  a: RankedEstimate,
  b: RankedEstimate,
  threshold = 0.9,
): RankRelation {
  if (a.value_id === b.value_id) return "same";
  const probability = orderingProbability(a, b);
  return probability >= threshold
    ? "above"
    : probability <= 1 - threshold
      ? "below"
      : "overlap";
}

export function stableTiers<T extends RankedEstimate>(
  rows: T[],
  threshold = 0.9,
): T[][] {
  const tiers: T[][] = [];
  for (const row of rows) {
    const previous = tiers.at(-1);
    if (!previous || previous.some((item) => rankRelation(item, row, threshold) === "above"))
      tiers.push([row]);
    else previous.push(row);
  }
  return tiers;
}

export function intervalDomain(rows: Rating[], z = 1.645) {
  if (!rows.length) return { minimum: 0, maximum: 1, span: 1 };
  const minimum = Math.min(...rows.map((row) => row.mu - z * row.sigma));
  const maximum = Math.max(...rows.map((row) => row.mu + z * row.sigma));
  return { minimum, maximum, span: Math.max(maximum - minimum, 0.0001) };
}
