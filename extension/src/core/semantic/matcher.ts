import {
  SEMANTIC_ACCEPT_FLOOR,
  SemanticDecision,
  SemanticProvider,
  SemanticRequest
} from './types';

export interface SemanticMatcherOptions {
  timeoutMs?: number;
  acceptFloor?: number;
}

/**
 * Validates raw provider output against the request. Anything outside the allowed set
 * (unknown answer id, option index out of range, confidence not in [0,1]) is rejected.
 */
export function validateDecision(raw: unknown, request: SemanticRequest): SemanticDecision | null {
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try {
        obj = JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
  }
  if (!obj || typeof obj !== 'object') return null;

  const kind = obj.kind;
  const confidence = typeof obj.confidence === 'number' ? obj.confidence : Number(obj.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  const rationale = typeof obj.rationale === 'string' ? obj.rationale.slice(0, 200) : undefined;

  if (kind === 'none') return { kind: 'none', confidence, rationale };

  if (kind === 'answer') {
    const answerId = typeof obj.answerId === 'string' ? obj.answerId : undefined;
    if (!answerId || !request.candidates.some((c) => c.id === answerId)) return null;
    return { kind: 'answer', answerId, confidence, rationale };
  }

  if (kind === 'option') {
    const idx = typeof obj.optionIndex === 'number' ? obj.optionIndex : Number(obj.optionIndex);
    if (!Number.isInteger(idx) || !request.options || idx < 0 || idx >= request.options.length) return null;
    return { kind: 'option', optionIndex: idx, confidence, rationale };
  }

  return null;
}

/**
 * Wraps a provider with availability caching, a timeout, output validation and the
 * acceptance gate. Returns null whenever the semantic tier should stay silent.
 */
export class SemanticMatcher {
  private availability: Promise<boolean> | null = null;
  private readonly timeoutMs: number;
  private readonly acceptFloor: number;

  constructor(private readonly provider: SemanticProvider, options: SemanticMatcherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 2500;
    this.acceptFloor = options.acceptFloor ?? SEMANTIC_ACCEPT_FLOOR;
  }

  get providerId(): string {
    return this.provider.id;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.availability) {
      this.availability = this.provider.isAvailable().catch(() => false);
    }
    return this.availability;
  }

  async match(request: SemanticRequest): Promise<SemanticDecision | null> {
    if (!request.question || (request.candidates.length === 0 && !(request.options && request.options.length > 0))) {
      return null;
    }
    if (!(await this.isAvailable())) return null;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const raw = await Promise.race([
        this.provider.decide(request, controller?.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller?.abort();
            reject(new Error('semantic_timeout'));
          }, this.timeoutMs);
        })
      ]);
      const decision = validateDecision(raw, request);
      if (!decision) return null;
      if (decision.kind === 'none') return decision;
      if (decision.confidence < this.acceptFloor) return { kind: 'none', confidence: decision.confidence, rationale: 'below_floor' };
      return decision;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
