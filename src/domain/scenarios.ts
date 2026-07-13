export interface ScenarioValue {
  id?: string;
  name: string;
  definition: string;
  category: string;
}

export interface ScenarioRequest {
  values: ScenarioValue[];
  contexts: string[];
  contextText?: string;
  domain?: string;
  choiceCount: number;
  purpose: string;
  question: number;
  profiles?: ScenarioProfile[];
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
  focalValueId: string;
}

export interface ScenarioProfile {
  id: string;
  focalValueId: string;
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

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index++) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function buildScenarioProfiles(
  values: ScenarioValue[],
  seed: string,
  count = 3,
): ScenarioProfile[] {
  return [...values]
    .sort(
      (left, right) =>
        hash(`${seed}:${left.id ?? left.name}`) - hash(`${seed}:${right.id ?? right.name}`),
    )
    .slice(0, Math.min(Math.max(2, count), values.length))
    .map((value, index) => ({
      id: String.fromCharCode(65 + index),
      focalValueId: value.id ?? value.name,
    }));
}

export function deriveScenario(input: ScenarioRequest): GeneratedScenario {
  const context = input.contextText?.trim() || (input.contexts.length ? input.contexts.join(" and ") : "an important life decision");
  const profiles = input.profiles?.length
    ? input.profiles
    : buildScenarioProfiles(input.values, `${input.purpose}:${input.question}`, input.choiceCount);
  return {
    text: `${input.domain ? `${input.domain}: ` : ""}In ${context}, several people face the same consequential decision. Each protects something important while accepting a different cost.`,
    provider: "local",
    model: "definition-derived",
    generatedAt: new Date().toISOString(),
    choices: profiles.map((profile) => {
      const value = input.values.find(
        (item) => (item.id ?? item.name) === profile.focalValueId,
      )!;
      const priority = clean(value.definition).replace(/[.!?]+$/, "").toLowerCase();
      return {
        id: profile.id,
        focalValueId: profile.focalValueId,
        text: `Chooses the path that best protects ${priority}, accepting tradeoffs elsewhere.`,
      };
    }),
  };
}

function scenarioPrompt(input: ScenarioRequest & { profiles: ScenarioProfile[] }) {
  const actionCount = input.profiles.length;
  const finalLabel = String.fromCharCode(64 + actionCount);
  return `Create one concrete, realistic decision scenario and ${actionCount} possible actions for a personal-values portrait exercise.

Requirements:
- Make all supplied values genuinely relevant and in tension.
- Do not name the values or reveal a preferred answer.
- Use the supplied definitions, not stereotypes about the labels.
- Use the domain, freeform context, and session purpose when supplied.
- Thread the freeform details directly into the scenario facts so the result can reflect the user's life, job, and situation.
- Establish exactly one shared decision, one set of actors, and one set of facts.
- Every action must respond to that exact decision. Actions must not introduce any fact,
  obligation, relationship, hazard, organization, or constraint absent from the scenario.
- Include every fact needed to understand every action in the shared scenario.
- Choose a concrete 2-7 word decision anchor that names the central decision object.
  Include that exact anchor verbatim in the scenario and in every action so coherence is verifiable.
- Keep the outcome stakes constant across people; vary only which concern guides their response.
- Write the scenario in 2 concise sentences, under 70 words total.
- Write ${actionCount} distinct, concrete actions labeled A through ${finalLabel}, each under 24 words.
- Each action belongs to an anonymous person and must primarily express its assigned focal value.
- Match feasibility, competence, kindness, risk, and social desirability across the actions as closely as possible.
- Vary the value tradeoff, not demographic details, writing style, or how admirable the person sounds.
- The action text must not reveal value names, value indices, or a preferred answer.
- Return only JSON in this shape:
  {"scenario":"...","anchor":"the exact shared decision","choices":[{"id":"A","action":"..."}]}.

Domain: ${input.domain || "General life"}
Context: ${input.contextText || input.contexts.join(", ") || "General life"}
Purpose: ${input.purpose || "Clarify personal priorities"}
Values:
${input.values.map((value, index) => `${index}. ${value.name}: ${value.definition || "No definition supplied"} (${value.category || "uncategorized"})`).join("\n")}

Hidden portrait assignments:
${input.profiles.map((profile) => {
  const value = input.values.find((item) => (item.id ?? item.name) === profile.focalValueId)!;
  return `- Person ${profile.id}: primarily express ${value.name} -- ${value.definition}`;
}).join("\n")}`;
}

