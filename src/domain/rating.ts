import type { Confidence, Rating, RatingConfig, RatingEvent, Strength } from "./types";
import { initialRating, rankedResults } from "./types";

export interface RatingSystem {
  update(left: Rating, right: Rating, event: RatingEvent): [Rating, Rating];
  winProbability(left: Rating, right: Rating): number;
}

const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);
const normalPdf = (x: number) => Math.exp(-(x * x) / 2) / SQRT_TWO_PI;

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a);
  return sign * y;
}

export const normalCdf = (x: number) => (1 + erf(x / Math.SQRT2)) / 2;

export function inverseNormalCdf(p: number): number {
  if (p <= 0 || p >= 1) throw new Error("Probability must be between zero and one");
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - low) return -inverseNormalCdf(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

function noiseFactor(strength: Strength, confidence: Confidence): number {
  const strengths = { slight: 1.08, moderate: 1, strong: 0.92 };
  const confidences = { uncertain: 1.08, somewhat: 1.04, confident: 1, highly: 0.94 };
  return Math.min(1.15, Math.max(0.85, strengths[strength] * confidences[confidence]));
}

function withCounters(rating: Rating, kind: "win" | "loss" | "tie" | "incomparable", at: Date): Rating {
  return {
    ...rating,
    comparisons: rating.comparisons + (kind === "incomparable" ? 0 : 1),
    wins: rating.wins + (kind === "win" ? 1 : 0),
    losses: rating.losses + (kind === "loss" ? 1 : 0),
    ties: rating.ties + (kind === "tie" ? 1 : 0),
    incomparable: rating.incomparable + (kind === "incomparable" ? 1 : 0),
    lastComparedAt: at,
  };
}

export class TrueSkillRatingSystem implements RatingSystem {
  constructor(readonly config: RatingConfig) {}

  update(left: Rating, right: Rating, event: RatingEvent): [Rating, Rating] {
    if (event.result === "skip" || event.result === "malformed") return [left, right];
    if (event.result === "incomparable") return [withCounters(left, "incomparable", event.occurredAt), withCounters(right, "incomparable", event.occurredAt)];

    const l = { ...left, sigma: Math.sqrt(left.sigma ** 2 + this.config.tau ** 2) };
    const r = { ...right, sigma: Math.sqrt(right.sigma ** 2 + this.config.tau ** 2) };
    const beta = this.config.beta * (this.config.modifiersEnabled ? noiseFactor(event.strength, event.confidence) : 1);
    const c = Math.sqrt(l.sigma ** 2 + r.sigma ** 2 + 2 * beta ** 2);
    let v: number;
    let w: number;

    if (event.result === "tie") {
      const epsilon = Math.SQRT2 * beta * inverseNormalCdf((this.config.drawProbability + 1) / 2);
      const t = (l.mu - r.mu) / c;
      const e = epsilon / c;
      const denominator = Math.max(normalCdf(e - t) - normalCdf(-e - t), 1e-12);
      v = (normalPdf(-e - t) - normalPdf(e - t)) / denominator;
      w = v ** 2 + ((e - t) * normalPdf(e - t) - (-e - t) * normalPdf(-e - t)) / denominator;
    } else {
      const leftWon = event.result === "left";
      const t = ((leftWon ? l.mu - r.mu : r.mu - l.mu) / c);
      const denominator = Math.max(normalCdf(t), 1e-12);
      const winnerV = normalPdf(t) / denominator;
      v = leftWon ? winnerV : -winnerV;
      w = winnerV * (winnerV + t);
    }

    const leftUpdated: Rating = {
      ...l,
      mu: l.mu + (l.sigma ** 2 / c) * v,
      sigma: l.sigma * Math.sqrt(Math.max(1e-6, 1 - (l.sigma ** 2 / c ** 2) * w)),
    };
    const rightUpdated: Rating = {
      ...r,
      mu: r.mu - (r.sigma ** 2 / c) * v,
      sigma: r.sigma * Math.sqrt(Math.max(1e-6, 1 - (r.sigma ** 2 / c ** 2) * w)),
    };
    if (event.result === "tie") return [withCounters(leftUpdated, "tie", event.occurredAt), withCounters(rightUpdated, "tie", event.occurredAt)];
    return event.result === "left"
      ? [withCounters(leftUpdated, "win", event.occurredAt), withCounters(rightUpdated, "loss", event.occurredAt)]
      : [withCounters(leftUpdated, "loss", event.occurredAt), withCounters(rightUpdated, "win", event.occurredAt)];
  }

  winProbability(left: Rating, right: Rating): number {
    const denominator = Math.sqrt(2 * this.config.beta ** 2 + left.sigma ** 2 + right.sigma ** 2);
    return normalCdf((left.mu - right.mu) / denominator);
  }
}

export function effectiveEvents(events: RatingEvent[]): RatingEvent[] {
  const superseded = new Set(events.map((event) => event.supersedesEventId).filter((id): id is string => Boolean(id)));
  return events.filter((event) => !superseded.has(event.id) && !event.erroneous).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));
}

export function replayRatings(valueIds: string[], events: RatingEvent[], config: RatingConfig, contextId?: string): Map<string, Rating> {
  const ratings = new Map(valueIds.map((id) => [id, initialRating(config)]));
  const system = new TrueSkillRatingSystem(config);
  for (const event of effectiveEvents(events)) {
    if (contextId && !event.contextIds.includes(contextId)) continue;
    if (!ratings.has(event.leftValueId) || !ratings.has(event.rightValueId)) continue;
    const [left, right] = system.update(ratings.get(event.leftValueId)!, ratings.get(event.rightValueId)!, event);
    ratings.set(event.leftValueId, left);
    ratings.set(event.rightValueId, right);
  }
  return ratings;
}

export function conservativeScore(rating: Rating, k: number): number {
  return rating.mu - k * rating.sigma;
}

export function isRankedEvent(event: RatingEvent): boolean {
  return rankedResults.includes(event.result);
}
