/**
 * One Odos run on one application, possibly spanning several pages.
 *
 *   start ─► resolve adapter + data + application record
 *     └─► loop:  fill page ─► decide ─┬─ advance: click Next, wait for the step to change ─┐
 *                    ▲                └─ stop: show panel with the reason                   │
 *                    └──────────────────────────────────────────────────────────────────────┘
 *
 * Stops (never submits): single-page ATS, review page, required fields unanswered, validation
 * errors, no safe Next button, page did not change, page limit, auto-advance off, cancelled.
 * When advancing may reload the page, the background is asked to resume this run on the next
 * load (RunContinuation), so server-rendered wizards keep the same application record.
 */

import { AtsAdapter, FormField } from '../adapters/types';
import { findMatchingAdapter } from '../adapters';
import { fillFieldWithValue } from '../autofillEngine';
import { ReviewPanelController, PageStatus } from '../ui/panel';
import { detectAts } from '../../detect';
import { detectPageCaptcha } from '../captcha';
import { FillOutcome, restoreField } from '../../core/filler';
import { resolveDictionaryHint } from '../../core/fieldSchema';
import { waitForSettle } from '../../core/dom';
import { buildDiagnostics, diagnosticsToText, logDiagnostics } from '../../core/diagnostics';
import { BUILD_ID } from '../../core/buildInfo';
import { Application, Job } from '../../core/models';
import { clickAdvanceButton, controlText, describeStop, isSafeToAdvance, NEXT_TEXT, StopReason, waitForPageChange } from '../../core/navigation';
import { isSubmitControl } from '../submitGuard';
import { fillCurrentPage, PageFillResult } from './pageFill';
import { collectManualEdits, hasAnswer, ManualEdit, snapshotAnswers } from './fieldValues';
import { attachLearningListeners } from './learning';
import {
  armContinuation,
  disarmContinuation,
  getApplicationRecord,
  getPageData,
  getResumeFile,
  logPrefilledApplication,
  logSubmission,
  PageData,
  ResumeFile,
  RunContinuation,
  saveAnswer,
  semanticMatch
} from './messaging';

const PAGE_CHANGE_TIMEOUT_MS = 15000;

export interface PageRecord {
  index: number;
  title: string;
  fill: PageFillResult;
}

export interface Decision {
  action: 'advance' | 'stop';
  reason?: StopReason;
  message: string;
  next?: HTMLElement;
}

function extensionVersion(): string {
  try {
    return chrome.runtime?.getManifest?.().version || '';
  } catch {
    return '';
  }
}

/**
 * Pure decision for the current page, given the navigator's view of it.
 */
export function decideNextStep(
  adapter: AtsAdapter,
  page: PageRecord,
  opts: { autoAdvance: boolean; pageLimitReached: boolean },
  doc: Document = document
): Decision {
  const nav = adapter.navigation;
  if (!nav.multiPage) return { action: 'stop', reason: 'single_page', message: describeStop('single_page') };
  if (nav.isFinalPage(doc)) return { action: 'stop', reason: 'review_page', message: describeStop('review_page') };
  if (!opts.autoAdvance) return { action: 'stop', reason: 'auto_advance_off', message: describeStop('auto_advance_off') };

  const unanswered = page.fill.fields.filter((f) => f.required && f.element.isConnected && !hasAnswer(f));
  if (unanswered.length > 0) return { action: 'stop', reason: 'needs_input', message: describeStop('needs_input', { required: unanswered.length }) };

  const errors = nav.validationErrors(doc);
  if (errors.length > 0) return { action: 'stop', reason: 'validation_errors', message: describeStop('validation_errors', { errors }) };

  const next = nav.findNextButton(doc);
  if (!next) return { action: 'stop', reason: 'no_next_button', message: describeStop('no_next_button') };
  if (!isSafeToAdvance(next)) {
    if (NEXT_TEXT.test(controlText(next)) && isSubmitControl(next)) {
      return { action: 'stop', reason: 'manual_next', message: describeStop('manual_next', { next: controlText(next) }), next };
    }
    return { action: 'stop', reason: 'no_next_button', message: describeStop('no_next_button') };
  }
  if (opts.pageLimitReached) return { action: 'stop', reason: 'page_limit', message: describeStop('page_limit') };
  return { action: 'advance', message: '', next };
}

export class ApplicationRun {
  private adapter!: AtsAdapter;
  private data!: PageData;
  private job!: Partial<Job>;
  private application!: Application;
  private isDuplicate = false;
  private resumeFile: ResumeFile | null = null;
  private pages: PageRecord[] = [];
  private panel: ReviewPanelController | null = null;
  private stopLearning: (() => void) | null = null;
  private submittedSoFar: Record<string, string> = {};
  private pageOffset = 0;
  private cancelled = false;
  private submissionRecorded = false;
  private running = false;
  private lastStop: Decision | null = null;

  get isRunning(): boolean {
    return this.running;
  }

  get currentPage(): PageRecord | undefined {
    return this.pages[this.pages.length - 1];
  }

