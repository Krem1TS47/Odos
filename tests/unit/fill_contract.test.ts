import { describe, it, expect, beforeEach } from 'vitest';
import { executeAutofill, fillFieldWithValue } from '../../extension/src/content/autofillEngine';
import { captureFieldSnapshot, restoreField } from '../../extension/src/core/filler';
import { DEFAULT_PROFILE, Profile, StoredAnswer } from '../../extension/src/core/models';
import { collectManualEdits, readFieldValue } from '../../extension/src/content/index';
import { GenericAdapter } from '../../extension/src/content/adapters/generic';

const profile: Profile = {
  ...DEFAULT_PROFILE,
  contact: { ...DEFAULT_PROFILE.contact, firstName: 'Ada', lastName: 'Lovelace', fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+14155551234', location: 'London, England, United Kingdom' },
  workAuthorization: { authorizedCountries: ['United States'], requiresSponsorship: false }
};

describe('Verified-fill contract through the engine (R1/R4/R11/R13)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('text and select fills are verified; an unmatched select is failed with a suggestion', async () => {
    document.body.innerHTML = `
      <label for="fn">First name</label><input id="fn" name="first_name" />
      <label for="src">How did you hear about us?</label>
      <select id="src" name="src"><option value="">Select</option><option>LinkedIn</option><option>Indeed</option><option>Other</option></select>`;
    const fields = new GenericAdapter().discoverFields(document);
    const answers: StoredAnswer[] = [{ id: 'h', questionPatterns: ['How did you hear about us?'], category: 'logistics', answer: 'Hacker News', autoFill: true }];
    const r = await executeAutofill(fields, { profile, answers });
    const fn = r.filledFields.find((f) => f.id === 'fn')!;
    expect(fn.status).toBe('verified');
    const src = r.emptyFields.find((f) => f.id === 'src')!;
    expect(src.status).toBe('failed');
    expect((document.getElementById('src') as HTMLSelectElement).value).toBe('');
  });

  it('never auto-picks "Prefer not to say" for an EEO question without a stored answer', async () => {
    document.body.innerHTML = `
      <label for="g">Gender</label>
      <select id="g" name="gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Prefer not to say</option></select>`;
    const fields = new GenericAdapter().discoverFields(document);
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields.length).toBe(0);
    expect((document.getElementById('g') as HTMLSelectElement).value).toBe('');
  });

  it('skips the resume only when the adapter is Workday, not when a page merely uses data-automation-id', async () => {
    const buf = new TextEncoder().encode('%PDF-1.4').buffer;
    document.body.innerHTML = `<div data-automation-id="some-widget"><label for="r">Resume</label><input id="r" name="resume" type="file" /></div>`;
    let fields = new GenericAdapter().discoverFields(document);
    let r = await executeAutofill(fields, { profile, answers: [], adapterId: 'generic', resumeFile: { fileName: 'r.pdf', fileType: 'application/pdf', data: buf } });
    expect(r.filledFields.length).toBe(1);
    expect((document.getElementById('r') as HTMLInputElement).files?.length).toBe(1);

    document.body.innerHTML = `<label for="r2">Resume</label><input id="r2" name="resume" type="file" />`;
    fields = new GenericAdapter().discoverFields(document);
    r = await executeAutofill(fields, { profile, answers: [], adapterId: 'workday', resumeFile: { fileName: 'r.pdf', fileType: 'application/pdf', data: buf } });
    expect(r.filledFields.length).toBe(0);
    expect(r.emptyFields[0].status).toBe('skipped');
    expect(r.emptyFields[0].statusReason).toBe('workday_upload_requires_human');
  });

  it('strips the +1 prefix for phone inputs', async () => {
    document.body.innerHTML = `<label for="p">Phone</label><input id="p" name="phone" type="tel" />`;
    const fields = new GenericAdapter().discoverFields(document);
    await executeAutofill(fields, { profile, answers: [] });
    expect((document.getElementById('p') as HTMLInputElement).value).toBe('4155551234');
  });

  it('undo restores text, select, radio group and combobox through the fillers', async () => {
    document.body.innerHTML = `
      <label for="fn">First name</label><input id="fn" name="first_name" value="Original" />
      <label for="c">Country</label><select id="c" name="country"><option value="">Select</option><option>Canada</option><option>United Kingdom</option></select>
      <fieldset><legend>Are you authorized to work in the US?</legend>
        <label><input type="radio" name="auth" value="y" /> Yes</label><label><input type="radio" name="auth" value="n" /> No</label></fieldset>
      <div class="select__control" id="w"><div class="select__single-value"></div><input id="cb" role="combobox" aria-controls="lb" aria-label="Visa sponsorship" /></div>
      <ul id="lb" role="listbox"><li role="option">Yes</li><li role="option">No</li></ul>`;
    const display = document.querySelector('.select__single-value')!;
    document.querySelectorAll('[role=option]').forEach((o) => o.addEventListener('click', () => (display.textContent = o.textContent)));
    const clearBtn = document.createElement('button');
    clearBtn.className = 'select__clear-indicator';
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', () => (display.textContent = ''));
    document.getElementById('w')!.appendChild(clearBtn);

    const fields = new GenericAdapter().discoverFields(document);
    const snaps = new Map(fields.map((f) => [f, captureFieldSnapshot(f)]));
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields.length).toBe(4);

    const events: string[] = [];
    document.getElementById('fn')!.addEventListener('input', () => events.push('input'));
    for (const f of r.filledFields) {
      const out = await restoreField(f, snaps.get(f)!);
      expect(out.status).toBe('verified');
    }
    expect((document.getElementById('fn') as HTMLInputElement).value).toBe('Original');
    expect(events).toContain('input');
    expect((document.getElementById('c') as HTMLSelectElement).value).toBe('');
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('input[type=radio]')).some((r) => r.checked)).toBe(false);
    expect(display.textContent).toBe('');
  });

  it('fillFieldWithValue (panel Fill) uses the same fillers and reports status', async () => {
    document.body.innerHTML = `<label for="q">Favorite tool</label><select id="q"><option value="">Select</option><option>Vim</option><option>Emacs</option></select>`;
    const field = new GenericAdapter().discoverFields(document)[0];
    const out = await fillFieldWithValue(field, 'Emacs');
    expect(out.status).toBe('verified');
    expect(readFieldValue(field)).toBe('Emacs');
  });

  it('collects manual edits (user-typed values) but not Odos fills or untouched fields', async () => {
    document.body.innerHTML = `
      <label for="fn">First name</label><input id="fn" name="first_name" />
      <label for="why">Why us?</label><textarea id="why" name="why"></textarea>
      <label for="x">Untouched</label><input id="x" name="x" />`;
    const fields = new GenericAdapter().discoverFields(document);
    const snaps = new Map(fields.map((f) => [f, captureFieldSnapshot(f)]));
    await executeAutofill(fields, { profile, answers: [] });
    (document.getElementById('why') as HTMLTextAreaElement).value = 'Because of the mission';
    const edits = collectManualEdits(fields, snaps);
    expect(edits.map((e) => e.field.id)).toEqual(['why']);
    expect(edits[0].value).toBe('Because of the mission');
  });
});
