import { normalCdf } from "./rating";
import { spearmanRankCorrelation } from "./statistics";
import type { RatedValue } from "./types";

export interface ConvergenceConfig { topK: number; minimumComparisons: number; stabilityWindow: number; uncertaintyThreshold: number; tiersSufficient: boolean }
export interface ConvergenceDiagnostics {
  averageUncertainty: number; maximumUncertainty: number; topKStability: number; rankCorrelation: number;
  minimumAdjacentOrderProbability: number; insufficientValues: number; unresolvedNearTies: number; suspectedContradictions: number;
  retestConsistency: number | null; categoryCoverage: number; contextInstability: number; state: "top-stable" | "exact-stable" | "tiers-stable" | "more-needed" | "contexts-unresolved";
  explanation: string;
}

export function convergenceDiagnostics(input: {
  values: RatedValue[]; recentRankings: string[][]; config: ConvergenceConfig; suspectedContradictions: number;
  retestOutcomes?: boolean[]; contextInstability?: number;
}): ConvergenceDiagnostics {
  const { values, config } = input;
  if (!values.length) return { averageUncertainty: 0, maximumUncertainty: 0, topKStability: 0, rankCorrelation: 0, minimumAdjacentOrderProbability: 0, insufficientValues: 0, unresolvedNearTies: 0, suspectedContradictions: input.suspectedContradictions, retestConsistency: null, categoryCoverage: 0, contextInstability: input.contextInstability ?? 0, state: "more-needed", explanation: "Add values and comparisons to begin estimating convergence." };
  const ordered = [...values].sort((a, b) => b.rating.mu - a.rating.mu || a.id.localeCompare(b.id));
  const averageUncertainty = values.reduce((sum, value) => sum + value.rating.sigma, 0) / values.length;
  const maximumUncertainty = Math.max(...values.map((value) => value.rating.sigma));
  const insufficientValues = values.filter((value) => value.rating.comparisons < config.minimumComparisons).length;
  const adjacent = ordered.slice(0, -1).map((value, i) => {
    const next = ordered[i + 1]!;
    return normalCdf((value.rating.mu - next.rating.mu) / Math.sqrt(value.rating.sigma ** 2 + next.rating.sigma ** 2));
  });
  const unresolvedNearTies = adjacent.filter((probability) => probability < 0.75).length;
  const minimumAdjacentOrderProbability = adjacent.length ? Math.min(...adjacent) : 1;
  const recent = input.recentRankings.slice(-config.stabilityWindow);
  const currentTop = new Set(ordered.slice(0, config.topK).map((value) => value.id));
  const topKStability = recent.length ? recent.reduce((sum, ranking) => sum + ranking.slice(0, config.topK).filter((id) => currentTop.has(id)).length / Math.max(1, config.topK), 0) / recent.length : 0;
  const correlations = recent.slice(0, -1).map((ranking, i) => spearmanRankCorrelation(ranking, recent[i + 1]!));
  const rankCorrelation = correlations.length ? correlations.reduce((a, b) => a + b, 0) / correlations.length : 0;
  const retestConsistency = input.retestOutcomes?.length ? input.retestOutcomes.filter(Boolean).length / input.retestOutcomes.length : null;
  const categories = new Map<string, number>();
  for (const value of values) if (value.parentCategory) categories.set(value.parentCategory, (categories.get(value.parentCategory) ?? 0) + value.rating.comparisons);
  const categoryCoverage = categories.size ? [...categories.values()].filter((count) => count >= config.minimumComparisons).length / categories.size : 1;
  const contextInstability = input.contextInstability ?? 0;
  let state: ConvergenceDiagnostics["state"] = "more-needed";
  if (contextInstability > 0.35) state = "contexts-unresolved";
  else if (insufficientValues === 0 && averageUncertainty <= config.uncertaintyThreshold && rankCorrelation >= 0.95 && minimumAdjacentOrderProbability >= 0.8) state = "exact-stable";
  else if (insufficientValues === 0 && topKStability >= 0.9 && recent.length >= Math.min(2, config.stabilityWindow)) {
    if (unresolvedNearTies === 0) state = "top-stable";
    else if (config.tiersSufficient) state = "tiers-stable";
  }
  const explanation = state === "exact-stable" ? "The exact ordering is stable across recent snapshots and adjacent values are well separated."
    : state === "top-stable" ? `The top ${config.topK} membership is stable, but ordering within or below it remains uncertain.`
      : state === "tiers-stable" ? `Broad tiers are stable, while ${unresolvedNearTies} adjacent pair${unresolvedNearTies === 1 ? "" : "s"} still overlap.`
        : state === "contexts-unresolved" ? "Global evidence is settling, but one or more contexts still produce materially different rankings."
          : `${insufficientValues} value${insufficientValues === 1 ? " has" : "s have"} insufficient coverage; more targeted comparisons are needed.`;
  return { averageUncertainty, maximumUncertainty, topKStability, rankCorrelation, minimumAdjacentOrderProbability, insufficientValues, unresolvedNearTies, suspectedContradictions: input.suspectedContradictions, retestConsistency, categoryCoverage, contextInstability, state, explanation };
}
