import { Profile, StoredAnswer, StoredAnswerCategory, parseLocationString } from './models';
import { findStoredAnswerByKeywords } from './answerMatcher';

/**
 * Standardized Canonical Form Field Keys.
 * Covers personal details, URLs, work history, legal eligibility, and EEOC disclosures.
 */
export type CanonicalField =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'phone_country'
  | 'phone_device_type'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'state'
  | 'postal_code'
  | 'country'
  | 'location'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'website'
  | 'twitter'
  | 'current_company'
  | 'current_title'
  | 'years_experience'
  | 'education_school'
  | 'education_degree'
  | 'education_field'
  | 'education_start_date'
  | 'education_end_date'
  | 'education_gpa'
  | 'experience_company'
  | 'experience_title'
  | 'experience_start_date'
  | 'experience_end_date'
  | 'experience_summary'
  | 'website_type'
  | 'resume'
  | 'cover_letter'
  | 'salary_expectation'
  | 'start_date'
  | 'notice_period'
  | 'work_authorization'
  | 'requires_sponsorship'
  | 'relocation'
  | 'referral_source'
  | 'pronouns'
  | 'eeo_gender'
  | 'eeo_race'
  | 'eeo_veteran'
  | 'eeo_disability';

export const ALL_CANONICAL_FIELDS: readonly CanonicalField[] = [
  'first_name', 'last_name', 'full_name', 'email', 'phone', 'phone_country', 'phone_device_type',
  'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'location',
  'linkedin', 'github', 'portfolio', 'website', 'twitter', 'current_company', 'current_title',
  'years_experience', 'education_school', 'education_degree', 'education_field',
  'education_start_date', 'education_end_date', 'education_gpa', 'experience_company',
  'experience_title', 'experience_start_date', 'experience_end_date', 'experience_summary',
  'website_type', 'resume', 'cover_letter', 'salary_expectation', 'start_date', 'notice_period',
  'work_authorization', 'requires_sponsorship', 'relocation', 'referral_source', 'pronouns',
  'eeo_gender', 'eeo_race', 'eeo_veteran', 'eeo_disability'
];

/**
 * Sensitive fields that strictly require explicit opt-in / user-defined answers.
 * Default to blank / un-filled if not explicitly provided in profile or answers.
 */
export const SENSITIVE_CANONICAL_FIELDS: ReadonlySet<CanonicalField> = new Set([
  'work_authorization',
  'requires_sponsorship',
  'salary_expectation',
  'eeo_gender',
  'eeo_race',
  'eeo_veteran',
  'eeo_disability'
]);

export function isFieldSensitive(field: CanonicalField): boolean {
  return SENSITIVE_CANONICAL_FIELDS.has(field);
}

/**
 * Canonical field -> synonym dictionary used when matching dropdown options
 * (see SYNONYM_DICTIONARIES in dropdownResolver.ts).
 */
export const CANONICAL_DICTIONARY: Partial<Record<CanonicalField, string>> = {
  work_authorization: 'work_authorization',
  requires_sponsorship: 'sponsorship',
  education_degree: 'degree',
  phone_device_type: 'phone_type',
  website_type: 'website_type',
  eeo_gender: 'gender',
  eeo_veteran: 'veteran',
  eeo_disability: 'disability',
  country: 'country',
  phone_country: 'country',
  relocation: 'boolean'
};

/**
 * Picks the synonym dictionary for a dropdown fill from the canonical field, or from the
 * stored answer's category plus the question label when no canonical mapping exists.
 */
