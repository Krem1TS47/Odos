import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { findMatchingAdapter, hostsEmbeddedAtsForm } from '../../extension/src/content/adapters';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { DEFAULT_PROFILE, Profile, StoredAnswer, ProfileSchema } from '../../extension/src/core/models';
import { resolveCanonicalValue } from '../../extension/src/core/fieldSchema';
import { resolveOption } from '../../extension/src/core/dropdownResolver';
import { mapElementToCanonical } from '../../extension/src/core/fieldMapper';
import { fillButtonGroup, alternateQueries } from '../../extension/src/core/filler';
import { looksLikeApplicationForm } from '../../extension/src/content/index';
import { compareWithBundled } from '../../extension/src/core/storage/repository';
import { ReviewPanelController } from '../../extension/src/content/ui/panel';
import { FormField } from '../../extension/src/content/adapters/types';

/** Regressions found by running the real saved ATS pages with the user's real profile (2026-11-03). */

const fixture = (f: string) => fs.readFileSync(path.resolve(__dirname, '../fixtures', f), 'utf-8');

const profile: Profile = ProfileSchema.parse({
  ...DEFAULT_PROFILE,
  contact: { ...DEFAULT_PROFILE.contact, firstName: 'Benjamin', lastName: 'Ching', fullName: 'Benjamin Ching', email: 'b@example.com', phone: '+14085551234', location: 'San Jose, California, United States' },
  workAuthorization: { authorizedCountries: ['United States', 'Canada'], requiresSponsorship: false },
  education: [{ id: 'e', school: 'University of British Columbia', degree: 'Bachelor of Science', field: 'Computer Science', startDate: 'September 2024', endDate: 'May 2028', gpa: '3.8' }],
  experience: [{ id: 'x', company: 'Samsung', title: 'Data Engineer Co-op', startDate: 'September 2026', endDate: '', summary: '' }]
});
const answers: StoredAnswer[] = [
  { id: 'ans_1', questionPatterns: ['How did you hear about this job?', 'Referral Source'], category: 'logistics', answer: 'Company website', autoFill: true },
  { id: 'ans_3', questionPatterns: ['Are you available for a 12-week internship?', '12-week internship availability'], category: 'logistics', answer: 'Yes', autoFill: true },
  { id: 'ans_8', questionPatterns: ['Race', 'Ethnicity', 'Race / Ethnicity'], category: 'demographic', answer: 'Asian', autoFill: true }
];

describe('Adapter selection', () => {
  it('a Lever page is handled by the Lever adapter, not Greenhouse (form#application-form)', () => {
    document.documentElement.innerHTML = fixture('lever/lever_application.html');
    expect(findMatchingAdapter(new URL('https://jobs.lever.co/palantir/abc/apply'), document)?.id).toBe('lever');
    expect(findMatchingAdapter(new URL('https://careers.palantir.com/apply'), document)?.id).toBe('lever');
  });

  it('a careers page that only embeds the ATS iframe is not filled itself', () => {
    document.body.innerHTML = `<input type="search" name="q" /><input type="email" name="newsletter" /><input name="name" /><iframe src="https://job-boards.greenhouse.io/embed/job_app?for=acme"></iframe>`;
    expect(hostsEmbeddedAtsForm(document)).toBe(true);
    expect(looksLikeApplicationForm(document)).toBe(false);
  });
});

describe('Question text on Lever', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = fixture('lever/lever_application.html');
  });

  it('labels carry no helper or error text and groups use the question, not an option', () => {
    const fields = findMatchingAdapter(new URL('https://jobs.lever.co/x/y/apply'), document)!.discoverFields(document);
    const labels = fields.map((f) => f.label);
    expect(labels).toContain('Resume/CV');
    expect(labels).toContain('Current location');
    expect(labels.some((l) => /No location found|ATTACH RESUME/.test(l))).toBe(false);
    const radios = fields.filter((f) => f.type === 'radio_group');
    expect(radios.map((r) => r.label)).toContain('Are you legally authorized to work in the country for which you are applying?');
    expect(radios.some((r) => r.label === 'Yes')).toBe(false);
    expect(fields.find((f) => f.type === 'checkbox_group')?.label).toBe('Language Skill(s) (Check all that apply)');
  });

  it('fills the university dropdown from the profile and authorization radios correctly', async () => {
    const fields = findMatchingAdapter(new URL('https://jobs.lever.co/x/y/apply'), document)!.discoverFields(document);
    await executeAutofill(fields, { profile, answers, adapterId: 'lever' });
    const uni = fields.find((f) => /which university/i.test(f.label))!;
    expect(uni.status).toBe('verified');
    expect(uni.matchedValue).toMatch(/University of British Columbia/);
    const sponsor = fields.find((f) => /sponsorship/i.test(f.label) && f.type === 'radio_group')!;
    expect(sponsor.matchedValue).toBe('No');
    // "Company website" must not become "Palantir Medium Blog"
    const heard = fields.find((f) => /heard about/i.test(f.label))!;
    expect(heard.matchedValue || '').not.toMatch(/Blog/);
    // Pronunciation is not your full name
    const pron = fields.find((f) => /pronunciation/i.test(f.label))!;
    expect(pron.matchedValue).toBeUndefined();
  });
});

