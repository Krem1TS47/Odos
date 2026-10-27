import { describe, it, expect } from 'vitest';
import {
  scoreQuestionMatch,
  findBestStoredAnswer,
  findStoredAnswerByKeywords,
  STORED_ANSWER_FLOOR
} from '../../extension/src/core/answerMatcher';
import { StoredAnswer } from '../../extension/src/core/models';

const answers: StoredAnswer[] = [
  { id: 'auth', questionPatterns: ['Are you legally authorized to work in the United States?', 'authorized to work'], category: 'eligibility', answer: 'Yes', autoFill: true },
  { id: 'spons', questionPatterns: ['Will you now or in the future require visa sponsorship?', 'require sponsorship'], category: 'eligibility', answer: 'No', autoFill: true },
  { id: 'hear', questionPatterns: ['How did you hear about this job?', 'where did you hear'], category: 'logistics', answer: 'Company website', autoFill: true },
  { id: 'name', questionPatterns: ['name'], category: 'other', answer: 'Ada Lovelace', autoFill: true },
  { id: 'relocate', questionPatterns: ['Are you willing to relocate?'], category: 'logistics', answer: 'Yes', autoFill: true }
];

describe('Scored stored-answer matcher (R6a)', () => {
  const MUST_MATCH: Array<[string, string]> = [
    ['Are you legally authorized to work in the United States?', 'auth'],
    ['Authorized to work in the U.S.?', 'auth'],
    ['Will you now or in the future require sponsorship for employment visa status?', 'spons'],
    ['How did you hear about us?', 'hear'],
    ['Where did you hear about this role?', 'hear'],
    ['Willing to relocate?', 'relocate']
  ];

  it.each(MUST_MATCH)('matches "%s" -> %s at or above the floor', (label, expectedId) => {
    const best = findBestStoredAnswer(label, answers);
    expect(best?.answer.id).toBe(expectedId);
    expect(best!.score).toBeGreaterThanOrEqual(STORED_ANSWER_FLOOR);
  });

  const MUST_NOT_MATCH: string[] = [
    'Company name',            // single-token pattern "name" must not grab other fields
    'Name of your university',
    'Yes',                      // labels under 4 chars never substring-match
    'Describe a time you worked on a team',
    'Preferred first name'
  ];

  it.each(MUST_NOT_MATCH)('does not auto-fill "%s"', (label) => {
    const best = findBestStoredAnswer(label, answers);
    expect(!best || best.score < STORED_ANSWER_FLOOR).toBe(true);
  });

  it('picks the best answer across all answers rather than the first hit', () => {
    const list: StoredAnswer[] = [
      { id: 'weak', questionPatterns: ['work'], category: 'other', answer: 'weak', autoFill: true },
      { id: 'strong', questionPatterns: ['authorized to work in the us'], category: 'eligibility', answer: 'strong', autoFill: true }
    ];
    expect(findBestStoredAnswer('Are you authorized to work in the US?', list)?.answer.id).toBe('strong');
  });

  it('scores exact, subset and overlap strategies distinctly', () => {
    expect(scoreQuestionMatch('How did you hear about us?', 'how did you hear about us')).toEqual({ score: 1, strategy: 'exact' });
    expect(scoreQuestionMatch('Will you require visa sponsorship now or later?', 'require sponsorship')?.strategy).toBe('pattern_subset');
    expect(scoreQuestionMatch('Hear about us', 'How did you hear about us?')?.strategy).toMatch(/subset/);
    expect(scoreQuestionMatch('Totally different question here', 'require sponsorship')).toBeNull();
  });

  it('keyword lookup requires every keyword token to appear in a pattern', () => {
    expect(findStoredAnswerByKeywords(answers, ['relocate', 'relocation'])?.id).toBe('relocate');
    expect(findStoredAnswerByKeywords(answers, ['salary'])).toBeUndefined();
  });
});
