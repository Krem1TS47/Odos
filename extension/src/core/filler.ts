/**
 * Framework-safe fillers with a verified-fill contract (eng review R1).
 *
 * Every fill path returns a FillOutcome:
 *   verified   - the control visibly holds the value we set
 *   unverified - we acted (clicked/typed) but could not confirm the widget accepted it
 *   failed     - nothing was selected; the control was restored to its pre-fill state
 *
 * Content scripts run in Chrome's isolated world, so page-set expandos such as React's
 * `_valueTracker` are not visible here. What works is the prototype `value` setter
 * followed by a real `input` event: React's change tracker compares the DOM value to the
 * value it last saw and fires onChange.
 */

import { assertNotSubmitControl } from '../content/submitGuard';
import { DropdownVariant, FillStatus, FillSuggestion, FormField } from '../content/adapters/types';
import {
  isElementVisible,
  resolveIdRefs,
  startAddedNodeRecorder,
  waitForCondition,
  waitForElement
} from './dom';
import { MatchResult, OptionCandidate, normalizeOptionText, resolveOption } from './dropdownResolver';

export interface FillOutcome {
  status: FillStatus;
  /** Value Odos tried to apply (option text for dropdowns). */
  value?: string;
  /** What the control displays after the attempt, when readable. */
  displayed?: string;
  reason: string;
  /** Closest candidate when nothing was selected. */
  suggestion?: FillSuggestion;
  /** Score/strategy of the selected option, when any. */
  match?: MatchResult;
}

/** Maximum wait for a combobox popup to show options (R15). */
export const COMBOBOX_WAIT_MS = 800;
/** Extra wait after the keyboard fallback (R15). */
export const COMBOBOX_RETRY_MS = 400;
/** Settle window for a widget to reflect a selection. */
export const SETTLE_MS = 150;

export const OPTION_SELECTOR = [
  '[role="option"]',
  'li[data-value]',
  '.option',
  '.select__option',
  'div[id*="-option-"]',
  '[data-automation-id="promptOption"]',
  '[data-automation-id="select-item"]',
  '[data-radix-collection-item]',
  'button[role="menuitem"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '.ant-select-item-option',
  '.MuiMenuItem-root',
  'li.select2-results__option',
  '.choices__item--choice'
].join(', ');

const CREATE_BUTTON_SELECTOR =
  '[data-automation-id="createOption"], button.select__add-option, button.create-option, [role="button"][data-action="add"]';

const LISTBOX_SELECTOR = '[role="listbox"], [role="menu"], .select__menu, .select2-results, .ant-select-dropdown, .MuiPopover-paper, .MuiAutocomplete-popper, [data-radix-popper-content-wrapper], .choices__list--dropdown';

function suggestionFrom(match: MatchResult | null | undefined): FillSuggestion | undefined {
  if (!match) return undefined;
  return { text: match.candidate.text.trim(), score: match.score, source: 'option' };
}

// ---------------------------------------------------------------------------
// Text inputs
// ---------------------------------------------------------------------------

/**
 * Injects a value into an input, textarea, or contenteditable element.
 * Returns true when the control holds the value afterwards.
 */
