/**
 * Multi-page application navigation.
 *
 * Every adapter declares a PageNavigator. The run loop (content/applicationRun.ts) fills a page,
 * asks the navigator whether this is the review page, finds the button that advances to the next
 * step, clicks it only when that is safe, and waits for the page to change.
 *
 * Safety (Invariant 1, Odos never submits): a button is clicked only when its text says "next /
 * continue", it does not read like submit/apply/finish, and it is not a form-submit control. A
 * "Next" that is a real <button type="submit"> (server-rendered wizards post each step) is left
 * for the user to click; the background then resumes Odos on the page that loads.
 */

import { isSubmitControl } from '../content/submitGuard';
import { isElementVisible } from './dom';

export type StopReason =
  | 'single_page'
  | 'review_page'
  | 'needs_input'
  | 'validation_errors'
  | 'no_next_button'
  | 'manual_next'
  | 'did_not_advance'
  | 'page_limit'
  | 'auto_advance_off'
  | 'cancelled'
  | 'already_applied';

export interface PageNavigator {
  /** False for ATSs whose application is a single page. */
  readonly multiPage: boolean;
  /** The control that advances to the next step, or null. */
  findNextButton(doc: Document): HTMLElement | null;
  /** True on the review / submit step, where Odos must stop. */
  isFinalPage(doc: Document): boolean;
  /** Changes whenever the visible step changes. */
  pageSignature(doc: Document): string;
  /** Human-readable step name for the panel ("My Experience"). */
  pageTitle(doc: Document): string;
  /** Visible validation errors on the current step. */
  validationErrors(doc: Document): string[];
}

export const NEXT_TEXT = /^(next|next step|next page|continue|save (and|&) continue|save (and|&) next|proceed|continue to next step|go to next step)\b/i;
export const FINAL_TEXT = /\b(submit|send application|apply now|finish|complete application|review and submit|confirm and submit)\b/i;

const BUTTON_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"], a[href]';
const ERROR_SELECTOR = '[role="alert"], [aria-live="assertive"], .error, .errors, .field-error, [class*="error-message"], [class*="errorMessage"]';
const HEADING_SELECTOR = 'h1, h2, [role="heading"][aria-level="1"], [role="heading"][aria-level="2"]';

export function controlText(el: Element): string {
  const value = el instanceof HTMLInputElement ? el.value : '';
  return (value || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
}

/** Whether Odos may click this control to advance (see module comment). */
export function isSafeToAdvance(btn: Element): boolean {
  const text = controlText(btn);
  if (!NEXT_TEXT.test(text) || FINAL_TEXT.test(text)) return false;
  if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true') return false;
  return !isSubmitControl(btn);
}

function visibleButtons(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(BUTTON_SELECTOR)).filter((b) => isElementVisible(b, { computed: false }));
}

export const SINGLE_PAGE_NAVIGATOR: PageNavigator = {
  multiPage: false,
  findNextButton: () => null,
  isFinalPage: () => true,
  pageSignature: (doc) => doc.location?.href || '',
  pageTitle: () => '',
  validationErrors: () => []
};

export interface GenericNavigatorOptions {
  nextSelector?: string;
  stepSelector?: string;
  errorSelector?: string;
  finalStep?: RegExp;
}

/**
 * Text-driven navigator for multi-step forms on any site. Site navigators pass selectors that
 * are more reliable than text where the ATS has stable ones.
 */
