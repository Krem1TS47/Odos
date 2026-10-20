import { z } from 'zod';

export const ContactInfoSchema = z.object({
  fullName: z.string().default(''),
  firstName: z.string().default(''),
  lastName: z.string().default(''),
  email: z.string().email().or(z.literal('')).default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  linkedin: z.string().optional().default(''),
  github: z.string().optional().default(''),
  website: z.string().optional().default('')
});

export const WorkAuthorizationSchema = z.object({
  authorizedCountries: z.array(z.string()).default([]),
  requiresSponsorship: z.boolean().default(false)
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
  summary: z.string().default('')
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

export const ProfileSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  contact: ContactInfoSchema.default({}),
  workAuthorization: WorkAuthorizationSchema.default({}),
  education: z.array(EducationItemSchema).default([]),
  experience: z.array(ExperienceItemSchema).default([]),
  skills: z.array(z.string()).default([]),
  resumes: z.array(ResumeMetadataSchema).default([])
});

export type ContactInfo = z.infer<typeof ContactInfoSchema>;
export type WorkAuthorization = z.infer<typeof WorkAuthorizationSchema>;
export type EducationItem = z.infer<typeof EducationItemSchema>;
export type ExperienceItem = z.infer<typeof ExperienceItemSchema>;
export type ResumeMetadata = z.infer<typeof ResumeMetadataSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

export const DEFAULT_PROFILE: Profile = {
  schemaVersion: 1,
  contact: {
    fullName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    github: '',
    website: ''
  },
  workAuthorization: {
    authorizedCountries: [],
    requiresSponsorship: false
  },
  education: [],
  experience: [],
  skills: [],
  resumes: []
};
