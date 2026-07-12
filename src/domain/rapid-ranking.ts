import type { RatingEvent, RatedValue } from "./types";

export interface RapidGroup {
  id: string;
  valueIds: string[];
  reason: string;
  question: number;
  budget: number;
}

const pairKey = (a: string, b: string) => [a, b].sort().join(":");

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index++) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function factorialLog2(size: number) {
  let result = 0;
  for (let value = 2; value <= size; value++) result += Math.log2(value);
  return result;
}

export function rapidQuestionLowerBound(size: number, groupSize = 5): number {
  if (size < 2) return 0;
  return Math.ceil(factorialLog2(size) / factorialLog2(Math.min(size, groupSize)));
}

export function rapidQuestionBudget(size: number, groupSize = 5): number {
  if (size < 2) return 0;
  const floor = rapidQuestionLowerBound(size, groupSize);
  return Math.max(floor, Math.ceil(size * 0.8));
}

export function selectRapidGroup(input: {
  values: RatedValue[];
  events: RatingEvent[];
  seed: string;
  completedQuestions: number;
  groupSize?: number;
}): RapidGroup | null {
  const groupSize = Math.min(input.groupSize ?? 5, input.values.length);
  const budget = rapidQuestionBudget(input.values.length, groupSize);
  if (groupSize < 2 || input.completedQuestions >= budget) return null;

  const appearances = new Map(input.values.map((value) => [value.id, 0]));
  const pairCounts = new Map<string, number>();
  for (const event of input.events) {
    if (!["left", "right", "tie"].includes(event.result)) continue;
    appearances.set(event.leftValueId, (appearances.get(event.leftValueId) ?? 0) + 1);
    appearances.set(event.rightValueId, (appearances.get(event.rightValueId) ?? 0) + 1);
    const key = pairKey(event.leftValueId, event.rightValueId);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  const selected: RatedValue[] = [];
  while (selected.length < groupSize) {
    const center = selected.length
      ? selected.reduce((sum, value) => sum + value.rating.mu, 0) / selected.length
      : null;
    const candidates = input.values.filter(
      (value) => !selected.some((item) => item.id === value.id),
    );
    candidates.sort((a, b) => {
      const score = (value: RatedValue) => {
        const sparse = 8 / (1 + (appearances.get(value.id) ?? 0));
        const uncertainty = value.rating.sigma;
        const proximity = center === null ? 0 : 5 / (1 + Math.abs(value.rating.mu - center));
        const novelPairs = selected.reduce(
          (sum, item) => sum + ((pairCounts.get(pairKey(value.id, item.id)) ?? 0) === 0 ? 2 : 0),
          0,
        );
        const category = selected.some(
          (item) => item.parentCategory && item.parentCategory === value.parentCategory,
        )
          ? 0
          : 0.75;
        const jitter = (hash(`${input.seed}:${input.completedQuestions}:${value.id}`) % 1000) / 1_000_000;
        return sparse + uncertainty + proximity + novelPairs + category + jitter;
      };
      return score(b) - score(a) || a.id.localeCompare(b.id);
    });
    selected.push(candidates[0]!);
  }

  selected.sort(
    (a, b) =>
      hash(`${input.seed}:${input.completedQuestions}:side:${a.id}`) -
      hash(`${input.seed}:${input.completedQuestions}:side:${b.id}`),
  );
  const minimumAppearance = Math.min(
    ...selected.map((value) => appearances.get(value.id) ?? 0),
  );
  return {
    id: `${input.seed}:${input.completedQuestions + 1}`,
    valueIds: selected.map((value) => value.id),
    reason: minimumAppearance < 2 ? "Build broad coverage" : "Resolve uncertain boundaries",
    question: input.completedQuestions + 1,
    budget,
  };
}

export function adjacentDecisions(order: string[]) {
  return order.slice(0, -1).map((leftValueId, index) => ({
    leftValueId,
    rightValueId: order[index + 1]!,
    result: "left" as const,
  }));
}