export function setNativeValue(el: HTMLElement, value: string): boolean {
  assertNotSubmitControl(el, 'setNativeValue');

  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    return fillContentEditable(el, value);
  }

  const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
  const isInput = inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement;
  if (!isInput || inputEl.type === 'file') return false;

  try {
    if (typeof inputEl.focus === 'function') inputEl.focus();
  } catch {}
  inputEl.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  inputEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Unidentified' }));

  let commandSucceeded = false;

  // Tier 1: native typing simulation via execCommand (browsers treat it as user input)
  try {
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      try {
        if (typeof inputEl.select === 'function') {
          inputEl.select();
        } else if (typeof inputEl.setSelectionRange === 'function' && inputEl.type !== 'email' && inputEl.type !== 'number') {
          inputEl.setSelectionRange(0, inputEl.value.length);
        }
      } catch {}
      commandSucceeded = document.execCommand('insertText', false, value);
    }
  } catch {}

  // Tier 2: prototype setter + input event (what frameworks observe from the isolated world)
  if (!commandSucceeded || inputEl.value !== value) {
    try {
      inputEl.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
    } catch {
      inputEl.dispatchEvent(new Event('beforeinput', { bubbles: true, cancelable: true }));
    }

    const proto = inputEl instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(inputEl, value);
    } else {
      inputEl.value = value;
    }

    try {
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
    } catch {
      inputEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
  }

  // Change lifecycle (React Hook Form, Formik, Yup validate on change/blur)
  inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));

  let blurred = false;
  try {
    if (typeof inputEl.blur === 'function') {
      inputEl.blur();
      blurred = true;
    }
  } catch {}
  if (!blurred) inputEl.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  inputEl.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

  return inputEl.value === value;
}

/**
 * Handles contenteditable elements (Ashby and modern rich-text question fields).
 */
export function fillContentEditable(el: HTMLElement, value: string): boolean {
  assertNotSubmitControl(el, 'fillContentEditable');

  try {
    el.focus();
  } catch {}
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

  let success = false;
  try {
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      document.execCommand('selectAll', false);
      success = document.execCommand('insertText', false, value);
    }
  } catch {}

  if (!success || el.textContent !== value) {
    el.textContent = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  try {
    el.blur();
  } catch {}

  return (el.textContent || '') === value;
}

/**
 * Re-applies a value if a framework reset the control during a re-render.
 */
export function reconcileField(el: HTMLElement, expectedValue: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.type === 'file') return true;
    if (el.value !== expectedValue) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, expectedValue);
      } else {
        el.value = expectedValue;
      }
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      return el.value === expectedValue;
    }
    return true;
  }
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    if ((el.textContent || '') !== expectedValue) {
      return fillContentEditable(el, expectedValue);
    }
  }
  return true;
}

/**
 * Fills a text-like control and verifies it holds the value.
 */
export function fillTextField(el: HTMLElement, value: string): FillOutcome {
  const ok = setNativeValue(el, value);
  if (ok) return { status: 'verified', value, displayed: value, reason: 'text_set' };
  const reconciled = reconcileField(el, value);
  if (reconciled) return { status: 'verified', value, displayed: value, reason: 'text_reconciled' };
  const current = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent || '';
  return { status: 'unverified', value, displayed: current, reason: 'value_not_retained' };
}

// ---------------------------------------------------------------------------
// Native <select>
// ---------------------------------------------------------------------------

function selectCandidates(selectEl: HTMLSelectElement): OptionCandidate[] {
  return Array.from(selectEl.options).map((opt, i) => ({ text: opt.text, value: opt.value, index: i, element: opt as unknown as HTMLElement }));
}

/**
 * Selects a native option under the resolver policy and verifies the selection stuck.
 */
export function fillSelect(selectEl: HTMLSelectElement, desiredValue: string, hintCategory?: string): FillOutcome {
  assertNotSubmitControl(selectEl, 'fillSelect');
  const { selected, suggestion } = resolveOption(selectCandidates(selectEl), desiredValue, hintCategory);
  if (!selected) {
    return { status: 'failed', value: desiredValue, reason: 'no_option_match', suggestion: suggestionFrom(suggestion) };
  }

  const idx = selected.candidate.index;
  selectEl.selectedIndex = idx;
  selectEl.value = selectEl.options[idx].value;
  for (let i = 0; i < selectEl.options.length; i++) {
    selectEl.options[i].selected = i === idx;
  }
  selectEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  selectEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  selectEl.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));

  const stuck = selectEl.selectedIndex === idx;
  return {
    status: stuck ? 'verified' : 'unverified',
    value: selectEl.options[idx].text.trim(),
    displayed: selectEl.options[selectEl.selectedIndex]?.text.trim(),
    reason: stuck ? 'select_option' : 'select_reset_by_page',
    match: selected
  };
}

