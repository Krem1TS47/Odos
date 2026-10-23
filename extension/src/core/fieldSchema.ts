import { Profile, StoredAnswer } from './models';

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
 * Resolves the canonical field value from the user profile and stored answers.
 */
export function resolveCanonicalValue(
  field: CanonicalField,
  profile: Profile,
  answers: StoredAnswer[] = []
): string | null {
  const contact = profile.contact;

  switch (field) {
    case 'first_name':
      return contact.firstName || contact.fullName.split(' ')[0] || null;

    case 'last_name':
      if (contact.lastName) return contact.lastName;
      const parts = contact.fullName.trim().split(/\s+/);
      return parts.length > 1 ? parts.slice(1).join(' ') : null;

    case 'full_name':
      return contact.fullName || `${contact.firstName} ${contact.lastName}`.trim() || null;

    case 'email':
      return contact.email || null;

    case 'phone':
      return contact.phone || null;

    case 'phone_device_type':
      return 'Mobile';

    case 'location':
      return contact.location || null;

    case 'city': {
      if (!contact.location) return null;
      const cityPart = contact.location.split(',')[0]?.trim();
      return cityPart || null;
    }

    case 'state': {
      if (!contact.location) return null;
      const locParts = contact.location.split(',').map((s) => s.trim());
      return locParts.length >= 2 ? locParts[1] : null;
    }

    case 'country': {
      if (!contact.location) return null;
      const locParts = contact.location.split(',').map((s) => s.trim());
      return locParts.length >= 3 ? locParts[locParts.length - 1] : null;
    }

    case 'linkedin':
      return contact.linkedin || null;

    case 'github':
      return contact.github || null;

    case 'portfolio':
    case 'website':
      return contact.website || contact.linkedin || null;

    case 'current_company': {
      const active = profile.experience.find((e) => (e as any).currentRole);
      return active?.company || profile.experience[0]?.company || null;
    }

    case 'current_title': {
      const active = profile.experience.find((e) => (e as any).currentRole);
      return active?.title || profile.experience[0]?.title || null;
    }

    case 'work_authorization': {
      if (profile.workAuthorization.authorizedCountries.length === 0) return null;
      return 'Yes';
    }

    case 'requires_sponsorship': {
      return profile.workAuthorization.requiresSponsorship ? 'Yes' : 'No';
    }

    case 'relocation': {
      const stored = findAnswerByKeywords(answers, ['relocate', 'relocation']);
      return stored?.answer || null;
    }

    case 'referral_source': {
      const stored = findAnswerByKeywords(answers, ['hear about', 'referral', 'source']);
      return stored?.answer || null;
    }

    case 'salary_expectation': {
      const stored = findAnswerByKeywords(answers, ['salary', 'hourly rate', 'compensation', 'pay rate']);
      return stored?.answer || null;
    }

    case 'eeo_race': {
      const stored = findAnswerByKeywords(answers, ['race', 'ethnicity']);
      return stored?.answer || null;
    }

    case 'eeo_gender': {
      const stored = findAnswerByKeywords(answers, ['gender', 'sex']);
      return stored?.answer || null;
    }

    case 'eeo_veteran': {
      const stored = findAnswerByKeywords(answers, ['veteran']);
      return stored?.answer || null;
    }

    case 'eeo_disability': {
      const stored = findAnswerByKeywords(answers, ['disability', 'handicap']);
      return stored?.answer || null;
    }

    case 'resume':
      return profile.resumes.find((r) => r.isDefault)?.fileName || profile.resumes[0]?.fileName || null;

    default:
      return null;
  }
}

function findAnswerByKeywords(answers: StoredAnswer[], keywords: string[]): StoredAnswer | undefined {
  return answers.find((ans) => {
    const text = ans.questionPatterns.join(' ').toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
}