export function createNavigator(options: GenericNavigatorOptions = {}): PageNavigator {
  const findNext = (doc: Document): HTMLElement | null => {
    if (options.nextSelector) {
      const specific = Array.from(doc.querySelectorAll<HTMLElement>(options.nextSelector)).filter((b) => isElementVisible(b, { computed: false }));
      if (specific.length > 0) return specific[specific.length - 1];
    }
    // The footer button is usually last in document order.
    const candidates = visibleButtons(doc).filter((b) => NEXT_TEXT.test(controlText(b)) && !FINAL_TEXT.test(controlText(b)));
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  };

  const stepText = (doc: Document): string => {
    if (!options.stepSelector) return '';
    return (doc.querySelector(options.stepSelector)?.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const heading = (doc: Document): string => {
    const h = Array.from(doc.querySelectorAll(HEADING_SELECTOR)).find((e) => isElementVisible(e, { computed: false }) && (e.textContent || '').trim());
    return (h?.textContent || '').replace(/\s+/g, ' ').trim();
  };

  return {
    multiPage: true,
    findNextButton: findNext,
    isFinalPage(doc) {
      const step = stepText(doc);
      if (options.finalStep && options.finalStep.test(step)) return true;
      const next = findNext(doc);
      if (next && FINAL_TEXT.test(controlText(next))) return true;
      if (next) return false;
      // No way forward: final when a submit-like control is showing.
      return visibleButtons(doc).some((b) => FINAL_TEXT.test(controlText(b)));
    },
    pageSignature(doc) {
      const loc = doc.location ? `${doc.location.pathname}${doc.location.hash}` : '';
      const controls = doc.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
      return [loc, stepText(doc), heading(doc), controls].join('|');
    },
    pageTitle(doc) {
      return stepText(doc) || heading(doc);
    },
    validationErrors(doc) {
      const sel = options.errorSelector ? `${options.errorSelector}, ${ERROR_SELECTOR}` : ERROR_SELECTOR;
      return Array.from(doc.querySelectorAll(sel))
        .filter((e) => isElementVisible(e, { computed: false }))
        .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 0 && t.length < 300)
        .slice(0, 10);
    }
  };
}

/**
 * Waits until the navigator reports a different page signature, or `timeoutMs` passes.
 * Resolves true when the page changed.
 */
export function waitForPageChange(nav: PageNavigator, doc: Document, before: string, timeoutMs = 15000, intervalMs = 150): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (nav.pageSignature(doc) !== before) return resolve(true);
      if (Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(tick, intervalMs);
    };
    setTimeout(tick, intervalMs);
  });
}

/**
 * Clicks an advance button. Callers check isSafeToAdvance first; as a second guarantee, any form
 * submission the click could trigger is cancelled while it is dispatched.
 */
export function clickAdvanceButton(btn: HTMLElement): void {
  if (!isSafeToAdvance(btn)) throw new Error(`[Odos] Refusing to click "${controlText(btn)}": not a safe Next/Continue control.`);
  const form = btn.closest('form');
  const block = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  form?.addEventListener('submit', block, true);
  try {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: 0 }));
    }
    btn.click();
  } finally {
    setTimeout(() => form?.removeEventListener('submit', block, true), 0);
  }
}

/** Panel copy for each stop reason. */
export function describeStop(reason: StopReason, detail: { required?: number; errors?: string[]; next?: string } = {}): string {
  switch (reason) {
    case 'single_page':
      return 'Review your answers and submit when ready.';
    case 'review_page':
      return 'Reached the review page. Check everything and submit yourself.';
    case 'needs_input':
      return `${detail.required ?? 0} required field(s) on this page need your answer. Fill them, then press Continue.`;
    case 'validation_errors':
      return `The page shows errors${detail.errors?.length ? `: ${detail.errors.slice(0, 2).join(' · ')}` : ''}. Fix them, then press Continue.`;
    case 'no_next_button':
      return 'No Next button found. Continue manually; run Odos again on the next page.';
    case 'manual_next':
      return `Click "${detail.next || 'Next'}" yourself. Odos will fill the next page when it loads.`;
    case 'did_not_advance':
      return 'Next was clicked but the page did not change. Check the form for errors, then press Continue.';
    case 'page_limit':
      return 'Stopped after the maximum number of pages for one run. Press Continue to keep going.';
    case 'auto_advance_off':
      return 'Automatic page advance is off (Dashboard → Settings). Click Next yourself and run Odos again.';
    case 'cancelled':
      return 'Stopped.';
    case 'already_applied':
      return 'Duplicate application protected. You have already applied to this role.';
  }
}
