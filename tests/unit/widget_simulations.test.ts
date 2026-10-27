import { describe, it, expect, beforeEach } from 'vitest';
import { fillCombobox } from '../../extension/src/core/filler';
import { collectControls, describeControl } from '../../extension/src/core/controlClassifier';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { DEFAULT_PROFILE, Profile } from '../../extension/src/core/models';

/**
 * Behavioural simulations of the real widgets that broke in production. Each mimics the
 * library's actual event contract (from react-select's source and live Workday traces):
 *  - react-select: menu exists only while open; opens on control mousedown + input focus;
 *    input `blur` CLEARS the input and closes the menu; option click sets single-value.
 *  - Workday prompt: clicking the search box opens a DEFAULT browse list; typing does not
 *    search; Enter runs a server search (async); clicking a result adds a pill; a sibling
 *    field's pill list is role="listbox" and always visible.
 */

function makeReactSelect(doc: Document, id: string, labelText: string, options: string[], opts: { async?: number } = {}) {
  const root = doc.createElement('div');
  root.innerHTML = `
    <label id="${id}-label">${labelText}</label>
    <div class="select__container">
      <div class="select__control">
        <div class="select__value-container">
          <div class="select__placeholder">Select...</div>
          <div class="select__input-container">
            <input class="select__input" id="${id}" role="combobox" aria-autocomplete="list" aria-haspopup="true" aria-expanded="false" aria-labelledby="${id}-label" type="text" value="" />
          </div>
        </div>
      </div>
    </div>`;
  doc.body.appendChild(root);
  const control = root.querySelector('.select__control') as HTMLElement;
  const input = root.querySelector('input') as HTMLInputElement;
  const valueContainer = root.querySelector('.select__value-container') as HTMLElement;
  let menu: HTMLElement | null = null;
  let focused = false;
  let openAfterFocus = false;
  let inputValue = '';
  const state = { selected: '' as string, blurs: 0 };

  const closeMenu = () => {
    if (menu) {
      menu.remove();
      menu = null;
    }
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-controls');
  };
  const renderMenu = () => {
    if (!menu) {
      menu = doc.createElement('div');
      menu.className = 'select__menu';
      menu.id = `react-select-${id}-listbox`;
      menu.setAttribute('role', 'listbox');
      root.querySelector('.select__container')!.appendChild(menu);
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-controls', menu.id);
    }
    const q = inputValue.toLowerCase();
    const rows = opts.async && q === '' ? [] : options.filter((o) => o.toLowerCase().includes(q));
    const paint = () => {
      if (!menu) return;
      menu.innerHTML = rows.length
        ? rows.map((o, i) => `<div class="select__option" role="option" id="react-select-${id}-option-${i}" aria-selected="false">${o}</div>`).join('')
        : `<div class="select__menu-notice select__menu-notice--no-options">No options</div>`;
      menu.querySelectorAll('[role="option"]').forEach((row) => {
        row.addEventListener('click', () => {
          state.selected = row.textContent || '';
          valueContainer.querySelector('.select__placeholder')?.remove();
          let sv = valueContainer.querySelector('.select__single-value');
          if (!sv) {
            sv = doc.createElement('div');
            sv.className = 'select__single-value';
            valueContainer.insertBefore(sv, valueContainer.firstChild);
          }
          sv.textContent = state.selected;
          inputValue = '';
          input.value = '';
          closeMenu();
        });
      });
    };
    if (opts.async && q) {
      menu.innerHTML = `<div class="select__menu-notice select__menu-notice--loading">Loading...</div>`;
      setTimeout(paint, opts.async);
    } else {
      paint();
    }
  };
  const openMenu = () => renderMenu();

  control.addEventListener('mousedown', (e) => {
    if ((e as MouseEvent).button !== 0) return;
    if (!focused) {
      openAfterFocus = true;
      input.focus();
    } else if (!menu) {
      openMenu();
    }
  });
  input.addEventListener('focus', () => {
    focused = true;
    if (openAfterFocus) openMenu();
    openAfterFocus = false;
  });
  input.addEventListener('blur', () => {
    state.blurs++;
    focused = false;
    inputValue = '';
    input.value = '';
    closeMenu();
  });
  input.addEventListener('input', () => {
    inputValue = input.value;
    renderMenu();
  });
  input.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Escape') closeMenu();
    if (ke.key === 'Enter' && menu) {
      const first = menu.querySelector('[role="option"]') as HTMLElement | null;
      first?.click();
    }
  });
  return { input, control, state, selected: () => state.selected };
}

