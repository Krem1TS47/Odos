/**
 * Dropdown Resolver for Odos
 *
 * Semantic synonym mapping and fuzzy option scoring for HTML <select> and custom
 * combobox listboxes (React-Select, Radix UI, Workday Canvas Kit, MUI, AntD, ...).
 *
 * Policy (eng review R4/R5):
 *  - A candidate is auto-selected only when its score reaches OPTION_MATCH_FLOOR.
 *    Below that the best candidate is returned as a *suggestion* for the review panel.
 *  - "Other / Not listed" and "Decline / Prefer not to say" options are never picked
 *    as a fallback; they are selectable only when the desired answer itself says so.
 *  - Synonym dictionaries apply when the caller passes a hint, or when the option set
 *    itself looks like that dictionary (>= 2 distinct keys present among the options).
 *  - Terms of three characters or fewer (us, in, ms, bs...) match only a whole option
 *    text or an abbreviation set off by parentheses, slashes or commas.
 */

export interface OptionCandidate {
  text: string;
  value: string;
  index: number;
  element?: HTMLElement;
}

export type MatchStrategy = 'exact' | 'synonym' | 'starts_with' | 'token_overlap' | 'creatable';

export interface MatchResult {
  candidate: OptionCandidate;
  score: number;
  strategy: MatchStrategy;
}

export interface OptionResolution {
  /** Candidate that may be auto-selected (score >= OPTION_MATCH_FLOOR), or null. */
  selected: MatchResult | null;
  /** Best candidate overall (may equal `selected`), surfaced as "closest: X" when nothing is selected. */
  suggestion: MatchResult | null;
}

/** Minimum score for an option to be selected without human review. */
export const OPTION_MATCH_FLOOR = 0.75;

/**
 * Normalizes text for comparison (lowercase, trimmed, collapsed whitespace, punctuation stripped).
 */
export function normalizeOptionText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether a dictionary term occurs in an option text.
 * Short terms (<= 3 chars) must be the whole text or a delimited abbreviation such as
 * "(BS)", "BA, BS, BFA" or "A.A. / A.S." in the raw text; longer terms may be substrings.
 */
export function matchesTerm(normText: string, normTerm: string, rawText?: string): boolean {
  if (!normText || !normTerm) return false;
  if (normText === normTerm) return true;

  if (normTerm.length <= 3) {
    const raw = (rawText || '').toLowerCase().replace(/\./g, '');
    if (!raw) return false;
    const re = new RegExp(`(^|[(/,;|]\\s*)${escapeRegex(normTerm)}(\\s*[)/,;|]|$)`);
    return re.test(raw);
  }

  if (normText.length <= 3) {
    return normText === normTerm;
  }

  return normText.includes(normTerm);
}

/**
 * Common synonym dictionaries for job application dropdowns.
 */
