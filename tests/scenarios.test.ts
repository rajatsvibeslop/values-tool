import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildScenarioProfiles,
  deriveScenario,
  extractScenarioChoices,
  extractScenarioText,
  OpenAICompatibleScenarioProvider,
  scenarioHasSharedAnchor,
} from "@/domain/scenarios";

const request = {
  contexts: ["Work"],
  purpose: "Choose a career direction",
  question: 1,
  values: [
    { id: "security", name: "Security", definition: "Maintain dependable foundations.", category: "Stability" },
    { id: "adventure", name: "Adventure", definition: "Seek novel and stretching experience.", category: "Exploration" },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("definition-derived scenarios", () => {
  it("builds a scenario from the active context and definitions", () => {
    const result = deriveScenario(request);
    expect(result.provider).toBe("local");
    expect(result.text).toContain("Work");
    expect(result.choices).toHaveLength(2);
    expect(result.choices?.every((choice) => choice.focalValueId)).toBe(true);
  });

  it("normalizes JSON and multipart provider responses", () => {
    expect(
      extractScenarioText([
        { type: "text", text: "```json\n" },
        { type: "text", text: '{"scenario":"A concrete decision with competing obligations."}' },
        { type: "text", text: "\n```" },
      ]),
    ).toBe("A concrete decision with competing obligations.");
  });

  it("maps generated portraits to focal values assigned before generation", () => {
    const profiles = buildScenarioProfiles(request.values, "fixed-seed");
    const content = JSON.stringify({
      scenario: "A difficult choice.",
      choices: [
        { id: "A", action: "Take the reliable role and build creative work around it." },
        { id: "B", action: "Take the uncertain role and preserve a practical fallback." },
      ],
    });
    const choices = extractScenarioChoices(content, profiles);
    expect(choices).toHaveLength(2);
    expect(choices.map((choice) => choice.focalValueId)).toEqual(
      profiles.map((profile) => profile.focalValueId),
    );
  });

  it("rejects portraits that splice unrelated decisions together", () => {
    expect(scenarioHasSharedAnchor(JSON.stringify({
      scenario: "A firm offers the Sunday project, which conflicts with a standing commitment.",
      anchor: "the Sunday project",
      choices: [
        { id: "A", action: "Decline the Sunday project and keep the commitment." },
        { id: "B", action: "Refuse a promotion because its product has safety flaws." },
      ],
    }))).toBe(false);
    expect(scenarioHasSharedAnchor(JSON.stringify({
      scenario: "A firm offers the Sunday project, which conflicts with a standing commitment.",
      anchor: "the Sunday project",
      choices: [
        { id: "A", action: "Decline the Sunday project and keep the commitment." },
        { id: "B", action: "Accept the Sunday project and arrange substitute coverage." },
      ],
    }))).toBe(true);
  });

  it("disables DeepSeek thinking so the output budget reaches final content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "deepseek-v4-flash",
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
            scenario: "The promotion offers security but leaves little time for meaningful creative work.",
            anchor: "the promotion",
            choices: [
              { id: "A", action: "Accept the promotion and protect a weekly block for experimentation." },
              { id: "B", action: "Decline the promotion and pursue uncertain work with a financial fallback." },
            ],
          }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleScenarioProvider({
      provider: "deepseek",
      apiKey: "test-key",
    });

    const result = await provider.generate(request);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      thinking: unknown;
      max_tokens: number;
      messages: { content: string }[];
    };
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.max_tokens).toBe(400);
    expect(body.messages[1]?.content).toContain("must not introduce any fact");
    expect(result.text).toContain("promotion offers security");
    expect(result.choices).toHaveLength(2);
    expect(new Set(result.choices?.map((choice) => choice.focalValueId)).size).toBe(2);
  });

  it("surfaces provider errors even when the HTTP response is successful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "No free provider available" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const provider = new OpenAICompatibleScenarioProvider({
      provider: "deepseek",
      apiKey: "test-key",
    });
    await expect(provider.generate(request)).rejects.toThrow("No free provider available");
  });
});
