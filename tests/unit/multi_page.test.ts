import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isSafeToAdvance,
  clickAdvanceButton,
  createNavigator,
  SINGLE_PAGE_NAVIGATOR,
  waitForPageChange
} from '../../extension/src/core/navigation';
import { WorkdayAdapter } from '../../extension/src/content/adapters/workday';
import { GreenhouseAdapter } from '../../extension/src/content/adapters/greenhouse';
import { LeverAdapter } from '../../extension/src/content/adapters/lever';
import { AshbyAdapter } from '../../extension/src/content/adapters/ashby';
import { GenericAdapter } from '../../extension/src/content/adapters/generic';
import { ApplicationRun, decideNextStep, PageRecord } from '../../extension/src/content/run/applicationRun';
import { DEFAULT_PROFILE, ProfileSchema } from '../../extension/src/core/models';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../extension/src/core/settings';
import { FormField } from '../../extension/src/content/adapters/types';

const profile = ProfileSchema.parse({
  ...DEFAULT_PROFILE,
  contact: { ...DEFAULT_PROFILE.contact, firstName: 'Ada', lastName: 'Lovelace', fullName: 'Ada Lovelace', email: 'ada@example.com' },
  workAuthorization: { authorizedCountries: ['United States'], requiresSponsorship: false }
});

function page(fields: FormField[]): PageRecord {
  return { index: 1, title: '', fill: { fields, snapshots: new Map(), filledFields: [], emptyFields: [], fieldValuesSnapshot: {}, verifiedCount: 0, unverifiedCount: 0 } };
}

