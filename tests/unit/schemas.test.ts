import { describe, it, expect } from 'vitest';
import {
  ProfileSchema,
  JobSchema,
  ApplicationSchema,
  StoredAnswerSchema,
  DEFAULT_PROFILE
} from '../../extension/src/core/models';

describe('Core Zod Schemas', () => {
  it('validates default profile', () => {
    const result = ProfileSchema.safeParse(DEFAULT_PROFILE);
    expect(result.success).toBe(true);
  });

  it('validates custom profile with education and experience', () => {
    const custom = {
      schemaVersion: 1,
      contact: {
        fullName: 'Benjamin Ching',
        firstName: 'Benjamin',
        lastName: 'Ching',
        email: 'ben@example.com',
        phone: '1234567890',
        location: 'San Jose, CA',
        linkedin: 'https://linkedin.com/in/ben',
        github: 'https://github.com/ben',
        website: 'https://ben.com'
      },
      workAuthorization: {
        authorizedCountries: ['United States', 'Canada'],
        requiresSponsorship: false
      },
      education: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          school: 'University of British Columbia',
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          startDate: '2024-09',
          endDate: '2027-12',
          gpa: '3.8'
        }
      ],
      experience: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          company: 'Acme',
          title: 'Software Engineer',
          startDate: '2025-01',
          summary: 'Developed web applications.'
        }
      ],
      skills: ['TypeScript', 'React', 'Python'],
      resumes: []
    };

    const parsed = ProfileSchema.parse(custom);
    expect(parsed.contact.fullName).toBe('Benjamin Ching');
    expect(parsed.skills).toContain('TypeScript');
  });

  it('validates stored answers and checks autoFill defaults', () => {
    const answer = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      questionPatterns: ['how did you hear about us', 'where did you find this role'],
      category: 'logistics',
      answer: 'Company website',
      autoFill: true
    };
    const parsed = StoredAnswerSchema.parse(answer);
    expect(parsed.category).toBe('logistics');
    expect(parsed.autoFill).toBe(true);
  });

  it('validates job schema and requires company and url', () => {
    const job = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      company: 'Acme Corp',
      title: 'Frontend Engineer',
      url: 'https://boards.greenhouse.io/acme/jobs/123',
      firstSeenAt: new Date().toISOString(),
      dedupeKey: 'acmecorp::frontendengineer::https://boards.greenhouse.io/acme/jobs/123'
    };
    const parsed = JobSchema.parse(job);
    expect(parsed.company).toBe('Acme Corp');
  });

  it('validates application schema and default status', () => {
    const app = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      jobId: '550e8400-e29b-41d4-a716-446655440003',
      status: 'prefilled',
      prefilledAt: new Date().toISOString(),
      events: []
    };
    const parsed = ApplicationSchema.parse(app);
    expect(parsed.status).toBe('prefilled');
  });
});
