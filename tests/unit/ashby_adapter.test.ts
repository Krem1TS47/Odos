import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AshbyAdapter } from '../../extension/src/content/adapters/ashby';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { Profile, DEFAULT_PROFILE } from '../../extension/src/core/models';

describe('Ashby Adapter & Autofill (Step 7)', () => {
  let adapter: AshbyAdapter;
  let fixtureHtml: string;

  beforeEach(() => {
    adapter = new AshbyAdapter();
    const fixturePath = path.resolve(__dirname, '../fixtures/ashby/ashby_application.html');
    fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
    document.documentElement.innerHTML = fixtureHtml;
  });

  it('matches Ashby hosted URL and vanity domains with Ashby markers', () => {
    const hostedUrl = new URL('https://jobs.ashbyhq.com/openai/94313f87-1234/application');
    expect(adapter.matches(hostedUrl, document)).toBe(true);

    const vanityUrl = new URL('https://careers.example.com/apply?ashby_jid=123');
    expect(adapter.matches(vanityUrl, document)).toBe(true);
  });

  it('extracts job details accurately from Ashby fixture', () => {
    const url = new URL('https://jobs.ashbyhq.com/openai/94313f87-1234/application');
    const job = adapter.extractJob(document, url);

    expect(job.company).toBeTruthy();
    expect(job.title).toBeTruthy();
    expect(job.url).toBe(url.href);
  });

  it('discovers system fields and custom UUID questions without selecting by CSS module class names', () => {
    const fields = adapter.discoverFields(document);
    expect(fields.length).toBeGreaterThanOrEqual(5);

    const idsAndNames = fields.map(f => f.id || f.name);

    // System fields
    expect(idsAndNames).toContain('_systemfield_name');
    expect(idsAndNames).toContain('_systemfield_email');
    expect(idsAndNames).toContain('_systemfield_resume');

    // Custom UUID questions
    const customQuestions = fields.filter(f => f.isCustomQuestion);
    expect(customQuestions.length).toBeGreaterThanOrEqual(1);

    // Invariant 1: No submit controls returned
    const submitControls = fields.filter(f => f.type as any === 'submit' || f.element.tagName === 'BUTTON');
    expect(submitControls.length).toBe(0);
  });

  it('executes autofill on Ashby system fields using profile and resume', async () => {
    const fields = adapter.discoverFields(document);

    const profile: Profile = {
      ...DEFAULT_PROFILE,
      contact: {
        ...DEFAULT_PROFILE.contact,
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        email: 'grace.hopper@navy.mil',
        phone: '2025550100',
        location: 'Arlington, VA'
      }
    };

    const resumeBuffer = new TextEncoder().encode('%PDF-1.4 dummy resume content').buffer;
    const result = await executeAutofill(fields, {
      profile,
      answers: [],
      resumeFile: {
        fileName: 'Grace_Hopper_Resume.pdf',
        fileType: 'application/pdf',
        data: resumeBuffer
      }
    });

    expect(result.filledFields.length).toBeGreaterThanOrEqual(3);

    const nameInput = document.getElementById('_systemfield_name') as HTMLInputElement;
    const emailInput = document.getElementById('_systemfield_email') as HTMLInputElement;
    const resumeInput = document.getElementById('_systemfield_resume') as HTMLInputElement;

    expect(nameInput.value).toBe('Grace Hopper');
    expect(emailInput.value).toBe('grace.hopper@navy.mil');
    expect(resumeInput.files?.length).toBe(1);

    // Open-ended / UUID questions with low confidence remain empty
    expect(result.emptyFields.length).toBeGreaterThanOrEqual(1);
  });

  it('detects confirmation in URL or DOM', () => {
    const activeUrl = new URL('https://jobs.ashbyhq.com/openai/123/application');
    expect(adapter.confirmationDetected(activeUrl, document)).toBe(false);

    const confUrl = new URL('https://jobs.ashbyhq.com/openai/123/application/confirmation');
    expect(adapter.confirmationDetected(confUrl, document)).toBe(true);
  });
});
