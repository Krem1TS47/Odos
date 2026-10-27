import { SemanticProvider, SemanticRequest } from './types';
import { contentTokens } from '../answerMatcher';

const SYNONYMS: Record<string, string> = {
  authorization: 'author', authorized: 'author', authorised: 'author', eligible: 'author', eligibility: 'author', permitted: 'author',
  visa: 'sponsor', sponsorship: 'sponsor', immigration: 'sponsor',
  relocating: 'reloc', relocate: 'reloc', relocation: 'reloc', moving: 'reloc', move: 'reloc',
  discovered: 'hear', discover: 'hear', learn: 'hear', learned: 'hear', find: 'hear', found: 'hear', hear: 'hear', heard: 'hear', referral: 'hear', source: 'hear',
  salary: 'pay', compensation: 'pay', pay: 'pay', expectations: 'pay', expected: 'pay',
  begin: 'start', start: 'start', available: 'start', availability: 'start', earliest: 'start',
  employed: 'work', worked: 'work', employment: 'work', work: 'work',
  eighteen: '18', '18': '18', age: 'age', older: 'age', over: 'age',
  previously: 'before', before: 'before', ever: 'before', prior: 'before',
  need: 'require', needs: 'require', needed: 'require', require: 'require', required: 'require'
};

function canon(token: string): string {
  const t = token.toLowerCase();
  if (SYNONYMS[t]) return SYNONYMS[t];
  return t.length > 6 ? t.slice(0, 6) : t;
}

function canonTokens(text: string): string[] {
  return Array.from(new Set(contentTokens(text).map(canon)));
}

/**
 * Deterministic provider for tests and offline evals. Scores candidates by content-token
 * overlap between the question and each candidate's patterns, then (if options exist)
 * maps the chosen answer onto the option list. Scripted responses can be injected for
 * adversarial tests (out-of-range indexes, unknown ids, malformed JSON).
 */
export class MockSemanticProvider implements SemanticProvider {
  readonly id = 'mock';
  private scripted: unknown[] = [];

  constructor(private readonly available = true) {}

  script(...responses: unknown[]): void {
    this.scripted.push(...responses);
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async decide(request: SemanticRequest): Promise<unknown> {
    if (this.scripted.length > 0) return this.scripted.shift();

    const q = new Set(canonTokens(request.question));
    let best: { id: string; answer: string; score: number } | null = null;
    for (const c of request.candidates) {
      let s = 0;
      for (const p of c.patterns) {
        const toks = canonTokens(p);
        if (toks.length === 0) continue;
        const inter = toks.filter((t) => q.has(t)).length;
        const denom = Math.min(toks.length, q.size);
        s = Math.max(s, denom === 0 ? 0 : inter / denom);
      }
      if (!best || s > best.score) best = { id: c.id, answer: c.answer, score: s };
    }
    if (!best || best.score < 0.5) return { kind: 'none', confidence: 0.9 };

    if (request.options && request.options.length > 0) {
      const a = new Set(canonTokens(best.answer));
      let bestIdx = -1;
      let bestScore = 0;
      request.options.forEach((o, i) => {
        const toks = canonTokens(o);
        const inter = toks.filter((t) => a.has(t)).length;
        const score = toks.length === 0 || a.size === 0 ? 0 : inter / Math.min(toks.length, a.size);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      });
      if (bestIdx >= 0 && bestScore >= 0.5) return { kind: 'option', optionIndex: bestIdx, confidence: Math.min(0.95, 0.6 + bestScore * 0.4) };
    }
    return { kind: 'answer', answerId: best.id, confidence: Math.min(0.95, 0.6 + best.score * 0.4) };
  }
}
