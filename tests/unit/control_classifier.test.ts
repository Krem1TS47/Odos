import { describe, it, expect, beforeEach } from 'vitest';
import { collectControls, describeControl, classifyControl, detectRepeatRow } from '../../extension/src/core/controlClassifier';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { DEFAULT_PROFILE, Profile, StoredAnswer } from '../../extension/src/core/models';
import { FormField } from '../../extension/src/content/adapters/types';

/**
 * Fixture pack (R14): one markup family per widget library, driven through
 * classifier -> engine, asserting classification, chosen option and verification status.
 * Widgets are simulated minimally: clicking an option updates the control's displayed value.
 */

function discover(): FormField[] {
  return collectControls(document, document, { deep: true }).map((c, i) => describeControl(c, i, document, { idPrefix: 'fx' }));
}

function simulateListbox(root: ParentNode, displaySelector: string) {
  root.querySelectorAll('[role="option"], .select__option, .ant-select-item-option, .MuiMenuItem-root, [data-radix-collection-item]').forEach((opt) => {
    opt.addEventListener('click', () => {
      const display = root.querySelector(displaySelector);
      if (display) display.textContent = opt.textContent || '';
      opt.setAttribute('aria-selected', 'true');
    });
  });
}

const profile: Profile = {
  ...DEFAULT_PROFILE,
  contact: { ...DEFAULT_PROFILE.contact, firstName: 'Ada', lastName: 'Lovelace', fullName: 'Ada Lovelace', email: 'ada@example.com', location: 'San Jose, California, United States' },
  workAuthorization: { authorizedCountries: ['United States'], requiresSponsorship: false },
  education: [
    { id: 'e1', school: 'MIT', degree: 'Bachelor of Science', field: 'Computer Science', startDate: '2016-09', endDate: '2020-05', gpa: '3.9' },
    { id: 'e2', school: 'Stanford University', degree: 'Master of Science', field: 'AI', startDate: '2020-09', endDate: '2022-06', gpa: '4.0' }
  ],
  experience: [
    { id: 'x1', company: 'Acme', title: 'Engineer', startDate: '2022-07', endDate: '', summary: 'Built things', isCurrent: true },
    { id: 'x2', company: 'Globex', title: 'Intern', startDate: '2021-06', endDate: '2021-09', summary: 'Interned', isCurrent: false }
  ]
};
const answers: StoredAnswer[] = [
  { id: 'deg', questionPatterns: ['Highest level of education'], category: 'logistics', answer: "Bachelor's Degree", autoFill: true }
];

