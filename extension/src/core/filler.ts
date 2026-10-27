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
import { isElementVisible, resolveIdRefs, startAddedNodeRecorder, waitForCondition } from './dom';
import { MatchResult, OptionCandidate, OptionResolution, normalizeOptionText, resolveOption } from './dropdownResolver';

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

/** Extra wait after the keyboard fallback (R15). */
export const COMBOBOX_RETRY_MS = 400;
/** Settle window for a widget to reflect a selection. */
export const SETTLE_MS = 150;

export const OPTION_SELECTOR = [
  '[role="option"]',
  '[data-automation-id="menuItem"]',
  '[data-automation-id="promptLeafNode"]',
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
//
// Root causes this driver is built around (verified against react-select's source and
// live-traced Workday automation):
//  1. Typing must NOT blur the search input. react-select's onInputBlur clears the input
//     and closes the menu; Workday's multi-select closes its list on blur. The old typing
//     path ended with blur(), so options vanished and the typed text stayed behind.
//  2. Workday catalogue prompts (School, Field of Study, Skills, Source) open a DEFAULT
//     browse list and search only on Enter. Rows of the default list are not answers:
//     clicking one selects nothing. Results arrive from the server, so reads poll until
//     the list answers the query and holds still.
//  3. Pill lists ([data-automation-id="selectedItemList"]) are role="listbox" and always
//     visible, so "any listbox on the page" picks the neighbouring field's chosen values.
//     The popup must be attributed: aria-controls, the one list that appeared after the
//     click, or a list inside the same field wrapper. Nothing wider.
//  4. Workday keeps a pick only once focus leaves the field, and an Escape sent with no
//     popup open cancels the answer that was just given.
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

/** How long a popup may take to open after the click. */
export const POPUP_OPEN_WAIT_MS = 800;
/** How long typed text may take to produce results (client-side filter or server search). */
export const TYPED_RESULTS_WAIT_MS = 1200;
/** How long an Enter-triggered server search may take to answer. */
export const ENTER_RESULTS_WAIT_MS = 2500;
/** How long the widget may take to reflect a click. */
export const SELECTION_VERIFY_MS = 1000;
/** A result list is "settled" when it has not changed for this long. */
export const LIST_SETTLE_MS = 400;

const POPUP_SELECTOR =
  '[role="listbox"], [role="menu"], [data-automation-id="promptOptions"], .select__menu, .select2-results, .ant-select-dropdown, .MuiPopover-paper, .MuiAutocomplete-popper, [data-radix-popper-content-wrapper], .choices__list--dropdown';

const PILL_LIST_SELECTOR = '[data-automation-id="selectedItemList"], [data-automation-id="selectedItem"]';
const FIELD_WRAPPER_SELECTOR = '[data-automation-id^="formField-"], .select__container, .select-shell, .field, .form-group, .ant-select, .MuiFormControl-root, .application-question';
const NON_OPTION_TEXT = /^(loading|loading\.\.\.|searching|searching\.\.\.|no options|no results|no matches( found)?|no items|type to search|start typing|select one)$/i;
const LOADING_SELECTOR = '.select__loading-indicator, .select__menu-notice--loading, [aria-busy="true"], [data-automation-id="loadingIndicator"]';

function cleanText(s: string | null | undefined): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function isPillListNode(el: Element): boolean {
  return Boolean(el.closest(PILL_LIST_SELECTOR));
}

function hasLayout(el: Element): boolean {
  // jsdom has no layout; treat as laid out unless hidden by attributes/styles.
  return isElementVisible(el);
}

/** An option row's own label (Workday puts it on data-automation-label; charms pollute textContent). */
export function optionLabelText(el: Element): string {
  const node = el.matches('[data-automation-id="promptOption"]') ? el : el.querySelector('[data-automation-id="promptOption"]');
  const label = node?.getAttribute('data-automation-label');
  if (label) return cleanText(label);
  const aria = el.getAttribute('aria-label');
  if (aria && !el.textContent?.trim()) return cleanText(aria);
  return cleanText(el.textContent);
}

/**
 * Real, selectable option rows inside a popup: deduped to the outermost row (Workday nests
 * promptOption inside menuItem[role=option]), visible, not placeholders or notices, and
 * never pills of an already-chosen value.
 */
export function collectOptions(root: ParentNode): HTMLElement[] {
  const rows = new Set<HTMLElement>();
  const els = Array.from(root.querySelectorAll<HTMLElement>(OPTION_SELECTOR));
  if (root instanceof Element && root.matches(OPTION_SELECTOR)) els.unshift(root as HTMLElement);
  for (const el of els) {
    if (isPillListNode(el)) continue;
    if (!hasLayout(el)) continue;
    const row = (el.closest('[role="option"], [data-automation-id="menuItem"]') as HTMLElement | null) || el;
    const text = optionLabelText(row);
    if (!text || NON_OPTION_TEXT.test(text)) continue;
    if (row.getAttribute('aria-disabled') === 'true') continue;
    rows.add(row);
  }
  return Array.from(rows);
}

function isLoading(root: ParentNode): boolean {
  if (root.querySelector(LOADING_SELECTOR)) return true;
  const notice = Array.from(root.querySelectorAll<HTMLElement>('[role="option"], .select__menu-notice, [data-automation-id="promptOption"], li, p, div'))
    .slice(0, 20)
    .some((n) => n.children.length === 0 && /^(loading|searching)/i.test(cleanText(n.textContent)));
  return notice;
}

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

const DISPLAY_VALUE_SELECTOR =
  '.select__single-value, [class*="single-value"], [class*="singleValue"], .select2-selection__rendered, .ant-select-selection-item, [data-automation-id="selectedItem"], [data-automation-id="selectedItemLabel"], .MuiSelect-select, [class*="selected-value"], [class*="selectedValue"]';

function findDisplayElement(control: HTMLElement, trigger?: HTMLElement | null): HTMLElement | null {
  const scope = trigger && trigger !== control ? trigger : control.parentElement || control;
  const display = scope.querySelector(DISPLAY_VALUE_SELECTOR) as HTMLElement | null;
  return display && display !== control ? display : null;
}

function fieldWrapperOf(el: Element): Element | null {
  return el.closest(FIELD_WRAPPER_SELECTOR);
}

/** Texts of selected pills inside the field wrapper (Workday multi-select). */
function pillTexts(control: HTMLElement, trigger?: HTMLElement | null): string[] {
  const wrap = fieldWrapperOf(trigger || control) || (trigger || control).parentElement;
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll<HTMLElement>('[data-automation-id="selectedItem"], .select__multi-value__label, .ant-select-selection-item'))
    .map((p) => optionLabelText(p))
    .filter(Boolean);
}

