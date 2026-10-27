import { SemanticProvider, SemanticRequest } from './types';

/**
 * Chrome built-in Prompt API provider (on-device Gemini Nano). Runs in extension contexts
 * (service worker / extension pages); the content script reaches it over messaging.
 * Availability depends on Chrome version, disk space and GPU; when absent the matcher
 * silently falls back to the lexical tier.
 */

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['answer', 'option', 'none'] },
    answerId: { type: 'string' },
    optionIndex: { type: 'integer' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    rationale: { type: 'string' }
  },
  required: ['kind', 'confidence'],
  additionalProperties: false
};

const SYSTEM_PROMPT = [
  'You match job-application form questions to a user\'s stored answers.',
  'You will receive a question, optional section, optional list of allowed options, and a list of candidate stored answers with ids.',
  'Pick exactly one: a stored answer id whose meaning answers the question, or an option index whose text is the right choice for the question given the stored answers, or "none".',
  'Never invent an answer. Never pick an answer that only shares words with the question but answers a different question.',
  'Respond with JSON only: {"kind":"answer"|"option"|"none","answerId"?:string,"optionIndex"?:number,"confidence":0..1,"rationale"?:string}.'
].join(' ');

export function buildPrompt(request: SemanticRequest): string {
  const lines: string[] = [];
  lines.push(`Question: ${request.question}`);
  if (request.section) lines.push(`Section: ${request.section}`);
  lines.push(`Field type: ${request.fieldType}`);
  if (request.options && request.options.length > 0) {
    lines.push('Options (index: text):');
    request.options.forEach((o, i) => lines.push(`  ${i}: ${o}`));
  }
  lines.push('Candidate stored answers (id: answer | known question phrasings):');
  for (const c of request.candidates) {
    lines.push(`  ${c.id}: ${c.answer} | ${c.patterns.join(' / ')}`);
  }
  lines.push('Return JSON only.');
  return lines.join('\n');
}

export class PromptApiProvider implements SemanticProvider {
  readonly id = 'chrome-prompt-api';
  private session: any = null;

  private get api(): any {
    const g = globalThis as any;
    return g.LanguageModel || g.ai?.languageModel || null;
  }

  async isAvailable(): Promise<boolean> {
    const api = this.api;
    if (!api) return false;
    try {
      const status = typeof api.availability === 'function' ? await api.availability() : typeof api.capabilities === 'function' ? (await api.capabilities()).available : 'unavailable';
      return status === 'available' || status === 'readily';
    } catch {
      return false;
    }
  }

  private async getSession(): Promise<any> {
    if (this.session) return this.session;
    const api = this.api;
    this.session = await api.create({
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }]
    });
    return this.session;
  }

  async decide(request: SemanticRequest, signal?: AbortSignal): Promise<unknown> {
    const session = await this.getSession();
    const prompt = buildPrompt(request);
    try {
      return await session.prompt(prompt, { responseConstraint: RESPONSE_SCHEMA, signal });
    } catch (err) {
      // Older builds reject responseConstraint; retry without it.
      if (signal?.aborted) throw err;
      return await session.prompt(prompt, { signal });
    }
  }
}
