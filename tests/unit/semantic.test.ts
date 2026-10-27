import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SemanticMatcher,
  MockSemanticProvider,
  validateDecision,
  SemanticRequest,
  SEMANTIC_ACCEPT_FLOOR
} from '../../extension/src/core/semantic';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { FormField } from '../../extension/src/content/adapters/types';
import { DEFAULT_PROFILE, StoredAnswer } from '../../extension/src/core/models';

const bank: StoredAnswer[] = [
  { id: 'auth', questionPatterns: ['Are you legally authorized to work in the United States?'], category: 'eligibility', answer: 'Yes', autoFill: true },
  { id: 'spons', questionPatterns: ['Will you now or in the future require visa sponsorship?'], category: 'eligibility', answer: 'No', autoFill: true },
  { id: 'hear', questionPatterns: ['How did you hear about this job?', 'Where did you find this posting?'], category: 'logistics', answer: 'Company website', autoFill: true },
  { id: 'relocate', questionPatterns: ['Are you willing to relocate?'], category: 'logistics', answer: 'Yes', autoFill: true },
  { id: 'salary', questionPatterns: ['What are your salary expectations?'], category: 'logistics', answer: '$150,000', autoFill: false },
  { id: 'start', questionPatterns: ['When can you start?', 'What is your earliest start date?'], category: 'logistics', answer: 'Two weeks after offer', autoFill: true },
  { id: 'notice', questionPatterns: ['What is your notice period?'], category: 'logistics', answer: '2 weeks', autoFill: true },
  { id: 'prev', questionPatterns: ['Have you worked for this company before?', 'previously employed here'], category: 'other', answer: 'No', autoFill: true },
  { id: 'age', questionPatterns: ['Are you 18 years of age or older?', 'at least 18 years old'], category: 'eligibility', answer: 'Yes', autoFill: true }
];

const candidatesOf = (answers: StoredAnswer[]) => answers.map((a) => ({ id: a.id, answer: a.answer, patterns: a.questionPatterns }));

describe('Semantic tier (R6b): validation, gating, fallback', () => {
  const request: SemanticRequest = { question: 'Do you need a visa?', fieldType: 'select', options: ['Yes', 'No'], candidates: candidatesOf(bank) };

  it('rejects outputs outside the allowed set', () => {
    expect(validateDecision({ kind: 'answer', answerId: 'nope', confidence: 0.9 }, request)).toBeNull();
    expect(validateDecision({ kind: 'option', optionIndex: 7, confidence: 0.9 }, request)).toBeNull();
    expect(validateDecision({ kind: 'option', optionIndex: -1, confidence: 0.9 }, request)).toBeNull();
    expect(validateDecision({ kind: 'answer', answerId: 'spons', confidence: 1.4 }, request)).toBeNull();
    expect(validateDecision('not json at all', request)).toBeNull();
    expect(validateDecision({ kind: 'banana', confidence: 0.9 }, request)).toBeNull();
  });

  it('accepts valid JSON strings and objects', () => {
    expect(validateDecision('{"kind":"option","optionIndex":1,"confidence":0.8}', request)).toEqual({ kind: 'option', optionIndex: 1, confidence: 0.8, rationale: undefined });
    expect(validateDecision({ kind: 'answer', answerId: 'spons', confidence: 0.9 }, request)?.answerId).toBe('spons');
  });

  it('gates decisions below the floor and tolerates provider failure', async () => {
    const provider = new MockSemanticProvider(true);
    provider.script({ kind: 'option', optionIndex: 1, confidence: SEMANTIC_ACCEPT_FLOOR - 0.1 });
    const matcher = new SemanticMatcher(provider);
    const low = await matcher.match(request);
    expect(low?.kind).toBe('none');

    provider.script(Promise.reject(new Error('boom')));
    expect(await matcher.match(request)).toBeNull();
  });

  it('is silent when the provider is unavailable', async () => {
    const matcher = new SemanticMatcher(new MockSemanticProvider(false));
    expect(await matcher.match(request)).toBeNull();
  });

  it('times out slow providers', async () => {
    const provider = new MockSemanticProvider(true);
    provider.script(new Promise(() => {}));
    const matcher = new SemanticMatcher(provider, { timeoutMs: 20 });
    expect(await matcher.match(request)).toBeNull();
  });
});