function makeWorkdayPrompt(doc: Document, autoId: string, label: string, catalogue: string[], opts: { searchDelay?: number; defaultList?: string[] } = {}) {
  const wrap = doc.createElement('div');
  wrap.setAttribute('data-automation-id', `formField-${autoId}`);
  wrap.innerHTML = `
    <label id="${autoId}-label">${label}</label>
    <div data-automation-id="multiSelectContainer">
      <div data-automation-id="selectedItemList" role="listbox"></div>
      <input data-automation-id="searchBox" type="text" placeholder="Search" aria-labelledby="${autoId}-label" />
    </div>`;
  doc.body.appendChild(wrap);
  const input = wrap.querySelector('input') as HTMLInputElement;
  const pillList = wrap.querySelector('[data-automation-id="selectedItemList"]') as HTMLElement;
  let popup: HTMLElement | null = null;
  const state = { searches: [] as string[], pills: [] as string[] };

  const close = () => {
    popup?.remove();
    popup = null;
  };
  const show = (rows: string[]) => {
    if (!popup) {
      popup = doc.createElement('div');
      popup.setAttribute('data-automation-id', 'promptOptions');
      popup.innerHTML = '<ul role="listbox"></ul>';
      doc.body.appendChild(popup); // portal, far from the field
    }
    const ul = popup.querySelector('ul')!;
    ul.innerHTML = rows.length
      ? rows.map((r) => `<li data-automation-id="menuItem" role="option"><p data-automation-id="promptOption" data-automation-label="${r}">${r}<span>›</span></p></li>`).join('')
      : '<li><p>No matches found</p></li>';
    ul.querySelectorAll('[role="option"]').forEach((row) => {
      row.addEventListener('click', () => {
        const text = row.querySelector('[data-automation-id="promptOption"]')!.getAttribute('data-automation-label')!;
        state.pills.push(text);
        const pill = doc.createElement('div');
        pill.setAttribute('data-automation-id', 'selectedItem');
        pill.innerHTML = `<span>${text}</span><input type="text" aria-hidden="true" value="${text}" /><button data-automation-id="DELETE_charm">x</button>`;
        pillList.appendChild(pill);
        input.value = '';
        close();
      });
    });
  };

  input.addEventListener('focus', () => show(opts.defaultList ?? catalogue.slice(0, 5)));
  input.addEventListener('click', () => show(opts.defaultList ?? catalogue.slice(0, 5)));
  input.addEventListener('blur', () => close());
  input.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Escape') close();
    if (ke.key === 'Enter') {
      const q = input.value.toLowerCase();
      state.searches.push(q);
      const results = catalogue.filter((c) => c.toLowerCase().includes(q));
      setTimeout(() => show(results), opts.searchDelay ?? 500);
    }
  });
  return { input, wrap, state, pillList };
}

const profile: Profile = {
  ...DEFAULT_PROFILE,
  contact: { ...DEFAULT_PROFILE.contact, firstName: 'Ada', lastName: 'Lovelace', fullName: 'Ada Lovelace', location: 'San Jose, California, United States' },
  education: [{ id: 'e1', school: 'University of British Columbia', degree: 'Bachelor of Science', field: 'Computer Science', startDate: '2020', endDate: '2024', gpa: '' }],
  workAuthorization: { authorizedCountries: ['United States'], requiresSponsorship: false }
};

