import type { RatedValue, RatingEvent } from "./types";
import { conservativeScore, TrueSkillRatingSystem } from "./rating";
import type { RatingConfig } from "./types";

export interface SelectionWeights {
  uncertainty: number; similarity: number; topFocus: number; boundary: number; coverage: number;
  retest: number; crossCategory: number; contradiction: number; contextDisagreement: number;
}

export interface MatchCandidate {
  leftValueId: string; rightValueId: string; score: number; reason: string; details: string[];
}

const pairKey = (a: string, b: string) => [a, b].sort().join(":");

function synonymPenalty(a: RatedValue, b: RatedValue): number {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const left = new Set([a.name, ...a.aliases].map(normalize));
  const right = [b.name, ...b.aliases].map(normalize);
  if (right.some((name) => left.has(name))) return 1;
  const aTokens = new Set(normalize(a.name).split(/\s+/));
  const overlap = normalize(b.name).split(/\s+/).filter((token) => aTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, 1) > 0.5 ? 0.65 : 0;
}

export function selectMatches(input: {
  values: RatedValue[]; events: RatingEvent[]; config: RatingConfig; weights: SelectionWeights;
  topK: number; minimumCoverage: number; count: number; contextId?: string;
}): MatchCandidate[] {
  const { values, events, config, weights, topK, minimumCoverage } = input;
  const system = new TrueSkillRatingSystem(config);
  const ranked = [...values].sort((a, b) => conservativeScore(b.rating, config.conservativeK) - conservativeScore(a.rating, config.conservativeK) || a.id.localeCompare(b.id));
  const rank = new Map(ranked.map((value, i) => [value.id, i + 1]));
  const pairEvents = new Map<string, RatingEvent[]>();
  for (const event of events) {
    const key = pairKey(event.leftValueId, event.rightValueId);
    pairEvents.set(key, [...(pairEvents.get(key) ?? []), event]);
  }
  const last = events.at(-1);
  const candidates: MatchCandidate[] = [];
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
    const a = values[i]!; const b = values[j]!;
    if (last && pairKey(a.id, b.id) === pairKey(last.leftValueId, last.rightValueId)) continue;
    const history = pairEvents.get(pairKey(a.id, b.id)) ?? [];
    const maxSigma = Math.max(a.rating.sigma, b.rating.sigma) / config.sigma;
    const winP = system.winProbability(a.rating, b.rating);
    const similar = 1 - Math.min(1, Math.abs(winP - 0.5) * 2);
    const top = Math.max(rank.get(a.id)! <= topK ? 1 : 0, rank.get(b.id)! <= topK ? 1 : 0);
    const boundaryDistance = Math.min(Math.abs(rank.get(a.id)! - topK), Math.abs(rank.get(b.id)! - topK));
    const boundary = 1 / (1 + boundaryDistance);
    const coverage = Math.max(0, minimumCoverage - Math.min(a.rating.comparisons, b.rating.comparisons)) / Math.max(1, minimumCoverage);
    const age = history.length ? Math.min(1, (Date.now() - history.at(-1)!.occurredAt.getTime()) / (30 * 86400000)) : 0;
    const retest = history.length ? age : 0;
    const crossCategory = a.parentCategory && b.parentCategory && a.parentCategory !== b.parentCategory ? 1 : 0;
    const results = new Set(history.map((event) => event.result));
    const contradiction = (results.has("left") && results.has("right")) || (results.has("tie") && results.size > 1) ? 1 : 0;
    const contextualResults = history.filter((event) => input.contextId ? event.contextIds.includes(input.contextId) : event.contextIds.length > 0);
    const contextDisagreement = contextualResults.some((event) => history.some((other) => other.result !== event.result && other.contextIds.join() !== event.contextIds.join())) ? 1 : 0;
    const components = [
      ["High uncertainty", maxSigma * weights.uncertainty], ["Possible tie", similar * weights.similarity],
      ["Top values", top * weights.topFocus], [`Top-${topK} boundary`, boundary * weights.boundary],
      ["Sparse evidence", coverage * weights.coverage], ["Retest for stability", retest * weights.retest],
      ["Cross-category coverage", crossCategory * weights.crossCategory], ["Potential contradiction", contradiction * weights.contradiction],
      ["Context disagreement", contextDisagreement * weights.contextDisagreement],
    ] as const;
    const penalty = synonymPenalty(a, b) * (history.some((event) => event.result === "malformed") ? 2 : 1);
    const score = components.reduce((sum, component) => sum + component[1], 0) - penalty;
    const details = components.filter((component) => component[1] > 0.25).sort((x, y) => y[1] - x[1]).map((component) => component[0]);
    candidates.push({ leftValueId: a.id, rightValueId: b.id, score, reason: details[0] ?? "Coverage balance", details });
  }
  return candidates.sort((a, b) => b.score - a.score || pairKey(a.leftValueId, a.rightValueId).localeCompare(pairKey(b.leftValueId, b.rightValueId))).slice(0, input.count);
}

export function balancedSides(candidate: MatchCandidate, seed: string): MatchCandidate {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hash % 2 === 0 ? candidate : { ...candidate, leftValueId: candidate.rightValueId, rightValueId: candidate.leftValueId };
}