export function resolveDictionaryHint(
  canonical?: CanonicalField,
  category?: StoredAnswerCategory,
  label?: string
): string | undefined {
  if (canonical && CANONICAL_DICTIONARY[canonical]) return CANONICAL_DICTIONARY[canonical];
  const norm = (label || '').toLowerCase();
  if (category === 'eligibility') {
    if (/sponsor/.test(norm)) return 'sponsorship';
    if (/authori[sz]|eligib|legally|permitted/.test(norm)) return 'work_authorization';
    return 'boolean';
  }
  if (category === 'demographic') {
    if (/gender|sex/.test(norm)) return 'gender';
    if (/veteran|military/.test(norm)) return 'veteran';
    if (/disabilit|handicap|impairment/.test(norm)) return 'disability';
  }
  if (/degree|education level|highest education/.test(norm)) return 'degree';
  if (/phone (device )?type/.test(norm)) return 'phone_type';
  if (/website type|link type|url type/.test(norm)) return 'website_type';
  return undefined;
}

export interface ResolveOptions {
  /** Which repeatable row (education/experience) the field belongs to. Defaults to 0. */
  rowIndex?: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

/**
 * Parses loose date strings ("2020", "2020-05", "May 2020", "05/2020") into a fractional year.
 */
export function parseYearFraction(text: string | undefined | null, now: Date = new Date()): number | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^(present|current|now|ongoing|today)$/.test(t)) {
    return now.getFullYear() + (now.getMonth() + 1) / 12;
  }
  let m = t.match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?$/);
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) : 1) / 12;
  m = t.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return Number(m[2]) + Number(m[1]) / 12;
  m = t.match(/^([a-z]{3,9})\.?\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3)] ?? MONTHS[m[1]];
    return Number(m[2]) + (mon || 1) / 12;
  }
  m = t.match(/(\d{4})/);
  if (m) return Number(m[1]) + 1 / 12;
  return null;
}

/**
 * Derives total years of experience from experience date ranges (rounded down, min 0).
 */
export function deriveYearsExperience(profile: Profile, now: Date = new Date()): number | null {
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const exp of profile.experience || []) {
    const start = parseYearFraction(exp.startDate, now);
    const end = exp.isCurrent ? parseYearFraction('present', now) : parseYearFraction(exp.endDate, now) ?? parseYearFraction('present', now);
    if (start === null) continue;
    earliest = earliest === null ? start : Math.min(earliest, start);
    if (end !== null) latest = latest === null ? end : Math.max(latest, end);
  }
  if (earliest === null || latest === null) return null;
  return Math.max(0, Math.floor(latest - earliest));
}

function currentExperience(profile: Profile) {
  return profile.experience.find((e) => e.isCurrent) || profile.experience[0];
}

/**
 * Resolves the canonical field value from the user profile and stored answers.
 * Every CanonicalField has a case; a null return means the profile has no value, not that
 * the field is unsupported.
 */