export const SYNONYM_DICTIONARIES: Record<string, Record<string, string[]>> = {
  boolean: {
    yes: ['yes', 'true', 'agree', 'i agree', 'confirmed', 'accept', 'i accept'],
    no: ['no', 'false', 'disagree', 'do not agree']
  },

  work_authorization: {
    yes: [
      'yes',
      'authorized',
      'legally authorized',
      'eligible to work',
      'i am authorized',
      'i am eligible',
      'citizen',
      'u s citizen',
      'permanent resident',
      'green card',
      'yes i am',
      'will not require sponsorship',
      'do not require sponsorship',
      'no sponsorship needed'
    ],
    no: [
      'no',
      'not authorized',
      'ineligible',
      'not eligible',
      'require sponsorship',
      'will require sponsorship',
      'require visa sponsorship',
      'no i am not'
    ]
  },

  sponsorship: {
    yes: [
      'yes',
      'will require',
      'require sponsorship',
      'require visa sponsorship',
      'will require sponsorship',
      'needs sponsorship',
      'yes i will require',
      'yes i will need'
    ],
    no: [
      'no',
      'will not require',
      'do not require',
      'will not require visa sponsorship',
      'will not require sponsorship',
      'do not require sponsorship',
      'no sponsorship needed',
      'no i will not require',
      'authorized to work without sponsorship'
    ]
  },

  degree: {
    bachelor: [
      'bachelor',
      'bachelors',
      'bachelor of science',
      'bachelor of arts',
      'bs',
      'ba',
      'b s',
      'b a',
      'undergraduate',
      'baccalaureate',
      'bfa',
      'bba',
      'bsc',
      'b sc',
      'four year degree',
      'college degree'
    ],
    master: [
      'master',
      'masters',
      'master of science',
      'master of arts',
      'ms',
      'ma',
      'm s',
      'm a',
      'graduate degree',
      'postgraduate',
      'mba',
      'm ba',
      'msc',
      'm sc',
      'meng',
      'm eng'
    ],
    doctorate: [
      'doctorate',
      'ph d',
      'phd',
      'doctor of philosophy',
      'doctoral',
      'terminal degree',
      'md',
      'jd',
      'dphil'
    ],
    associate: [
      'associate',
      'associates',
      'associate of arts',
      'associate of science',
      'associate degree',
      'a a',
      'a s',
      'aa',
      'as',
      'two year degree'
    ],
    high_school: ['high school', 'secondary school', 'ged', 'high school diploma', 'secondary education']
  },

  phone_type: {
    mobile: ['mobile', 'cell', 'cellular', 'mobile phone', 'cell phone', 'iphone', 'smart phone', 'personal'],
    landline: ['landline', 'home', 'home phone', 'work', 'work phone', 'office']
  },

  website_type: {
    linkedin: ['linkedin', 'linked in', 'linked in profile'],
    github: ['github', 'git hub'],
    portfolio: ['portfolio', 'personal website', 'personal portfolio', 'website', 'personal url', 'blog', 'projects'],
    other: ['other', 'link', 'url', 'additional website']
  },

  gender: {
    male: ['male', 'man', 'cisgender male', 'cisgender man', 'he him'],
    female: ['female', 'woman', 'cisgender female', 'cisgender woman', 'she her'],
    non_binary: ['non binary', 'nonbinary', 'gender non conforming', 'genderqueer', 'they them', 'other gender'],
    decline: ['decline to state', 'prefer not to say', 'choose not to disclose', 'decline to self identify', 'i do not wish to answer', 'do not wish to specify']
  },

  veteran: {
    veteran: ['i identify as one or more of the classifications of protected veteran', 'protected veteran', 'veteran', 'active duty wartime or campaign badge veteran', 'yes'],
    not_veteran: ['i am not a protected veteran', 'i am not a veteran', 'not a veteran', 'no'],
    decline: ['decline to state', 'prefer not to say', 'choose not to disclose', 'i do not wish to answer']
  },

  disability: {
    yes: ['yes i have a disability', 'yes i have a disability or previously had a disability', 'have a disability', 'yes'],
    no: ['no i do not have a disability', 'no i dont have a disability', 'no disability', 'no'],
    decline: ['prefer not to answer', 'i do not wish to answer', 'decline to state', 'prefer not to disclose', 'choose not to disclose']
  },

  country: {
    united_states: ['united states', 'united states of america', 'usa', 'us', 'u s', 'u s a'],
    canada: ['canada', 'ca', 'can'],
    united_kingdom: ['united kingdom', 'uk', 'u k', 'great britain', 'england'],
    germany: ['germany', 'deutschland', 'de'],
    france: ['france', 'fr'],
    india: ['india', 'in']
  }
};

/**
 * Checks if a candidate text represents a "Creatable / Add Option" action in searchable dropdowns
 * e.g., 'Create "Stanford University"', '+ Add "UC Berkeley"', 'Use "React"'.
 */
export function isCreatableOption(optionText: string, desiredValue: string): boolean {
  const normOption = normalizeOptionText(optionText);
  const normDesired = normalizeOptionText(desiredValue);
  if (!normOption || !normDesired) return false;

  const prefixes = ['create', 'add', 'use', 'add new', 'insert'];
  const hasPrefix = prefixes.some((p) => normOption.startsWith(p));
  if (hasPrefix && normOption.includes(normDesired)) {
    return true;
  }

  if (optionText.trim().startsWith('+') && normOption.includes(normDesired)) {
    return true;
  }

  return false;
}

const OTHER_PATTERNS = ['other', 'not listed', 'none of the above', 'not specified', 'unspecified', 'something else'];
const DECLINE_PATTERNS = [
  'decline to state',
  'decline to answer',
  'decline to self identify',
  'decline to identify',
  'prefer not to answer',
  'prefer not to say',
  'prefer not to disclose',
  'prefer not to respond',
  'i do not wish to answer',
  'do not wish to answer',
  'do not wish to specify',
  'choose not to disclose',
  'choose not to identify',
  'rather not say',
  'i decline'
];