/**
 * Back-compat boolean wrapper around fillSelect.
 */
export function fillSelectElement(selectEl: HTMLSelectElement, desiredValue: string, hintCategory?: string): boolean {
  return fillSelect(selectEl, desiredValue, hintCategory).status !== 'failed';
}

// ---------------------------------------------------------------------------
// Radios and checkboxes
// ---------------------------------------------------------------------------

const TRUTHY = new Set(['yes', 'true', 'y', 'agree', 'i agree', 'accept', 'i accept', 'checked', 'on', '1']);
const FALSY = new Set(['no', 'false', 'n', 'disagree', 'unchecked', 'off', '0']);

/** Interprets an answer as a checkbox state; null when the answer is not boolean-like. */
export function parseBooleanAnswer(value: string): boolean | null {
  const norm = normalizeOptionText(value);
  if (TRUTHY.has(norm)) return true;
  if (FALSY.has(norm)) return false;
  return null;
}

function clickInput(input: HTMLInputElement): void {
  assertNotSubmitControl(input, 'clickInput');
  input.click();
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

/**
 * Single radio or checkbox toggle (legacy helper; radio groups use fillRadioGroup).
 */
export function fillRadioOrCheckbox(inputEl: HTMLInputElement, desiredState = true): boolean {
  assertNotSubmitControl(inputEl, 'fillRadioOrCheckbox');
  if (inputEl.type === 'radio') {
    if (desiredState && !inputEl.checked) clickInput(inputEl);
    return inputEl.checked === desiredState || desiredState;
  }
  if (inputEl.type === 'checkbox') {
    if (inputEl.checked !== desiredState) clickInput(inputEl);
    return inputEl.checked === desiredState;
  }
  return false;
}

function groupCandidates(inputs: HTMLInputElement[], labels?: string[]): OptionCandidate[] {
  return inputs.map((input, i) => ({
    text: labels?.[i] || input.value || '',
    value: input.value || '',
    index: i,
    element: input
  }));
}

/**
 * Picks the radio whose label/value matches the answer, clicks only that one, verifies.
 */
export function fillRadioGroup(
  inputs: HTMLInputElement[],
  desiredValue: string,
  hintCategory?: string,
  labels?: string[]
): FillOutcome {
  if (inputs.length === 0) return { status: 'failed', reason: 'empty_group' };
  const { selected, suggestion } = resolveOption(groupCandidates(inputs, labels), desiredValue, hintCategory);
  if (!selected) {
    return { status: 'failed', value: desiredValue, reason: 'no_option_match', suggestion: suggestionFrom(suggestion) };
  }
  const target = inputs[selected.candidate.index];
  if (!target.checked) clickInput(target);
  const ok = target.checked && inputs.every((i) => i === target || !i.checked);
  return {
    status: ok ? 'verified' : 'unverified',
    value: selected.candidate.text.trim(),
    displayed: selected.candidate.text.trim(),
    reason: ok ? 'radio_checked' : 'radio_not_retained',
    match: selected
  };
}

/**
 * Single checkbox: boolean-like answers set the state; an answer equal to the label checks it.
 */
export function fillCheckbox(input: HTMLInputElement, desiredValue: string, label?: string): FillOutcome {
  let desired = parseBooleanAnswer(desiredValue);
  if (desired === null && label && normalizeOptionText(label) === normalizeOptionText(desiredValue)) desired = true;
  if (desired === null) return { status: 'failed', value: desiredValue, reason: 'not_boolean' };
  if (input.checked !== desired) clickInput(input);
  const ok = input.checked === desired;
  return { status: ok ? 'verified' : 'unverified', value: desired ? 'Yes' : 'No', reason: ok ? 'checkbox_set' : 'checkbox_not_retained' };
}

/**
 * Checkbox group: each delimited answer token checks its matching option.
 */
export function fillCheckboxGroup(
  inputs: HTMLInputElement[],
  desiredValue: string,
  hintCategory?: string,
  labels?: string[]
): FillOutcome {
  const tokens = desiredValue
    .split(/[;,\n|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0 || inputs.length === 0) return { status: 'failed', value: desiredValue, reason: 'empty_answer' };

  const candidates = groupCandidates(inputs, labels);
  const chosen = new Set<number>();
  let bestSuggestion: MatchResult | null = null;
  for (const token of tokens) {
    const { selected, suggestion } = resolveOption(candidates, token, hintCategory);
    if (selected) chosen.add(selected.candidate.index);
    else if (suggestion && (!bestSuggestion || suggestion.score > bestSuggestion.score)) bestSuggestion = suggestion;
  }
  if (chosen.size === 0) {
    return { status: 'failed', value: desiredValue, reason: 'no_option_match', suggestion: suggestionFrom(bestSuggestion) };
  }
  for (const idx of chosen) {
    if (!inputs[idx].checked) clickInput(inputs[idx]);
  }
  const ok = Array.from(chosen).every((idx) => inputs[idx].checked);
  const picked = Array.from(chosen).map((idx) => candidates[idx].text.trim()).join('; ');
  return { status: ok ? 'verified' : 'unverified', value: picked, displayed: picked, reason: ok ? 'checkboxes_set' : 'checkbox_not_retained' };
}

// ---------------------------------------------------------------------------
// Custom comboboxes
// ---------------------------------------------------------------------------

export interface ComboboxFillOptions {
  element: HTMLElement;
  desired: string;
  trigger?: HTMLElement;
  searchInput?: HTMLInputElement | null;
  optionSource?: Element | null;
  variant?: DropdownVariant;
  hintCategory?: string;
  doc?: Document;
}

function cleanText(s: string | null | undefined): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

const DISPLAY_VALUE_SELECTOR =
  '.select__single-value, [class*="single-value"], [class*="singleValue"], .select2-selection__rendered, .ant-select-selection-item, [data-automation-id="selectedItem"], [data-automation-id="selectedItemLabel"], .MuiSelect-select, [class*="selected-value"], [class*="selectedValue"]';

/**
 * Reads what a dropdown control currently shows to the user.
 */
export function readDisplayedValue(control: HTMLElement, trigger?: HTMLElement | null): string {
  const scope = trigger && trigger !== control ? trigger : control.parentElement || control;
  const display = scope.querySelector(DISPLAY_VALUE_SELECTOR) as HTMLElement | null;
  if (display && display !== control) {
    const t = cleanText(display.textContent);
    if (t) return t;
  }
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    return cleanText(control.value);
  }
  return cleanText((trigger || control).textContent);
}

function pointerSequence(el: Element): void {
  const init = { bubbles: true, cancelable: true, composed: true } as MouseEventInit;
  el.dispatchEvent(new MouseEvent('pointerdown', init));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new MouseEvent('pointerup', init));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  (el as HTMLElement).click();
}

