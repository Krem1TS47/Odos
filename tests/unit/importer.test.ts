import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { importV1, importV1Profile, importV1Answers } from '../../extension/src/core/importer/v1Importer';

describe('v1 YAML Importer', () => {
  const profileYamlPath = path.resolve(__dirname, '../../legacy/data/profile.yaml');
  const answersYamlPath = path.resolve(__dirname, '../../legacy/data/answers.yaml');

  it('imports legacy profile.yaml correctly', () => {
    const yamlStr = fs.readFileSync(profileYamlPath, 'utf-8');
    const result = importV1Profile(yamlStr);

    expect(result.profile).toBeDefined();
    expect(result.profile.contact.firstName).toBe('Benjamin');
    expect(result.profile.contact.lastName).toBe('Ching');
    expect(result.profile.contact.fullName).toBe('Benjamin Ching');
    expect(result.profile.contact.email).toBe('benbenching@gmail.com');
    expect(result.profile.contact.phone).toBe('+14088299844');
    expect(result.profile.contact.location).toBe('San Jose, California, United States');
    expect(result.profile.workAuthorization.authorizedCountries).toContain('Canada');
    expect(result.profile.workAuthorization.authorizedCountries).toContain('United States');
    expect(result.profile.workAuthorization.requiresSponsorship).toBe(false);

    expect(result.profile.education.length).toBeGreaterThan(0);
    expect(result.profile.education[0].school).toBe('University of British Columbia');

    expect(result.profile.experience.length).toBeGreaterThan(0);
    expect(result.profile.experience[0].company).toBe('Samsung');

    // Sensitive disclosures/demographics converted to StoredAnswers with autoFill = false
    expect(result.answersFromProfile.length).toBeGreaterThan(0);
    const ageAnswer = result.answersFromProfile.find(a => a.questionPatterns.some(p => p.includes('18')));
    expect(ageAnswer?.answer).toBe('Yes');
    expect(ageAnswer?.autoFill).toBe(false);
  });

  it('imports legacy answers.yaml correctly', () => {
    const yamlStr = fs.readFileSync(answersYamlPath, 'utf-8');
    const answers = importV1Answers(yamlStr);

    const hearAnswer = answers.find(a => a.category === 'logistics');
    expect(hearAnswer).toBeDefined();
    expect(hearAnswer?.answer).toBe('Company website');
    expect(hearAnswer?.autoFill).toBe(true);
  });

  it('performs full import with combined results', () => {
    const profileStr = fs.readFileSync(profileYamlPath, 'utf-8');
    const answersStr = fs.readFileSync(answersYamlPath, 'utf-8');

    const combined = importV1(profileStr, answersStr);
    expect(combined.profile).toBeDefined();
    expect(combined.answers.length).toBeGreaterThan(2);
  });
});
