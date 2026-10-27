import { z } from 'zod';

/**
 * Profile schema v2 (eng review R8).
 *
 * v1 -> v2 adds: contact.pronouns, contact.twitter, contact.address (structured),
 * preferences (availability, notice period, years of experience, salary expectation,
 * relocation, cover letter template) and experience[].isCurrent.
 * Old v1 records are migrated on parse by `migrateProfileInput`; nothing is dropped.
 */

export const PROFILE_SCHEMA_VERSION = 2 as const;

export const AddressSchema = z.object({
  line1: z.string().default(''),
  line2: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  postalCode: z.string().default(''),
  country: z.string().default('')
});

export const ContactInfoSchema = z.object({
  fullName: z.string().default(''),
  firstName: z.string().default(''),
  lastName: z.string().default(''),
  email: z.string().email().or(z.literal('')).default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  linkedin: z.string().optional().default(''),
  github: z.string().optional().default(''),
  website: z.string().optional().default(''),
  twitter: z.string().optional().default(''),
  pronouns: z.string().optional().default(''),
  address: AddressSchema.default({})
});

export const WorkAuthorizationSchema = z.object({
  authorizedCountries: z.array(z.string()).default([]),
  requiresSponsorship: z.boolean().default(false)
});

export const PreferencesSchema = z.object({
  /** Earliest start date / availability, free text (e.g. "Immediately", "2 weeks", "2026-01-15"). */
  availability: z.string().default(''),
  /** Notice period, free text (e.g. "2 weeks"). */
  noticePeriod: z.string().default(''),
  /** Years of professional experience; blank means derive from experience dates. */
  yearsExperience: z.string().default(''),
  /** Salary expectation. Sensitive: only filled when explicitly set. */
  salaryExpectation: z.string().default(''),
  /** '' = unknown, 'yes' | 'no'. */
  willingToRelocate: z.enum(['', 'yes', 'no']).default(''),
  /** Default cover letter / additional information text. */
  coverLetterTemplate: z.string().default('')
});

export const EducationItemSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  school: z.string().default(''),
  degree: z.string().default(''),
  field: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().optional().default(''),
  gpa: z.string().optional().default('')
});

export const ExperienceItemSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  company: z.string().default(''),
  title: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().optional().default(''),
  summary: z.string().default(''),
  isCurrent: z.boolean().default(false)
});

export const ResumeMetadataSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  label: z.string().default('Default Resume'),
  fileName: z.string(),
  fileType: z.string().default('application/pdf'),
  fileSize: z.number().default(0),
  isDefault: z.boolean().default(false),
  uploadedAt: z.string().default(() => new Date().toISOString())
});

const ProfileV2Schema = z.object({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION).default(PROFILE_SCHEMA_VERSION),
  contact: ContactInfoSchema.default({}),
  workAuthorization: WorkAuthorizationSchema.default({}),
  preferences: PreferencesSchema.default({}),
  education: z.array(EducationItemSchema).default([]),
  experience: z.array(ExperienceItemSchema).default([]),
  skills: z.array(z.string()).default([]),
  resumes: z.array(ResumeMetadataSchema).default([])
});

/**
 * Splits a free-text location ("San Jose, CA, United States") into address parts.
 */
export function parseLocationString(location: string): { city: string; state: string; country: string } {
  const parts = (location || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { city: '', state: '', country: '' };
  if (parts.length === 1) return { city: parts[0], state: '', country: '' };
  if (parts.length === 2) return { city: parts[0], state: parts[1], country: '' };
  return { city: parts[0], state: parts[1], country: parts[parts.length - 1] };
}

/**
 * Migrates any older (or partial) profile record to the v2 shape. Pure: never throws
 * on unknown input shapes; validation happens in the schema afterwards.
 */
export function migrateProfileInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const input = raw as Record<string, any>;
  const version = typeof input.schemaVersion === 'number' ? input.schemaVersion : 1;
  if (version >= PROFILE_SCHEMA_VERSION) return input;

  const contact = { ...(input.contact || {}) };
  if (!contact.address || typeof contact.address !== 'object') {
    const parsed = parseLocationString(typeof contact.location === 'string' ? contact.location : '');
    contact.address = { line1: '', line2: '', city: parsed.city, state: parsed.state, postalCode: '', country: parsed.country };
  }

  const experience = Array.isArray(input.experience)
    ? input.experience.map((exp: any) => {
        if (!exp || typeof exp !== 'object') return exp;
        if (typeof exp.isCurrent === 'boolean') return exp;
        const end = typeof exp.endDate === 'string' ? exp.endDate.trim().toLowerCase() : '';
        const isCurrent = end === 'present' || end === 'current' || end === 'now';
        return { ...exp, isCurrent };
      })
    : input.experience;

  return {
    ...input,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    contact,
    preferences: input.preferences && typeof input.preferences === 'object' ? input.preferences : {},
    experience
  };
}

export const ProfileSchema = z.preprocess(migrateProfileInput, ProfileV2Schema);

export type Address = z.infer<typeof AddressSchema>;
export type ContactInfo = z.infer<typeof ContactInfoSchema>;
export type WorkAuthorization = z.infer<typeof WorkAuthorizationSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type EducationItem = z.infer<typeof EducationItemSchema>;
export type ExperienceItem = z.infer<typeof ExperienceItemSchema>;
export type ResumeMetadata = z.infer<typeof ResumeMetadataSchema>;
export type Profile = z.infer<typeof ProfileV2Schema>;

export const DEFAULT_PROFILE: Profile = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  contact: {
    fullName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    github: '',
    website: '',
    twitter: '',
    pronouns: '',
    address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' }
  },
  workAuthorization: {
    authorizedCountries: [],
    requiresSponsorship: false
  },
  preferences: {
    availability: '',
    noticePeriod: '',
    yearsExperience: '',
    salaryExpectation: '',
    willingToRelocate: '',
    coverLetterTemplate: ''
  },
  education: [],
  experience: [],
  skills: [],
  resumes: []
};