function keydown(el: Element, key: string, code = key): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code }));
}

function visibleOptions(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(OPTION_SELECTOR)).filter((o) => isElementVisible(o));
}

/**
 * Resolves the option pool for an open combobox (eng review R10), in order:
 * linked listbox (aria-controls/owns/activedescendant) -> nodes that appeared after the
 * open click -> classifier-provided optionSource -> visible options anywhere.
 */
export async function resolveOptionPool(
  control: HTMLElement,
  trigger: HTMLElement | null | undefined,
  recorder: { peek(): Element[] },
  optionSource: Element | null | undefined,
  doc: Document,
  waitMs: number
): Promise<{ options: HTMLElement[]; root: ParentNode; strategy: string }> {
  const linked: Element[] = [];
  for (const node of [control, trigger].filter(Boolean) as Element[]) {
    linked.push(...resolveIdRefs(node, 'aria-controls', doc), ...resolveIdRefs(node, 'aria-owns', doc));
    const active = resolveIdRefs(node, 'aria-activedescendant', doc)[0];
    if (active?.parentElement) linked.push(active.parentElement);
  }
  const linkedRoot = linked.find((l) => l !== control && l !== trigger);
  if (linkedRoot) {
    await waitForElement(OPTION_SELECTOR, waitMs, linkedRoot);
    const options = visibleOptions(linkedRoot);
    if (options.length > 0) return { options, root: linkedRoot, strategy: 'aria_linked' };
  }

  const appeared = await waitForElement(OPTION_SELECTOR, waitMs, doc);
  const added = recorder.peek();
  if (added.length > 0) {
    const roots: Element[] = [];
    for (const node of added) {
      if (!node.isConnected) continue;
      if (node.matches(LISTBOX_SELECTOR) || node.querySelector(LISTBOX_SELECTOR) || node.matches(OPTION_SELECTOR) || node.querySelector(OPTION_SELECTOR)) {
        roots.push(node);
      }
    }
    const dedup = roots.filter((r) => !roots.some((other) => other !== r && other.contains(r)));
    const options: HTMLElement[] = [];
    for (const r of dedup) {
      if (r.matches(OPTION_SELECTOR) && isElementVisible(r)) options.push(r as HTMLElement);
      options.push(...visibleOptions(r));
    }
    if (options.length > 0) return { options: Array.from(new Set(options)), root: dedup[0] || doc, strategy: 'appeared_after_click' };
  }

  if (optionSource && optionSource.isConnected) {
    const options = visibleOptions(optionSource);
    if (options.length > 0) return { options, root: optionSource, strategy: 'option_source' };
  }

  const all = appeared ? visibleOptions(doc) : visibleOptions(doc);
  return { options: all, root: doc, strategy: 'document_visible' };
}

