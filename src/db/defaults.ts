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
  quiz: {
    defaultChoiceCount: 5,
    defaultDomainId: "general-life",
    domains: [
      {
        id: "general-life",
        name: "General",
        valueSetId: "preset:broad-100",
        contextPrompt: "Choices across life as a whole",
        archived: false,
      },
      {
        id: "politics",
        name: "Politics",
        valueSetId: "preset:broad-100",
        contextPrompt: "Public policy and civic tradeoffs",
        archived: false,
      },
      {
        id: "work",
        name: "Work",
        valueSetId: "preset:broad-100",
        contextPrompt: "Career, craft, and organizational decisions",
        archived: false,
      },
      {
        id: "relationships",
        name: "Relationships",
        valueSetId: "preset:broad-100",
        contextPrompt: "Close relationships and interpersonal commitments",
        archived: false,
      },
      {
        id: "lifestyle",
        name: "Lifestyle",
        valueSetId: "preset:broad-100",
        contextPrompt: "Daily routines, consumption, and ways of living",
        archived: false,
      },
      {
        id: "creativity",
        name: "Creativity",
        valueSetId: "preset:broad-100",
        contextPrompt: "Expression, experimentation, and making",
        archived: false,
      },
      {
        id: "community",
        name: "Community",
        valueSetId: "preset:broad-100",
        contextPrompt: "Civic life, belonging, and collective welfare",
        archived: false,
      },
      {
        id: "custom",
        name: "Custom",
        valueSetId: "",
        contextPrompt: "User-defined context",
        archived: false,
      },
    ],
  },
} as const;

export type AppSettings = typeof DEFAULT_SETTINGS;
