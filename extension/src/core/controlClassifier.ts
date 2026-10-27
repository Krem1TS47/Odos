/**
 * Control classifier shared by every ATS adapter (eng review D2/R2/R3).
 *
 * Decides, for each candidate element, whether it is a text-like input, a native select,
 * a custom dropdown (and which variant), a file input, or part of a radio/checkbox group.
 * Adapters call `collectControls()` and then `describeControl()`; they only add
 * ATS-specific label extras, ids and custom-question flags on top.
 *
 *   element
 *     ├─ <select> ───────────────────────────────► native select
 *     ├─ input[type=radio|checkbox] ── group by name ─► radio_group / checkbox_group
 *     ├─ input[type=file] ──────────────────────► file
 *     ├─ combobox signals on element or wrapper
 *     │    ├─ has a search input (self/child)  ► combobox:searchable
 *     │    └─ button/div trigger               ► combobox:listbox-button
 *     ├─ input[list] ───────────────────────────► combobox:datalist
 *     ├─ wrapper with adjacent hidden <select> ─► (skip; the native select is the control)
 *     ├─ contenteditable ───────────────────────► textarea
 *     └─ else ─────────────────────────────────► text / email / tel / url / textarea
 */

import { isSubmitControl } from '../content/submitGuard';
import { DropdownVariant, FormField, FormFieldType } from '../content/adapters/types';
import { deepQuerySelectorAll, isElementVisible, resolveIdRefs } from './dom';
import { LabelResolutionExtras, resolveFieldLabel } from './fieldMapper';

export interface ClassifiedControl {
  /** The element Odos interacts with (input for searchable comboboxes, button for listbox buttons). */
  element: HTMLElement;
  type: FormFieldType;
  dropdownVariant?: DropdownVariant;
  /** Wrapper/trigger that opens the popup, when different from `element`. */
  trigger?: HTMLElement;
  /** Search input inside a wrapper-style combobox. */
  searchInput?: HTMLInputElement | null;
  /** Listbox/menu node referenced by aria-controls/aria-owns, if it exists right now. */
  optionSource?: Element | null;
  /** Members of a radio/checkbox group (first member is `element`). */
  groupElements?: HTMLInputElement[];
  /** Closest shared container of a group (fieldset / role=radiogroup / common parent). */
  groupContainer?: HTMLElement | null;
}

/** Selector that finds every element worth classifying. */
export const CONTROL_SELECTOR = [
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="combobox"]',
  '[role="listbox"][tabindex]',
  '[aria-haspopup="listbox"]',
  '[aria-haspopup="menu"]',
  '[aria-haspopup="true"]',
  '[aria-autocomplete]',
  '.select__control',
  '.select__input',
  '.select2-selection',
  '.ant-select-selector',
  '.MuiSelect-select',
  '.MuiAutocomplete-input',
  '.choices__inner',
  '[data-automation-id="select-button"]',
  '[data-automation-id="dropdownWidget"]',
  '[data-automation-id="searchWidget"]',
  '[data-automation-id="selectWidget"]',
  '[data-automation-id="multiselectInputContainer"]',
  '[data-automation-id="multiSelectContainer"]',
  'input[data-automation-id="searchBox"]'
].join(', ');

const LIBRARY_WRAPPER_CLASSES = [
  'select__control',
  'select__container',
  'select2-selection',
  'select2-container',
  'ant-select-selector',
  'ant-select',
  'MuiSelect-select',
  'MuiAutocomplete-root',
  'MuiAutocomplete-inputRoot',
  'choices__inner',
  'choices'
];

const WORKDAY_WRAPPER_IDS = new Set([
  'select-button',
  'dropdownWidget',
  'searchWidget',
  'selectWidget',
  'multiselectInputContainer',
  'multiSelectContainer'
]);

/** Inputs that libraries render only for form submission / a11y and must never be typed into. */
const HIDDEN_LIBRARY_INPUT_CLASSES = ['MuiSelect-nativeInput', 'choices__input--cloned'];

function hasClass(el: Element, names: string[]): boolean {
  return names.some((n) => el.classList.contains(n));
}

/**
 * True when the element itself carries custom-dropdown signals.
 */
