import type { ComparisonResult, RatingEvent } from "./types";

export interface ExactDecision {
  leftValueId: string;
  rightValueId: string;
  result: ComparisonResult;
}

export interface ExactRankingProgress {
  ordered: string[];
  placed: number;
  total: number;
  decisiveComparisons: number;
  reusedComparisons: number;
  lowerBound: number;
  worstCase: number;
  complete: boolean;
  nextPair: { leftValueId: string; rightValueId: string } | null;
  ties: [string, string][];
  conflicts: [string, string][];
}

const pairKey = (a: string, b: string) =>
  a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministicOrder(valueIds: string[], seed: string): string[] {
  const ordered = [...new Set(valueIds)].sort();
  const next = random(hashSeed(seed));
  for (let index = ordered.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1));
    [ordered[index], ordered[swap]] = [ordered[swap]!, ordered[index]!];
  }
  return ordered;
}

export function exactRankingLowerBound(size: number): number {
  let bits = 0;
  for (let value = 2; value <= size; value++) bits += Math.log2(value);
  return Math.ceil(bits);
}

export function binaryInsertionWorstCase(size: number): number {
  let comparisons = 0;
  for (let positions = 2; positions <= size; positions++)
    comparisons += Math.ceil(Math.log2(positions));
  return comparisons;
}

function normalizedOutcome(
  decision: ExactDecision,
  first: string,
  second: string,
): -1 | 0 | 1 | null {
  if (decision.result === "tie") return 0;
  if (decision.result !== "left" && decision.result !== "right") return null;
  const winner =
    decision.result === "left"
      ? decision.leftValueId
      : decision.rightValueId;
  return winner === first ? -1 : winner === second ? 1 : null;
}

export function exactRankingProgress(input: {
  valueIds: string[];
  seed: string;
  decisions: ExactDecision[];
}): ExactRankingProgress {
  const sequence = deterministicOrder(input.valueIds, input.seed);
  const outcomes = new Map<string, Set<-1 | 0 | 1>>();
  for (const decision of input.decisions) {
    const [first, second] = [decision.leftValueId, decision.rightValueId].sort();
    const outcome = normalizedOutcome(decision, first!, second!);
    if (outcome === null) continue;
    const key = pairKey(first!, second!);
    const bucket = outcomes.get(key) ?? new Set<-1 | 0 | 1>();
    bucket.add(outcome);
    outcomes.set(key, bucket);
  }

  if (!sequence.length)
    return {
      ordered: [], placed: 0, total: 0, decisiveComparisons: 0,
      reusedComparisons: 0, lowerBound: 0, worstCase: 0, complete: true,
      nextPair: null, ties: [], conflicts: [],
    };

  const ordered = [sequence[0]!];
  const ties: [string, string][] = [];
  const conflicts: [string, string][] = [];
  let reusedComparisons = 0;

  for (const current of sequence.slice(1)) {
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const midpoint = Math.floor((low + high) / 2);
      const pivot = ordered[midpoint]!;
      const key = pairKey(current, pivot);
      const known = outcomes.get(key);
      if (!known || known.size !== 1) {
        if (known && known.size > 1) conflicts.push([current, pivot]);
        return {
          ordered,
          placed: ordered.length,
          total: sequence.length,
          decisiveComparisons: input.decisions.filter((decision) =>
            ["left", "right", "tie"].includes(decision.result),
          ).length,
          reusedComparisons,
          lowerBound: exactRankingLowerBound(sequence.length),
          worstCase: binaryInsertionWorstCase(sequence.length),
          complete: false,
          nextPair: { leftValueId: current, rightValueId: pivot },
          ties,
          conflicts,
        };
      }
      reusedComparisons++;
      const first = [current, pivot].sort()[0]!;
      const stored = [...known][0]!;
      const relative = current === first ? stored : stored === 0 ? 0 : -stored;
      if (relative === 0) {
        ties.push([current, pivot]);
        low = midpoint;
        high = midpoint;
      } else if (relative < 0) high = midpoint;
      else low = midpoint + 1;
    }
    ordered.splice(low, 0, current);
  }

  return {
    ordered,
    placed: ordered.length,
    total: sequence.length,
    decisiveComparisons: input.decisions.filter((decision) =>
      ["left", "right", "tie"].includes(decision.result),
    ).length,
    reusedComparisons,
    lowerBound: exactRankingLowerBound(sequence.length),
    worstCase: binaryInsertionWorstCase(sequence.length),
    complete: true,
    nextPair: null,
    ties,
    conflicts,
  };
}

export const toExactDecisions = (events: RatingEvent[]): ExactDecision[] =>
  events.map((event) => ({
    leftValueId: event.leftValueId,
    rightValueId: event.rightValueId,
    result: event.result,
  }));