describe('Semantic eval set (mock provider, >= 90% required)', () => {
  it('meets the accuracy bar on the eval fixtures', async () => {
    const cases = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/semantic_eval.json'), 'utf-8')) as Array<{
      question: string;
      options?: string[];
      expect: { kind: string; optionIndex?: number; answerId?: string };
    }>;
    const matcher = new SemanticMatcher(new MockSemanticProvider(true));
    let correct = 0;
    const failures: string[] = [];
    for (const c of cases) {
      const d = await matcher.match({ question: c.question, fieldType: c.options ? 'select' : 'text', options: c.options, candidates: candidatesOf(bank) });
      const kind = d?.kind ?? 'none';
      const ok =
        kind === c.expect.kind &&
        (c.expect.kind !== 'option' || d?.optionIndex === c.expect.optionIndex) &&
        (c.expect.kind !== 'answer' || d?.answerId === c.expect.answerId);
      if (ok) correct++;
      else failures.push(`${c.question} -> ${JSON.stringify(d)}`);
    }
    const accuracy = correct / cases.length;
    expect(accuracy, failures.join('\n')).toBeGreaterThanOrEqual(0.9);
  });
});

describe('Engine integration: semantic tier fills what the lexical matcher cannot', () => {
  it('falls back to lexical-only behavior when no semantic function is provided, and uses it when present', async () => {
    document.body.innerHTML = `
      <label for="q1">Do you require sponsorship for an employment visa?</label>
      <select id="q1" name="q1"><option value="">Select</option><option value="y">Yes</option><option value="n">No</option></select>`;
    const el = document.getElementById('q1') as HTMLSelectElement;
    const field: FormField = { id: 'q1', name: 'q1', label: 'Do you require sponsorship for an employment visa?', type: 'select', element: el, required: true, options: ['Yes', 'No'], optionValues: ['y', 'n'] };

    // Only a paraphrase-only answer bank (no profile sponsorship info)
    const answers: StoredAnswer[] = [bank[1]];
    const profile = { ...DEFAULT_PROFILE, workAuthorization: { authorizedCountries: [], requiresSponsorship: false } };

    const matcher = new SemanticMatcher(new MockSemanticProvider(true));
    const result = await executeAutofill([field], {
      profile,
      answers,
      semanticMatch: (req) => matcher.match(req)
    });
    expect(result.filledFields.length).toBe(1);
    expect(el.value).toBe('n');
    expect(field.source).toBe('answer'); // the stored answer matches lexically; no AI needed

    // A question the heuristics cannot see
    document.body.innerHTML = `
      <label for="q2">Have you ever been employed by this organization?</label>
      <select id="q2" name="q2"><option value="">Select</option><option value="y">Yes</option><option value="n">No</option></select>`;
    const el2 = document.getElementById('q2') as HTMLSelectElement;
    const field2: FormField = { id: 'q2', name: 'q2', label: 'Have you ever been employed by this organization?', type: 'select', element: el2, required: true, options: ['Yes', 'No'], optionValues: ['y', 'n'] };
    const r2 = await executeAutofill([field2], { profile, answers: bank, semanticMatch: (req) => matcher.match(req) });
    expect(r2.filledFields.length).toBe(1);
    expect(el2.value).toBe('n');
    expect(field2.source).toBe('ai');

    const r3 = await executeAutofill([{ ...field2, element: el2 }], { profile, answers: bank });
    expect(r3.filledFields.length + r3.emptyFields.length).toBe(1);
  });
});
