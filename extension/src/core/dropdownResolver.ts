/**
 * Dropdown Resolver for Odos
 * 
 * Provides semantic synonym mapping, fuzzy option scoring, and creatable/add-option
 * detection for HTML <select> and custom combobox listboxes (React-Select, Radix UI,
 * Workday Canvas Kit, Headless UI, etc.).
 */

export interface OptionCandidate {
  text: string;
  value: string;
  index: number;
  element?: HTMLElement;
}

export interface MatchResult {
  candidate: OptionCandidate;
  score: number;
  strategy: 'exact' | 'synonym' | 'starts_with' | 'token_overlap' | 'creatable' | 'fallback_other';
}

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

/**
 * Checks if a word or phrase matches a dictionary term using whole-word boundary
 * for short terms (<= 3 chars) to avoid false substring collisions (e.g. 'as' inside 'master').
 */
export function matchesTerm(normText: string, normTerm: string): boolean {
  if (normText === normTerm) return true;

  if (normTerm.length <= 3) {
    const regex = new RegExp(`\\b${normTerm}\\b`, 'i');
    return regex.test(normText);
  }

  if (normText.length <= 3) {
    return normText === normTerm;
  }

  if (normText.includes(normTerm)) {
    return true;
  }

  return false;
}

/**
 * Common synonym dictionaries for job application dropdowns.
 */
export const SYNONYM_DICTIONARIES: Record<string, Record<string, string[]>> = {
  // Generic Boolean
  boolean: {
    yes: ['yes', 'true', 'agree', 'confirmed'],
    no: ['no', 'false', 'disagree']
  },

  // Work Authorization (Are you legally authorized to work?)
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

  // Visa Sponsorship (Will you now or in the future require visa sponsorship?)
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

  // Degree / Education Level
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
    high_school: [
      'high school',
      'secondary school',
      'ged',
      'high school diploma',
      'secondary education'
    ]
  },

  // Phone Device Type
  phone_type: {
    mobile: ['mobile', 'cell', 'cellular', 'mobile phone', 'cell phone', 'iphone', 'smart phone', 'personal'],
    landline: ['landline', 'home', 'home phone', 'work', 'work phone', 'office']
  },

  // Website Type (Workday & generic URL dropdowns)
  website_type: {
    linkedin: ['linkedin', 'linked in', 'linked in profile'],
    github: ['github', 'git hub'],
    portfolio: ['portfolio', 'personal website', 'personal portfolio', 'website', 'personal url', 'blog', 'projects'],
    other: ['other', 'link', 'url', 'additional website']
  },

  // EEOC Gender
  gender: {
    male: ['male', 'man', 'cisgender male', 'cisgender man', 'he him'],
    female: ['female', 'woman', 'cisgender female', 'cisgender woman', 'she her'],
    non_binary: ['non binary', 'nonbinary', 'gender non conforming', 'genderqueer', 'they them', 'other gender'],
    decline: ['decline to state', 'prefer not to say', 'choose not to disclose', 'decline to self identify', 'i do not wish to answer', 'do not wish to specify']
  },

  // EEOC Veteran
  veteran: {
    veteran: ['i identify as one or more of the classifications of protected veteran', 'protected veteran', 'veteran', 'active duty wartime or campaign badge veteran', 'yes'],
    not_veteran: ['i am not a protected veteran', 'i am not a veteran', 'not a veteran', 'no'],
    decline: ['decline to state', 'prefer not to say', 'choose not to disclose', 'i do not wish to answer']
  },

  // EEOC Disability
  disability: {
    yes: ['yes i have a disability', 'yes i have a disability or previously had a disability', 'have a disability', 'yes'],
    no: ['no i do not have a disability', 'no i dont have a disability', 'no disability', 'no'],
    decline: ['prefer not to answer', 'i do not wish to answer', 'decline to state', 'prefer not to disclose', 'choose not to disclose']
  },

  // Country Shortcuts
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

  // Symbol prefix like "+ Harvard" or "Add Harvard"
  if (optionText.trim().startsWith('+') && normOption.includes(normDesired)) {
    return true;
  }

  return false;
}

/**
 * Checks if an option is a generic fallback / "Other" option.
 */
export function isOtherOrFallbackOption(optionText: string): boolean {
  const norm = normalizeOptionText(optionText);
  const patterns = [
    'other',
    'not listed',
    'none of the above',
    'not specified',
    'unspecified',
    'decline to state',
    'prefer not to answer'
  ];
  return patterns.some((p) => norm === p || norm.startsWith(`${p} `) || norm.includes(`(${p})`));
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
      if (matchesTerm(norm, normTerm)) {
        return key;
      }
    }
  }
  return null;
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

/**
 * Evaluates candidate options and scores the best matching option for desiredValue.
 */
