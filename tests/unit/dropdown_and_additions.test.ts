import { describe, it, expect, beforeEach } from 'vitest';
import {
  findBestOptionMatch,
  OptionCandidate,
  isCreatableOption,
  isOtherOrFallbackOption
} from '../../extension/src/core/dropdownResolver';
import {
  fillSelectElement,
  fillComboboxWidget
} from '../../extension/src/core/filler';
import {
  REPEATABLE_CONFIGS,
  findAddButton,
  countExistingItems,
  triggerAdditionsForSection,
  processDynamicAdditions
} from '../../extension/src/core/repeatableManager';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { FormField } from '../../extension/src/content/adapters/types';
import { Profile, DEFAULT_PROFILE } from '../../extension/src/core/models';

describe('Dropdown Resolver & Semantic Option Matching', () => {
  it('matches exact text or value', () => {
    const candidates: OptionCandidate[] = [
      { text: 'United States', value: 'US', index: 0 },
      { text: 'Canada', value: 'CA', index: 1 }
    ];

    const match = findBestOptionMatch(candidates, 'United States');
    expect(match).not.toBeNull();
    expect(match?.candidate.index).toBe(0);
    expect(match?.strategy).toBe('exact');
  });

  it('resolves complex sponsorship and work authorization synonyms', () => {
    const candidates: OptionCandidate[] = [
      { text: '-- Please Select --', value: '', index: 0 },
      { text: 'Yes, I will now or in the future require visa sponsorship', value: 'needs_spons', index: 1 },
      { text: 'No, I am authorized to work in the US without sponsorship', value: 'no_spons', index: 2 }
    ];

    // Profile requiresSponsorship = false -> 'No'
    const matchNo = findBestOptionMatch(candidates, 'No', 'sponsorship');
    expect(matchNo).not.toBeNull();
    expect(matchNo?.candidate.index).toBe(2);
    expect(matchNo?.strategy).toBe('synonym');

    // Profile requiresSponsorship = true -> 'Yes'
    const matchYes = findBestOptionMatch(candidates, 'Yes', 'sponsorship');
    expect(matchYes).not.toBeNull();
    expect(matchYes?.candidate.index).toBe(1);
    expect(matchYes?.strategy).toBe('synonym');
  });

  it('resolves degree level synonyms', () => {
    const candidates: OptionCandidate[] = [
      { text: 'High School Diploma / GED', value: 'hs', index: 0 },
      { text: 'Associate Degree (AA, AS)', value: 'assoc', index: 1 },
      { text: "Bachelor's Degree (BA, BS, BFA)", value: 'bachelor', index: 2 },
      { text: "Master's Degree (MS, MA, MBA)", value: 'master', index: 3 },
      { text: 'Doctorate or Ph.D.', value: 'doc', index: 4 }
    ];

    const match1 = findBestOptionMatch(candidates, 'Bachelors', 'degree');
    expect(match1?.candidate.index).toBe(2);
    expect(match1?.strategy).toBe('synonym');

    const match2 = findBestOptionMatch(candidates, 'Master of Science', 'degree');
    expect(match2?.candidate.index).toBe(3);
    expect(match2?.strategy).toBe('synonym');
  });

  it('detects and matches creatable / add-option patterns', () => {
    expect(isCreatableOption('Create "UC Berkeley"', 'UC Berkeley')).toBe(true);
    expect(isCreatableOption('+ Add "Stanford University"', 'Stanford University')).toBe(true);
    expect(isCreatableOption('Normal School Option', 'UC Berkeley')).toBe(false);

    const candidates: OptionCandidate[] = [
      { text: 'No matching institutions found', value: '', index: 0 },
      { text: 'Create "Acme Institute"', value: 'new', index: 1 }
    ];

    const match = findBestOptionMatch(candidates, 'Acme Institute');
    expect(match?.candidate.index).toBe(1);
    expect(match?.strategy).toBe('creatable');
  });

  it('falls back to "Other" option when requested or appropriate', () => {
    expect(isOtherOrFallbackOption('Other / Not Listed')).toBe(true);
    expect(isOtherOrFallbackOption('None of the above')).toBe(true);

    const candidates: OptionCandidate[] = [
      { text: 'LinkedIn', value: 'li', index: 0 },
      { text: 'Indeed', value: 'ind', index: 1 },
      { text: 'Other (Please specify)', value: 'other', index: 2 }
    ];

    const match = findBestOptionMatch(candidates, 'Substack Newsletter');
    expect(match?.candidate.index).toBe(2);
    expect(match?.strategy).toBe('fallback_other');
  });
});