function matchesAnyPattern(norm: string, patterns: string[]): boolean {
  return patterns.some((p) => norm === p || norm.startsWith(`${p} `) || norm.endsWith(` ${p}`) || norm.includes(` ${p} `));
}

/** True for generic "Other / Not listed" options. */
export function isOtherOption(optionText: string): boolean {
  const norm = normalizeOptionText(optionText);
  if (!norm) return false;
  return matchesAnyPattern(norm, OTHER_PATTERNS);
}

/** True for "Decline to state / Prefer not to say" style options. */
export function isDeclineOption(optionText: string): boolean {
  const norm = normalizeOptionText(optionText);
  if (!norm) return false;
  return DECLINE_PATTERNS.some((p) => norm === p || norm.includes(p));
}

/** Back-compat: either an "Other" or a "Decline" style option. */
export function isOtherOrFallbackOption(optionText: string): boolean {
  return isOtherOption(optionText) || isDeclineOption(optionText);
}

const PLACEHOLDER_TEXTS = new Set([
  '',
  'select',
  'select one',
  'select an option',
  'select option',
  'please select',
  'please choose',
  'choose',
  'choose one',
  'none selected',
  'select a value'
]);

/** True for "Select one / -- Please select --" placeholder options. */
export function isPlaceholderOption(text: string, value: string): boolean {
  const norm = normalizeOptionText(text);
  if (PLACEHOLDER_TEXTS.has(norm)) return true;
  if (norm === 'none' && value === '') return true;
  if ((text || '').trim().startsWith('--')) return true;
  return false;
}

/**
 * Finds which dictionary key a given text belongs to.
 */
export function findCategoryKey(dict: Record<string, string[]>, text: string): string | null {
  const norm = normalizeOptionText(text);
  if (!norm) return null;

  for (const [key, terms] of Object.entries(dict)) {
    if (key === norm) return key;
    for (const term of terms) {
      const normTerm = normalizeOptionText(term);
      if (matchesTerm(norm, normTerm, text)) {
        return key;
      }
    }
  }
  return null;
}

/**
 * Without a hint, a dictionary applies only when the option set itself looks like it:
 * at least two distinct keys of the dictionary must each be matched by some option.
 */
export function deriveApplicableDictionaries(candidates: OptionCandidate[]): Record<string, string[]>[] {
  const result: Record<string, string[]>[] = [];
  for (const dict of Object.values(SYNONYM_DICTIONARIES)) {
    const keys = new Set<string>();
    for (const c of candidates) {
      const k = findCategoryKey(dict, c.text) || findCategoryKey(dict, c.value);
      if (k) keys.add(k);
      if (keys.size >= 2) break;
    }
    if (keys.size >= 2) result.push(dict);
  }
  return result;
}

/**
 * Computes Jaccard word-token similarity between two strings.
 */
