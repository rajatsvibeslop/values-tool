import { describe, expect, it } from "vitest";
import { effectiveEvents, replayRatings, TrueSkillRatingSystem } from "@/domain/rating";
import { initialRating } from "@/domain/types";
import { config, event } from "./helpers";

describe("TrueSkill rating system", () => {
  it("moves a winner above a loser and reduces uncertainty", () => {
    const system = new TrueSkillRatingSystem(config); const prior = initialRating(config); const [winner, loser] = system.update(prior, prior, event());
    expect(winner.mu).toBeGreaterThan(prior.mu); expect(loser.mu).toBeLessThan(prior.mu); expect(winner.sigma).toBeLessThan(prior.sigma); expect(winner.wins).toBe(1); expect(loser.losses).toBe(1);
  });

  it("handles a draw by reducing uncertainty without inventing a winner", () => {
    const system = new TrueSkillRatingSystem(config); const left = { ...initialRating(config), mu: 27 }; const right = { ...initialRating(config), mu: 23 }; const [a, b] = system.update(left, right, event({ result: "tie" }));
    expect(a.mu).toBeLessThan(left.mu); expect(b.mu).toBeGreaterThan(right.mu); expect(a.ties).toBe(1); expect(b.ties).toBe(1);
  });

  it("does not treat incomparable, skip, or malformed as a draw", () => {
    const system = new TrueSkillRatingSystem(config); const prior = initialRating(config);
    const [a, b] = system.update(prior, prior, event({ result: "incomparable" })); expect(a.mu).toBe(prior.mu); expect(a.sigma).toBe(prior.sigma); expect(a.incomparable).toBe(1); expect(a.ties).toBe(0); expect(a.comparisons).toBe(0); expect(b.incomparable).toBe(1);
    for (const result of ["skip", "malformed"] as const) expect(system.update(prior, prior, event({ result }))[0]).toEqual(prior);
  });

  it("replays deterministically and isolates context-specific evidence", () => {
    const events = [event({ id: "1", result: "left", contextIds: ["work"] }), event({ id: "2", result: "right", contextIds: ["home"], occurredAt: new Date("2026-01-02") })];
    const first = replayRatings(["a", "b"], events, config); const second = replayRatings(["a", "b"], [...events].reverse(), config);
    expect(first).toEqual(second); const work = replayRatings(["a", "b"], events, config, "work"); expect(work.get("a")!.wins).toBe(1); expect(work.get("a")!.losses).toBe(0);
  });

  it("excludes superseded events while preserving both source records", () => {
    const original = event({ id: "original", result: "left" }); const correction = event({ id: "correction", result: "right", supersedesEventId: "original", occurredAt: new Date("2026-01-02") });
    expect(effectiveEvents([original, correction]).map((item) => item.id)).toEqual(["correction"]); const ratings = replayRatings(["a", "b"], [original, correction], config); expect(ratings.get("b")!.wins).toBe(1); expect(ratings.get("a")!.wins).toBe(0);
  });

  it("keeps confidence and strength neutral by default and bounded when enabled", () => {
    const prior = initialRating(config); const system = new TrueSkillRatingSystem(config); const normal = system.update(prior, prior, event()); const emphatic = system.update(prior, prior, event({ strength: "strong", confidence: "highly" })); expect(normal).toEqual(emphatic);
    const enabled = new TrueSkillRatingSystem({ ...config, modifiersEnabled: true }); const changed = enabled.update(prior, prior, event({ strength: "strong", confidence: "highly" })); expect(changed[0].mu).not.toBe(normal[0].mu); expect(Math.abs(changed[0].mu - normal[0].mu)).toBeLessThan(1);
  });
});