function mouseLike(type: string, el: Element): Event {
  let x = 0;
  let y = 0;
  try {
    const r = el.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  } catch {}
  const init: PointerEventInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: type.endsWith('down') ? 1 : 0, pointerId: 1, pointerType: 'mouse' } as PointerEventInit;
  if (type.startsWith('pointer') && typeof PointerEvent === 'function') return new PointerEvent(type, init);
  return new MouseEvent(type, init);
}

/** A full pointer sequence at the element's centre, the way a user clicks. */
export function pointerClick(el: Element): void {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    el.dispatchEvent(mouseLike(type, el));
  }
  (el as HTMLElement).click();
}

function keydown(el: Element, key: string, code = key): void {
  const keyCode = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === 'ArrowDown' ? 40 : key === 'Tab' ? 9 : 0;
  const init: KeyboardEventInit = { bubbles: true, cancelable: true, key, code, keyCode, which: keyCode } as KeyboardEventInit;
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  if (key === 'Enter') el.dispatchEvent(new KeyboardEvent('keypress', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
}

/**
 * Types a search query into a combobox input WITHOUT blurring or firing change: focus,
 * prototype setter, beforeinput/input. This is the whole difference between a menu that
 * shows results and one that closes with the text left behind.
 */
export function typeIntoSearchInput(input: HTMLInputElement, text: string): void {
  assertNotSubmitControl(input, 'typeIntoSearchInput');
  try {
    input.focus();
  } catch {}
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor && descriptor.set) descriptor.set.call(input, text);
  else input.value = text;
  try {
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
  } catch {
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }
}

function visiblePopups(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(POPUP_SELECTOR)).filter((p) => hasLayout(p) && !isPillListNode(p));
}