function findDisplayElement(control: HTMLElement, trigger?: HTMLElement | null): HTMLElement | null {
  const scope = trigger && trigger !== control ? trigger : control.parentElement || control;
  const display = scope.querySelector(DISPLAY_VALUE_SELECTOR) as HTMLElement | null;
  return display && display !== control ? display : null;
}

function isSelectionReflected(
  control: HTMLElement,
  trigger: HTMLElement | null | undefined,
  option: HTMLElement,
  optionText: string,
  pre: { displayed: string; ariaSelected: string | null; typed: string }
): boolean {
  const normOpt = normalizeOptionText(optionText);
  const displayed = readDisplayedValue(control, trigger);
  const normDisplayed = normalizeOptionText(displayed);
  // When the only "display" is the search input itself, the typed text is not evidence.
  const displayIsTypedText = !findDisplayElement(control, trigger) && normDisplayed === normalizeOptionText(pre.typed) && Boolean(pre.typed);
  if (
    !displayIsTypedText &&
    normDisplayed &&
    normDisplayed !== normalizeOptionText(pre.displayed) &&
    (normDisplayed.includes(normOpt) || normOpt.includes(normDisplayed))
  ) {
    return true;
  }
  if (option.isConnected && option.getAttribute('aria-selected') === 'true' && pre.ariaSelected !== 'true') return true;
  const scope = trigger && trigger !== control ? trigger : control.parentElement;
  const hidden = scope?.querySelector<HTMLInputElement>('input[type="hidden"]');
  if (hidden && hidden.value && normalizeOptionText(hidden.value) === normalizeOptionText(option.getAttribute('data-value') || option.getAttribute('value') || optionText)) {
    return true;
  }
  // The input holding the option text only counts when it is not simply what we typed.
  if (
    control instanceof HTMLInputElement &&
    normalizeOptionText(control.value) === normOpt &&
    normOpt !== normalizeOptionText(pre.displayed) &&
    normalizeOptionText(control.value) !== normalizeOptionText(pre.typed)
  ) {
    return true;
  }
  return false;
}

