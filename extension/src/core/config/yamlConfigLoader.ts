import YAML from 'yaml';
import { Profile, ProfileSchema, StoredAnswer, StoredAnswerCategory } from '../models';

export interface ParsedYamlConfig {
  profile: Profile;
  answers: StoredAnswer[];
  defaultResumePath?: string;
  warnings: string[];
}

/**
 * Parses and validates profile.yaml content.
 */
export function parseProfileYaml(yamlStr: string): { profile: Profile; defaultResumePath?: string } {
  const raw = YAML.parse(yamlStr);
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid YAML format: expected an object.');
  }

  // Support `contact` key (or fallback to `personal`)
  const contactRaw = raw.contact || raw.personal || {};
  const firstName = contactRaw.first_name || contactRaw.firstName || '';
  const lastName = contactRaw.last_name || contactRaw.lastName || '';
  const fullName = (contactRaw.full_name || contactRaw.fullName || `${firstName} ${lastName}`).trim();

  let locationStr = '';
  if (typeof contactRaw.location === 'object' && contactRaw.location !== null) {
    const parts = [contactRaw.location.city, contactRaw.location.state, contactRaw.location.country].filter(Boolean);
    locationStr = parts.join(', ');
  } else if (typeof contactRaw.location === 'string') {
    locationStr = contactRaw.location;
  }

  const phoneNum = contactRaw.phone || '';
  const areaCode = contactRaw.area || '';
  const formattedPhone = phoneNum ? `${areaCode}${phoneNum}`.trim() : '';

  const contact = {
    fullName,
    firstName,
    lastName,
    email: contactRaw.email || '',
    phone: formattedPhone,
    location: locationStr,
    linkedin: contactRaw.linkedin || '',
    github: contactRaw.github || '',
    website: contactRaw.website || contactRaw.portfolio || ''
  };

  // Work Authorization
  const workAuthRaw = raw.work_authorization || raw.workAuthorization || {};
  const countries = workAuthRaw.authorized_countries || workAuthRaw.authorized_to_work_in || workAuthRaw.authorizedCountries || [];
  const requiresSponsorship = Boolean(workAuthRaw.requires_sponsorship ?? workAuthRaw.requiresSponsorship ?? false);

  const workAuthorization = {
    authorizedCountries: Array.isArray(countries) ? countries.map(String) : [],
    requiresSponsorship
  };

  // Education
  const educationRaw = Array.isArray(raw.education) ? raw.education : [];
  const education = educationRaw.map((edu: any) => ({
    id: edu.id || crypto.randomUUID(),
    school: edu.school || '',
    degree: edu.degree || '',
    field: edu.field || '',
    startDate: edu.start_date || edu.startDate || edu.start || '',
    endDate: edu.end_date || edu.endDate || edu.end || '',
    gpa: edu.gpa ? String(edu.gpa) : ''
  }));

  // Experience
  const expRaw = Array.isArray(raw.experience) ? raw.experience : [];
  const experience = expRaw.map((exp: any) => ({
    id: exp.id || crypto.randomUUID(),
    company: exp.company || '',
    title: exp.title || '',
    startDate: exp.start_date || exp.startDate || exp.start || '',
    endDate: exp.end_date || exp.endDate || exp.end || '',
    summary: exp.summary || ''
  }));

  // Skills
  const skills = Array.isArray(raw.skills) ? raw.skills.map(String) : [];

  // Default Resume path from YAML
  let defaultResumePath: string | undefined = undefined;
  if (raw.resumes && typeof raw.resumes === 'object') {
    if (typeof raw.resumes.default === 'string') {
      defaultResumePath = raw.resumes.default;
    }
  }

  // Assembled in the v1 shape; ProfileSchema migrates it to the current version.
  const profile = {
    schemaVersion: 1,
    contact,
    workAuthorization,
    education,
    experience,
    skills,
    resumes: []
  };

  const validated = ProfileSchema.parse(profile);
  return { profile: validated, defaultResumePath };
}

/**
 * Parses and validates answers.yaml content.
 */
export function parseAnswersYaml(yamlStr: string): StoredAnswer[] {
  const raw = YAML.parse(yamlStr);
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid YAML format: expected an object.');
  }

  const answers: StoredAnswer[] = [];

  // New structured array format: `answers: [ { category, patterns, answer, autofill } ]`
  if (Array.isArray(raw.answers)) {
    for (const item of raw.answers) {
      if (!item || typeof item !== 'object') continue;

      const category: StoredAnswerCategory =
        ['eligibility', 'demographic', 'motivation', 'logistics', 'other'].includes(item.category)
          ? item.category
          : 'other';

      const patterns = Array.isArray(item.patterns)
        ? item.patterns.map(String).filter(Boolean)
        : item.pattern
        ? [String(item.pattern)]
        : [];

      if (patterns.length === 0) continue;

      answers.push({
        id: item.id || crypto.randomUUID(),
        questionPatterns: patterns,
        category,
        answer: String(item.answer || ''),
        autoFill: Boolean(item.autofill ?? item.autoFill ?? false)
      });
    }
    return answers;
  }

  // Fallback support for flat YAML keys
  const addAnswer = (
    patterns: string[],
    answer: string,
    category: StoredAnswerCategory,
    autoFill: boolean
  ) => {
    if (!answer || typeof answer !== 'string' || !answer.trim()) return;
    answers.push({
      id: crypto.randomUUID(),
      questionPatterns: patterns,
      category,
      answer: answer.trim(),
      autoFill
    });
  };

  if (raw.how_did_you_hear) {
    addAnswer(['How did you hear about this role?', 'How did you hear about us?'], raw.how_did_you_hear, 'logistics', true);
  }
  if (raw.why_interested_template) {
    addAnswer(['Why are you interested in this position?'], raw.why_interested_template, 'motivation', false);
  }
  if (raw.strengths) {
    addAnswer(['What are your greatest strengths?'], raw.strengths, 'motivation', false);
  }
  if (raw.biggest_achievement) {
    addAnswer(['What is your greatest accomplishment?'], raw.biggest_achievement, 'motivation', false);
  }

  return answers;
}

/**
 * Parses both profile and answers YAML files into complete application configuration.
 */
export function parseFullYamlConfig(profileYamlStr?: string, answersYamlStr?: string): ParsedYamlConfig {
  const warnings: string[] = [];
  let profile: Profile = ProfileSchema.parse({});
  let defaultResumePath: string | undefined = undefined;

  if (profileYamlStr) {
    try {
      const parsed = parseProfileYaml(profileYamlStr);
      profile = parsed.profile;
      defaultResumePath = parsed.defaultResumePath;
    } catch (err: any) {
      warnings.push(`Profile YAML error: ${err.message}`);
    }
  }

  let answers: StoredAnswer[] = [];
  if (answersYamlStr) {
    try {
      answers = parseAnswersYaml(answersYamlStr);
    } catch (err: any) {
      warnings.push(`Answers YAML error: ${err.message}`);
    }
  }

  return {
    profile,
    answers,
    defaultResumePath,
    warnings
  };
}
