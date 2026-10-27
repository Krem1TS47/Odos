/**
 * Semantic tier contract (eng review R6b).
 *
 * A SemanticProvider is asked to pick ONE of the user's stored answers, ONE of the
 * field's options, or "none" for a question the lexical matcher could not resolve.
 * The output is validated against the request (enum / index bounds / confidence) and
 * accepted only above SEMANTIC_ACCEPT_FLOOR. Providers never see profile PII beyond the
 * answer bank; the request carries only the question, its section, options and answers.
 */

export interface SemanticCandidateAnswer {
  id: string;
  answer: string;
  patterns: string[];
}

export interface SemanticRequest {
  question: string;
  section?: string;
  fieldType: string;
  options?: string[];
  candidates: SemanticCandidateAnswer[];
}

export type SemanticDecisionKind = 'answer' | 'option' | 'none';

export interface SemanticDecision {
  kind: SemanticDecisionKind;
  answerId?: string;
  optionIndex?: number;
  confidence: number;
  rationale?: string;
}

export interface SemanticProvider {
  readonly id: string;
  /** Cheap availability probe (model present, API exposed, opt-in satisfied). */
  isAvailable(): Promise<boolean>;
  /** Returns the raw model output; validation happens in SemanticMatcher. */
  decide(request: SemanticRequest, signal?: AbortSignal): Promise<unknown>;
}

/** Minimum confidence for a semantic decision to be applied. */
export const SEMANTIC_ACCEPT_FLOOR = 0.75;

/** Function shape injected into the autofill engine (content script -> background). */
export type SemanticMatchFn = (request: SemanticRequest) => Promise<SemanticDecision | null>;