  private get allFields(): FormField[] {
    return this.pages.flatMap((p) => p.fill.fields);
  }

  /** Starts a run (or resumes one carried across a page load). Returns a status line. */
  async start(continuation?: RunContinuation): Promise<string> {
    const url = new URL(window.location.href);
    const adapter = findMatchingAdapter(url, document);
    if (!adapter) throw new Error('No supported ATS form detected on this page.');
    this.adapter = adapter;
    this.data = await getPageData();

    const record = continuation ? await getApplicationRecord(continuation.applicationId, continuation.jobId) : null;
    if (record && continuation) {
      this.job = record.job;
      this.application = record.application;
      this.isDuplicate = true;
      this.pageOffset = continuation.pageIndex;
      this.submittedSoFar = { ...continuation.submittedSoFar };
    } else {
      const jobPartial = adapter.extractJob(document, url);
      const resumeId = this.data.defaultResume?.id;
      const logged = await logPrefilledApplication({
        company: jobPartial.company,
        title: jobPartial.title,
        url: jobPartial.url || window.location.href,
        descriptionText: jobPartial.descriptionText,
        resumeId
      });
      this.job = logged.job;
      this.application = logged.application;
      this.isDuplicate = logged.isDuplicate;
    }

    if (this.data.defaultResume?.id) this.resumeFile = await getResumeFile(this.data.defaultResume.id);

    this.observeConfirmation();
    return this.loop({ fillFirst: true });
  }

  /** Panel "Continue": the user fixed the current page; re-check it and move on. */
  async resume(): Promise<string> {
    if (this.running) return 'Already running.';
    this.cancelled = false;
    return this.loop({ fillFirst: false });
  }

  cancel(): void {
    this.cancelled = true;
    disarmContinuation();
  }

