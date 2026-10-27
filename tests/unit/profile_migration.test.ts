import { describe, it, expect } from 'vitest';
import { ProfileSchema, DEFAULT_PROFILE, migrateProfileInput, PROFILE_SCHEMA_VERSION, Profile, StoredAnswer } from '../../extension/src/core/models';
import { ALL_CANONICAL_FIELDS, resolveCanonicalValue, deriveYearsExperience, parseYearFraction, resolveDictionaryHint } from '../../extension/src/core/fieldSchema';
import { OdosDatabase } from '../../extension/src/core/storage/db';
import { StorageRepository } from '../../extension/src/core/storage/repository';

const v1 = {
  schemaVersion: 1,
  contact: { fullName: 'Ada Lovelace', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+14155551234', location: 'San Jose, CA, United States', linkedin: 'https://linkedin.com/in/ada', github: '', website: '' },
  workAuthorization: { authorizedCountries: ['United States'], requiresSponsorship: false },
  education: [{ id: 'e1', school: 'MIT', degree: 'BS', field: 'CS', startDate: '2016', endDate: '2020', gpa: '3.9' }],
  experience: [{ id: 'x1', company: 'Acme', title: 'Engineer', startDate: '2020-06', endDate: 'Present', summary: '' }],
  skills: ['TypeScript'],
  resumes: []
};

describe('Profile v1 -> v2 migration (R8)', () => {
  it('migrates a v1 record without losing data and fills new fields with defaults', () => {
    const parsed = ProfileSchema.parse(v1);
    expect(parsed.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(parsed.contact.fullName).toBe('Ada Lovelace');
    expect(parsed.contact.address).toEqual({ line1: '', line2: '', city: 'San Jose', state: 'CA', postalCode: '', country: 'United States' });
    expect(parsed.contact.pronouns).toBe('');
    expect(parsed.preferences.availability).toBe('');
    expect(parsed.experience[0].isCurrent).toBe(true);
    expect(parsed.education[0].school).toBe('MIT');
  });

  it('leaves v2 input untouched and tolerates garbage input in the migrator', () => {
    expect(migrateProfileInput(DEFAULT_PROFILE)).toBe(DEFAULT_PROFILE);
    expect(migrateProfileInput(null)).toBeNull();
    expect(migrateProfileInput('nope')).toBe('nope');
    expect(ProfileSchema.safeParse({ schemaVersion: 1, contact: { email: 'not-an-email' } }).success).toBe(false);
  });

  it('a malformed stored profile is reported, not silently replaced, and storage is untouched', async () => {
    const db = new OdosDatabase(`MigrateDB_${Math.random()}`);
    const repo = new StorageRepository(db);
    const broken = { schemaVersion: 1, contact: { email: 'definitely not an email', fullName: 'Keep Me' } };
    await db.profile.put({ key: 'current', profile: broken as any, updatedAt: new Date().toISOString() });

    const loaded = await repo.getProfile();
    expect(loaded.contact.fullName).toBe('');
    const status = repo.getProfileLoadStatus();
    expect(status.ok).toBe(false);
    expect(status.issue).toContain('could not be read');

    const stillStored = await db.profile.get('current');
    expect((stillStored!.profile as any).contact.fullName).toBe('Keep Me');
  });

  it('round-trips a v1 record through the repository as v2', async () => {
    const db = new OdosDatabase(`MigrateDB2_${Math.random()}`);
    const repo = new StorageRepository(db);
    await db.profile.put({ key: 'current', profile: v1 as any, updatedAt: new Date().toISOString() });
    const loaded = await repo.getProfile();
    expect(loaded.schemaVersion).toBe(2);
    expect(repo.getProfileLoadStatus().ok).toBe(true);
    expect(repo.getProfileLoadStatus().storedVersion).toBe(1);
  });
});

describe('Canonical resolver coverage (every key resolves to something or null, never throws)', () => {
  const full: Profile = ProfileSchema.parse({
    ...v1,
    contact: { ...v1.contact, twitter: 'https://x.com/ada', pronouns: 'she/her', address: { line1: '1 Main St', line2: 'Apt 2', city: 'San Jose', state: 'CA', postalCode: '95110', country: 'United States' } },
    preferences: { availability: 'Immediately', noticePeriod: '2 weeks', yearsExperience: '', salaryExpectation: '$150,000', willingToRelocate: 'yes', coverLetterTemplate: 'Dear team' },
    resumes: [{ id: 'r', label: 'Main', fileName: 'ada.pdf', fileType: 'application/pdf', fileSize: 1, isDefault: true, uploadedAt: '2026-01-01' }]
  });
  const answers: StoredAnswer[] = [
    { id: 'race', questionPatterns: ['Race / Ethnicity'], category: 'demographic', answer: 'Asian', autoFill: false },
    { id: 'hear', questionPatterns: ['How did you hear about us?'], category: 'logistics', answer: 'LinkedIn', autoFill: true }
  ];

  const EXPECTED: Partial<Record<(typeof ALL_CANONICAL_FIELDS)[number], string | null>> = {
    first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace', email: 'ada@example.com', phone: '+14155551234',
    phone_country: 'United States', phone_device_type: 'Mobile', address_line1: '1 Main St', address_line2: 'Apt 2', city: 'San Jose',
    state: 'CA', postal_code: '95110', country: 'United States', location: 'San Jose, CA, United States', linkedin: 'https://linkedin.com/in/ada',
    github: null, portfolio: 'https://linkedin.com/in/ada', website: 'https://linkedin.com/in/ada', twitter: 'https://x.com/ada',
    current_company: 'Acme', current_title: 'Engineer', education_school: 'MIT', education_degree: 'BS', education_field: 'CS',
    education_start_date: '2016', education_end_date: '2020', education_gpa: '3.9', experience_company: 'Acme', experience_title: 'Engineer',
    experience_start_date: '2020-06', experience_end_date: 'Present', experience_summary: null, website_type: 'LinkedIn', resume: 'ada.pdf',
    cover_letter: 'Dear team', salary_expectation: '$150,000', start_date: 'Immediately', notice_period: '2 weeks', work_authorization: 'Yes',
    requires_sponsorship: 'No', relocation: 'Yes', referral_source: 'LinkedIn', pronouns: 'she/her', eeo_gender: null, eeo_race: 'Asian',
    eeo_veteran: null, eeo_disability: null
  };

  it.each(ALL_CANONICAL_FIELDS)('%s', (key) => {
    const v = resolveCanonicalValue(key, full, answers);
    if (key === 'years_experience') {
      expect(Number(v)).toBeGreaterThanOrEqual(5);
      return;
    }
    expect(v).toBe(EXPECTED[key]);
  });

  it('derives years of experience from date ranges and parses loose dates', () => {
    expect(parseYearFraction('May 2020')).toBeCloseTo(2020 + 5 / 12, 3);
    expect(parseYearFraction('05/2020')).toBeCloseTo(2020 + 5 / 12, 3);
    expect(parseYearFraction('2020-05')).toBeCloseTo(2020 + 5 / 12, 3);
    const p: Profile = ProfileSchema.parse({ ...v1, experience: [{ id: 'a', company: 'A', title: 'T', startDate: '2015-01', endDate: '2018-01' }, { id: 'b', company: 'B', title: 'T', startDate: '2018-01', endDate: '2021-01' }] });
    expect(deriveYearsExperience(p, new Date('2026-10-26'))).toBe(6);
    expect(resolveCanonicalValue('years_experience', p)).toBe('6');
  });

  it('resolves dropdown dictionary hints from canonical, category and label', () => {
    expect(resolveDictionaryHint('requires_sponsorship')).toBe('sponsorship');
    expect(resolveDictionaryHint('work_authorization')).toBe('work_authorization');
    expect(resolveDictionaryHint(undefined, 'eligibility', 'Do you require sponsorship?')).toBe('sponsorship');
    expect(resolveDictionaryHint(undefined, 'eligibility', 'Are you authorized to work?')).toBe('work_authorization');
    expect(resolveDictionaryHint(undefined, 'demographic', 'Veteran status')).toBe('veteran');
    expect(resolveDictionaryHint(undefined, 'other', 'Favorite color')).toBeUndefined();
  });
});
