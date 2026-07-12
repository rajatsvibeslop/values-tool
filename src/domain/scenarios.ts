export interface ScenarioValue {
  id?: string;
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
  choices?: ScenarioChoice[];
}

export interface ScenarioChoice {
  id: string;
  text: string;
  valueOrder: string[];
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
  const actionCount = Math.min(3, input.values.length);
  const finalLabel = String.fromCharCode(64 + actionCount);
  const exampleOrder = input.values.map((_, index) => index).join(",");
  return `Create one concrete, realistic decision scenario and ${actionCount} possible actions for a personal-values ranking exercise.

Requirements:
- Make all supplied values genuinely relevant and in tension.
- Do not name the values or reveal a preferred answer.
- Use the supplied definitions, not stereotypes about the labels.
- Use the context and session purpose when supplied.
- Write the scenario in 2 concise sentences, under 70 words total.
- Write ${actionCount} distinct, concrete actions labeled A through ${finalLabel}, each under 24 words.
- Keep every action plausible. Each action must prioritize a different supplied value first,
  while also implying a complete priority order over all five values.
- For each action, include that hidden order as value_order: a permutation of the integer
  indices 0 through ${input.values.length - 1}. The action text must not reveal those indices or value names.
- Return only JSON in this shape:
  {"scenario":"...","choices":[{"id":"A","action":"...","value_order":[${exampleOrder}]}]}.

Context: ${input.contexts.join(", ") || "General life"}
Purpose: ${input.purpose || "Clarify personal priorities"}
Values:
${input.values.map((value, index) => `${index}. ${value.name}: ${value.definition || "No definition supplied"} (${value.category || "uncategorized"})`).join("\n")}`;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(contentText).filter(Boolean).join("");
  if (!content || typeof content !== "object") return "";
  const part = content as { text?: unknown; content?: unknown };
  if (typeof part.text === "string") return part.text;
  return contentText(part.content);
}

export function extractScenarioText(content: unknown): string {
  const raw = contentText(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { scenario?: unknown; text?: unknown };
    const scenario = contentText(parsed.scenario ?? parsed.text).trim();
    return scenario || raw;
  } catch {
    return raw;
  }
}

export function extractScenarioChoices(
  content: unknown,
  values: ScenarioValue[],
): ScenarioChoice[] {
  const raw = contentText(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      choices?: unknown;
      options?: unknown;
    };
    const options = parsed.choices ?? parsed.options;
    if (!Array.isArray(options)) return [];
    return options.flatMap((option, optionIndex) => {
      if (!option || typeof option !== "object") return [];
      const item = option as {
        id?: unknown;
        action?: unknown;
        text?: unknown;
        value_order?: unknown;
        valueOrder?: unknown;
        priority_order?: unknown;
      };
      const text = contentText(item.action ?? item.text).trim();
      const rawOrder = item.value_order ?? item.valueOrder ?? item.priority_order;
      if (!text || !Array.isArray(rawOrder) || rawOrder.length !== values.length) return [];
      const indices = rawOrder.map((index) =>
        typeof index === "number" ? index : Number.parseInt(String(index), 10),
      );
      if (
        indices.some((index) => !Number.isInteger(index) || index < 0 || index >= values.length) ||
        new Set(indices).size !== values.length
      )
        return [];
      return [{
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : String.fromCharCode(65 + optionIndex),
        text: clean(text),
        valueOrder: indices.map((index) => values[index]!.id ?? values[index]!.name),
      }];
    });
  } catch {
    return [];
  }
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
        // The free router can select a mandatory-reasoning model. Its internal
        // tokens share this budget, so leave room for a short final answer.
        max_tokens: openRouter ? 1_400 : 400,
        response_format: { type: "json_object" },
        ...(openRouter
          ? { reasoning: { effort: "low", exclude: true } }
          : { thinking: { type: "disabled" } }),
      }),
    });
    const payload = (await response.json()) as {
      choices?: {
        finish_reason?: string;
        message?: { content?: unknown };
        delta?: { content?: unknown };
        text?: unknown;
      }[];
      error?: { message?: string };
      model?: string;
    };
    if (!response.ok || payload.error)
      throw new Error(payload.error?.message || `Scenario request failed (${response.status})`);
    const choice = payload.choices?.[0];
    const content = choice?.message?.content ?? choice?.delta?.content ?? choice?.text;
    const scenario = extractScenarioText(content);
    if (!scenario) {
      const suffix = choice?.finish_reason === "length" ? " (output limit reached)" : "";
      throw new Error(`The hosted model did not produce a final scenario${suffix}`);
    }
    if (scenario.length < 20) throw new Error("The generated scenario was too short");
    return {
      text: clean(scenario),
      provider: this.config.provider,
      model: payload.model || model,
      generatedAt: new Date().toISOString(),
      choices: extractScenarioChoices(content, input.values),
    };
  }
}
