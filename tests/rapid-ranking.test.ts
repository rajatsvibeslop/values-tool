import { describe, expect, it } from "vitest";
import {
  adjacentDecisions,
  portraitQuestionBudget,
  rapidQuestionBudget,
  rapidQuestionLowerBound,
  selectRapidGroup,
} from "@/domain/rapid-ranking";
import { initialRating } from "@/domain/types";
import type { RatingEvent } from "@/domain/types";
import { replayRatings } from "@/domain/rating";
import { spearmanRankCorrelation } from "@/domain/statistics";
import { buildScenarioProfiles } from "@/domain/scenarios";
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

  it("gives portrait sessions enough coverage without exceeding 99 questions", () => {
    expect(portraitQuestionBudget(19)).toBe(38);
    expect(portraitQuestionBudget(100)).toBe(99);
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

  it("separates a stable 19-value ordering with portrait best-worst evidence", () => {
    const portraitValues = values.slice(0, 19);
    const budget = portraitQuestionBudget(portraitValues.length);
    const events: RatingEvent[] = [];
    let rated = portraitValues;
    for (let questionIndex = 0; questionIndex < budget; questionIndex++) {
      const group = selectRapidGroup({
        values: rated,
        events,
        seed: "portrait-synthetic",
        completedQuestions: questionIndex,
        questionBudget: budget,
      })!;
      const ordered = buildScenarioProfiles(
        group.valueIds.map((id) => ({ id, name: id, definition: id, category: "" })),
        `portrait:${questionIndex}`,
      )
        .map((profile) => profile.focalValueId)
        .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
      const decisions = [
        [ordered[0]!, ordered[1]!],
        [ordered[0]!, ordered[2]!],
        [ordered[1]!, ordered[2]!],
      ];
      decisions.forEach(([leftValueId, rightValueId], index) =>
        events.push({
          id: `portrait-${questionIndex}-${index}`,
          leftValueId,
          rightValueId,
          result: "left",
          strength: "moderate",
          confidence: "somewhat",
          contextIds: [],
          occurredAt: new Date(questionIndex * 10 + index),
        }),
      );
      const ratings = replayRatings(
        portraitValues.map((value) => value.id),
        events,
        config,
      );
      rated = portraitValues.map((value) => ({ ...value, rating: ratings.get(value.id)! }));
    }
    const inferred = [...rated]
      .sort((left, right) => right.rating.mu - left.rating.mu)
      .map((value) => value.id);
    expect(inferred.slice(0, 5)).toEqual(["v0", "v1", "v2", "v3", "v4"]);
    expect(spearmanRankCorrelation(portraitValues.map((value) => value.id), inferred)).toBeGreaterThan(0.9);
    expect(Math.min(...rated.map((value) => value.rating.comparisons))).toBeGreaterThanOrEqual(9);
  });
});
