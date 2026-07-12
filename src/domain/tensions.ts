import type { RatingEvent } from "./types";

export interface TensionSuggestion {
  type: "cycle" | "reversal" | "context" | "low-confidence" | "explicit-reversal";
  title: string; description: string; valueIds: string[]; contextIds: string[]; eventIds: string[]; severity: "low" | "medium" | "high";
}

function winnerLoser(event: RatingEvent): [string, string] | null {
  if (event.result === "left") return [event.leftValueId, event.rightValueId];
  if (event.result === "right") return [event.rightValueId, event.leftValueId];
  return null;
}

export function detectCycles(events: RatingEvent[]): TensionSuggestion[] {
  const edges = new Map<string, Map<string, string[]>>();
  for (const event of events) {
    const pair = winnerLoser(event); if (!pair) continue;
    if (!edges.has(pair[0])) edges.set(pair[0], new Map());
    edges.get(pair[0])!.set(pair[1], [...(edges.get(pair[0])!.get(pair[1]) ?? []), event.id]);
  }
  const ids = [...new Set(events.flatMap((event) => [event.leftValueId, event.rightValueId]))].sort();
  const suggestions: TensionSuggestion[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (let k = j + 1; k < ids.length; k++) {
    const triples = [[ids[i]!, ids[j]!, ids[k]!], [ids[i]!, ids[k]!, ids[j]!]];
    for (const [a, b, c] of triples) if (edges.get(a)?.has(b) && edges.get(b)?.has(c) && edges.get(c)?.has(a)) {
      suggestions.push({ type: "cycle", title: "Preference cycle detected", description: "Recent choices imply a non-transitive ordering among three values.", valueIds: [a, b, c], contextIds: [], eventIds: [...edges.get(a)!.get(b)!, ...edges.get(b)!.get(c)!, ...edges.get(c)!.get(a)!], severity: "high" });
      break;
    }
  }
  return suggestions;
}

export function detectReversals(events: RatingEvent[]): TensionSuggestion[] {
  const groups = new Map<string, RatingEvent[]>();
  const key = (event: RatingEvent) => [event.leftValueId, event.rightValueId].sort().join(":");
  for (const event of events) groups.set(key(event), [...(groups.get(key(event)) ?? []), event]);
  const suggestions: TensionSuggestion[] = [];
  for (const pairEvents of groups.values()) {
    const outcomes = pairEvents.map(winnerLoser).filter((result): result is [string, string] => Boolean(result));
    const reversed = outcomes.some((outcome, i) => outcomes.some((other, j) => i !== j && outcome[0] === other[1] && outcome[1] === other[0]));
    if (!reversed) continue;
    const contexts = [...new Set(pairEvents.flatMap((event) => event.contextIds))];
    const contextDependent = pairEvents.some((event, i) => pairEvents.some((other, j) => i !== j && winnerLoser(event)?.[0] !== winnerLoser(other)?.[0] && event.contextIds.join() !== other.contextIds.join()));
    suggestions.push({ type: contextDependent ? "context" : "reversal", title: contextDependent ? "Context-dependent reversal" : "Repeated pair reversed", description: contextDependent ? "The preferred value changes across contexts." : "The same pair produced opposing choices over time.", valueIds: [...new Set(pairEvents.flatMap((event) => [event.leftValueId, event.rightValueId]))], contextIds: contexts, eventIds: pairEvents.map((event) => event.id), severity: contextDependent ? "medium" : "high" });
  }
  return suggestions;
}

export function detectTensions(events: RatingEvent[]): TensionSuggestion[] {
  return [...detectCycles(events), ...detectReversals(events)];
}
