import { describe, expect, it } from "vitest";
import { deriveScenario } from "@/domain/scenarios";

describe("definition-derived scenarios", () => {
  it("builds a scenario from the active context and definitions", () => {
    const result = deriveScenario({
      contexts: ["Work"], purpose: "Choose a career direction", question: 1,
      values: [
        { name: "Security", definition: "Maintain dependable foundations.", category: "Stability" },
        { name: "Adventure", definition: "Seek novel and stretching experience.", category: "Exploration" },
      ],
    });
    expect(result.provider).toBe("local");
    expect(result.text).toContain("Work");
    expect(result.text).toContain("maintain dependable foundations");
  });
});