export function findBestOptionMatch(
  candidates: OptionCandidate[],
  desiredValue: string,
  hintCategory?: string
): MatchResult | null {
  if (!candidates || candidates.length === 0 || !desiredValue) {
    return null;
  }

  const normDesired = normalizeOptionText(desiredValue);
  if (!normDesired) return null;

  // Filter out placeholder options like "Select one", "Please select", "-- Choose --"
  const validCandidates = candidates.filter((c) => {
    const text = normalizeOptionText(c.text);
    const isPlaceholder =
      text === '' ||
      text === 'select' ||
      text === 'select one' ||
      text === 'please select' ||
      text === 'choose' ||
      (text === 'none' && c.value === '') ||
      c.text.trim().startsWith('--');
    return !isPlaceholder;
  });

  const pool = validCandidates.length > 0 ? validCandidates : candidates;

  let bestMatch: MatchResult | null = null;

  const consider = (
    current: MatchResult | null,
    cand: OptionCandidate,
    score: number,
    strategy: MatchResult['strategy']
  ): MatchResult => {
    if (!current || score > current.score) {
      return { candidate: cand, score, strategy };
    }
    return current;
  };

  // 1. Exact match (Text or Value)
  for (const c of pool) {
    const normText = normalizeOptionText(c.text);
    const normVal = normalizeOptionText(c.value);

    if (normText === normDesired || normVal === normDesired) {
      return { candidate: c, score: 1.0, strategy: 'exact' };
    }
  }

  // 2. Creatable Option Match (e.g. `Create "Stanford"` or `+ Add "Stanford"`)
  for (const c of pool) {
    if (isCreatableOption(c.text, desiredValue)) {
      bestMatch = consider(bestMatch, c, 0.95, 'creatable');
    }
  }
  if (bestMatch && (bestMatch as MatchResult).strategy === 'creatable') {
    return bestMatch;
  }

  // 3. Synonym Matching via Dictionary
  // Determine dictionaries to inspect (either by explicit hint or all dictionaries)
  const dictsToTest: Record<string, string[]>[] = [];
  if (hintCategory && SYNONYM_DICTIONARIES[hintCategory]) {
    dictsToTest.push(SYNONYM_DICTIONARIES[hintCategory]);
  } else {
    Object.values(SYNONYM_DICTIONARIES).forEach((d) => dictsToTest.push(d));
  }

  for (const dict of dictsToTest) {
    const desiredCat = findCategoryKey(dict, desiredValue);
    if (desiredCat) {
      for (const c of pool) {
        const optCat = findCategoryKey(dict, c.text) || findCategoryKey(dict, c.value);
        if (optCat && optCat === desiredCat) {
          bestMatch = consider(bestMatch, c, 0.92, 'synonym');
          break;
        }
      }
    }
    if (bestMatch && (bestMatch as MatchResult).score >= 0.9) break;
  }

  if (bestMatch && (bestMatch as MatchResult).score >= 0.9) {
    return bestMatch;
  }

  // 4. StartsWith / Prefix Match
  for (const c of pool) {
    const normText = normalizeOptionText(c.text);
    const normVal = normalizeOptionText(c.value);
    if (normText.startsWith(normDesired) || normVal.startsWith(normDesired)) {
      bestMatch = consider(bestMatch, c, 0.85, 'starts_with');
    } else if (normDesired.startsWith(normText) && normText.length >= 3) {
      bestMatch = consider(bestMatch, c, 0.80, 'starts_with');
    }
  }

  if (bestMatch && (bestMatch as MatchResult).score >= 0.85) {
    return bestMatch;
  }

  // 5. Token Overlap / Substring Inclusion
  for (const c of pool) {
    const normText = normalizeOptionText(c.text);
    if (normText.includes(normDesired) || normDesired.includes(normText)) {
      bestMatch = consider(bestMatch, c, 0.75, 'token_overlap');
      continue;
    }

    const similarity = tokenSimilarity(c.text, desiredValue);
    if (similarity >= 0.5) {
      bestMatch = consider(bestMatch, c, 0.60 + similarity * 0.15, 'token_overlap');
    }
  }

  if (bestMatch && (bestMatch as MatchResult).score >= 0.65) {
    return bestMatch;
  }

  // 6. Fallback to "Other" / "Not Listed" if desired value represents other OR if no candidate matched
  // and the user's intent is to specify an unlisted option
  for (const c of pool) {
    if (isOtherOrFallbackOption(c.text)) {
      const score = normDesired.includes('other') || normDesired.includes('not listed') ? 0.80 : 0.50;
      bestMatch = consider(bestMatch, c, score, 'fallback_other');
      break;
    }
  }

  return bestMatch;
}