function fillDatalist(input: HTMLInputElement, desired: string, hintCategory?: string): FillOutcome {
  const listId = input.getAttribute('list');
  const list = listId ? (input.ownerDocument.getElementById(listId) as HTMLDataListElement | null) : null;
  if (list) {
    const candidates: OptionCandidate[] = Array.from(list.options).map((o, i) => ({ text: o.label || o.value, value: o.value, index: i }));
    const { selected } = resolveOption(candidates, desired, hintCategory);
    if (selected) {
      const outcome = fillTextField(input, selected.candidate.value || selected.candidate.text);
      return { ...outcome, reason: 'datalist_option', match: selected };
    }
  }
  const outcome = fillTextField(input, desired);
  return { ...outcome, reason: 'datalist_free_text' };
}

/**
 * Drives a custom combobox/listbox widget under the verified-fill contract.
 */
export async function fillCombobox(opts: ComboboxFillOptions): Promise<FillOutcome> {
  const { element, desired, hintCategory } = opts;
  const doc = opts.doc || element.ownerDocument || document;
  assertNotSubmitControl(element, 'fillCombobox');

  const searchInput: HTMLInputElement | null =
    opts.searchInput !== undefined
      ? opts.searchInput
      : element instanceof HTMLInputElement
        ? element
        : element.querySelector<HTMLInputElement>('input[type="text"], input[type="search"], input[role="searchbox"], input[aria-autocomplete], input.select__input, input[data-automation-id="searchBox"], input:not([type])');
  const trigger = opts.trigger && opts.trigger !== element ? opts.trigger : null;

  if (opts.variant === 'datalist' && element instanceof HTMLInputElement) {
    return fillDatalist(element, desired, hintCategory);
  }

  const pre = {
    search: searchInput ? searchInput.value : '',
    displayed: readDisplayedValue(element, trigger),
    ariaSelected: null as string | null,
    typed: ''
  };

  const restore = () => {
    if (searchInput && searchInput.value !== pre.search) {
      setNativeValue(searchInput, pre.search);
    }
    keydown(searchInput || element, 'Escape');
  };

  // 1. Open the popup
  const recorder = startAddedNodeRecorder(doc);
  try {
    if (typeof element.focus === 'function') element.focus();
    pointerSequence(trigger || element);
    if (trigger && searchInput && typeof searchInput.focus === 'function') searchInput.focus();

    // 2. Type to filter
    if (searchInput && desired) {
      setNativeValue(searchInput, desired);
      pre.typed = desired;
      keydown(searchInput, 'ArrowDown');
    }

    // 3. Collect the option pool
    const pool = await resolveOptionPool(element, trigger, recorder, opts.optionSource, doc, COMBOBOX_WAIT_MS);
    const candidates: OptionCandidate[] = pool.options.map((opt, idx) => ({
      text: opt.textContent || '',
      value: opt.getAttribute('data-value') || opt.getAttribute('value') || '',
      index: idx,
      element: opt
    }));

    const { selected, suggestion } = resolveOption(candidates, desired, hintCategory);

    if (!selected || !selected.candidate.element) {
      // Creatable / "+ Add" fallback
      const addBtn = (pool.root as ParentNode).querySelector<HTMLElement>(CREATE_BUTTON_SELECTOR) || doc.querySelector<HTMLElement>(CREATE_BUTTON_SELECTOR);
      if (addBtn && isElementVisible(addBtn)) {
        assertNotSubmitControl(addBtn, 'fillCombobox:addOptionBtn');
        pointerSequence(addBtn);
        const changed = await waitForCondition(() => readDisplayedValue(element, trigger) !== pre.displayed, SETTLE_MS, 25);
        return {
          status: changed ? 'verified' : 'unverified',
          value: desired,
          displayed: readDisplayedValue(element, trigger),
          reason: 'creatable_option'
        };
      }
      restore();
      return { status: 'failed', value: desired, reason: `no_option_match:${pool.strategy}`, suggestion: suggestionFrom(suggestion) };
    }

    const option = selected.candidate.element;
    const optionText = cleanText(selected.candidate.text);
    pre.ariaSelected = option.getAttribute('aria-selected');

    // 4. Click the option (Workday Canvas Kit & React-Select need the full pointer sequence)
    pointerSequence(option);
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    let ok = await waitForCondition(() => isSelectionReflected(element, trigger, option, optionText, pre), SETTLE_MS, 25);

    // 5. Keyboard fallback: ArrowDown to the option, then Enter
    if (!ok) {
      const target = searchInput || element;
      try {
        if (typeof target.focus === 'function') target.focus();
      } catch {}
      const steps = Math.min(selected.candidate.index + 1, 50);
      for (let i = 0; i < steps; i++) keydown(target, 'ArrowDown');
      keydown(target, 'Enter');
      ok = await waitForCondition(() => isSelectionReflected(element, trigger, option, optionText, pre), COMBOBOX_RETRY_MS, 25);
    }

    if (ok) {
      // Real widgets clear the search text once a value is shown elsewhere; make sure no typed
      // text lingers when the displayed value lives outside the search input.
      const displayEl = findDisplayElement(element, trigger);
      if (searchInput && displayEl && displayEl !== searchInput && searchInput.value === pre.typed && pre.typed) {
        setNativeValue(searchInput, pre.search);
      }
      element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      return { status: 'verified', value: optionText, displayed: readDisplayedValue(element, trigger), reason: `option_selected:${pool.strategy}`, match: selected };
    }

    // 6. Could not confirm: leave no typed search text behind, close the popup.
    restore();
    return { status: 'unverified', value: optionText, displayed: readDisplayedValue(element, trigger), reason: 'selection_not_confirmed', match: selected };
  } finally {
    recorder.stop();
  }
}

