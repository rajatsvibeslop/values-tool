import type { Rating } from "./types";

function seeded(seed: number): () => number {
  let x = seed | 0;
  return () => {
    x |= 0; x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSample(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export interface RankEstimate { low: number; high: number; topKProbability: number }

export function estimateRanks(ratings: Map<string, Rating>, topK: number, iterations = 2000, seed = 1729): Map<string, RankEstimate> {
  const ids = [...ratings.keys()].sort();
  const samples = new Map(ids.map((id) => [id, [] as number[]]));
  const random = seeded(seed);
  for (let i = 0; i < iterations; i++) {
    const ordered = ids.map((id) => ({ id, score: ratings.get(id)!.mu + ratings.get(id)!.sigma * normalSample(random) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    ordered.forEach((item, rank) => samples.get(item.id)!.push(rank + 1));
  }
  return new Map(ids.map((id) => {
    const ranks = samples.get(id)!.sort((a, b) => a - b);
    const low = ranks[Math.floor(iterations * 0.05)] ?? 1;
    const high = ranks[Math.floor(iterations * 0.95)] ?? ids.length;
    return [id, { low, high, topKProbability: ranks.filter((rank) => rank <= topK).length / iterations }];
  }));
}

export function spearmanRankCorrelation(a: string[], b: string[]): number {
  const common = a.filter((id) => b.includes(id));
  if (common.length < 2) return 1;
  const bRanks = new Map(b.map((id, i) => [id, i]));
  const sum = common.reduce((total, id, i) => total + (i - bRanks.get(id)!) ** 2, 0);
  return 1 - (6 * sum) / (common.length * (common.length ** 2 - 1));
}
