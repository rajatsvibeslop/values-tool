export interface ScenarioValue {
  name: string;
  definition: string;
  category: string;
}

export interface ScenarioRequest {
  values: ScenarioValue[];
  contexts: string[];
  purpose: string;
  question: number;
}

export interface GeneratedScenario {
  text: string;
  provider: string;
  model: string;
  generatedAt: string;
}

export interface ScenarioProvider {
  readonly id: string;
  generate(input: ScenarioRequest): Promise<GeneratedScenario>;
}

export type HostedScenarioProvider = "openrouter" | "deepseek";

export interface HostedScenarioConfig {
  provider: HostedScenarioProvider;
  apiKey: string;
  model?: string;
}

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export function deriveScenario(input: ScenarioRequest): GeneratedScenario {
  const context = input.contexts.length ? input.contexts.join(" and ") : "an important life decision";
  const stakes = input.values
    .map((value) => clean(value.definition).replace(/[.!?]+$/, "").toLowerCase())
    .filter(Boolean);
  const text = stakes.length
    ? `In ${context}, imagine a consequential choice with real tradeoffs among ${stakes.join("; ")}. No option protects everything. Rank the values by what should guide the decision.`
    : `In ${context}, imagine a consequential choice where these priorities point toward different actions. Rank them by what should guide the decision.`;
  return {
    text,
    provider: "local",
    model: "definition-derived",
    generatedAt: new Date().toISOString(),
  };
}

function scenarioPrompt(input: ScenarioRequest) {
  return `Create one concrete, realistic decision scenario for a personal-values ranking exercise.

Requirements:
- Make all supplied values genuinely relevant and in tension.
- Do not name the values or reveal a preferred answer.
- Use the supplied definitions, not stereotypes about the labels.
- Use the context and session purpose when supplied.
- Write 2 concise sentences, under 70 words total.
- Return only JSON: {"scenario":"..."}.

Context: ${input.contexts.join(", ") || "General life"}
Purpose: ${input.purpose || "Clarify personal priorities"}
Values:
${input.values.map((value) => `- ${value.name}: ${value.definition || "No definition supplied"} (${value.category || "uncategorized"})`).join("\n")}`;
}

export class OpenAICompatibleScenarioProvider implements ScenarioProvider {
  readonly id: string;
  constructor(private readonly config: HostedScenarioConfig) {
    this.id = config.provider;
  }

  async generate(input: ScenarioRequest): Promise<GeneratedScenario> {
    if (!this.config.apiKey.trim()) throw new Error("An API key is required for hosted scenarios");
    const openRouter = this.config.provider === "openrouter";
    const endpoint = openRouter
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.deepseek.com/chat/completions";
    const model =
      this.config.model?.trim() ||
      (openRouter ? "openrouter/free" : "deepseek-v4-flash");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey.trim()}`,
        "Content-Type": "application/json",
        ...(openRouter
          ? {
              "HTTP-Referer": location.origin + location.pathname,
              "X-OpenRouter-Title": "Values Tool",
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You design neutral behavioral decision scenarios for reflective research." },
          { role: "user", content: scenarioPrompt(input) },
        ],
        temperature: 0.7,
        max_tokens: 180,
        response_format: { type: "json_object" },
      }),
    });
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(payload.error?.message || `Scenario request failed (${response.status})`);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("The scenario provider returned no text");
    let scenario = content;
    try {
      scenario = (JSON.parse(content) as { scenario?: string }).scenario || content;
    } catch {
      scenario = content.replace(/^```(?:json)?|```$/g, "").trim();
    }
    if (scenario.length < 20) throw new Error("The generated scenario was too short");
    return {
      text: clean(scenario),
      provider: this.config.provider,
      model,
      generatedAt: new Date().toISOString(),
    };
  }
}