/**
 * Attributes a popup to the control that opened it (eng review R10, tightened):
 *  1. aria-controls / aria-owns / aria-activedescendant's list (authoritative when set)
 *  2. exactly one popup (or option-bearing node) that appeared since the open click
 *  3. the classifier's optionSource
 *  4. a popup inside the same field wrapper
 *  5. the single visible popup on the page, only when there is exactly one
 * Never "any listbox": pill lists and neighbouring fields are always on screen.
 */
export function findOwnedPopup(
  control: HTMLElement,
  trigger: HTMLElement | null | undefined,
  before: Set<Element>,
  recorder: { peek(): Element[] },
  optionSource: Element | null | undefined,
  doc: Document
): Element | null {
  for (const node of [control, trigger].filter(Boolean) as Element[]) {
    const refs = [...resolveIdRefs(node, 'aria-controls', doc), ...resolveIdRefs(node, 'aria-owns', doc)];
    const active = resolveIdRefs(node, 'aria-activedescendant', doc)[0];
    if (active?.parentElement) refs.push(active.closest(POPUP_SELECTOR) || active.parentElement);
    for (const r of refs) {
      if (r !== control && r !== trigger && hasLayout(r) && !isPillListNode(r)) return r;
    }
  }

  const appeared = visiblePopups(doc).filter((p) => !before.has(p));
  if (appeared.length === 1) return appeared[0];
  if (appeared.length > 1) {
    // Prefer the one holding options; if still ambiguous, the first that appeared.
    const withOptions = appeared.filter((p) => collectOptions(p).length > 0);
    if (withOptions.length >= 1) return withOptions[0];
  }

  const added = recorder.peek().filter((n) => n.isConnected && !isPillListNode(n));
  const addedRoots = added.filter((n) => n.matches(POPUP_SELECTOR) || n.querySelector(POPUP_SELECTOR) || n.matches(OPTION_SELECTOR) || n.querySelector(OPTION_SELECTOR));
  const outer = addedRoots.filter((r) => !addedRoots.some((o) => o !== r && o.contains(r)));
  if (outer.length >= 1) {
    const popup = outer[0].matches(POPUP_SELECTOR) ? outer[0] : outer[0].querySelector(POPUP_SELECTOR) || outer[0];
    return popup;
  }

  if (optionSource && optionSource.isConnected && hasLayout(optionSource) && !isPillListNode(optionSource)) return optionSource;

  const wrap = fieldWrapperOf(trigger || control);
  if (wrap) {
    for (const scope of [wrap, wrap.parentElement].filter(Boolean) as Element[]) {
      const own = Array.from(scope.querySelectorAll(POPUP_SELECTOR)).filter((p) => hasLayout(p) && !isPillListNode(p));
      if (own.length > 0) return own[0];
    }
  }

  const all = visiblePopups(doc).filter((p) => collectOptions(p).length > 0);
  if (all.length === 1) return all[0];
  return null;
}

function queryWords(query: string): string[] {
  const all = normalizeOptionText(query).split(' ').filter(Boolean);
  const long = all.filter((w) => w.length >= 3 && !/^(and|the|for|of)$/.test(w));
  return long.length ? long : all;
}

