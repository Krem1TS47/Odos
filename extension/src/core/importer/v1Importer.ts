import YAML from 'yaml';
import { Profile, ProfileSchema, StoredAnswer, StoredAnswerCategory } from '../models';

export interface V1ImportResult {
  profile?: Profile;
  answers: StoredAnswer[];
  warnings: string[];
}

export function importV1Profile(yamlContent: string): { profile: Profile; answersFromProfile: StoredAnswer[]; warnings: string[] } {
  const warnings: string[] = [];
  const answersFromProfile: StoredAnswer[] = [];

  const raw = YAML.parse(yamlContent);
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid YAML format for profile.');
  }

  const personal = raw.personal || {};
  const firstName = personal.first_name || '';
  const lastName = personal.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  let locationStr = '';
  if (typeof personal.location === 'object' && personal.location !== null) {
    const parts = [personal.location.city, personal.location.state, personal.location.country].filter(Boolean);
    locationStr = parts.join(', ');
  } else if (typeof personal.location === 'string') {
    locationStr = personal.location;
  }

  const contact = {
    fullName,
    firstName,
    lastName,
    email: personal.email || '',
    phone: personal.phone ? `${personal.area || ''}${personal.phone}`.trim() : '',
    location: locationStr,
    linkedin: personal.linkedin || '',
    github: personal.github || '',
    website: personal.portfolio || personal.website || ''
  };

  const workAuthRaw = raw.work_authorization || {};
  const workAuthorization = {
    authorizedCountries: Array.isArray(workAuthRaw.authorized_to_work_in)
      ? workAuthRaw.authorized_to_work_in
      : [],
    requiresSponsorship: Boolean(workAuthRaw.requires_sponsorship)
  };

  const education = Array.isArray(raw.education)
    ? raw.education.map((edu: any) => ({
        id: crypto.randomUUID(),
        school: edu.school || '',
        degree: edu.degree || '',
        field: edu.field || '',
        startDate: edu.start || '',
        endDate: edu.end || '',
        gpa: edu.gpa ? String(edu.gpa) : ''
      }))
    : [];

  const experience = Array.isArray(raw.experience)
    ? raw.experience.map((exp: any) => ({
        id: crypto.randomUUID(),
        company: exp.company || '',
        title: exp.title || '',
        startDate: exp.start || '',
        endDate: exp.end || '',
        summary: exp.summary || ''
      }))
    : [];

  const skills = Array.isArray(raw.skills) ? raw.skills : [];

  // Convert disclosures and demographics into StoredAnswers (sensitive: autoFill = false)
  if (raw.disclosures) {
    if (raw.disclosures.at_least_18_years_of_age !== undefined) {
      answersFromProfile.push({
        id: crypto.randomUUID(),
        questionPatterns: ['Are you at least 18 years old?', 'Are you 18 years of age or older?'],
        category: 'eligibility',
        answer: raw.disclosures.at_least_18_years_of_age ? 'Yes' : 'No',
        autoFill: false
      });
    }
    if (raw.disclosures.is_government_official !== undefined) {
      answersFromProfile.push({
        id: crypto.randomUUID(),
        questionPatterns: ['Are you a government official?', 'Are you currently or formerly a government official?'],
        category: 'eligibility',
        answer: raw.disclosures.is_government_official ? 'Yes' : 'No',
        autoFill: false
      });
    }
  }

  if (raw.demographics) {
    if (raw.demographics.race) {
      answersFromProfile.push({
        id: crypto.randomUUID(),
        questionPatterns: ['Race', 'Ethnicity', 'Race / Ethnicity'],
        category: 'demographic',
        answer: String(raw.demographics.race),
        autoFill: false
      });
    }
    if (raw.demographics.gender) {
      answersFromProfile.push({
        id: crypto.randomUUID(),
        questionPatterns: ['Gender', 'Sex'],
        category: 'demographic',
        answer: String(raw.demographics.gender),
        autoFill: false
      });
    }
    if (raw.demographics.veteran_status !== undefined) {
      answersFromProfile.push({
        id: crypto.randomUUID(),
        questionPatterns: ['Veteran Status', 'Are you a protected veteran?'],
        category: 'demographic',
        answer: raw.demographics.veteran_status ? 'Yes' : 'No',
        autoFill: false
      });
    }
    if (raw.demographics.disability_status !== undefined) {
      answersFromProfile.push({
        id: crypto.randomUUID(),
        questionPatterns: ['Disability Status', 'Do you have a disability?'],
        category: 'demographic',
        answer: raw.demographics.disability_status ? 'Yes' : 'No',
        autoFill: false
      });
    }
  }

  const profile: Profile = {
    schemaVersion: 1,
    contact,
    workAuthorization,
    education,
    experience,
    skills,
    resumes: []
  };

  const parsed = ProfileSchema.parse(profile);
  return { profile: parsed, answersFromProfile, warnings };
}

export function importV1Answers(yamlContent: string): StoredAnswer[] {
  const raw = YAML.parse(yamlContent);
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid YAML format for answers.');
  }

  const answers: StoredAnswer[] = [];

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
    addAnswer(
      ['How did you hear about this role?', 'How did you hear about us?', 'Where did you find this position?'],
      raw.how_did_you_hear,
      'logistics',
      true
    );
  }

  if (raw.why_interested_template) {
    addAnswer(
      ['Why are you interested in this position?', 'Why do you want to work at this company?'],
      raw.why_interested_template,
      'motivation',
      false
    );
  }

  if (raw.strengths) {
    addAnswer(
      ['What are your greatest strengths?', 'What is your top skill?'],
      raw.strengths,
      'motivation',
      false
    );
  }

  if (raw.biggest_achievement) {
    addAnswer(
      ['What is your greatest accomplishment?', 'Biggest professional achievement'],
      raw.biggest_achievement,
      'motivation',
      false
    );
  }

  if (raw.custom && typeof raw.custom === 'object') {
    for (const [key, val] of Object.entries(raw.custom)) {
      if (typeof val === 'string' && val.trim()) {
        const pattern = key.replace(/_/g, ' ');
        addAnswer([pattern], val, 'other', false);
      }
    }
  }

  return answers;
}

export function importV1(profileYaml?: string, answersYaml?: string): V1ImportResult {
  let profile: Profile | undefined;
  const answers: StoredAnswer[] = [];
  const warnings: string[] = [];

  if (profileYaml) {
    const res = importV1Profile(profileYaml);
    profile = res.profile;
    answers.push(...res.answersFromProfile);
    warnings.push(...res.warnings);
  }

  if (answersYaml) {
    const ansList = importV1Answers(answersYaml);
    answers.push(...ansList);
  }

  return { profile, answers, warnings };
}
