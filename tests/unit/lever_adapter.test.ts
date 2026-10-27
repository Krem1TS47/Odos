import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LeverAdapter } from '../../extension/src/content/adapters/lever';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { Profile, DEFAULT_PROFILE } from '../../extension/src/core/models';

describe('Lever Adapter & Autofill (Step 6)', () => {
  let adapter: LeverAdapter;
  let fixtureHtml: string;

  beforeEach(() => {
    adapter = new LeverAdapter();
    const fixturePath = path.resolve(__dirname, '../fixtures/lever/lever_application.html');
    fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
    document.documentElement.innerHTML = fixtureHtml;
  });

  it('matches Lever URL and vanity domains with Lever form markers', () => {
    const hostedUrl = new URL('https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c/apply');
    expect(adapter.matches(hostedUrl, document)).toBe(true);

    const vanityUrl = new URL('https://careers.palantir.com/apply/ac978161');
    expect(adapter.matches(vanityUrl, document)).toBe(true);
  });

  it('extracts job details accurately from Lever fixture', () => {
    const url = new URL('https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c/apply');
    const job = adapter.extractJob(document, url);

    expect(job.company).toContain('Palantir');
    expect(job.title).toContain('Administrative Business Partner');
    expect(job.location).toContain('London');
  });

  it('discovers standard fields, social URLs, and custom card questions', () => {
    const fields = adapter.discoverFields(document);
    expect(fields.length).toBeGreaterThanOrEqual(8);

    const names = fields.map(f => f.name);
    expect(names).toContain('name');
    expect(names).toContain('email');
    expect(names).toContain('phone');
    expect(names).toContain('org');
    expect(names).toContain('urls[LinkedIn]');
    expect(names).toContain('urls[GitHub]');
    expect(names).toContain('resume');

    // Custom card fields (cards[uuid][field...])
    const cardFields = fields.filter(f => f.isCustomQuestion);
    expect(cardFields.length).toBeGreaterThanOrEqual(1);

    // Invariant 1: No submit controls returned
    const submitControls = fields.filter(f => f.type as any === 'submit' || f.element.tagName === 'BUTTON');
    expect(submitControls.length).toBe(0);
  });

  it('executes autofill with full name mapping for Lever', async () => {
    const fields = adapter.discoverFields(document);

    const profile: Profile = {
      ...DEFAULT_PROFILE,
      contact: {
        ...DEFAULT_PROFILE.contact,
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        email: 'ada@lovelace.org',
        phone: '4155551212',
        location: 'London, UK',
        linkedin: 'https://linkedin.com/in/ada-lovelace',
        github: 'https://github.com/ada',
        website: 'https://adalovelace.org'
      },
      experience: [
        {
          id: 'exp-1',
          company: 'Babbage Analytical Engine Co.',
          title: 'Computing Pioneer',
          startDate: '1842-01',
          endDate: 'Present',
          summary: 'Created first computer algorithm',
          isCurrent: true
        }
      ]
    };

    const resumeBuffer = new TextEncoder().encode('%PDF-1.4 dummy resume').buffer;
    const result = await executeAutofill(fields, {
      profile,
      answers: [],
      resumeFile: {
        fileName: 'Ada_Lovelace_Resume.pdf',
        fileType: 'application/pdf',
        data: resumeBuffer
      }
    });

    expect(result.filledFields.length).toBeGreaterThanOrEqual(5);

    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
    const orgInput = document.querySelector('input[name="org"]') as HTMLInputElement;
    const linkedinInput = document.querySelector('input[name="urls[LinkedIn]"]') as HTMLInputElement;

    expect(nameInput.value).toBe('Ada Lovelace');
    expect(emailInput.value).toBe('ada@lovelace.org');
    expect(orgInput.value).toBe('Babbage Analytical Engine Co.');
    expect(linkedinInput.value).toBe('https://linkedin.com/in/ada-lovelace');
  });

  it('detects confirmation in URL or DOM', () => {
    const activeUrl = new URL('https://jobs.lever.co/palantir/ac978161/apply');
    expect(adapter.confirmationDetected(activeUrl, document)).toBe(false);

    const confUrl = new URL('https://jobs.lever.co/palantir/ac978161/thanks');
    expect(adapter.confirmationDetected(confUrl, document)).toBe(true);
  });
});