function tokenSimilarity(a: string, b: string): number {
  const aTokens = new Set(normalizeOptionText(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeOptionText(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function scorePool(pool: OptionCandidate[], desiredValue: string, hintCategory?: string): MatchResult | null {
  const normDesired = normalizeOptionText(desiredValue);
  if (!normDesired || pool.length === 0) return null;

  let bestMatch: MatchResult | null = null;
  const consider = (cand: OptionCandidate, score: number, strategy: MatchStrategy) => {
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { candidate: cand, score, strategy };
    }
  };

  // 1. Exact match (text or value)
  for (const c of pool) {
    if (normalizeOptionText(c.text) === normDesired || normalizeOptionText(c.value) === normDesired) {
      return { candidate: c, score: 1.0, strategy: 'exact' };
    }
  }

  // 2. Creatable option
  for (const c of pool) {
    if (isCreatableOption(c.text, desiredValue)) {
      consider(c, 0.95, 'creatable');
    }
  }
  if (bestMatch && (bestMatch as MatchResult).strategy === 'creatable') return bestMatch;

  // 3. Synonym dictionaries (hinted, or derived from the option set)
  const dictsToTest: Record<string, string[]>[] = [];
  if (hintCategory && SYNONYM_DICTIONARIES[hintCategory]) {
    dictsToTest.push(SYNONYM_DICTIONARIES[hintCategory]);
  } else if (!hintCategory) {
    dictsToTest.push(...deriveApplicableDictionaries(pool));
  }

  for (const dict of dictsToTest) {
    const desiredCat = findCategoryKey(dict, desiredValue);
    if (!desiredCat) continue;
    for (const c of pool) {
      const optCat = findCategoryKey(dict, c.text) || findCategoryKey(dict, c.value);
      if (optCat && optCat === desiredCat) {
        consider(c, 0.92, 'synonym');
        break;
      }
    }
    if (bestMatch && (bestMatch as MatchResult).score >= 0.9) break;
  }
  if (bestMatch && (bestMatch as MatchResult).score >= 0.9) return bestMatch;

  // 4. Prefix match
  for (const c of pool) {
    const normText = normalizeOptionText(c.text);
    const normVal = normalizeOptionText(c.value);
    if (normText.startsWith(normDesired) || (normVal && normVal.startsWith(normDesired))) {
      consider(c, 0.85, 'starts_with');
    } else if (normText.length >= 3 && normDesired.startsWith(normText)) {
      consider(c, 0.8, 'starts_with');
    }
  }
  if (bestMatch && (bestMatch as MatchResult).score >= 0.85) return bestMatch;

  // 5. Substring inclusion / token overlap
  for (const c of pool) {
    const normText = normalizeOptionText(c.text);
    if (normText.length >= 3 && (normText.includes(normDesired) || normDesired.includes(normText))) {
      consider(c, 0.75, 'token_overlap');
      continue;
    }
    const similarity = tokenSimilarity(c.text, desiredValue);
    if (similarity >= 0.5) {
      consider(c, 0.6 + similarity * 0.15, 'token_overlap');
    }
  }

  return bestMatch;
}

/**
 * Evaluates candidate options and returns the best-scoring one regardless of the floor.
 * Prefer resolveOption() in fill paths; this remains for previews (e.g. the dashboard tester).
 */
export function findBestOptionMatch(
  candidates: OptionCandidate[],
  desiredValue: string,
  hintCategory?: string
): MatchResult | null {
  return resolveOption(candidates, desiredValue, hintCategory).suggestion;
}

/**
 * Resolves which option (if any) may be auto-selected for `desiredValue`.
 */
export function resolveOption(
  candidates: OptionCandidate[],
  desiredValue: string,
  hintCategory?: string
): OptionResolution {
  if (!candidates || candidates.length === 0 || !desiredValue) {
    return { selected: null, suggestion: null };
  }
  const normDesired = normalizeOptionText(desiredValue);
  if (!normDesired) return { selected: null, suggestion: null };

  const nonPlaceholder = candidates.filter((c) => !isPlaceholderOption(c.text, c.value));
  const basePool = nonPlaceholder.length > 0 ? nonPlaceholder : candidates;

  const desiredIsOther = isOtherOption(desiredValue);
  const desiredIsDecline = isDeclineOption(desiredValue);

  // Guarded pool: never auto-select "Other" or "Decline" unless the answer says so.
  const guardedPool = basePool.filter((c) => {
    if (!desiredIsOther && isOtherOption(c.text)) return false;
    if (!desiredIsDecline && isDeclineOption(c.text)) return false;
    return true;
  });

  const best = scorePool(guardedPool, desiredValue, hintCategory);
  if (best && best.score >= OPTION_MATCH_FLOOR) {
    return { selected: best, suggestion: best };
  }

  // An answer that itself declines / says "other" selects that class of option.
  if (desiredIsDecline) {
    const c = basePool.find((x) => isDeclineOption(x.text));
    if (c) {
      const m: MatchResult = { candidate: c, score: 0.9, strategy: 'synonym' };
      return { selected: m, suggestion: m };
    }
  }
  if (desiredIsOther) {
    const c = basePool.find((x) => isOtherOption(x.text));
    if (c) {
      const m: MatchResult = { candidate: c, score: 0.9, strategy: 'synonym' };
      return { selected: m, suggestion: m };
    }
  }

  // Suggestion may come from the full pool (including Other) but is never auto-applied.
  const suggestion = best || scorePool(basePool, desiredValue, hintCategory);
  return { selected: null, suggestion };
}
