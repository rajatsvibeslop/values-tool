import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveScenario,
  extractScenarioChoices,
  extractScenarioText,
  OpenAICompatibleScenarioProvider,
} from "@/domain/scenarios";

const request = {
  contexts: ["Work"],
  purpose: "Choose a career direction",
  question: 1,
  values: [
    { name: "Security", definition: "Maintain dependable foundations.", category: "Stability" },
    { name: "Adventure", definition: "Seek novel and stretching experience.", category: "Exploration" },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("definition-derived scenarios", () => {
  it("builds a scenario from the active context and definitions", () => {
    const result = deriveScenario(request);
    expect(result.provider).toBe("local");
    expect(result.text).toContain("Work");
    expect(result.text).toContain("maintain dependable foundations");
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

  it("maps generated actions back to a validated hidden value order", () => {
    const content = JSON.stringify({
      scenario: "A difficult choice.",
      choices: [
        { id: "A", action: "Take the reliable role and build creative work around it.", value_order: [0, 1] },
        { id: "B", action: "Take the uncertain role and preserve a practical fallback.", value_order: [1, 0] },
        { id: "C", action: "Negotiate a trial period before making a permanent commitment.", value_order: [1, 0] },
      ],
    });
    const choices = extractScenarioChoices(content, request.values.map((value, index) => ({
      ...value,
      id: `value-${index}`,
    })));
    expect(choices).toHaveLength(3);
    expect(choices[0]?.valueOrder).toEqual(["value-0", "value-1"]);
    expect(choices[1]?.valueOrder).toEqual(["value-1", "value-0"]);
  });

  it("disables DeepSeek thinking so the output budget reaches final content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "deepseek-v4-flash",
          choices: [{ finish_reason: "stop", message: { content: '{"scenario":"A promotion offers security but leaves little time for meaningful creative work."}' } }],
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
    const body = JSON.parse(String(init.body)) as { thinking: unknown; max_tokens: number };
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.max_tokens).toBe(400);
    expect(result.text).toContain("promotion offers security");
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
