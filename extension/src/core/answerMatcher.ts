/**
 * Scored lexical matcher between a form question (label) and the user's stored answers.
 *
 * Replaces two-way substring containment (eng review R6a). Scores:
 *   1.00 exact normalized match
 *   0.90 every content token of the pattern appears in the label
 *   0.85 every content token of the label appears in the pattern (label has >= 2 tokens)
 *   0.55 + 0.35 * jaccard(content tokens) when jaccard >= 0.5
 * Guards: labels shorter than 4 characters only match exactly; a single-token pattern
 * only reaches 0.9 against a single-token label (otherwise 0.7, a suggestion).
 * Auto-fill requires STORED_ANSWER_FLOOR.
 */

import { StoredAnswer } from './models';

export const STORED_ANSWER_FLOOR = 0.75;

export type AnswerMatchStrategy = 'exact' | 'pattern_subset' | 'label_subset' | 'token_overlap';

export interface AnswerMatch {
  answer: StoredAnswer;
  pattern: string;
  score: number;
  strategy: AnswerMatchStrategy;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'you', 'your', 'yours', 'are', 'is', 'am', 'be', 'been', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'to', 'in', 'of', 'for', 'this', 'that', 'these',
  'please', 'we', 'our', 'have', 'has', 'any', 'now', 'or', 'and', 'with', 'on', 'at', 'if',
  'it', 'as', 'what', 'which', 'i', 'my', 'me', 'by', 'from', 'about', 'into', 'how', 'when',
  'there', 'here', 'us', 'they', 'them', 'their', 'so', 'than', 'then', 'such', 'some', 'may'
]);

/**
 * Lowercases, strips punctuation and collapses whitespace.
 */
export function normalizeQuestion(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/**
 * Content tokens: normalized, stop words removed, light plural stemming.
 */
export function contentTokens(text: string): string[] {
  const all = normalizeQuestion(text).split(' ').filter(Boolean);
  const content = all.filter((t) => !STOP_WORDS.has(t)).map(stem);
  return content.length > 0 ? Array.from(new Set(content)) : Array.from(new Set(all.map(stem)));
}

function isSubset(a: string[], b: string[]): boolean {
  if (a.length === 0) return false;
  const set = new Set(b);
  return a.every((t) => set.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Scores how well a stored question pattern matches a form label.
 */
export function scoreQuestionMatch(label: string, pattern: string): { score: number; strategy: AnswerMatchStrategy } | null {
  const normLabel = normalizeQuestion(label);
  const normPattern = normalizeQuestion(pattern);
  if (!normLabel || !normPattern) return null;

  if (normLabel === normPattern) return { score: 1.0, strategy: 'exact' };

  // Very short labels ("Name", "Yes") only match exactly.
  if (normLabel.length < 4) return null;

  const labelTokens = contentTokens(label);
  const patternTokens = contentTokens(pattern);
  if (labelTokens.length === 0 || patternTokens.length === 0) return null;

  if (isSubset(patternTokens, labelTokens)) {
    if (patternTokens.length === 1) {
      return labelTokens.length === 1
        ? { score: 0.9, strategy: 'pattern_subset' }
        : { score: 0.7, strategy: 'pattern_subset' };
    }
    return { score: 0.9, strategy: 'pattern_subset' };
  }

  // The label's content is contained in the pattern. A single content token qualifies only
  // when the label is a real phrase (>= 3 words, i.e. stop words were stripped), so a bare
  // "Name" field never matches "Company name".
  const labelWordCount = normLabel.split(' ').length;
  if ((labelTokens.length >= 2 || labelWordCount >= 3) && isSubset(labelTokens, patternTokens)) {
    return { score: 0.85, strategy: 'label_subset' };
  }

  const j = jaccard(labelTokens, patternTokens);
  if (j >= 0.5) {
    return { score: Math.round((0.55 + 0.35 * j) * 1000) / 1000, strategy: 'token_overlap' };
  }

  return null;
}

/**
 * Ranks all stored answers against a label (best first).
 */
export function rankStoredAnswers(label: string, answers: StoredAnswer[], limit = 3): AnswerMatch[] {
  const matches: AnswerMatch[] = [];
  for (const answer of answers) {
    let bestForAnswer: AnswerMatch | null = null;
    for (const pattern of answer.questionPatterns || []) {
      const s = scoreQuestionMatch(label, pattern);
      if (s && (!bestForAnswer || s.score > bestForAnswer.score)) {
        bestForAnswer = { answer, pattern, score: s.score, strategy: s.strategy };
      }
    }
    if (bestForAnswer) matches.push(bestForAnswer);
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

/**
 * Best stored answer for a label across ALL answers (not first-wins). The caller decides
 * whether the score clears STORED_ANSWER_FLOOR.
 */
export function findBestStoredAnswer(label: string, answers: StoredAnswer[]): AnswerMatch | null {
  const ranked = rankStoredAnswers(label, answers, 1);
  return ranked.length > 0 ? ranked[0] : null;
}

/**
 * Keyword lookup used by canonical resolvers (salary, relocation, EEO...). A keyword phrase
 * matches an answer when all of its content tokens appear in one of the answer's patterns.
 */
export function findStoredAnswerByKeywords(answers: StoredAnswer[], keywords: string[]): StoredAnswer | undefined {
  let best: { answer: StoredAnswer; score: number } | null = null;
  for (const answer of answers) {
    for (const pattern of answer.questionPatterns || []) {
      const patternTokens = contentTokens(pattern);
      for (const kw of keywords) {
        const kwTokens = contentTokens(kw);
        if (kwTokens.length > 0 && isSubset(kwTokens, patternTokens)) {
          const score = kwTokens.length / Math.max(patternTokens.length, 1);
          if (!best || score > best.score) best = { answer, score };
        }
      }
    }
  }
  return best?.answer;
}