export function hasComboboxSignals(el: Element): boolean {
  const role = el.getAttribute('role');
  if (role === 'combobox') return true;
  const haspopup = (el.getAttribute('aria-haspopup') || '').toLowerCase();
  if (haspopup === 'listbox' || haspopup === 'menu' || haspopup === 'true' || haspopup === 'tree') return true;
  const autocomplete = (el.getAttribute('aria-autocomplete') || '').toLowerCase();
  if (autocomplete === 'list' || autocomplete === 'both') return true;
  if (el.hasAttribute('aria-expanded') && el.hasAttribute('aria-controls')) return true;
  if (el.hasAttribute('data-radix-select-trigger') || el.getAttribute('data-radix-collection-item') !== null) return false;
  if (hasClass(el, LIBRARY_WRAPPER_CLASSES)) return true;
  const autoId = el.getAttribute('data-automation-id');
  if (autoId && WORKDAY_WRAPPER_IDS.has(autoId)) return true;
  if (autoId === 'searchBox') return true;
  return false;
}

/**
 * Finds a wrapper up to `levels` ancestors above `el` that carries combobox signals.
 */
export function findComboboxWrapper(el: Element, levels = 3): HTMLElement | null {
  let node: Element | null = el.parentElement;
  for (let i = 0; i < levels && node; i++) {
    if (hasComboboxSignals(node)) return node as HTMLElement;
    node = node.parentElement;
  }
  return null;
}

function isTextLikeInput(el: HTMLElement): el is HTMLInputElement {
  if (el.tagName !== 'INPUT') return false;
  const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
  return ['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'date', 'month'].includes(type);
}

function findInnerSearchInput(wrapper: Element): HTMLInputElement | null {
  const inputs = Array.from(wrapper.querySelectorAll<HTMLInputElement>('input, textarea'));
  for (const input of inputs) {
    const type = (input.getAttribute('type') || 'text').toLowerCase();
    if (type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'file') continue;
    if (input.getAttribute('aria-hidden') === 'true') continue;
    if (hasClass(input, HIDDEN_LIBRARY_INPUT_CLASSES)) continue;
    return input;
  }
  return null;
}

function hasAdjacentNativeSelect(wrapper: Element): HTMLSelectElement | null {
  let scope: Element | null = wrapper.parentElement;
  for (let i = 0; i < 2 && scope; i++) {
    const sel = scope.querySelector('select');
    if (sel && !wrapper.contains(sel)) return sel;
    scope = scope.parentElement;
  }
  return null;
}

function hasVisibleChevronSibling(input: Element): boolean {
  const parent = input.parentElement;
  if (!parent) return false;
  return Boolean(parent.querySelector('button, [role="button"], svg, .chevron, [class*="indicator"], [class*="arrow"]'));
}

function resolveOptionSource(el: Element, trigger: Element | undefined, doc: Document): Element | null {
  for (const node of [el, trigger].filter(Boolean) as Element[]) {
    const refs = [...resolveIdRefs(node, 'aria-controls', doc), ...resolveIdRefs(node, 'aria-owns', doc)];
    if (refs.length > 0) return refs[0];
  }
  return null;
}

/**
 * Classifies one element. Returns null when the element must be skipped
 * (hidden, submit control, plain button, library-internal input, or a wrapper whose
 * inner input will be classified instead).
 */
export function classifyControl(el: HTMLElement, doc: Document = document): ClassifiedControl | null {
  const tag = el.tagName.toUpperCase();
  const inputEl = el as HTMLInputElement;
  const inputType = tag === 'INPUT' ? (inputEl.getAttribute('type') || 'text').toLowerCase() : '';

  if (tag === 'INPUT' && inputType === 'hidden') return null;
  if (isSubmitControl(el)) return null;
  if (el.closest('[data-automation-id="selectedItemList"], [data-automation-id="selectedItem"]')) return null;
  if (el.getAttribute('aria-hidden') === 'true' && tag !== 'SELECT') return null;
  if (hasClass(el, HIDDEN_LIBRARY_INPUT_CLASSES)) return null;

  // Native select (also the preferred target behind Select2/Chosen-style skins)
  if (tag === 'SELECT') {
    return { element: el, type: 'select', dropdownVariant: 'native' };
  }

  if (tag === 'INPUT') {
    if (inputType === 'file') return { element: el, type: 'file' };
    if (inputType === 'radio') return { element: el, type: 'radio' };
    if (inputType === 'checkbox') return { element: el, type: 'checkbox' };
    if (['submit', 'button', 'image', 'reset'].includes(inputType)) return null;

    const wrapper = findComboboxWrapper(el);
    const selfSignals = hasComboboxSignals(el);
    const readonlyWithChevron = inputEl.readOnly && hasVisibleChevronSibling(el);

    if (el.hasAttribute('list') && !selfSignals) {
      return { element: el, type: 'combobox', dropdownVariant: 'datalist', searchInput: inputEl };
    }

    if (selfSignals || wrapper || readonlyWithChevron) {
      const trigger = wrapper || el;
      return {
        element: el,
        type: 'combobox',
        dropdownVariant: 'searchable',
        trigger: trigger === el ? undefined : trigger,
        searchInput: inputEl,
        optionSource: resolveOptionSource(el, trigger, doc)
      };
    }

    // Plain inputs hidden by CSS are library internals or honeypots; skip them.
    if (isTextLikeInput(el) && !isElementVisible(el, { computed: false })) return null;

    if (inputType === 'email') return { element: el, type: 'email' };
    if (inputType === 'tel') return { element: el, type: 'tel' };
    if (inputType === 'url') return { element: el, type: 'url' };
    return { element: el, type: 'text' };
  }

  if (tag === 'TEXTAREA') {
    if (!isElementVisible(el, { computed: false })) return null;
    return { element: el, type: 'textarea' };
  }

  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    return { element: el, type: 'textarea' };
  }

  // Non-input element: only custom dropdown wrappers/triggers qualify.
  if (!hasComboboxSignals(el)) return null;

  // A skinned native select: let the <select> be the control.
  if (hasAdjacentNativeSelect(el)) return null;

  // Wrapper with an inner search input: the inner input will be classified on its own visit.
  const inner = findInnerSearchInput(el);
  if (inner) return null;

  // A trigger nested inside a wrapper that is itself a trigger: prefer the outer one once.
  const outer = findComboboxWrapper(el, 2);
  if (outer && !findInnerSearchInput(outer) && outer.querySelectorAll(CONTROL_SELECTOR).length > 1 && tag !== 'BUTTON') {
    return null;
  }

  return {
    element: el,
    type: 'combobox',
    dropdownVariant: 'listbox-button',
    optionSource: resolveOptionSource(el, undefined, doc)
  };
}

