import type { RatingEvent } from "@/domain/types";

export const config = { mu: 25, sigma: 25 / 3, beta: 25 / 6, tau: 25 / 300, drawProbability: 0.1, conservativeK: 3, modifiersEnabled: false };

export function event(overrides: Partial<RatingEvent> = {}): RatingEvent {
  return { id: "event-1", leftValueId: "a", rightValueId: "b", result: "left", strength: "moderate", confidence: "confident", contextIds: [], occurredAt: new Date("2026-01-01T00:00:00Z"), ...overrides };
}
