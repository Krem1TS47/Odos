import { describe, it, expect, beforeEach } from 'vitest';
import {
  findBestOptionMatch,
  resolveOption,
  OptionCandidate,
  isCreatableOption,
  isOtherOrFallbackOption,
  isDeclineOption,
  OPTION_MATCH_FLOOR
} from '../../extension/src/core/dropdownResolver';
import {
  fillSelectElement,
  fillComboboxWidget,
  fillCombobox
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

  it('never auto-selects "Other" or "Decline" as a fallback; surfaces it only as a suggestion', () => {
    expect(isOtherOrFallbackOption('Other / Not Listed')).toBe(true);
    expect(isOtherOrFallbackOption('None of the above')).toBe(true);
    expect(isDeclineOption('Prefer not to say')).toBe(true);

    const candidates: OptionCandidate[] = [
      { text: 'LinkedIn', value: 'li', index: 0 },
      { text: 'Indeed', value: 'ind', index: 1 },
      { text: 'Other (Please specify)', value: 'other', index: 2 }
    ];

    const resolution = resolveOption(candidates, 'Substack Newsletter');
    expect(resolution.selected).toBeNull();
    // No scoring basis for "Other", so nothing is suggested either: the row goes to review
    expect(resolution.suggestion).toBeNull();
    expect(findBestOptionMatch(candidates, 'Substack Newsletter')).toBeNull();

    // An answer that itself says "Other" may select the Other option
    const explicit = resolveOption(candidates, 'Other');
    expect(explicit.selected?.candidate.index).toBe(2);

    // EEO-style decline options are never picked unless the answer declines
    const eeo: OptionCandidate[] = [
      { text: 'Hispanic or Latino', value: 'h', index: 0 },
      { text: 'Asian', value: 'a', index: 1 },
      { text: 'Decline to self identify', value: 'd', index: 2 }
    ];
    expect(resolveOption(eeo, 'Pacific Islander').selected).toBeNull();
    expect(resolveOption(eeo, 'Decline to state').selected?.candidate.index).toBe(2);
  });

  it('applies the 0.75 floor: weak token overlap is a suggestion, not a selection', () => {
    const candidates: OptionCandidate[] = [
      { text: 'Software Engineering Internship Program', value: 'a', index: 0 },
      { text: 'Hardware Design', value: 'b', index: 1 }
    ];
    const res = resolveOption(candidates, 'Software Internship');
    expect(res.selected).toBeNull();
    expect(res.suggestion?.candidate.index).toBe(0);
    expect(res.suggestion!.score).toBeLessThan(OPTION_MATCH_FLOOR);
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

  it('fills a custom combobox: clicks the matching option and verifies the displayed value', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="select__control" id="wrap">
        <div class="select__single-value"></div>
        <input type="text" role="combobox" id="degree-combobox" aria-controls="degree-listbox" />
      </div>
      <div id="options-portal">
        <ul role="listbox" id="degree-listbox">
          <li role="option" data-value="hs">High School</li>
          <li role="option" data-value="bs">Bachelor of Science (B.S.)</li>
          <li role="option" data-value="ms">Master of Science (M.S.)</li>
        </ul>
      </div>
    `;
    document.body.appendChild(container);

    // Simulated widget: clicking an option updates the displayed value
    const display = container.querySelector('.select__single-value')!;
    let clicked = '';
    container.querySelectorAll('[role="option"]').forEach((opt) => {
      opt.addEventListener('click', () => {
        clicked = opt.textContent || '';
        display.textContent = clicked;
        opt.setAttribute('aria-selected', 'true');
      });
    });

    const comboboxEl = container.querySelector<HTMLElement>('#degree-combobox')!;
    const outcome = await fillCombobox({ element: comboboxEl, desired: 'Bachelors', hintCategory: 'degree', trigger: container.querySelector<HTMLElement>('#wrap')! });

    expect(outcome.status).toBe('verified');
    expect(clicked).toBe('Bachelor of Science (B.S.)');
    expect(outcome.value).toBe('Bachelor of Science (B.S.)');
    expect(outcome.reason).toContain('aria_linked');
    // Back-compat wrapper still reports success
    expect(await fillComboboxWidget(comboboxEl, 'Masters', document, 'degree')).toBe(true);
  });

  it('restores the search text and reports failed with a suggestion when no option matches', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div role="combobox" id="school-combobox" tabindex="0">
        <input type="text" role="searchbox" value="" />
      </div>
      <ul role="listbox">
        <li role="option">Stanford University</li>
        <li role="option">Harvard University</li>
      </ul>
    `;
    document.body.appendChild(container);
    const comboboxEl = container.querySelector<HTMLElement>('#school-combobox')!;
    const search = container.querySelector<HTMLInputElement>('input')!;

    const outcome = await fillCombobox({ element: comboboxEl, desired: 'Cal Poly' });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('no_option_match');
    // Typed search text is not left behind (complaint 1)
    expect(search.value).toBe('');
  });

  it('reports unverified (not filled) when the widget ignores the click', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button type="button" id="country-btn" aria-haspopup="listbox">Select one</button>
      <ul role="listbox">
        <li role="option">United States</li>
        <li role="option">Canada</li>
      </ul>
    `;
    document.body.appendChild(container);
    const btn = container.querySelector<HTMLElement>('#country-btn')!;
    const outcome = await fillCombobox({ element: btn, desired: 'United States', hintCategory: 'country' });
    expect(outcome.status).toBe('unverified');
    expect(outcome.value).toBe('United States');
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