export function resolveCanonicalValue(
  field: CanonicalField,
  profile: Profile,
  answers: StoredAnswer[] = [],
  options: ResolveOptions = {}
): string | null {
  const contact = profile.contact;
  const prefs = profile.preferences;
  const address = contact.address;
  const row = Math.max(0, options.rowIndex ?? 0);
  const loc = parseLocationString(contact.location || '');
  const edu = profile.education[row];
  const exp = profile.experience[row];

  switch (field) {
    case 'first_name':
      return contact.firstName || contact.fullName.split(' ')[0] || null;

    case 'last_name': {
      if (contact.lastName) return contact.lastName;
      const parts = contact.fullName.trim().split(/\s+/);
      return parts.length > 1 ? parts.slice(1).join(' ') : null;
    }

    case 'full_name':
      return contact.fullName || `${contact.firstName} ${contact.lastName}`.trim() || null;

    case 'email':
      return contact.email || null;

    case 'phone':
      return contact.phone || null;

    case 'phone_country': {
      if (address?.country) return address.country;
      if (loc.country) return loc.country;
      if ((contact.phone || '').trim().startsWith('+1')) return 'United States';
      return null;
    }

    case 'phone_device_type':
      return 'Mobile';

    case 'location':
      return contact.location || null;

    case 'address_line1':
      return address?.line1 || null;

    case 'address_line2':
      return address?.line2 || null;

    case 'city':
      return address?.city || loc.city || null;

    case 'state':
      return address?.state || loc.state || null;

    case 'postal_code':
      return address?.postalCode || null;

    case 'country':
      return address?.country || loc.country || null;

    case 'linkedin':
      return contact.linkedin || null;

    case 'github':
      return contact.github || null;

    case 'twitter':
      return contact.twitter || null;

    case 'pronouns':
      return contact.pronouns || null;

    case 'portfolio':
    case 'website':
      return contact.website || contact.linkedin || null;

    case 'current_company':
      return currentExperience(profile)?.company || null;

    case 'current_title':
      return currentExperience(profile)?.title || null;

    case 'years_experience': {
      if (prefs?.yearsExperience) return prefs.yearsExperience;
      const derived = deriveYearsExperience(profile);
      return derived === null ? null : String(derived);
    }

    case 'education_school':
      return edu?.school || null;

    case 'education_degree':
      return edu?.degree || null;

    case 'education_field':
      return edu?.field || null;

    case 'education_start_date':
      return edu?.startDate || null;

    case 'education_end_date':
      return edu?.endDate || null;

    case 'education_gpa':
      return edu?.gpa || null;

    case 'experience_company':
      return exp?.company || null;

    case 'experience_title':
      return exp?.title || null;

    case 'experience_start_date':
      return exp?.startDate || null;

    case 'experience_end_date':
      return exp ? (exp.isCurrent ? 'Present' : exp.endDate || null) : null;

    case 'experience_summary':
      return exp?.summary || null;

    case 'website_type':
      return contact.linkedin ? 'LinkedIn' : contact.github ? 'GitHub' : 'Portfolio';

    case 'work_authorization': {
      if (profile.workAuthorization.authorizedCountries.length === 0) return null;
      return 'Yes';
    }

    case 'requires_sponsorship':
      return profile.workAuthorization.requiresSponsorship ? 'Yes' : 'No';

    case 'relocation': {
      if (prefs?.willingToRelocate === 'yes') return 'Yes';
      if (prefs?.willingToRelocate === 'no') return 'No';
      return findStoredAnswerByKeywords(answers, ['relocate', 'relocation', 'willing to relocate'])?.answer || null;
    }

    case 'start_date':
      return prefs?.availability || findStoredAnswerByKeywords(answers, ['start date', 'earliest start', 'availability', 'available to start', 'when can you start'])?.answer || null;

    case 'notice_period':
      return prefs?.noticePeriod || findStoredAnswerByKeywords(answers, ['notice period', 'notice'])?.answer || null;

    case 'cover_letter':
      return prefs?.coverLetterTemplate || findStoredAnswerByKeywords(answers, ['cover letter', 'additional information'])?.answer || null;

    case 'referral_source':
      return findStoredAnswerByKeywords(answers, ['hear about', 'referral', 'referral source', 'where did you find', 'how did you find'])?.answer || null;

    case 'salary_expectation':
      return prefs?.salaryExpectation || findStoredAnswerByKeywords(answers, ['salary', 'hourly rate', 'compensation', 'pay rate', 'desired pay'])?.answer || null;

    case 'eeo_race':
      return findStoredAnswerByKeywords(answers, ['race', 'ethnicity'])?.answer || null;

    case 'eeo_gender':
      return findStoredAnswerByKeywords(answers, ['gender', 'sex', 'gender identity'])?.answer || null;

    case 'eeo_veteran':
      return findStoredAnswerByKeywords(answers, ['veteran', 'military status'])?.answer || null;

    case 'eeo_disability':
      return findStoredAnswerByKeywords(answers, ['disability', 'handicap'])?.answer || null;

    case 'resume':
      return profile.resumes.find((r) => r.isDefault)?.fileName || profile.resumes[0]?.fileName || null;

    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}