describe('Advance safety', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('only Next/Continue controls that are not form submits are clickable', () => {
    document.body.innerHTML = `
      <form>
        <button type="button" id="a">Save and Continue</button>
        <button type="button" id="b">Next</button>
        <button type="submit" id="c">Next</button>
        <button id="d">Continue</button>
        <button type="button" id="e">Submit</button>
        <button type="button" id="f">Review and Submit</button>
        <button type="button" id="g" disabled>Next</button>
      </form>`;
    const ok = (id: string) => isSafeToAdvance(document.getElementById(id)!);
    expect(ok('a')).toBe(true);
    expect(ok('b')).toBe(true);
    expect(ok('c')).toBe(false); // posts the form
    expect(ok('d')).toBe(false); // <button> without type in a form is a submit button
    expect(ok('e')).toBe(false);
    expect(ok('f')).toBe(false);
    expect(ok('g')).toBe(false);
  });

  it('clickAdvanceButton refuses unsafe controls and cancels any submission a click triggers', () => {
    document.body.innerHTML = `<form id="f"><button type="button" id="next">Next</button><button type="submit" id="sub">Submit</button></form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const submitted = vi.fn();
    form.addEventListener('submit', submitted);
    // A page script that submits the form from the Next handler must still not submit.
    document.getElementById('next')!.addEventListener('click', () => form.requestSubmit());
    clickAdvanceButton(document.getElementById('next')!);
    expect(submitted).not.toHaveBeenCalled();
    expect(() => clickAdvanceButton(document.getElementById('sub')!)).toThrow(/Refusing/);
  });
});

describe('Navigators per adapter', () => {
  it('Greenhouse, Lever and Ashby are single-page; Workday and Generic are multi-page', () => {
    expect(new GreenhouseAdapter().navigation).toBe(SINGLE_PAGE_NAVIGATOR);
    expect(new LeverAdapter().navigation).toBe(SINGLE_PAGE_NAVIGATOR);
    expect(new AshbyAdapter().navigation).toBe(SINGLE_PAGE_NAVIGATOR);
    expect(new WorkdayAdapter().navigation.multiPage).toBe(true);
    expect(new GenericAdapter().navigation.multiPage).toBe(true);
  });

  it('Workday: footer button advances; Review step and a Submit footer are final', () => {
    const nav = new WorkdayAdapter().navigation;
    document.body.innerHTML = `
      <ol><li data-automation-id="progressBarActiveStep">current step 2 of 6 My Experience</li></ol>
      <button type="button" data-automation-id="pageFooterNextButton">Save and Continue</button>`;
    expect(nav.findNextButton(document)?.textContent).toBe('Save and Continue');
    expect(nav.isFinalPage(document)).toBe(false);
    expect(nav.pageTitle(document)).toContain('My Experience');

    document.body.innerHTML = `
      <ol><li data-automation-id="progressBarActiveStep">current step 6 of 6 Review</li></ol>
      <button type="button" data-automation-id="pageFooterNextButton">Submit</button>`;
    expect(nav.isFinalPage(document)).toBe(true);
  });

  it('Generic: finds the last Next on the page, treats a lone Submit as final, reports errors', () => {
    const nav = createNavigator();
    document.body.innerHTML = `<a href="#">Next article</a><div role="alert">Phone is required</div><button type="button">Previous</button><button type="button">Continue</button>`;
    expect(nav.findNextButton(document)?.textContent).toBe('Continue');
    expect(nav.validationErrors(document)).toEqual(['Phone is required']);
    document.body.innerHTML = `<button type="submit">Submit application</button>`;
    expect(nav.findNextButton(document)).toBeNull();
    expect(nav.isFinalPage(document)).toBe(true);
  });

  it('waitForPageChange resolves when the step signature changes', async () => {
    const nav = createNavigator({ stepSelector: '#step' });
    document.body.innerHTML = '<div id="step">Step 1</div>';
    const before = nav.pageSignature(document);
    setTimeout(() => (document.getElementById('step')!.textContent = 'Step 2'), 200);
    expect(await waitForPageChange(nav, document, before, 2000, 50)).toBe(true);
    expect(await waitForPageChange(nav, document, nav.pageSignature(document), 300, 50)).toBe(false);
  });
});

describe('decideNextStep', () => {
  const wd = new WorkdayAdapter();
  const opts = { autoAdvance: true, pageLimitReached: false };

  it('single-page ATS stops with single_page', () => {
    document.body.innerHTML = '';
    expect(decideNextStep(new LeverAdapter(), page([]), opts).reason).toBe('single_page');
  });

  it('stops for unanswered required fields, then advances once they are answered', () => {
    document.body.innerHTML = `<input id="q" required /><button type="button" data-automation-id="pageFooterNextButton">Next</button>`;
    const el = document.getElementById('q') as HTMLInputElement;
    const field: FormField = { id: 'q', name: 'q', label: 'Q', type: 'text', element: el, required: true };
    expect(decideNextStep(wd, page([field]), opts).reason).toBe('needs_input');
    el.value = 'answered';
    expect(decideNextStep(wd, page([field]), opts).action).toBe('advance');
  });

  it('stops on validation errors, a submit-type Next, the page limit, and when auto-advance is off', () => {
    document.body.innerHTML = `<div data-automation-id="errorMessage">Error: Required</div><button type="button" data-automation-id="pageFooterNextButton">Next</button>`;
    expect(decideNextStep(wd, page([]), opts).reason).toBe('validation_errors');

    document.body.innerHTML = `<form><button type="submit">Next</button></form>`;
    expect(decideNextStep(new GenericAdapter(), page([]), opts).reason).toBe('manual_next');

    document.body.innerHTML = `<button type="button" data-automation-id="pageFooterNextButton">Next</button>`;
    expect(decideNextStep(wd, page([]), { autoAdvance: true, pageLimitReached: true }).reason).toBe('page_limit');
    expect(decideNextStep(wd, page([]), { autoAdvance: false, pageLimitReached: false }).reason).toBe('auto_advance_off');
  });

  it('settings normalize bad values to defaults', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ autoAdvancePages: false, maxPagesPerRun: 999 })).toEqual({ autoAdvancePages: false, maxPagesPerRun: DEFAULT_SETTINGS.maxPagesPerRun });
  });
});

/**
 * A three-step Workday-like wizard rendered in place (single-page app, no reloads):
 *   My Information -> Application Questions -> Review (footer reads Submit).
 */
function mountWizard(opts: { requireUnknown?: boolean } = {}) {
  const steps = [
    `<div data-automation-id="formField-legalNameSection_firstName"><label for="fn">First Name*</label><input id="fn" data-automation-id="legalNameSection_firstName" required /></div>
     <div data-automation-id="formField-legalNameSection_lastName"><label for="ln">Last Name*</label><input id="ln" data-automation-id="legalNameSection_lastName" required /></div>
     <div data-automation-id="formField-email"><label for="em">Email*</label><input id="em" type="email" data-automation-id="email" required /></div>`,
    `<div data-automation-id="formField-sponsor"><label for="sp">Will you now or in the future require visa sponsorship?*</label>
       <select id="sp" required><option value="">Select One</option><option value="y">Yes</option><option value="n">No</option></select></div>
     ${opts.requireUnknown ? `<div data-automation-id="formField-clearance"><label for="cl">Do you hold an active TS/SCI clearance?*</label><input id="cl" required /></div>` : ''}`,
    `<h2>Review</h2><p>Everything looks good.</p>`
  ];
  const titles = ['My Information', 'Application Questions', 'Review'];
  const state = { step: 0, submitted: false, nextClicks: 0 };
  const render = () => {
    const last = state.step === steps.length - 1;
    document.body.innerHTML = `
      <div data-automation-id="jobPostingHeader"><h2 data-automation-id="jobTitle">Software Engineer</h2></div>
      <ol><li data-automation-id="progressBarActiveStep">current step ${state.step + 1} of 3 ${titles[state.step]}</li></ol>
      <div data-automation-id="form-page">${steps[state.step]}</div>
      <button type="button" data-automation-id="pageFooterNextButton">${last ? 'Submit' : 'Save and Continue'}</button>`;
    document.querySelector('[data-automation-id="pageFooterNextButton"]')!.addEventListener('click', () => {
      if (last) {
        state.submitted = true;
        return;
      }
      state.nextClicks++;
      // Workday validates required fields before moving on.
      const missing = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[required]')).some((i) => !i.value);
      if (missing) return;
      setTimeout(() => {
        state.step++;
        render();
      }, 100);
    });
  };
  render();
  return state;
}

function mockBackground() {
  const sent: any[] = [];
  (chrome.runtime.sendMessage as any).mockImplementation(async (msg: any) => {
    sent.push(msg);
    switch (msg.type) {
      case 'GET_PAGE_DATA':
        return { success: true, data: { profile, answers: [], settings: DEFAULT_SETTINGS } };
      case 'LOG_PREFILLED_APPLICATION':
        return {
          success: true,
          data: {
            job: { id: 'job-1', company: 'Acme', title: 'Software Engineer', url: 'x', dedupeKey: 'k', firstSeenAt: '' },
            application: { id: 'app-1', jobId: 'job-1', status: 'prefilled', prefilledAt: '', submittedAnswers: {}, notes: '', events: [] },
            isDuplicate: false
          }
        };
      default:
        return { success: true, data: {} };
    }
  });
  return sent;
}

describe('ApplicationRun through a Workday-style wizard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('odos-review-panel-host')?.remove();
  });

  it('fills each step, advances, stops at Review, and never clicks Submit', async () => {
    const wizard = mountWizard();
    const sent = mockBackground();
    const run = new ApplicationRun();
    const status = await run.start();

    expect(wizard.submitted).toBe(false);
    expect(wizard.nextClicks).toBe(2);
    expect(run.stopDecision?.reason).toBe('review_page');
    expect(status).toMatch(/across 3 pages/);
    // Continuation armed before each advance and cleared once the step changed in place
    expect(sent.filter((m) => m.type === 'ARM_CONTINUATION').length).toBe(2);
    expect(sent.filter((m) => m.type === 'DISARM_CONTINUATION').length).toBeGreaterThanOrEqual(2);
    // One application record for the whole wizard
    expect(sent.filter((m) => m.type === 'LOG_PREFILLED_APPLICATION').length).toBe(1);
    run.cancel();
  }, 30000);

  it('stops on a step with an unanswerable required question, then Continue moves on', async () => {
    const wizard = mountWizard({ requireUnknown: true });
    mockBackground();
    const run = new ApplicationRun();
    await run.start();
    expect(run.stopDecision?.reason).toBe('needs_input');
    expect(wizard.step).toBe(1);
    expect((document.getElementById('sp') as HTMLSelectElement).value).toBe('n');

    // The user answers, then presses Continue in the panel.
    (document.getElementById('cl') as HTMLInputElement).value = 'No';
    await run.resume();
    expect(wizard.step).toBe(2);
    expect(run.stopDecision?.reason).toBe('review_page');
    expect(wizard.submitted).toBe(false);
    run.cancel();
  }, 30000);
});
