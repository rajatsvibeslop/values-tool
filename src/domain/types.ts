export type ComparisonResult = "left" | "right" | "tie" | "incomparable" | "skip" | "malformed";
export type Strength = "slight" | "moderate" | "strong";
export type Confidence = "uncertain" | "somewhat" | "confident" | "highly";

export interface Rating {
  mu: number;
  sigma: number;
  comparisons: number;
  wins: number;
  losses: number;
  ties: number;
  incomparable: number;
  lastComparedAt: Date | null;
}

export interface RatingConfig {
  mu: number;
  sigma: number;
  beta: number;
  tau: number;
  drawProbability: number;
  conservativeK: number;
  modifiersEnabled: boolean;
}

export interface RatingEvent {
  id: string;
  leftValueId: string;
  rightValueId: string;
  result: ComparisonResult;
  strength: Strength;
  confidence: Confidence;
  contextIds: string[];
  occurredAt: Date;
  supersedesEventId?: string | null;
  erroneous?: boolean;
}

export interface RatedValue {
  id: string;
  name: string;
  parentCategory: string;
  aliases: string[];
  rating: Rating;
}

export const rankedResults: ComparisonResult[] = ["left", "right", "tie"];

export function initialRating(config: RatingConfig): Rating {
  return { mu: config.mu, sigma: config.sigma, comparisons: 0, wins: 0, losses: 0, ties: 0, incomparable: 0, lastComparedAt: null };
}