function groupKeyFor(input: HTMLInputElement, doc: Document): string {
  const form = input.closest('form');
  const scope = form ? `form:${Array.from(doc.querySelectorAll('form')).indexOf(form)}` : 'doc';
  const name = (input.getAttribute('name') || '').replace(/\[\]$/, '');
  if (name) return `${scope}|name:${name}`;
  const group = input.closest('[role="radiogroup"], [role="group"], fieldset');
  if (group) {
    const all = Array.from(doc.querySelectorAll('[role="radiogroup"], [role="group"], fieldset'));
    return `${scope}|group:${all.indexOf(group)}`;
  }
  return `${scope}|single:${Math.random()}`;
}

function commonContainer(inputs: HTMLInputElement[]): HTMLElement | null {
  if (inputs.length === 0) return null;
  const explicit = inputs[0].closest('fieldset, [role="radiogroup"], [role="group"]');
  if (explicit && inputs.every((i) => explicit.contains(i))) return explicit as HTMLElement;
  let node: HTMLElement | null = inputs[0].parentElement;
  while (node) {
    if (inputs.every((i) => node!.contains(i))) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Collects and classifies every control under `root`, grouping radios (always) and
 * checkboxes (when two or more share a name) into one entry each.
 */
export function collectControls(
  root: ParentNode,
  doc: Document = document,
  options: { deep?: boolean; extraSelector?: string } = {}
): ClassifiedControl[] {
  const selector = options.extraSelector ? `${CONTROL_SELECTOR}, ${options.extraSelector}` : CONTROL_SELECTOR;
  const elements = (options.deep ? deepQuerySelectorAll(selector, root) : Array.from(root.querySelectorAll(selector))) as HTMLElement[];

  const seen = new Set<HTMLElement>();
  const ordered: ClassifiedControl[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();
  const checkboxGroups = new Map<string, HTMLInputElement[]>();
  const groupSlot = new Map<string, number>();

  for (const el of elements) {
    if (seen.has(el)) continue;
    seen.add(el);

    const classified = classifyControl(el, doc);
    if (!classified) continue;

    if (classified.type === 'radio' || classified.type === 'checkbox') {
      const input = el as HTMLInputElement;
      const key = groupKeyFor(input, doc);
      const map = classified.type === 'radio' ? radioGroups : checkboxGroups;
      if (!map.has(key)) {
        map.set(key, []);
        groupSlot.set(`${classified.type}|${key}`, ordered.length);
        ordered.push(classified); // placeholder, replaced below
      }
      map.get(key)!.push(input);
      continue;
    }

    ordered.push(classified);
  }

  // Materialize groups in place.
  for (const [key, inputs] of radioGroups) {
    const slot = groupSlot.get(`radio|${key}`)!;
    ordered[slot] = {
      element: inputs[0],
      type: 'radio_group',
      groupElements: inputs,
      groupContainer: commonContainer(inputs)
    };
  }
  for (const [key, inputs] of checkboxGroups) {
    const slot = groupSlot.get(`checkbox|${key}`)!;
    if (inputs.length >= 2) {
      ordered[slot] = {
        element: inputs[0],
        type: 'checkbox_group',
        groupElements: inputs,
        groupContainer: commonContainer(inputs)
      };
    } else {
      ordered[slot] = { element: inputs[0], type: 'checkbox' };
    }
  }

  return ordered;
}

/**
 * Label for a single radio/checkbox option.
 */
export function optionLabelFor(input: HTMLInputElement, doc: Document = document): string {
  const aria = input.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const labelledBy = resolveIdRefs(input, 'aria-labelledby', doc);
  if (labelledBy.length > 0) {
    const t = labelledBy.map((l) => (l.textContent || '').trim()).filter(Boolean).join(' ');
    if (t) return t;
  }
  if (input.id) {
    const forLabel = doc.querySelector(`label[for="${CSS && typeof CSS.escape === 'function' ? CSS.escape(input.id) : input.id}"]`);
    const t = (forLabel?.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  const wrapping = input.closest('label');
  if (wrapping) {
    const t = (wrapping.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  const next = input.nextElementSibling;
  if (next && (next.tagName === 'LABEL' || next.tagName === 'SPAN')) {
    const t = (next.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  return input.value || '';
}

/**
 * Question label for a radio/checkbox group: legend, labelled-by, a label that does not
 * wrap one of the inputs, the container's own aria-label, or the preceding heading.
 */
export function groupLabelFor(control: ClassifiedControl, doc: Document = document): string {
  const container = control.groupContainer;
  const inputs = control.groupElements || [];
  const belongsToOption = (el: Element) =>
    Boolean(el.querySelector('input')) || inputs.some((i) => i.id && el.getAttribute('for') === i.id);

  if (container) {
    const legend = container.querySelector('legend');
    if (legend && (legend.textContent || '').trim()) return (legend.textContent || '').replace(/\s+/g, ' ').trim();

    const ariaLabel = container.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    const labelledBy = resolveIdRefs(container, 'aria-labelledby', doc)
      .map((l) => (l.textContent || '').trim())
      .filter(Boolean)
      .join(' ');
    if (labelledBy) return labelledBy;

    const candidates = Array.from(container.querySelectorAll('label, [id$="-label"], .label, .application-label, h3, h4, legend, p'));
    const heading = candidates.find((c) => !belongsToOption(c) && (c.textContent || '').trim());
    if (heading) return (heading.textContent || '').replace(/\s+/g, ' ').trim();

    let prev = container.previousElementSibling;
    for (let i = 0; i < 2 && prev; i++) {
      if (/^(LABEL|LEGEND|H[1-6]|P|SPAN|DIV)$/.test(prev.tagName) && !prev.querySelector('input, select, textarea')) {
        const t = (prev.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t;
      }
      prev = prev.previousElementSibling;
    }
  }

  return resolveFieldLabel(inputs[0] || control.element, doc, { fallbackToName: true });
}

const REPEAT_ITEM_SELECTORS: Array<{ section: 'education' | 'experience' | 'website'; selector: string }> = [
  { section: 'education', selector: '[data-automation-id="education-item"], [data-automation-id^="education-"], .education-entry, .school-entry, [data-field="education_item"], [class*="education-item"], [class*="education_item"]' },
  { section: 'experience', selector: '[data-automation-id="workExperience-item"], [data-automation-id^="workExperience-"], .employment-entry, .job-entry, .experience-entry, [data-field="employment_item"], [class*="experience-item"], [class*="employment-item"]' },
  { section: 'website', selector: '[data-automation-id="website-item"], [data-automation-id^="website-"], .website-entry, .url-entry, [class*="website-item"]' }
];

const REPEAT_SECTION_SELECTORS: Array<{ section: 'education' | 'experience' | 'website'; selector: string }> = [
  { section: 'education', selector: '[data-automation-id="educationSection"], .education-section, #education_section, [data-field="education"]' },
  { section: 'experience', selector: '[data-automation-id="workExperienceSection"], .employment-section, #employment_section, [data-field="employment"], .experience-section' },
  { section: 'website', selector: '[data-automation-id="websiteSection"], [data-automation-id="websitesSection"], .websites-section, #urls_section' }
];

/**
 * Determines which repeatable section and row (0-based) an element belongs to.
 */
export function detectRepeatRow(el: Element): { section: 'education' | 'experience' | 'website'; rowIndex: number } | null {
  for (const { section, selector } of REPEAT_ITEM_SELECTORS) {
    const item = el.closest(selector);
    if (!item || item === el) continue;
    const scope = item.parentElement || item.ownerDocument;
    const siblings = Array.from(scope.querySelectorAll(selector)).filter((s) => s.parentElement === item.parentElement);
    const idx = siblings.indexOf(item);
    return { section, rowIndex: idx >= 0 ? idx : 0 };
  }
  for (const { section, selector } of REPEAT_SECTION_SELECTORS) {
    if (el.closest(selector)) return { section, rowIndex: 0 };
  }
  return null;
}

export interface DescribeOptions {
  /** Prefix for generated ids when the element has none. */
  idPrefix: string;
  /** Label extras forwarded to resolveFieldLabel. */
  labelExtras?: LabelResolutionExtras;
  /** Override/clean the label after resolution (friendly names, etc.). */
  finalizeLabel?: (label: string, control: ClassifiedControl) => string;
  /** Override id/name derivation. */
  identify?: (control: ClassifiedControl) => { id?: string; name?: string };
  /** Extra required-ness check. */
  isRequired?: (control: ClassifiedControl) => boolean;
}

/**
 * Builds a FormField from a classified control (shared by all adapters).
 */
export function describeControl(control: ClassifiedControl, index: number, doc: Document, opts: DescribeOptions): FormField {
  const el = control.element;
  const inputEl = el as HTMLInputElement;
  const custom = opts.identify ? opts.identify(control) : {};
  const name = custom.name ?? (el.getAttribute('name') || '');
  const id = custom.id ?? (el.getAttribute('id') || `${opts.idPrefix}_${index}`);

  let rawLabel: string;
  if (control.type === 'radio_group' || control.type === 'checkbox_group') {
    rawLabel = groupLabelFor(control, doc);
  } else {
    rawLabel = resolveFieldLabel(el, doc, opts.labelExtras);
  }
  let label = rawLabel.replace(/[*]/g, '').trim();
  if (opts.finalizeLabel) label = opts.finalizeLabel(label, control);

  const required =
    Boolean(inputEl.required) ||
    el.getAttribute('aria-required') === 'true' ||
    rawLabel.includes('*') ||
    (control.groupElements?.some((g) => g.required) ?? false) ||
    (opts.isRequired ? opts.isRequired(control) : false);

  let options: string[] | undefined;
  let optionValues: string[] | undefined;
  if (control.type === 'select') {
    const selectEl = el as HTMLSelectElement;
    const all = Array.from(selectEl.options).filter((o) => o.text.trim() && !o.text.trim().startsWith('--'));
    options = all.map((o) => o.text.trim());
    optionValues = all.map((o) => o.value);
  } else if (control.groupElements) {
    options = control.groupElements.map((g) => optionLabelFor(g, doc));
    optionValues = control.groupElements.map((g) => g.value);
  }

  const repeat = detectRepeatRow(el);

  return {
    id,
    name,
    label,
    type: control.type,
    element: el,
    required,
    options,
    optionValues,
    dropdownVariant: control.dropdownVariant,
    trigger: control.trigger,
    optionSource: control.optionSource,
    groupElements: control.groupElements,
    rowIndex: repeat?.rowIndex,
    repeatSection: repeat?.section
  };
}