/** Do these rows answer the query (vs. a default browse list)? */
function answersQuery(texts: string[], query: string, baseline: string | null): boolean {
  if (texts.length === 0) return false;
  if (baseline !== null && texts.join('\n') !== baseline) return true;
  const words = queryWords(query);
  if (words.length === 0) return false;
  // A row is relevant when it carries at least half of the query's words. Requiring only one
  // word let a default browse list of universities pass as results for "University of X".
  const needed = Math.ceil(words.length / 2);
  const relevant = texts.filter((t) => {
    const norm = normalizeOptionText(t);
    return words.filter((w) => norm.includes(w)).length >= needed;
  }).length;
  return relevant / texts.length >= 0.5;
}

interface ReadResult {
  popup: Element | null;
  options: HTMLElement[];
  texts: string[];
  resolution: OptionResolution | null;
  answered: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Polls the owned popup until it shows a floor-clearing match, or its rows answer the query
 * and hold still, or the deadline passes.
 */
async function readOptions(
  ctx: {
    control: HTMLElement;
    trigger: HTMLElement | null;
    before: Set<Element>;
    recorder: { peek(): Element[] };
    optionSource: Element | null | undefined;
    doc: Document;
    desired: string;
    hint?: string;
    typed: boolean;
    baseline: string | null;
  },
  deadlineMs: number
): Promise<ReadResult> {
  const deadline = Date.now() + deadlineMs;
  let last: string | null = null;
  let steadySince = Date.now();
  let lastResult: ReadResult = { popup: null, options: [], texts: [], resolution: null, answered: false };
  for (;;) {
    const popup = findOwnedPopup(ctx.control, ctx.trigger, ctx.before, ctx.recorder, ctx.optionSource, ctx.doc);
    const loading = popup ? isLoading(popup) : false;
    const options = popup && !loading ? collectOptions(popup) : [];
    const texts = options.map(optionLabelText);
    const searched = !ctx.typed || answersQuery(texts, ctx.desired, ctx.baseline);
    const candidates: OptionCandidate[] = options.map((opt, idx) => ({
      text: texts[idx],
      value: opt.getAttribute('data-value') || opt.getAttribute('value') || opt.getAttribute('data-automation-label') || '',
      index: idx,
      element: opt
    }));
    const resolution = candidates.length > 0 ? resolveOption(candidates, ctx.desired, ctx.hint) : null;
    lastResult = { popup, options, texts, resolution, answered: searched && options.length > 0 };
    if (searched && resolution?.selected) return lastResult;

    const key = texts.join('\n');
    if (key !== last) {
      last = key;
      steadySince = Date.now();
    }
    const settled = searched && options.length > 0 && Date.now() - steadySince >= LIST_SETTLE_MS;
    if (settled || Date.now() >= deadline) return lastResult;
    await sleep(100);
  }
}

function isSelectionReflected(
  control: HTMLElement,
  trigger: HTMLElement | null | undefined,
  option: HTMLElement,
  optionText: string,
  pre: { displayed: string; ariaSelected: string | null; typed: string; pills: string[] }
): boolean {
  const normOpt = normalizeOptionText(optionText);

  // Workday multi-select: a new pill carrying the option text
  const pillsNow = pillTexts(control, trigger);
  if (pillsNow.length > pre.pills.length && pillsNow.some((p) => normalizeOptionText(p) === normOpt || normalizeOptionText(p).includes(normOpt))) {
    return true;
  }

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
  if (option.isConnected && option.getAttribute('aria-selected') === 'true' && pre.ariaSelected !== 'true' && option.getAttribute('data-automation-checked') !== null) {
    return true;
  }
  if (option.isConnected && option.getAttribute('data-automation-checked') === 'Checked') return true;
  const scope = trigger && trigger !== control ? trigger : control.parentElement;
  const hidden = scope?.querySelector<HTMLInputElement>('input[type="hidden"]');
  if (hidden && hidden.value && normalizeOptionText(hidden.value) === normalizeOptionText(option.getAttribute('data-value') || option.getAttribute('value') || optionText)) {
    return true;
  }
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

/** Close an open popup the way a person would; never send Escape when nothing is open. */
async function closePopupIfOpen(doc: Document, focusTarget: Element | null): Promise<void> {
  if (visiblePopups(doc).length === 0) return;
  if (focusTarget) keydown(focusTarget, 'Escape');
  keydown(doc.body, 'Escape');
  await sleep(120);
  if (visiblePopups(doc).length === 0) return;
  pointerClick(doc.body);
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
    typed: '',
    pills: pillTexts(element, trigger)
  };

  // Idempotent: already showing the wanted value.
  if (pre.displayed && normalizeOptionText(pre.displayed) === normalizeOptionText(desired)) {
    return { status: 'verified', value: desired, displayed: pre.displayed, reason: 'already_selected' };
  }

  const before = new Set(visiblePopups(doc));
  const recorder = startAddedNodeRecorder(doc);
  const ctxBase = { control: element, trigger, before, recorder, optionSource: opts.optionSource, doc, desired, hint: hintCategory };

  const clearTypedQuery = () => {
    if (searchInput && pre.typed && searchInput.value === pre.typed) {
      typeIntoSearchInput(searchInput, pre.search);
    }
  };

  try {
    try {
      (trigger || element).scrollIntoView?.({ block: 'center' });
    } catch {}

    // 1. Open: pointer sequence on the trigger (react-select opens on control mousedown once
    //    the input is focused), then focus the search input.
    pointerClick(trigger || element);
    if (searchInput) {
      try {
        searchInput.focus();
      } catch {}
      // Click the search box itself as a person would: Workday opens its browse list on that
      // click, and react-select ignores a mousedown on its own input while the menu is open.
      if (searchInput !== (trigger || element)) pointerClick(searchInput);
      if (!trigger) searchInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    }

    let read: ReadResult;
    let how = 'open';

    if (searchInput && desired) {
      // 2. Type without blurring. Results may be a client-side filter (instant) or a server
      //    search (hundreds of ms). Rows are believed once they answer the query.
      typeIntoSearchInput(searchInput, desired);
      pre.typed = desired;
      how = 'typed';
      read = await readOptions({ ...ctxBase, typed: true, baseline: null }, TYPED_RESULTS_WAIT_MS);

      // 3. Typing did not search (Workday catalogue prompts): press Enter and read again,
      //    believing the list once it differs from what was showing when Enter was pressed.
      if (!read.resolution?.selected && !read.answered) {
        const baseline = read.texts.join('\n');
        keydown(searchInput, 'Enter');
        how = 'enter';
        read = await readOptions({ ...ctxBase, typed: true, baseline }, ENTER_RESULTS_WAIT_MS);
      }
    } else {
      read = await readOptions({ ...ctxBase, typed: false, baseline: null }, POPUP_OPEN_WAIT_MS);
    }

    // Enter may have committed a highlighted row outright (Workday). Accept only if it is ours.
    if (!read.resolution?.selected && pre.typed) {
      const pillsNow = pillTexts(element, trigger);
      const committed = pillsNow.filter((p) => !pre.pills.includes(p));
      if (committed.length === 1 && normalizeOptionText(committed[0]).includes(normalizeOptionText(desired))) {
        clearTypedQuery();
        await closePopupIfOpen(doc, searchInput || element);
        return { status: 'verified', value: committed[0], displayed: committed[0], reason: `enter_committed:${how}` };
      }
    }

    const selected = read.resolution?.selected;
    if (!selected || !selected.candidate.element) {
      // Creatable / "+ Add" fallback inside the owned popup only
      const addBtn = read.popup ? (read.popup as ParentNode).querySelector<HTMLElement>(CREATE_BUTTON_SELECTOR) : doc.querySelector<HTMLElement>(CREATE_BUTTON_SELECTOR);
      if (addBtn && hasLayout(addBtn)) {
        assertNotSubmitControl(addBtn, 'fillCombobox:addOptionBtn');
        pointerClick(addBtn);
        const changed = await waitForCondition(() => readDisplayedValue(element, trigger) !== pre.displayed || pillTexts(element, trigger).length > pre.pills.length, SELECTION_VERIFY_MS, 50);
        return { status: changed ? 'verified' : 'unverified', value: desired, displayed: readDisplayedValue(element, trigger), reason: 'creatable_option' };
      }
      clearTypedQuery();
      await closePopupIfOpen(doc, searchInput || element);
      const reason = read.options.length === 0 ? (read.popup ? 'no_results' : 'popup_not_found') : 'no_option_match';
      return { status: 'failed', value: desired, reason: `${reason}:${how}`, suggestion: suggestionFrom(read.resolution?.suggestion) };
    }

    const option = selected.candidate.element;
    const optionText = cleanText(selected.candidate.text);
    pre.ariaSelected = option.getAttribute('aria-selected');

    // 4. Click the row (full pointer sequence; refuse detached rows, React throws on them).
    if (!option.isConnected) {
      clearTypedQuery();
      await closePopupIfOpen(doc, searchInput || element);
      return { status: 'failed', value: desired, reason: 'option_list_changed' };
    }
    pointerClick(option);

    let ok = await waitForCondition(() => isSelectionReflected(element, trigger, option, optionText, pre), SELECTION_VERIFY_MS, 50);

    // 5. Keyboard fallback: ArrowDown to the option, then Enter (react-select selects the focused option on Enter).
    if (!ok && option.isConnected) {
      const target = searchInput || element;
      try {
        target.focus();
      } catch {}
      const idx = read.options.indexOf(option);
      const steps = Math.min((idx >= 0 ? idx : 0) + 1, 50);
      for (let i = 0; i < steps; i++) keydown(target, 'ArrowDown');
      keydown(target, 'Enter');
      ok = await waitForCondition(() => isSelectionReflected(element, trigger, option, optionText, pre), COMBOBOX_RETRY_MS, 50);
    }

    if (ok) {
      const displayEl = findDisplayElement(element, trigger);
      if (searchInput && displayEl && displayEl !== searchInput && searchInput.value === pre.typed && pre.typed) {
        typeIntoSearchInput(searchInput, pre.search);
      }
      // Workday keeps the pick only once focus leaves the field.
      await closePopupIfOpen(doc, searchInput || element);
      const active = doc.activeElement as HTMLElement | null;
      if (active && (active === element || active === trigger || active === searchInput)) {
        try {
          active.blur();
        } catch {}
      }
      return { status: 'verified', value: optionText, displayed: readDisplayedValue(element, trigger) || pillTexts(element, trigger).slice(-1)[0], reason: `option_selected:${how}`, match: selected };
    }

    // 6. Could not confirm: leave no typed text behind, close the popup, report unverified.
    clearTypedQuery();
    await closePopupIfOpen(doc, searchInput || element);
    return { status: 'unverified', value: optionText, displayed: readDisplayedValue(element, trigger), reason: `selection_not_confirmed:${how}`, match: selected };
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
      if (input && input.value !== (snap.value ?? '')) typeIntoSearchInput(input, snap.value ?? '');
      const scope = field.trigger || el.parentElement || el;
      const clearBtn = scope.querySelector<HTMLElement>('[class*="clear-indicator"], [class*="clearIndicator"], [aria-label*="clear" i], [data-automation-id="clearButton"], .ant-select-clear, .select2-selection__clear, [data-automation-id="DELETE_charm"]');
      const displayedNow = readDisplayedValue(el, field.trigger);
      if (clearBtn && displayedNow && displayedNow !== (snap.displayed || '')) {
        pointerClick(clearBtn);
      }
      await closePopupIfOpen(el.ownerDocument || document, input || el);
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