describe('Wrong-place answers', () => {
  it('a start-date field does not get the "12-week internship availability" answer', () => {
    expect(resolveCanonicalValue('start_date', profile, answers)).toBeNull();
    expect(resolveCanonicalValue('referral_source', profile, answers)).toBe('Company website');
  });

  it('website synonyms are not inferred from options without a hint', () => {
    const cands = ['LinkedIn', 'Palantir Medium Blog', 'Palantir Website', 'Friend or Family'].map((t, i) => ({ text: t, value: t, index: i }));
    expect(resolveOption(cands, 'Company website').selected).toBeNull();
  });

  it('"Do you have 4+ years of experience" is a yes/no question, not years_experience', () => {
    expect(mapElementToCanonical({ labelText: 'Do you have 4+ years of experience as a full-time engineer?' }).canonical).toBeUndefined();
    expect(mapElementToCanonical({ labelText: 'Years of professional experience' }).canonical).toBe('years_experience');
  });
});

describe('Ashby', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = fixture('ashby/ashby_application.html');
  });

  it('Yes/No toggle buttons are one button_group with the question as label', () => {
    const fields = findMatchingAdapter(new URL('https://jobs.ashbyhq.com/openai/x/application'), document)!.discoverFields(document);
    const sponsor = fields.find((f) => /sponsorship/i.test(f.label))!;
    expect(sponsor.type).toBe('button_group');
    expect(sponsor.options).toEqual(['Yes', 'No']);
    expect(fields.some((f) => /^[0-9a-f-]{36}$/.test(f.label))).toBe(false);
    const location = fields.find((f) => f.type === 'combobox')!;
    expect(location.label).toBe('Which country do you intend to work from?');
  });

  it('distinct-name checkboxes in one fieldset form one group, and race answers check the right box', async () => {
    const fields = findMatchingAdapter(new URL('https://jobs.ashbyhq.com/openai/x/application'), document)!.discoverFields(document);
    const eth = fields.find((f) => /ethnicit/i.test(f.label))!;
    expect(eth.type).toBe('checkbox_group');
    await executeAutofill([eth], { profile, answers, adapterId: 'ashby' });
    expect(eth.matchedValue).toBe('Asian or Asian American');
  });

  it('clicking a type-less toggle button never submits its form', async () => {
    document.body.innerHTML = `<form id="f"><div><button aria-pressed="false" data-option="yes">Yes</button><button aria-pressed="false" data-option="no">No</button></div></form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const submitted = vi.fn();
    form.addEventListener('submit', submitted);
    const buttons = Array.from(form.querySelectorAll('button')) as HTMLElement[];
    buttons.forEach((b) => b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    const out = await fillButtonGroup(buttons, 'No');
    expect(out.status).toBe('verified');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(submitted).not.toHaveBeenCalled();
  });
});

describe('Combobox query fallbacks', () => {
  it('derives shorter queries for long school names', () => {
    expect(alternateQueries('The University of British Columbia')).toContain('University of British Columbia');
    expect(alternateQueries('University of British Columbia (Vancouver)')[0]).toBe('University of British Columbia');
  });
});

describe('Config drift', () => {
  it('reports when stored data differs from the bundled YAML', () => {
    const bundled = { profile, answers, defaultResume: { fileName: 'r.pdf' } };
    const stale = ProfileSchema.parse({ ...profile, contact: { ...profile.contact, email: 'old@example.com' }, education: [] });
    const report = compareWithBundled(stale, answers.slice(0, 1), bundled as any);
    expect(report.drifted).toBe(true);
    expect(report.differences).toEqual(expect.arrayContaining(['contact.email', 'education', '2 stored answer(s)', 'resume']));
    expect(compareWithBundled({ ...profile, resumes: [{ id: 'r', label: 'r', fileName: 'r.pdf', fileType: 'application/pdf', fileSize: 1, isDefault: true, uploadedAt: 'x' }] }, answers, bundled as any).drifted).toBe(false);
  });
});

describe('Learning from answers typed on the page', () => {
  it('the panel proposes a typed answer and saves it on ✓', async () => {
    document.body.innerHTML = '<input id="q" />';
    const el = document.getElementById('q') as HTMLInputElement;
    const field: FormField = { id: 'q', name: 'q', label: 'Do you have an active security clearance?', type: 'text', element: el, required: false, status: 'failed' };
    const onSaveAnswers = vi.fn(async (_e: any) => {});
    const panel = new ReviewPanelController({ job: { company: 'Acme' }, filledFields: [], emptyFields: [field], onConfirmSubmitted: vi.fn(), onSaveAnswers });
    panel.render();
    panel.proposeAnswer(field, 'No');
    const shadow = (panel as any).shadow as ShadowRoot;
    expect(shadow.querySelector('.learn-box')?.textContent).toContain('Do you have an active security clearance?');
    (shadow.querySelector('button[data-learn="save"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onSaveAnswers).toHaveBeenCalledWith([{ field, value: 'No' }]);
    expect(((panel as any).shadow as ShadowRoot).querySelector('.learn-saved')).not.toBeNull();
    panel.destroy();
  });
});