describe('react-select behavioural simulation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('selects an option without ever blurring the input mid-flow', async () => {
    const rs = makeReactSelect(document, 'country', 'Country', ['Canada', 'United States', 'United Kingdom']);
    const outcome = await fillCombobox({ element: rs.input, desired: 'United States', hintCategory: 'country', trigger: rs.control });
    expect(outcome.status).toBe('verified');
    expect(rs.selected()).toBe('United States');
    expect(rs.input.value).toBe('');
    // react-select clears the input on blur; a blur before the click would have killed the menu
    expect(document.querySelector('.select__menu')).toBeNull();
  });

  it('waits for async (server-searched) options such as School and picks the match', async () => {
    const rs = makeReactSelect(document, 'school--0', 'School', ['University of British Columbia', 'University of Toronto', 'British Academy'], { async: 600 });
    const outcome = await fillCombobox({ element: rs.input, desired: 'University of British Columbia', trigger: rs.control });
    expect(outcome.status).toBe('verified');
    expect(rs.selected()).toBe('University of British Columbia');
  });

  it('fails cleanly when the search finds nothing: no text left behind, menu closed', async () => {
    const rs = makeReactSelect(document, 'school--1', 'School', ['Harvard University', 'Stanford University'], { async: 200 });
    const outcome = await fillCombobox({ element: rs.input, desired: 'Hogwarts', trigger: rs.control });
    expect(outcome.status).toBe('failed');
    expect(rs.input.value).toBe('');
    expect(rs.selected()).toBe('');
  });

  it('end to end through the classifier and engine on a Greenhouse-style form', async () => {
    const rs = makeReactSelect(document, 'question_1', 'Are you legally authorized to work in the United States?', ['Yes', 'No']);
    const fields = collectControls(document, document).map((c, i) => describeControl(c, i, document, { idPrefix: 'gh' }));
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('combobox');
    const r = await executeAutofill(fields, { profile, answers: [] });
    expect(r.filledFields[0]?.status).toBe('verified');
    expect(rs.selected()).toBe('Yes');
  });
});

describe('Workday prompt behavioural simulation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('presses Enter to search, ignores the default browse list, picks the result, verifies via the pill', async () => {
    // A neighbouring field with a chosen value: its pill list is a visible role="listbox"
    const neighbour = makeWorkdayPrompt(document, 'fieldOfStudy', 'Field of Study', ['Computer Science']);
    neighbour.pillList.innerHTML = '<div data-automation-id="selectedItem"><span>Computer Science</span></div>';

    const school = makeWorkdayPrompt(document, 'school', 'School or University', ['University of British Columbia', 'University of Toronto', 'Brown University'], {
      defaultList: ['Aalto University', 'Aarhus University', 'Abilene Christian University'],
      searchDelay: 700
    });
    const fields = collectControls(document, document).map((c, i) => describeControl(c, i, document, { idPrefix: 'wd' }));
    const schoolField = fields.find((f) => f.label.startsWith('School'))!;
    expect(schoolField.type).toBe('combobox');
    expect(schoolField.element).toBe(school.input);

    const outcome = await fillCombobox({ element: school.input, desired: 'University of British Columbia', trigger: schoolField.trigger });
    expect(outcome.status).toBe('verified');
    expect(school.state.searches).toEqual(['university of british columbia']);
    expect(school.state.pills).toEqual(['University of British Columbia']);
    // Never clicked anything in the neighbour's pill list, and no stray text remains
    expect(neighbour.state.pills).toEqual([]);
    expect(school.input.value).toBe('');
  });

  it('reports failed (not filled) when the catalogue has no match, clearing the query', async () => {
    const school = makeWorkdayPrompt(document, 'school2', 'School or University', ['Harvard University'], { defaultList: ['Aalto University'], searchDelay: 300 });
    const outcome = await fillCombobox({ element: school.input, desired: 'Hogwarts School', trigger: school.wrap.querySelector('[data-automation-id="multiSelectContainer"]') as HTMLElement });
    expect(outcome.status).toBe('failed');
    expect(school.state.pills).toEqual([]);
    expect(school.input.value).toBe('');
  });

  it('fills the school through the engine from the profile education row', async () => {
    const school = makeWorkdayPrompt(document, 'school3', 'School or University', ['University of British Columbia', 'University of Toronto'], { searchDelay: 400 });
    const fields = collectControls(document, document).map((c, i) => describeControl(c, i, document, { idPrefix: 'wd' }));
    const r = await executeAutofill(fields, { profile, answers: [], adapterId: 'workday' });
    expect(r.filledFields[0]?.status).toBe('verified');
    expect(school.state.pills).toEqual(['University of British Columbia']);
  });
});
