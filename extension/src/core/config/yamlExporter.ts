import YAML from 'yaml';
import { Profile, StoredAnswer } from '../models';

/**
 * Serializes Profile to formatted YAML string.
 */
export function exportProfileToYaml(profile: Profile, defaultResumeFileName?: string): string {
  const obj: Record<string, any> = {
    contact: {
      first_name: profile.contact.firstName,
      last_name: profile.contact.lastName,
      email: profile.contact.email,
      phone: profile.contact.phone,
      location: profile.contact.location,
      linkedin: profile.contact.linkedin || '',
      github: profile.contact.github || '',
      website: profile.contact.website || ''
    },
    work_authorization: {
      authorized_countries: profile.workAuthorization.authorizedCountries,
      requires_sponsorship: profile.workAuthorization.requiresSponsorship
    },
    education: profile.education.map((edu) => ({
      school: edu.school,
      degree: edu.degree,
      field: edu.field,
      start_date: edu.startDate,
      end_date: edu.endDate || '',
      gpa: edu.gpa || ''
    })),
    experience: profile.experience.map((exp) => ({
      company: exp.company,
      title: exp.title,
      start_date: exp.startDate,
      end_date: exp.endDate || '',
      summary: exp.summary || ''
    })),
    skills: profile.skills
  };

  const defaultResume =
    defaultResumeFileName ||
    profile.resumes.find((r) => r.isDefault)?.fileName ||
    profile.resumes[0]?.fileName;

  if (defaultResume) {
    obj.resumes = {
      default: defaultResume.startsWith('resumes/') ? defaultResume : `resumes/${defaultResume}`
    };
  }

  return YAML.stringify(obj);
}

/**
 * Serializes StoredAnswers to formatted YAML string.
 */
export function exportAnswersToYaml(answers: StoredAnswer[]): string {
  const obj = {
    answers: answers.map((ans) => ({
      category: ans.category,
      patterns: ans.questionPatterns,
      answer: ans.answer,
      autofill: ans.autoFill
    }))
  };

  return YAML.stringify(obj);
}