/**
 * Back-compat wrapper: true unless nothing could be selected.
 */
export async function fillComboboxWidget(
  comboboxEl: HTMLElement,
  desiredValue: string,
  _searchContainer: HTMLElement | Document = document,
  hintCategory?: string
): Promise<boolean> {
  const outcome = await fillCombobox({ element: comboboxEl, desired: desiredValue, hintCategory, doc: comboboxEl.ownerDocument || document });
  return outcome.status !== 'failed';
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * Attaches a resume or binary file to an input[type="file"].
 */
export function fillFileInput(
  fileInput: HTMLInputElement,
  fileData: { fileName: string; fileType: string; data: ArrayBuffer | Blob }
): boolean {
  assertNotSubmitControl(fileInput, 'fillFileInput');

  try {
    const file = fileData.data instanceof File
      ? fileData.data
      : new File([fileData.data], fileData.fileName, { type: fileData.fileType });

    let applied = false;

    if (typeof DataTransfer !== 'undefined') {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        applied = true;
      } catch {
        // Fallback below
      }
    }

    if (!applied) {
      Object.defineProperty(fileInput, 'files', { value: [file], writable: true, configurable: true });
      applied = true;
    }

    if (applied) {
      fileInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      const dropZone = fileInput.closest('.drop-zone, .file-upload, [role="button"]') || fileInput.parentElement;
      if (dropZone) {
        try {
          if (typeof DataTransfer !== 'undefined') {
            const dropDt = new DataTransfer();
            dropDt.items.add(file);
            dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dropDt }));
          }
        } catch {
          // DragEvent may be unavailable
        }
      }
      return true;
    }
  } catch (err) {
    console.warn('[Odos Filler] Could not set file input via DataTransfer:', err);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Snapshot & undo (eng review R13)
// ---------------------------------------------------------------------------

export interface FieldSnapshot {
  value?: string;
  checked?: boolean;
  checkedValue?: string | null;
  checkedValues?: string[];
  selectedIndex?: number;
  displayed?: string;
}

/**
 * Captures enough state to reverse a fill for every field type.
 */
export function captureFieldSnapshot(field: FormField): FieldSnapshot {
  const el = field.element;
  switch (field.type) {
    case 'select': {
      const s = el as HTMLSelectElement;
      return { value: s.value, selectedIndex: s.selectedIndex };
    }
    case 'radio_group': {
      const checked = (field.groupElements || []).find((g) => g.checked);
      return { checkedValue: checked ? checked.value : null };
    }
    case 'checkbox_group':
      return { checkedValues: (field.groupElements || []).filter((g) => g.checked).map((g) => g.value) };
    case 'checkbox':
    case 'radio':
      return { checked: (el as HTMLInputElement).checked };
    case 'combobox': {
      const input = el instanceof HTMLInputElement ? el : null;
      return { value: input ? input.value : '', displayed: readDisplayedValue(el, field.trigger) };
    }
    case 'file':
      return {};
    default: {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return { value: el.value };
      return { value: el.textContent || '' };
    }
  }
}

/**
 * Restores a field to its snapshot through the same mechanisms used to fill it.
 */
export async function restoreField(field: FormField, snap: FieldSnapshot): Promise<FillOutcome> {
  const el = field.element;
  switch (field.type) {
    case 'select': {
      const s = el as HTMLSelectElement;
      const idx = snap.selectedIndex ?? -1;
      s.selectedIndex = idx;
      for (let i = 0; i < s.options.length; i++) s.options[i].selected = i === idx;
      s.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      s.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return { status: s.selectedIndex === idx ? 'verified' : 'unverified', value: snap.value, reason: 'undo_select' };
    }
    case 'radio_group': {
      const inputs = field.groupElements || [];
      if (snap.checkedValue !== null && snap.checkedValue !== undefined) {
        const target = inputs.find((i) => i.value === snap.checkedValue);
        if (target && !target.checked) clickInput(target);
        return { status: target?.checked ? 'verified' : 'unverified', value: snap.checkedValue, reason: 'undo_radio' };
      }
      for (const i of inputs) {
        if (i.checked) {
          i.checked = false;
          i.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        }
      }
      return { status: inputs.every((i) => !i.checked) ? 'verified' : 'unverified', reason: 'undo_radio_clear' };
    }
    case 'checkbox_group': {
      const want = new Set(snap.checkedValues || []);
      for (const i of field.groupElements || []) {
        const should = want.has(i.value);
        if (i.checked !== should) clickInput(i);
      }
      const ok = (field.groupElements || []).every((i) => i.checked === want.has(i.value));
      return { status: ok ? 'verified' : 'unverified', reason: 'undo_checkbox_group' };
    }
    case 'checkbox':
    case 'radio': {
      const input = el as HTMLInputElement;
      const want = Boolean(snap.checked);
      if (input.checked !== want) {
        if (input.type === 'radio' && !want) {
          input.checked = false;
          input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } else {
          clickInput(input);
        }
      }
      return { status: input.checked === want ? 'verified' : 'unverified', reason: 'undo_checkbox' };
    }
    case 'combobox': {
      const input = el instanceof HTMLInputElement ? el : el.querySelector<HTMLInputElement>('input:not([type="hidden"])');
      if (input) setNativeValue(input, snap.value ?? '');
      const scope = field.trigger || el.parentElement || el;
      const clearBtn = scope.querySelector<HTMLElement>('[class*="clear-indicator"], [class*="clearIndicator"], [aria-label*="clear" i], [data-automation-id="clearButton"], .ant-select-clear, .select2-selection__clear');
      const displayedNow = readDisplayedValue(el, field.trigger);
      if (clearBtn && displayedNow && displayedNow !== (snap.displayed || '')) {
        pointerSequence(clearBtn);
      }
      keydown(input || el, 'Escape');
      const after = readDisplayedValue(el, field.trigger);
      const ok = normalizeOptionText(after) === normalizeOptionText(snap.displayed || '') || (!snap.displayed && !after);
      return { status: ok ? 'verified' : 'unverified', value: snap.displayed, displayed: after, reason: 'undo_combobox' };
    }
    case 'file':
      return { status: 'skipped', reason: 'undo_file_not_supported' };
    default: {
      const outcome = fillTextField(el, snap.value ?? '');
      return { ...outcome, reason: 'undo_text' };
    }
  }
}
