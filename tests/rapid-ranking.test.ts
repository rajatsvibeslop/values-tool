import { describe, expect, it } from "vitest";
import {
  adjacentDecisions,
  rapidQuestionBudget,
  rapidQuestionLowerBound,
  selectRapidGroup,
} from "@/domain/rapid-ranking";
import { initialRating } from "@/domain/types";
import type { RatingEvent } from "@/domain/types";
import { replayRatings } from "@/domain/rating";
import { spearmanRankCorrelation } from "@/domain/statistics";
import { config } from "./helpers";

const values = Array.from({ length: 100 }, (_, index) => ({
  id: `v${index}`,
  name: `Value ${index}`,
  parentCategory: `Category ${index % 10}`,
  aliases: [],
  rating: initialRating(config),
}));

describe("rapid listwise ranking", () => {
  it("keeps a 100-value session below 100 questions", () => {
    expect(rapidQuestionLowerBound(100, 5)).toBe(76);
    expect(rapidQuestionBudget(100, 5)).toBe(80);
  });

  it("selects five distinct values deterministically", () => {
    const first = selectRapidGroup({ values, events: [], seed: "set", completedQuestions: 0 });
    const second = selectRapidGroup({ values, events: [], seed: "set", completedQuestions: 0 });
    expect(first).toEqual(second);
    expect(first?.valueIds).toHaveLength(5);
    expect(new Set(first?.valueIds).size).toBe(5);
  });

  it("encodes a five-value answer with four adjacent relations", () => {
    expect(adjacentDecisions(["a", "b", "c", "d", "e"])).toEqual([
      { leftValueId: "a", rightValueId: "b", result: "left" },
      { leftValueId: "b", rightValueId: "c", result: "left" },
      { leftValueId: "c", rightValueId: "d", result: "left" },
      { leftValueId: "d", rightValueId: "e", result: "left" },
    ]);
  });

  it("stops when the question budget is exhausted", () => {
    expect(selectRapidGroup({
      values, events: [], seed: "set", completedQuestions: 80,
    })).toBeNull();
  });

  it("recovers a stable synthetic ordering within the 80-question budget", () => {
    const events: RatingEvent[] = [];
    let rated = values;
    for (let questionIndex = 0; questionIndex < 80; questionIndex++) {
      const group = selectRapidGroup({
        values: rated,
        events,
        seed: "synthetic",
        completedQuestions: questionIndex,
      })!;
      const ordered = [...group.valueIds].sort(
        (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
      );
      for (const [index, decision] of adjacentDecisions(ordered).entries())
        events.push({
          id: `q${questionIndex}-${index}`,
          ...decision,
          strength: "moderate",
          confidence: "confident",
          contextIds: [],
          occurredAt: new Date(questionIndex * 10 + index),
        });
      const ratings = replayRatings(values.map((value) => value.id), events, config);
      rated = values.map((value) => ({ ...value, rating: ratings.get(value.id)! }));
    }
    const inferred = [...rated]
      .sort((a, b) => b.rating.mu - a.rating.mu)
      .map((value) => value.id);
    expect(spearmanRankCorrelation(values.map((value) => value.id), inferred)).toBeGreaterThan(0.9);
  });
});