describe('Control classifier fixture pack', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('React-Select: inner input is the control, wrapper is the trigger, option verified via single-value', async () => {
    document.body.innerHTML = `
      <label id="country-label">Country</label>
      <div class="select__container">
        <div class="select__control">
          <div class="select__value-container">
            <div class="select__single-value"></div>
            <input class="select__input" id="country" role="combobox" aria-autocomplete="list" aria-haspopup="true" aria-expanded="false" aria-labelledby="country-label" aria-controls="rs-listbox" type="text" />
          </div>
        </div>
      </div>
      <div id="rs-listbox" class="select__menu">
        <div class="select__option" id="rs-option-0">Canada</div>
        <div class="select__option" id="rs-option-1">United States</div>
      </div>`;
    simulateListbox(document, '.select__single-value');
    const fields = discover();
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('combobox');
    expect(fields[0].dropdownVariant).toBe('searchable');
    expect(fields[0].trigger?.classList.contains('select__control')).toBe(true);
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0].status).toBe('verified');
    expect(r.filledFields[0].matchedValue).toBe('United States');
    expect((document.getElementById('country') as HTMLInputElement).value).toBe('');
  });

  it('Radix Select: button trigger role=combobox with portal content', async () => {
    document.body.innerHTML = `
      <label for="degree-trigger">Degree</label>
      <button id="degree-trigger" type="button" role="combobox" aria-expanded="false" aria-controls="radix-content" data-state="closed"><span id="radix-value">Select a degree</span></button>
      <div data-radix-popper-content-wrapper><div id="radix-content" role="listbox">
        <div role="option" data-radix-collection-item>High School</div>
        <div role="option" data-radix-collection-item>Bachelor's</div>
        <div role="option" data-radix-collection-item>Master's</div>
      </div></div>`;
    simulateListbox(document, '#radix-value');
    const fields = discover();
    expect(fields[0].type).toBe('combobox');
    expect(fields[0].dropdownVariant).toBe('listbox-button');
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0].status).toBe('verified');
    expect(r.filledFields[0].matchedValue).toBe("Bachelor's");
  });

  it('MUI Select: role=button trigger, hidden native input is skipped', async () => {
    document.body.innerHTML = `
      <label id="state-label">State</label>
      <div class="MuiFormControl-root">
        <div class="MuiSelect-select" role="button" aria-haspopup="listbox" aria-labelledby="state-label" tabindex="0">Select</div>
        <input aria-hidden="true" tabindex="-1" class="MuiSelect-nativeInput" value="" />
      </div>
      <div class="MuiPopover-paper"><ul role="listbox">
        <li class="MuiMenuItem-root" role="option">Texas</li>
        <li class="MuiMenuItem-root" role="option">California</li>
      </ul></div>`;
    simulateListbox(document, '.MuiSelect-select');
    const fields = discover();
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('combobox');
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0].status).toBe('verified');
    expect(r.filledFields[0].matchedValue).toBe('California');
  });

  it('AntD Select: search input inside .ant-select-selector', async () => {
    document.body.innerHTML = `
      <label for="ant-country">Country</label>
      <div class="ant-select"><div class="ant-select-selector">
        <span class="ant-select-selection-search"><input id="ant-country" type="search" role="combobox" aria-haspopup="listbox" aria-owns="ant-list" autocomplete="off" class="ant-select-selection-search-input" /></span>
        <span class="ant-select-selection-item"></span>
      </div></div>
      <div class="ant-select-dropdown"><div id="ant-list" role="listbox">
        <div class="ant-select-item-option" role="option">Canada</div>
        <div class="ant-select-item-option" role="option">United States</div>
      </div></div>`;
    simulateListbox(document, '.ant-select-selection-item');
    const fields = discover();
    expect(fields.length).toBe(1);
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0].status).toBe('verified');
    expect(r.filledFields[0].matchedValue).toBe('United States');
  });

  it('Select2 skin: the hidden native <select> is the control; the skin is skipped', async () => {
    document.body.innerHTML = `
      <label for="s2">Country</label>
      <span><select id="s2" class="select2-hidden-accessible" aria-hidden="true"><option value="">Select</option><option value="ca">Canada</option><option value="us">United States</option></select>
      <span class="select2-container"><span class="select2-selection" role="combobox" aria-haspopup="true"><span class="select2-selection__rendered"></span></span></span></span>`;
    const fields = discover();
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('select');
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0].status).toBe('verified');
    expect((document.getElementById('s2') as HTMLSelectElement).value).toBe('us');
  });

  it('datalist input: picks the datalist option value, else free text', async () => {
    document.body.innerHTML = `
      <label for="city">City</label>
      <input id="city" list="cities" />
      <datalist id="cities"><option value="San Jose"></option><option value="San Diego"></option></datalist>`;
    const fields = discover();
    expect(fields[0].type).toBe('combobox');
    expect(fields[0].dropdownVariant).toBe('datalist');
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0].status).toBe('verified');
    expect((document.getElementById('city') as HTMLInputElement).value).toBe('San Jose');
  });

  it('Workday searchWidget: inner input is classified as combobox, promptOptions selected', async () => {
    document.body.innerHTML = `
      <div data-automation-id="formField-countryRegion">
        <label id="st-label">State</label>
        <div data-automation-id="searchWidget" aria-labelledby="st-label">
          <input type="text" data-automation-id="searchBox" aria-labelledby="st-label" />
          <div data-automation-id="selectedItem"></div>
        </div>
      </div>
      <div><ul role="listbox">
        <li role="option" data-automation-id="promptOption">Colorado</li>
        <li role="option" data-automation-id="promptOption">California</li>
      </ul></div>`;
    simulateListbox(document, '[data-automation-id="selectedItem"]');
    const fields = discover();
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('combobox');
    expect(fields[0].element.tagName).toBe('INPUT');
    expect(fields[0].trigger?.getAttribute('data-automation-id')).toBe('searchWidget');
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0].status).toBe('verified');
    expect(r.filledFields[0].matchedValue).toBe('California');
    // typed search text is cleared by the widget contract when the selection is confirmed? The input
    // keeps what the widget leaves; what matters is the displayed value.
  });

  it('plain ARIA combobox (aria-expanded + aria-controls) with an unresponsive widget is unverified, not failed', async () => {
    document.body.innerHTML = `
      <label for="plain">Country</label>
      <input id="plain" type="text" aria-expanded="false" aria-controls="plain-list" />
      <ul id="plain-list" role="listbox"><li role="option">United States</li></ul>`;
    const fields = discover();
    expect(fields[0].type).toBe('combobox');
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields.length).toBe(1);
    expect(r.filledFields[0].status).toBe('unverified');
  });

  it('radio group: one field with options, answered through the sponsorship dictionary', async () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Will you now or in the future require sponsorship?</legend>
        <label><input type="radio" name="spons" value="1" /> Yes, I will require sponsorship</label>
        <label><input type="radio" name="spons" value="0" /> No, I will not require sponsorship</label>
      </fieldset>`;
    const fields = discover();
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('radio_group');
    expect(fields[0].label).toContain('sponsorship');
    expect(fields[0].options?.length).toBe(2);
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0].status).toBe('verified');
    const radios = document.querySelectorAll<HTMLInputElement>('input[type=radio]');
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
  });

  it('checkbox group: shared name groups boxes; a single consent checkbox stays single', () => {
    document.body.innerHTML = `
      <div role="group" aria-label="Languages">
        <label><input type="checkbox" name="langs[]" value="js" /> JavaScript</label>
        <label><input type="checkbox" name="langs[]" value="py" /> Python</label>
      </div>
      <label><input type="checkbox" name="consent" /> I agree to the privacy policy</label>`;
    const fields = discover();
    expect(fields.map((f) => f.type)).toEqual(['checkbox_group', 'checkbox']);
    expect(fields[0].label).toBe('Languages');
    expect(fields[0].options).toEqual(['JavaScript', 'Python']);
  });

  it('skips hidden, submit, honeypot and plain button elements', () => {
    document.body.innerHTML = `
      <input type="hidden" name="token" />
      <input type="text" name="honeypot" style="display:none" />
      <input type="submit" value="Apply" />
      <button type="button">Cancel</button>
      <input type="text" name="visible" />`;
    const fields = discover();
    expect(fields.map((f) => f.name)).toEqual(['visible']);
  });

  it('detects repeatable rows and fills the nth education/experience entry', async () => {
    document.body.innerHTML = `
      <div data-automation-id="educationSection">
        <div data-automation-id="education-item"><label for="s0">School</label><input id="s0" type="text" /></div>
        <div data-automation-id="education-item"><label for="s1">School</label><input id="s1" type="text" /><label for="d1">Degree</label><input id="d1" type="text" /></div>
      </div>
      <div data-automation-id="workExperienceSection">
        <div data-automation-id="workExperience-item"><label for="c0">Company</label><input id="c0" type="text" /></div>
        <div data-automation-id="workExperience-item"><label for="c1">Company</label><input id="c1" type="text" /><label for="t1">Job Title</label><input id="t1" type="text" /></div>
      </div>`;
    const fields = discover();
    expect(detectRepeatRow(document.getElementById('s1')!)).toEqual({ section: 'education', rowIndex: 1 });
    expect(fields.find((f) => f.id === 'd1')?.rowIndex).toBe(1);
    await executeAutofill(fields, { profile, answers: [] });
    expect((document.getElementById('s0') as HTMLInputElement).value).toBe('MIT');
    expect((document.getElementById('s1') as HTMLInputElement).value).toBe('Stanford University');
    expect((document.getElementById('d1') as HTMLInputElement).value).toBe('Master of Science');
    expect((document.getElementById('c0') as HTMLInputElement).value).toBe('Acme');
    expect((document.getElementById('c1') as HTMLInputElement).value).toBe('Globex');
    expect((document.getElementById('t1') as HTMLInputElement).value).toBe('Intern');
  });

  it('classifyControl returns null for a wrapper whose inner input will be classified instead', () => {
    document.body.innerHTML = `<div id="w" role="combobox"><input id="i" type="text" /></div>`;
    expect(classifyControl(document.getElementById('w')!)).toBeNull();
    expect(classifyControl(document.getElementById('i')!)?.type).toBe('combobox');
  });

  it('a stored answer fills a native select through the derived degree dictionary', async () => {
    document.body.innerHTML = `
      <label for="edu">Highest level of education completed</label>
      <select id="edu"><option value="">Select</option><option>High School</option><option>Bachelor's Degree</option><option>Master's Degree</option></select>`;
    const fields = discover();
    const r = await executeAutofill(fields, { profile: DEFAULT_PROFILE, answers });
    expect(r.filledFields[0].status).toBe('verified');
    expect((document.getElementById('edu') as HTMLSelectElement).value).toBe("Bachelor's Degree");
  });
});
