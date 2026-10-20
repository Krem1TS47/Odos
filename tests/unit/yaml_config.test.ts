import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseProfileYaml,
  parseAnswersYaml,
  parseFullYamlConfig,
  exportProfileToYaml,
  exportAnswersToYaml
} from '../../extension/src/core/config';
import { OdosDatabase } from '../../extension/src/core/storage/db';
import { StorageRepository } from '../../extension/src/core/storage/repository';

describe('Repo YAML Configuration (config/profile.yaml & config/answers.yaml)', () => {
  const profileYamlPath = path.resolve(__dirname, '../../config/profile.yaml');
  const answersYamlPath = path.resolve(__dirname, '../../config/answers.yaml');

  it('parses config/profile.yaml accurately', () => {
    const rawYaml = fs.readFileSync(profileYamlPath, 'utf-8');
    const { profile, defaultResumePath } = parseProfileYaml(rawYaml);

    expect(profile.contact.firstName).toBe('Benjamin');
    expect(profile.contact.lastName).toBe('Ching');
    expect(profile.contact.fullName).toBe('Benjamin Ching');
    expect(profile.contact.email).toBe('benbenching@gmail.com');
    expect(profile.contact.phone).toBe('+14088299844');
    expect(profile.contact.location).toBe('San Jose, California, United States');

    expect(profile.workAuthorization.authorizedCountries).toContain('United States');
    expect(profile.workAuthorization.authorizedCountries).toContain('Canada');
    expect(profile.workAuthorization.requiresSponsorship).toBe(false);

    expect(profile.education.length).toBeGreaterThan(0);
    expect(profile.education[0].school).toBe('University of British Columbia');
    expect(profile.education[0].degree).toBe('Bachelor of Science');

    expect(profile.experience.length).toBeGreaterThan(0);
    expect(profile.experience[0].company).toBe('Samsung');

    expect(profile.skills).toContain('TypeScript');
    expect(profile.skills).toContain('React');

    expect(defaultResumePath).toBe('resumes/Benjamin_Ching_Resume.pdf');
  });

  it('parses config/answers.yaml accurately with categories and autofill flags', () => {
    const rawYaml = fs.readFileSync(answersYamlPath, 'utf-8');
    const answers = parseAnswersYaml(rawYaml);

    expect(answers.length).toBeGreaterThanOrEqual(6);

    const hearJob = answers.find((a) => a.category === 'logistics');
    expect(hearJob).toBeDefined();
    expect(hearJob?.answer).toBe('Company website');
    expect(hearJob?.autoFill).toBe(true);

    const eligibility = answers.filter((a) => a.category === 'eligibility');
    expect(eligibility.length).toBeGreaterThanOrEqual(2);
    expect(eligibility.every((a) => a.autoFill === false)).toBe(true);

    const demographics = answers.filter((a) => a.category === 'demographic');
    expect(demographics.length).toBeGreaterThanOrEqual(3);

    const relocate = answers.find((a) => a.questionPatterns.some((p) => p.toLowerCase().includes('relocate')));
    expect(relocate).toBeDefined();
    expect(relocate?.answer).toBe('Yes');
    expect(relocate?.autoFill).toBe(true);

    const internship = answers.find((a) => a.questionPatterns.some((p) => p.toLowerCase().includes('12-week') || p.toLowerCase().includes('12 week')));
    expect(internship).toBeDefined();
    expect(internship?.answer).toBe('Yes');
    expect(internship?.autoFill).toBe(true);

    const hourlyRate = answers.find((a) => a.questionPatterns.some((p) => p.toLowerCase().includes('hourly rate')));
    expect(hourlyRate).toBeDefined();
    expect(hourlyRate?.answer).toBe('Open to discussion / Negotiable');
    expect(hourlyRate?.autoFill).toBe(true);

    const clearance = answers.find((a) => a.questionPatterns.some((p) => p.toLowerCase().includes('clearance')));
    expect(clearance).toBeDefined();
    expect(clearance?.answer).toBe('No');
    expect(clearance?.category).toBe('eligibility');
    expect(clearance?.autoFill).toBe(false);
  });

  it('roundtrips profile and answers between YAML and objects', () => {
    const rawProfile = fs.readFileSync(profileYamlPath, 'utf-8');
    const { profile } = parseProfileYaml(rawProfile);

    const exportedProfileYaml = exportProfileToYaml(profile, 'resumes/Benjamin_Ching_Resume.pdf');
    const reimportedProfile = parseProfileYaml(exportedProfileYaml);

    expect(reimportedProfile.profile.contact.fullName).toBe(profile.contact.fullName);
    expect(reimportedProfile.profile.contact.email).toBe(profile.contact.email);
    expect(reimportedProfile.profile.education[0].school).toBe(profile.education[0].school);

    const rawAnswers = fs.readFileSync(answersYamlPath, 'utf-8');
    const answers = parseAnswersYaml(rawAnswers);

    const exportedAnswersYaml = exportAnswersToYaml(answers);
    const reimportedAnswers = parseAnswersYaml(exportedAnswersYaml);

    expect(reimportedAnswers.length).toBe(answers.length);
    expect(reimportedAnswers[0].answer).toBe(answers[0].answer);
  });

  it('syncs YAML configuration into StorageRepository and Dexie IndexedDB', async () => {
    const db = new OdosDatabase(`TestSyncDB_${Math.random()}`);
    const repo = new StorageRepository(db);

    const rawProfile = fs.readFileSync(profileYamlPath, 'utf-8');
    const rawAnswers = fs.readFileSync(answersYamlPath, 'utf-8');
    const fullConfig = parseFullYamlConfig(rawProfile, rawAnswers);

    const base64Resume = btoa('%PDF-1.4 mock resume content');

    const result = await repo.syncFromYamlConfig({
      profile: fullConfig.profile,
      answers: fullConfig.answers,
      defaultResume: {
        fileName: 'Benjamin_Ching_Resume.pdf',
        fileType: 'application/pdf',
        dataBase64: base64Resume
      }
    }, true);

    expect(result.updated).toBe(true);
    expect(result.answersCount).toBeGreaterThan(0);
    expect(result.hasResume).toBe(true);

    const storedProfile = await repo.getProfile();
    expect(storedProfile.contact.fullName).toBe('Benjamin Ching');
    expect(storedProfile.resumes.length).toBe(1);
    expect(storedProfile.resumes[0].isDefault).toBe(true);

    const storedAnswers = await repo.listAnswers();
    expect(storedAnswers.length).toBeGreaterThanOrEqual(6);
  });
});
