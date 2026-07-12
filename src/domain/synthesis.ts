export interface SynthesisEvidence {
  eventId: string;
  originalText: string;
  relationship: "supports" | "contradicts";
}

export interface DraftSynthesis {
  text: string;
  claimType: string;
  evidence: SynthesisEvidence[];
  creationMethod: "ai";
  status: "draft";
}

export interface SynthesisProvider {
  readonly id: string;
  synthesize(input: { valueName: string; evidence: SynthesisEvidence[] }): Promise<DraftSynthesis[]>;
}

export class NoSynthesisProvider implements SynthesisProvider {
  readonly id = "none";
  async synthesize(): Promise<DraftSynthesis[]> { return []; }
}
