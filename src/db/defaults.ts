export const DEFAULT_CONTEXTS = [
  ["general-life", "General life", "Choices across life as a whole"],
  ["work", "Work", "Career, craft, and organizational decisions"],
  ["relationships", "Relationships", "Close relationships and interpersonal commitments"],
  ["morality", "Morality", "Ethical duties, principles, and difficult tradeoffs"],
  ["lifestyle", "Lifestyle", "Daily routines, consumption, and ways of living"],
  ["creativity", "Creativity", "Expression, experimentation, and making"],
  ["community", "Community", "Civic life, belonging, and collective welfare"],
] as const;

export const DEFAULT_SETTINGS = {
  rating: { mu: 25, sigma: 25 / 3, beta: 25 / 6, tau: 25 / 300, drawProbability: 0.1, conservativeK: 3, modifiersEnabled: false },
  selection: { uncertainty: 1, similarity: 1.2, topFocus: 0.8, boundary: 1, coverage: 1.1, retest: 0.5, crossCategory: 0.35, contradiction: 0.8, contextDisagreement: 0.8 },
  convergence: { topK: 5, minimumComparisons: 5, stabilityWindow: 5, uncertaintyThreshold: 3, retestFrequency: 12, tiersSufficient: true },
  display: { showRatingsDuringComparison: false, theme: "system" },
  export: { includeArchived: true, includeSnapshots: true },
} as const;

export type AppSettings = typeof DEFAULT_SETTINGS;