  private async loop(opts: { fillFirst: boolean }): Promise<string> {
    this.running = true;
    try {
      let fill = opts.fillFirst;
      for (;;) {
        if (this.cancelled) return this.stop({ action: 'stop', reason: 'cancelled', message: describeStop('cancelled') });

        if (fill || !this.currentPage) await this.fillPage();
        fill = true;

        const page = this.currentPage!;
        const pageLimitReached = this.pages.length >= this.data.settings.maxPagesPerRun;
        const decision = decideNextStep(this.adapter, page, { autoAdvance: this.data.settings.autoAdvancePages, pageLimitReached });

        if (decision.action === 'stop') {
          if (decision.reason === 'manual_next') this.armFor(page);
          return this.stop(decision);
        }

        const advanced = await this.advance(page, decision.next!);
        if (!advanced) {
          const errors = this.adapter.navigation.validationErrors(document);
          return this.stop(
            errors.length > 0
              ? { action: 'stop', reason: 'validation_errors', message: describeStop('validation_errors', { errors }) }
              : { action: 'stop', reason: 'did_not_advance', message: describeStop('did_not_advance') }
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async fillPage(): Promise<void> {
    this.stopLearning?.();
    const fill = await fillCurrentPage({
      adapter: this.adapter,
      profile: this.data.profile,
      answers: this.data.answers,
      // The resume is attached on whichever page first shows a resume input.
      resumeFile: this.resumeFile,
      semanticMatch: semanticMatch
    });
    if (fill.filledFields.some((f) => f.type === 'file')) this.resumeFile = null;
    const page: PageRecord = { index: this.pageOffset + this.pages.length + 1, title: this.adapter.navigation.pageTitle(document), fill };
    this.pages.push(page);
    logDiagnostics(buildDiagnostics({ fields: fill.fields, adapterId: this.adapter.id, url: window.location.href, version: extensionVersion() }));
  }

  private continuationFor(page: PageRecord): RunContinuation {
    return {
      applicationId: this.application.id,
      jobId: this.application.jobId,
      pageIndex: page.index,
      adapterId: this.adapter.id,
      submittedSoFar: { ...this.submittedSoFar, ...snapshotAnswers(page.fill.fields) }
    };
  }

  private armFor(page: PageRecord): void {
    armContinuation(this.continuationFor(page));
  }

  /** Clicks Next and waits for the step to change. A full page load ends this script; the armed
   *  continuation resumes the run on the new page. */
  private async advance(page: PageRecord, next: HTMLElement): Promise<boolean> {
    const nav = this.adapter.navigation;
    this.submittedSoFar = { ...this.submittedSoFar, ...snapshotAnswers(page.fill.fields) };
    const before = nav.pageSignature(document);
    this.armFor(page);
    this.panel?.setStatus({ pageNumber: page.index, title: page.title, message: `Saving "${page.title || 'this page'}" and moving to the next step…`, working: true });
    clickAdvanceButton(next);
    const changed = await waitForPageChange(nav, document, before, PAGE_CHANGE_TIMEOUT_MS);
    disarmContinuation();
    if (changed) await waitForSettle(document.body, 600, 8000);
    return changed;
  }

  private stop(decision: Decision): string {
    this.lastStop = decision;
    const page = this.currentPage;
    this.renderPanel(decision);
    const filled = this.pages.reduce((n, p) => n + p.fill.filledFields.length, 0);
    const toCheck = this.pages.reduce((n, p) => n + p.fill.unverifiedCount, 0);
    const pagesText = this.pages.length > 1 ? ` across ${this.pages.length} pages` : '';
    const check = toCheck > 0 ? ` (${toCheck} to check)` : '';
    return `Odos filled ${filled} fields${pagesText}${check}. ${decision.message}${page?.title ? ` [${page.title}]` : ''}`;
  }

  private renderPanel(decision: Decision): void {
    const page = this.currentPage;
    if (!page) return;
    const detection = detectAts(window.location.href, document);
    const captcha = this.adapter.detectCaptcha ? this.adapter.detectCaptcha(document) : detectPageCaptcha(document);
    const status: PageStatus = {
      pageNumber: page.index,
      title: page.title,
      message: decision.message,
      canContinue: ['needs_input', 'validation_errors', 'did_not_advance', 'page_limit'].includes(decision.reason || ''),
      working: false
    };

    this.panel?.destroy();
    this.panel = new ReviewPanelController({
      job: this.job,
      application: this.application,
      detection,
      atsName: this.adapter.name,
      filledFields: page.fill.filledFields,
      emptyFields: page.fill.emptyFields,
      captcha,
      isDuplicate: this.isDuplicate,
      pageStatus: this.adapter.navigation.multiPage ? status : undefined,
      onContinue: status.canContinue ? () => void this.resume() : undefined,
      onConfirmSubmitted: () => this.markSubmitted(false),
      onUndoPrefill: () => this.undoCurrentPage(),
      onFillField: (field, value, remember) => this.fillFromPanel(field, value, remember),
      getManualEdits: () => collectManualEdits(this.allFields, this.allSnapshots()),
      onSaveAnswers: async (edits: ManualEdit[]) => {
        for (const e of edits) await saveAnswer({ question: e.field.label, answer: e.value });
      },
      onClose: () => this.cancel(),
      getDiagnostics: () => diagnosticsToText(buildDiagnostics({ fields: this.allFields, adapterId: this.adapter.id, url: window.location.href, version: extensionVersion() })),
      buildId: BUILD_ID
    });
    this.panel.render();

    this.stopLearning = attachLearningListeners(
      [...page.fill.emptyFields, ...page.fill.filledFields.filter((f) => f.status === 'unverified')],
      (field, value) => this.panel?.proposeAnswer(field, value)
    );
  }

  private allSnapshots() {
    const merged = new Map<FormField, ReturnType<PageFillResult['snapshots']['get']> & object>();
    for (const p of this.pages) p.fill.snapshots.forEach((v, k) => merged.set(k, v));
    return merged;
  }

  private async fillFromPanel(field: FormField, value: string, remember: boolean): Promise<FillOutcome> {
    const outcome = await fillFieldWithValue(field, value, resolveDictionaryHint(field.canonical, undefined, field.label));
    field.status = outcome.status;
    field.statusReason = outcome.reason;
    if (outcome.status === 'verified' || outcome.status === 'unverified') {
      field.matchedValue = outcome.value;
      field.source = 'manual';
      field.suggestion = undefined;
    }
    if (remember && field.label) await saveAnswer({ question: field.label, answer: value, answerId: field.answerId });
    return outcome;
  }

  /** Undo reverses the step on screen; earlier steps were already saved by the ATS. */
  private async undoCurrentPage(): Promise<void> {
    const page = this.currentPage;
    if (!page) return;
    for (const f of page.fill.filledFields) {
      const snap = page.fill.snapshots.get(f);
      if (!snap) continue;
      try {
        await restoreField(f, snap);
        f.status = undefined;
        f.matchedValue = undefined;
      } catch (err) {
        console.warn('[Odos] Undo failed for field', f.label, err);
      }
    }
    this.panel?.destroy();
    this.panel = null;
  }

  markSubmitted(auto: boolean): void {
    if (this.submissionRecorded || !this.application) return;
    this.submissionRecorded = true;
    logSubmission({
      applicationId: this.application.id,
      submittedAnswers: { ...this.submittedSoFar, ...snapshotAnswers(this.currentPage?.fill.fields || []) },
      resumeId: this.data.defaultResume?.id
    });
    if (this.panel) {
      this.panel.showSubmittedNotice();
    } else if (auto) {
      // Panel closed but the application went through: keep hand-typed answers as drafts.
      const edits = collectManualEdits(this.allFields, this.allSnapshots());
      for (const e of edits) void saveAnswer({ question: e.field.label, answer: e.value, autoFill: false });
      if (edits.length > 0) console.log(`[Odos] Saved ${edits.length} hand-typed answer(s) as drafts.`);
    }
  }

  private observeConfirmation(): void {
    const check = () => {
      if (this.adapter.confirmationDetected(new URL(window.location.href), document)) {
        this.markSubmitted(true);
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', check);
    window.addEventListener('hashchange', check);
  }

  /** For tests and diagnostics. */
  get stopDecision(): Decision | null {
    return this.lastStop;
  }
}