function scenarioResponseFormat(input: ScenarioRequest & { profiles: ScenarioProfile[] }) {
  const actionCount = input.profiles.length;
  return {
    type: "json_schema",
    json_schema: {
      name: "value_decision_scenario",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          scenario: { type: "string", minLength: 20, maxLength: 600 },
          anchor: { type: "string", minLength: 5, maxLength: 80 },
          choices: {
            type: "array",
            minItems: actionCount,
            maxItems: actionCount,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", enum: Array.from({ length: actionCount }, (_, index) => String.fromCharCode(65 + index)) },
                action: { type: "string", minLength: 12, maxLength: 240 },
              },
              required: ["id", "action"],
            },
          },
        },
        required: ["scenario", "anchor", "choices"],
      },
    },
  };
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(contentText).filter(Boolean).join("");
  if (!content || typeof content !== "object") return "";
  if ("scenario" in content || "choices" in content) return JSON.stringify(content);
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
  profiles: ScenarioProfile[],
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
      };
      const id = typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : String.fromCharCode(65 + optionIndex);
      const text = contentText(item.action ?? item.text).trim();
      const profile = profiles.find((item) => item.id === id);
      if (!text || !profile) return [];
      return [{
        id,
        text: clean(text),
        focalValueId: profile.focalValueId,
      }];
    });
  } catch {
    return [];
  }
}

export function scenarioHasSharedAnchor(content: unknown): boolean {
  const raw = contentText(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(raw) as {
      scenario?: unknown;
      anchor?: unknown;
      choices?: unknown;
    };
    const anchor = clean(contentText(parsed.anchor)).toLocaleLowerCase();
    const anchorTokens = anchor
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 2 && !["the", "this", "that"].includes(token));
    const containsAnchor = (value: unknown) => {
      const tokens = new Set(
        clean(contentText(value))
          .toLocaleLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .split(" ")
          .filter(Boolean),
      );
      return anchorTokens.length > 0 && anchorTokens.every((token) => tokens.has(token));
    };
    if (!anchor || !containsAnchor(parsed.scenario)) return false;
    if (!Array.isArray(parsed.choices) || !parsed.choices.length) return false;
    return parsed.choices.every((choice) => {
      if (!choice || typeof choice !== "object") return false;
      const item = choice as { action?: unknown; text?: unknown };
      return containsAnchor(item.action ?? item.text);
    });
  } catch {
    return false;
  }
}

export class OpenAICompatibleScenarioProvider implements ScenarioProvider {
  readonly id: string;
  constructor(private readonly config: HostedScenarioConfig) {
    this.id = config.provider;
  }

  async generate(input: ScenarioRequest): Promise<GeneratedScenario> {
    if (!this.config.apiKey.trim()) throw new Error("An API key is required for hosted scenarios");
    const request = {
      ...input,
      profiles:
        input.profiles?.length
          ? input.profiles
          : buildScenarioProfiles(input.values, `${input.purpose}:${input.question}`, input.choiceCount),
    };
    const openRouter = this.config.provider === "openrouter";
    const endpoint = openRouter
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.deepseek.com/chat/completions";
    const configuredModel = this.config.model?.trim();
    const obsoleteFreeModel = configuredModel === "deepseek/deepseek-v4-flash:free";
    const model = openRouter
      ? !configuredModel || obsoleteFreeModel
        ? "google/gemma-4-26b-a4b-it:free"
        : configuredModel
      : configuredModel || "deepseek-v4-flash";
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
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
          { role: "system", content: "You design tightly controlled factorial-survey vignettes. All portraits must respond to the same stated facts; never splice together separate scenarios." },
          { role: "user", content: scenarioPrompt(request) },
        ],
        temperature: 0.45,
        // The free router can select a mandatory-reasoning model. Its internal
        // tokens share this budget, so leave room for a short final answer.
        max_tokens: openRouter ? 600 : 400,
        response_format: openRouter
          ? scenarioResponseFormat(request)
          : { type: "json_object" },
        ...(openRouter
          ? {
              plugins: [{ id: "response-healing" }],
              provider: {
                require_parameters: true,
                allow_fallbacks: true,
                sort: "latency",
                preferred_max_latency: { p90: 8 },
              },
            }
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
    const choices = extractScenarioChoices(content, request.profiles);
    if (choices.length !== request.profiles.length)
      throw new Error("The hosted model did not produce the required usable actions");
    if (!scenarioHasSharedAnchor(content))
      throw new Error("The hosted model produced choices that did not share one decision");
    return {
      text: clean(scenario),
      provider: this.config.provider,
      model: payload.model || model,
      generatedAt: new Date().toISOString(),
      choices,
    };
  }
}