describe('Native <select> and Combobox Dropdown Filling', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('fills native select element using semantic synonym matching', () => {
    const select = document.createElement('select');
    select.innerHTML = `
      <option value="">Select option</option>
      <option value="no_spons">I will not require sponsorship now or in the future</option>
      <option value="needs_spons">I will require immigration visa sponsorship</option>
    `;
    document.body.appendChild(select);

    const success = fillSelectElement(select, 'No', 'sponsorship');
    expect(success).toBe(true);
    expect(select.value).toBe('no_spons');
    expect(select.selectedIndex).toBe(1);
  });

  it('fills custom combobox listbox and simulates selection events', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div role="combobox" id="degree-combobox" tabindex="0">
        <input type="text" role="searchbox" />
      </div>
      <div id="options-portal">
        <ul role="listbox">
          <li role="option" data-value="hs">High School</li>
          <li role="option" data-value="bs">Bachelor of Science (B.S.)</li>
          <li role="option" data-value="ms">Master of Science (M.S.)</li>
        </ul>
      </div>
    `;
    document.body.appendChild(container);

    const comboboxEl = container.querySelector<HTMLElement>('#degree-combobox')!;
    const success = await fillComboboxWidget(comboboxEl, 'Bachelors', document, 'degree');

    expect(success).toBe(true);
  });

  it('clicks Creatable / Add Option button in custom combobox widget', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div role="combobox" id="school-combobox">
        <input type="text" />
      </div>
      <div id="portal">
        <button type="button" data-automation-id="createOption">Add "Cal Poly"</button>
      </div>
    `;
    document.body.appendChild(container);

    let clicked = false;
    const addBtn = container.querySelector<HTMLElement>('[data-automation-id="createOption"]')!;
    addBtn.addEventListener('click', () => {
      clicked = true;
    });

    const comboboxEl = container.querySelector<HTMLElement>('#school-combobox')!;
    const success = await fillComboboxWidget(comboboxEl, 'Cal Poly', document);

    expect(success).toBe(true);
    expect(clicked).toBe(true);
  });
});

describe('Dynamic Repeatable Additions Manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('identifies and triggers "Add" button to spawn repeatable items', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div data-automation-id="educationSection">
        <div data-automation-id="education-item">First School</div>
        <button type="button" data-automation-id="Add" aria-label="Add Education">Add</button>
      </div>
    `;
    document.body.appendChild(container);

    const config = REPEATABLE_CONFIGS.find((c) => c.type === 'education')!;
    expect(countExistingItems(document, config)).toBe(1);

    const addBtn = findAddButton(document, config);
    expect(addBtn).not.toBeNull();

    // Mock DOM addition upon clicking Add
    addBtn?.addEventListener('click', () => {
      const newItem = document.createElement('div');
      newItem.setAttribute('data-automation-id', 'education-item');
      newItem.textContent = 'Second School';
      container.querySelector('[data-automation-id="educationSection"]')!.appendChild(newItem);
    });

    const added = await triggerAdditionsForSection(document, config, 2);
    expect(added).toBe(1);
    expect(countExistingItems(document, config)).toBe(2);
  });

  it('processes dynamic additions based on user profile', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div data-automation-id="educationSection">
        <button type="button" data-automation-id="Add">Add</button>
      </div>
      <div data-automation-id="websiteSection">
        <button type="button" data-automation-id="Add">Add</button>
      </div>
    `;
    document.body.appendChild(container);

    // Mock additions on click
    container.querySelectorAll('button[data-automation-id="Add"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const parent = btn.parentElement!;
        const tag = parent.getAttribute('data-automation-id') === 'educationSection' ? 'education-item' : 'website-item';
        const el = document.createElement('div');
        el.setAttribute('data-automation-id', tag);
        parent.appendChild(el);
      });
    });

    const profile: Profile = {
      ...DEFAULT_PROFILE,
      education: [
        {
          id: '1',
          school: 'MIT',
          degree: 'BS',
          field: 'CS',
          startDate: '2020',
          endDate: '2024',
          gpa: '3.9'
        }
      ],
      contact: {
        ...DEFAULT_PROFILE.contact,
        linkedin: 'https://linkedin.com/in/test'
      }
    };

    const res = await processDynamicAdditions(document, profile);
    expect(res.addedEducation).toBe(1);
    expect(res.addedWebsites).toBe(1);
  });
});

describe('Full Autofill with Dynamic Additions and Semantic Dropdowns', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('executes autofill on form with semantic select dropdowns and repeatable sections', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <form id="app-form">
        <div data-automation-id="educationSection">
          <button type="button" data-automation-id="Add">Add</button>
        </div>
        <div>
          <label id="lbl-sponsor">Will you require sponsorship?</label>
          <select id="sponsorship" name="sponsorship">
            <option value="">Select</option>
            <option value="yes_val">Yes, I will need visa sponsorship</option>
            <option value="no_val">No, I will not require visa sponsorship</option>
          </select>
        </div>
      </form>
    `;
    document.body.appendChild(container);

    const selectEl = container.querySelector<HTMLSelectElement>('#sponsorship')!;

    const field: FormField = {
      id: 'sponsorship',
      name: 'sponsorship',
      label: 'Will you require sponsorship?',
      type: 'select',
      element: selectEl,
      required: true
    };

    const profile: Profile = {
      ...DEFAULT_PROFILE,
      workAuthorization: {
        authorizedCountries: ['United States'],
        requiresSponsorship: false
      }
    };

    const result = await executeAutofill([field], {
      profile,
      answers: []
    });

    expect(result.filledFields.length).toBe(1);
    expect(selectEl.value).toBe('no_val');
  });
});
