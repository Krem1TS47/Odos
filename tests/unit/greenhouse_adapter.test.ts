import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GreenhouseAdapter } from '../../extension/src/content/adapters/greenhouse';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { Profile, StoredAnswer, DEFAULT_PROFILE } from '../../extension/src/core/models';

describe('Greenhouse Adapter & Autofill Engine (Fixture Tests)', () => {
  let adapter: GreenhouseAdapter;
  let fixtureHtml: string;

  beforeEach(() => {
    adapter = new GreenhouseAdapter();
    const fixturePath = path.resolve(__dirname, '../fixtures/greenhouse_job_board.html');
    fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
    document.documentElement.innerHTML = fixtureHtml;
  });

  it('matches greenhouse URL and embedded forms', () => {
    const url = new URL('https://boards.greenhouse.io/acme/jobs/12345');
    expect(adapter.matches(url, document)).toBe(true);

    const otherUrl = new URL('https://example.com/careers');
    // Still matches because the fixture DOM has an embedded greenhouse form!
    expect(adapter.matches(otherUrl, document)).toBe(true);
  });

  it('extracts job details accurately from fixture', () => {
    const url = new URL('https://boards.greenhouse.io/acme/jobs/12345');
    const job = adapter.extractJob(document, url);

    expect(job.company).toBe('Acme Corp');
    expect(job.title).toBe('Frontend Engineer');
    expect(job.location).toContain('San Francisco');
    expect(job.descriptionText).toContain('skilled Frontend Engineer');
  });

  it('discovers all application form fields without submit controls', () => {
    const fields = adapter.discoverFields(document);
    expect(fields.length).toBeGreaterThanOrEqual(10);

    const labels = fields.map((f) => f.label.toLowerCase());
    expect(labels).toContain('first name');
    expect(labels).toContain('last name');
    expect(labels).toContain('email');
    expect(labels).toContain('phone');
    expect(labels).toContain('resume/cv');

    // Submit Guard verification: No field may be a submit button
    const submitElements = fields.filter((f) => f.type as any === 'submit' || f.element.tagName === 'BUTTON');
    expect(submitElements.length).toBe(0);
  });

  it('executes autofill on discovered fields using profile and stored answers', async () => {
    const fields = adapter.discoverFields(document);

    const profile: Profile = {
      ...DEFAULT_PROFILE,
      contact: {
        ...DEFAULT_PROFILE.contact,
        firstName: 'Benjamin',
        lastName: 'Ching',
        fullName: 'Benjamin Ching',
        email: 'benbenching@gmail.com',
        phone: '4088299844',
        location: 'San Jose, CA',
        linkedin: 'https://linkedin.com/in/ben',
        github: 'https://github.com/ben',
        website: 'https://ben.com'
      },
      workAuthorization: {
        authorizedCountries: ['United States'],
        requiresSponsorship: false
      }
    };

    const answers: StoredAnswer[] = [
      {
        id: 'ans-1',
        questionPatterns: ['how did you hear about this job', 'where did you hear'],
        category: 'logistics',
        answer: 'Company website',
        autoFill: true
      }
    ];

    const resumeBuffer = new TextEncoder().encode('%PDF-1.4 sample resume content').buffer;

    const result = await executeAutofill(fields, {
      profile,
      answers,
      resumeFile: {
        fileName: 'Benjamin_Ching_Resume.pdf',
        fileType: 'application/pdf',
        data: resumeBuffer
      }
    });

    expect(result.filledFields.length).toBeGreaterThanOrEqual(8);

    // Verify DOM inputs updated
    const firstNameInput = document.getElementById('first_name') as HTMLInputElement;
    const emailInput = document.getElementById('email') as HTMLInputElement;
    const phoneInput = document.getElementById('phone') as HTMLInputElement;
    const authSelect = document.getElementById('question_work_auth') as HTMLSelectElement;
    const sponsorSelect = document.getElementById('question_sponsorship') as HTMLSelectElement;
    const hearInput = document.getElementById('question_hear') as HTMLInputElement;

    expect(firstNameInput.value).toBe('Benjamin');
    expect(emailInput.value).toBe('benbenching@gmail.com');
    expect(phoneInput.value).toBe('4088299844');
    expect(authSelect.value).toBe('yes');
    expect(sponsorSelect.value).toBe('no');
    expect(hearInput.value).toBe('Company website');

    // Open-ended question was not auto-drafted (left for review)
    const whyAcme = result.emptyFields.find((f) => f.id === 'question_why_acme');
    expect(whyAcme).toBeDefined();
  });

  it('detects confirmation in URL or DOM', () => {
    const activeUrl = new URL('https://boards.greenhouse.io/acme/jobs/12345');
    expect(adapter.confirmationDetected(activeUrl, document)).toBe(false);

    const successUrl = new URL('https://boards.greenhouse.io/acme/jobs/12345/confirmation');
    expect(adapter.confirmationDetected(successUrl, document)).toBe(true);

    const confDiv = document.createElement('div');
    confDiv.id = 'application_confirmation';
    confDiv.textContent = 'Thank you for applying to Acme Corp!';
    document.body.appendChild(confDiv);

    expect(adapter.confirmationDetected(activeUrl, document)).toBe(true);
  });

  describe('Modern React Board (job-boards.greenhouse.io)', () => {
    let modernAdapter: GreenhouseAdapter;

    beforeEach(() => {
      modernAdapter = new GreenhouseAdapter();
      const fixturePath = path.resolve(__dirname, '../fixtures/greenhouse/greenhouse_new_board.html');
      const modernHtml = fs.readFileSync(fixturePath, 'utf-8');
      document.documentElement.innerHTML = modernHtml;
    });

    it('matches modern Greenhouse job boards domain and form', () => {
      const url = new URL('https://job-boards.greenhouse.io/anthropic/jobs/5183044008');
      expect(modernAdapter.matches(url, document)).toBe(true);
    });

    it('extracts job details from modern board', () => {
      const url = new URL('https://job-boards.greenhouse.io/anthropic/jobs/5183044008');
      const job = modernAdapter.extractJob(document, url);

      expect(job.company).toBe('Anthropic');
      expect(job.title).toBeTruthy();
      expect(job.location).toContain('San Francisco');
    });

    it('discovers fields including React comboboxes and custom question ids', () => {
      const fields = modernAdapter.discoverFields(document);
      expect(fields.length).toBeGreaterThanOrEqual(4);

      const fieldIds = fields.map(f => f.id);
      expect(fieldIds).toContain('first_name');
      expect(fieldIds).toContain('last_name');
      expect(fieldIds).toContain('email');

      // Discovers comboboxes
      const comboboxes = fields.filter(f => f.type === 'combobox');
      expect(comboboxes.length).toBeGreaterThanOrEqual(2);

      // Custom question combobox
      const customQuestion = comboboxes.find(f => f.isCustomQuestion);
      expect(customQuestion).toBeDefined();
      expect(customQuestion?.id).toMatch(/^question_/);
      expect(customQuestion?.label).toContain('Constellation application form');

      // Invariant 1: No submit controls discovered
      const submitControls = fields.filter(f => f.type as any === 'submit' || f.element.tagName === 'BUTTON');
      expect(submitControls.length).toBe(0);
    });
  });
});
