import { FormField } from '../adapters/types';
import { Job, Application } from '../../core/models';
import { CaptchaDetection } from '../captcha';
import { DetectionResult } from '../../detect';
import { FillOutcome } from '../../core/filler';
import { PANEL_CSS } from './panel.styles';
import type { ManualEdit } from '../run/fieldValues';

export type { ManualEdit };

/** Where a multi-page run stands, shown above the field list. */
export interface PageStatus {
  pageNumber: number;
  title: string;
  message: string;
  /** Show "Continue" (resume after the user fixed this page). */
  canContinue?: boolean;
  /** Advancing right now. */
  working?: boolean;
}

export interface ReviewPanelOptions {
  job: Partial<Job>;
  application?: Application;
  detection?: DetectionResult;
  atsName?: string;
  filledFields: FormField[];
  emptyFields: FormField[];
  failedFields?: FormField[];
  captcha?: CaptchaDetection;
  initialSnapshot?: Record<string, string>;
  isDuplicate?: boolean;
  alreadyApplied?: boolean;
  priorAudit?: {
    appliedAt: string;
    url?: string;
    company?: string;
    title?: string;
  };
  onOverrideProtection?: () => void;
  onConfirmSubmitted: () => void;
  onUndoPrefill?: () => void | Promise<void>;
  /** Fills a field from the panel (same filler as autofill); `remember` stores the answer. */
  onFillField?: (field: FormField, value: string, remember: boolean) => Promise<FillOutcome>;
  /** Fields the user filled by hand since discovery (offered for saving on submit). */
  getManualEdits?: () => ManualEdit[];
  onSaveAnswers?: (edits: ManualEdit[]) => Promise<void>;
  /** Returns the run diagnostics as text for the "Copy diagnostics" action. */
  getDiagnostics?: () => string;
  /** Build identifier shown in the header so a stale extension load is obvious. */
  buildId?: string;
  /** Multi-page run status. */
  pageStatus?: PageStatus;
  /** Resume a multi-page run after the user fixed the current page. */
  onContinue?: () => void;
  /** The user dismissed the panel (also cancels a run in progress). */
  onClose?: () => void;
}

function escapeHtml(text: string | undefined | null): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ReviewPanelController {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private options: ReviewPanelOptions;
  private isExpanded: boolean = true;
  private activeTab: 'all' | 'needs_review' | 'filled' = 'all';
  private searchQuery: string = '';
  private proposals: Array<{ field: FormField; value: string; state: 'pending' | 'saved' | 'dismissed' }> = [];

  constructor(options: ReviewPanelOptions) {
    this.options = options;
  }

  render(): void {
    // Remove existing panel if present
    const existing = document.getElementById('odos-review-panel-host');
    if (existing) existing.remove();

    this.host = document.createElement('div');
    this.host.id = 'odos-review-panel-host';
    this.host.style.position = 'fixed';
    this.host.style.bottom = '20px';
    this.host.style.right = '20px';
    this.host.style.zIndex = '2147483647';
    this.host.style.pointerEvents = 'none';
    this.host.style.maxHeight = 'calc(100vh - 40px)';
    this.host.style.display = 'flex';
    this.host.style.flexDirection = 'column';
    this.host.style.justifyContent = 'flex-end';

    // Closed Shadow DOM isolation to prevent host page CSS interference
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    this.updateUI();
    document.body.appendChild(this.host);
  }

  private updateUI(): void {
    if (!this.shadow) return;

    const {
      job,
      atsName,
      detection,
      filledFields,
      emptyFields,
      failedFields = [],
      captcha,
      isDuplicate,
      alreadyApplied,
      priorAudit
    } = this.options;

    const appliedDateStr = priorAudit?.appliedAt
      ? new Date(priorAudit.appliedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      : '';

    const totalFields = filledFields.length + emptyFields.length + failedFields.length;
    const unverifiedCount = filledFields.filter((f) => f.status === 'unverified').length;
    const atsLabel = atsName || (detection?.ats ? detection.ats.toUpperCase() : 'ATS');
    const confidenceText = detection ? `${Math.round(detection.confidence * 100)}% match` : '';
    const companyName = job.company || 'Job Application';

    // Filter fields according to tab
    const showEmpty = this.activeTab === 'all' || this.activeTab === 'needs_review';
    const showFilled = this.activeTab === 'all' || this.activeTab === 'filled';

    const hasAnyFieldsToShow = (showEmpty && emptyFields.length > 0) || (showFilled && filledFields.length > 0);

    this.shadow.innerHTML = `
      <style>${PANEL_CSS}</style>

      ${
        !this.isExpanded
          ? `
        <div class="odos-panel odos-panel-collapsed">
          <div class="odos-header" id="panel-header-btn">
            <div class="odos-header-left">
              <span class="odos-brand-pill">ODOS</span>
              <span class="odos-collapsed-title" title="${companyName}">${companyName}</span>
              <span class="odos-collapsed-stat">${filledFields.length}/${totalFields} filled</span>
            </div>
            <div class="odos-header-actions">
              <button class="icon-btn" id="btn-toggle-expand" title="Expand panel">&#9650;</button>
              <button class="icon-btn" id="btn-close-panel" title="Dismiss panel">&times;</button>
            </div>
          </div>
        </div>
      `
          : `
        <div class="odos-panel">
          <div class="odos-header" id="panel-header-btn">
            <div class="odos-header-left">
              <span class="odos-brand-pill">ODOS</span>
              <div class="odos-header-titles">
                <div class="odos-title" title="${companyName}">${companyName}</div>
                <div class="odos-subtitle">${atsLabel} ${confidenceText ? '&bull; ' + confidenceText : ''} ${alreadyApplied ? '&bull; <span style="color:#d97706;font-weight:600;">Already Applied</span>' : isDuplicate ? '&bull; Re-fill' : ''}${this.options.buildId ? ' &bull; build ' + escapeHtml(this.options.buildId) : ''}</div>
              </div>
            </div>
            <div class="odos-header-actions">
              <button class="icon-btn" id="btn-toggle-expand" title="Minimize panel">&minus;</button>
              <button class="icon-btn" id="btn-close-panel" title="Dismiss panel">&times;</button>
            </div>
          </div>

          <div class="odos-body">
            ${
              alreadyApplied
                ? `
              <div class="duplicate-alert">
                <span class="duplicate-alert-icon">⚠️</span>
                <div class="duplicate-alert-content">
                  <div class="duplicate-alert-title">Duplicate Application Protected</div>
                  <div class="duplicate-alert-desc">
                    You already applied to this role${appliedDateStr ? ` on <strong>${escapeHtml(appliedDateStr)}</strong>` : ''}.
                    Odos prevented autofill to protect against duplicate applications.
                  </div>
                  ${
                    this.options.onOverrideProtection
                      ? `<button class="btn-override-protection" id="btn-override-dup">Fill Anyway</button>`
                      : ''
                  }
                </div>
              </div>
            `
                : ''
            }

            ${
              captcha?.present
                ? `
              <div class="captcha-alert">
                <span>⚠️</span>
                <div>
                  <strong>${captcha.type ? captcha.type + ' ' : ''}CAPTCHA Detected:</strong>
                  Odos never bypasses security checks. Please solve the CAPTCHA before submitting.
                </div>
              </div>
            `
                : ''
            }

            ${this.renderPageStatus()}

            ${this.renderProposals()}

            <div class="stat-grid">
              <div class="stat-box ${this.activeTab === 'all' ? 'active' : ''}" id="tab-all">
                <div class="stat-num">${totalFields}</div>
                <div class="stat-label">Total</div>
              </div>
              <div class="stat-box ${this.activeTab === 'filled' ? 'active' : ''}" id="tab-filled">
                <div class="stat-num">${filledFields.length}</div>
                <div class="stat-label">Filled${unverifiedCount > 0 ? ` · ${unverifiedCount} to check` : ''}</div>
              </div>
              <div class="stat-box ${this.activeTab === 'needs_review' ? 'active' : ''}" id="tab-review">
                <div class="stat-num">${emptyFields.length}</div>
                <div class="stat-label">Needs Review</div>
              </div>
            </div>

            <div class="search-wrapper">
              <input
                type="text"
                class="field-search-input"
                id="field-search-input"
                placeholder="Search fields..."
                value="${this.searchQuery}"
              />
            </div>

            <div class="field-list-wrapper">
              ${
                !hasAnyFieldsToShow
                  ? `<div class="empty-state">No fields to display in this category.</div>`
                  : `
                <ul class="field-list">
                  ${
                    showEmpty
                      ? emptyFields
                          .map((f, i) => this.renderReviewRow(f, i, 'empty'))
                          .join('')
                      : ''
                  }

                  ${
                    showFilled
                      ? filledFields
                          .map((f, i) =>
                            f.status === 'unverified'
                              ? this.renderReviewRow(f, i, 'filled')
                              : `
                      <li class="field-item" data-type="filled" data-index="${i}">
                        <div class="field-info">
                          <div class="field-title-row">
                            <span class="field-title">${escapeHtml(f.label || f.name || 'Unlabeled field')}</span>
                            ${f.required ? '<span class="badge-required">Required</span>' : ''}
                          </div>
                          <span class="field-meta">${escapeHtml(f.canonical || 'Prefilled')}${f.source === 'ai' ? '<span class="field-source">· AI</span>' : ''}</span>
                        </div>
                        <span class="field-val-badge" title="${escapeHtml(f.matchedValue || 'Filled')}">${escapeHtml(f.matchedValue || 'Filled')}</span>
                      </li>
                    `
                          )
                          .join('')
                      : ''
                  }
                </ul>
              `
              }
            </div>

            <div class="invariant-notice">
              <strong>Human submission required:</strong> Odos does not click final submit buttons. Review your answers above and submit when ready.
              ${this.options.getDiagnostics ? '<button type="button" id="btn-copy-diagnostics" class="link-btn" title="Copy what Odos saw and did on this page">Copy diagnostics</button>' : ''}
            </div>

            <div class="panel-actions">
              ${
                this.options.onUndoPrefill
                  ? `<button class="btn-undo" id="btn-undo">Undo Prefill</button>`
                  : ''
              }
              <button class="btn-submit" id="btn-mark-submitted">Mark Submitted</button>
            </div>
          </div>
        </div>
      `
      }
    `;

    // Attach event listeners
    const headerEl = this.shadow.getElementById('panel-header-btn');
    headerEl?.addEventListener('click', (e) => {
      // Don't toggle if an action button inside the header was clicked
      if ((e.target as HTMLElement).closest('.icon-btn')) return;
      this.isExpanded = !this.isExpanded;
      this.updateUI();
    });

    const toggleExpandBtn = this.shadow.getElementById('btn-toggle-expand');
    toggleExpandBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isExpanded = !this.isExpanded;
      this.updateUI();
    });

    const closeBtn = this.shadow.getElementById('btn-close-panel');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.options.onClose?.();
      this.destroy();
    });

    if (this.isExpanded) {
      const tabAll = this.shadow.getElementById('tab-all');
      tabAll?.addEventListener('click', () => {
        this.activeTab = 'all';
        this.updateUI();
      });

      const tabFilled = this.shadow.getElementById('tab-filled');
      tabFilled?.addEventListener('click', () => {
        this.activeTab = this.activeTab === 'filled' ? 'all' : 'filled';
        this.updateUI();
      });

      const tabReview = this.shadow.getElementById('tab-review');
      tabReview?.addEventListener('click', () => {
        this.activeTab = this.activeTab === 'needs_review' ? 'all' : 'needs_review';
        this.updateUI();
      });

      const searchInput = this.shadow.getElementById('field-search-input') as HTMLInputElement | null;
      searchInput?.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.filterFieldsBySearch(this.searchQuery);
      });

      // If we had a search query before re-render, apply it
      if (this.searchQuery) {
        this.filterFieldsBySearch(this.searchQuery);
      }

      const markSubmittedBtn = this.shadow.getElementById('btn-mark-submitted');
      markSubmittedBtn?.addEventListener('click', () => {
        this.options.onConfirmSubmitted();
        this.showSubmittedNotice();
      });

      this.shadow.querySelectorAll<HTMLButtonElement>('button[data-learn]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const p = this.proposals[Number(btn.getAttribute('data-proposal'))];
          if (!p) return;
          if (btn.getAttribute('data-learn') === 'dismiss') {
            p.state = 'dismissed';
            this.updateUI();
            return;
          }
          btn.disabled = true;
          try {
            await this.options.onSaveAnswers?.([{ field: p.field, value: p.value }]);
            p.state = 'saved';
          } catch {
            btn.disabled = false;
          }
          this.updateUI();
        });
      });

      const continueBtn = this.shadow.getElementById('btn-continue') as HTMLButtonElement | null;
      continueBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        continueBtn.disabled = true;
        continueBtn.textContent = 'Continuing…';
        this.options.onContinue?.();
      });

      const overrideBtn = this.shadow.getElementById('btn-override-dup') as HTMLButtonElement | null;
      overrideBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        overrideBtn.disabled = true;
        overrideBtn.textContent = 'Filling…';
        this.options.onOverrideProtection?.();
      });

      const diagBtn = this.shadow.getElementById('btn-copy-diagnostics') as HTMLButtonElement | null;
      diagBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!this.options.getDiagnostics) return;
        const text = this.options.getDiagnostics();
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            diagBtn.textContent = 'Copied';
          } else {
            throw new Error('clipboard unavailable');
          }
        } catch {
          console.log('[Odos] diagnostics\n' + text);
          diagBtn.textContent = 'Printed to console';
        }
        setTimeout(() => {
          diagBtn.textContent = 'Copy diagnostics';
        }, 2000);
      });

      const undoBtn = this.shadow.getElementById('btn-undo');
      undoBtn?.addEventListener('click', () => {
        if (this.options.onUndoPrefill) {
          this.options.onUndoPrefill();
        }
      });

      // Jump to a field on row click; inline controls stop propagation.
      const rows = this.shadow.querySelectorAll('.field-item');
      rows.forEach((el) => {
        el.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.inline-answer')) return;
          const idx = Number(el.getAttribute('data-index'));
          const list = el.getAttribute('data-type') === 'empty' ? emptyFields : filledFields;
          const field = list[idx];
          if (field?.element && typeof field.element.scrollIntoView === 'function') {
            field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof field.element.focus === 'function') {
              field.element.focus();
            }
            this.pulseElement(field.element);
          }
        });
      });

      // Inline Fill / Fill & remember
      this.shadow.querySelectorAll<HTMLElement>('.inline-answer').forEach((box) => {
        const idx = Number(box.getAttribute('data-index'));
        const list = box.getAttribute('data-type') === 'empty' ? emptyFields : filledFields;
        const field = list[idx];
        const input = box.querySelector<HTMLInputElement | HTMLSelectElement>('select, input');
        const fillBtn = box.querySelector<HTMLButtonElement>('button[data-action="fill"]');
        const rememberBtn = box.querySelector<HTMLButtonElement>('button[data-action="remember"]');
        const run = async (remember: boolean) => {
          if (!field || !input || !this.options.onFillField) return;
          const value = input.value.trim();
          if (!value) return;
          if (fillBtn) fillBtn.disabled = true;
          if (rememberBtn) rememberBtn.disabled = true;
          try {
            const outcome = await this.options.onFillField(field, value, remember);
            this.applyOutcome(field, outcome);
          } finally {
            this.updateUI();
          }
        };
        fillBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          run(false);
        });
        rememberBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          run(true);
        });
        input?.addEventListener('click', (e) => e.stopPropagation());
        input?.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            run(false);
          }
        });
      });
    }
  }

  /**
   * Learning loop: the user answered a field Odos could not fill. Offer to remember it.
   * The latest answer per field wins; dismissed proposals stay dismissed.
   */
  proposeAnswer(field: FormField, value: string): void {
    const v = value.trim();
    if (!v) return;
    const existing = this.proposals.find((p) => p.field === field);
    if (existing) {
      if (existing.state === 'dismissed' || (existing.state === 'saved' && existing.value === v)) return;
      existing.value = v;
      existing.state = 'pending';
    } else {
      this.proposals.push({ field, value: v, state: 'pending' });
    }
    if (this.shadow && this.isExpanded) this.updateUI();
  }

  getPendingProposals(): ManualEdit[] {
    return this.proposals.filter((p) => p.state === 'pending').map((p) => ({ field: p.field, value: p.value }));
  }

  /** Updates the multi-page status line in place (e.g. "moving to the next step…"). */
  setStatus(status: PageStatus): void {
    this.options.pageStatus = status;
    if (this.shadow && this.isExpanded) this.updateUI();
  }

  private renderPageStatus(): string {
    const st = this.options.pageStatus;
    if (!st) return '';
    const title = st.title ? ` · ${escapeHtml(st.title)}` : '';
    return `
      <div class="page-status ${st.working ? 'page-status-working' : ''}">
        <div class="page-status-head">Page ${st.pageNumber}${title}</div>
        <div class="page-status-msg">${escapeHtml(st.message)}</div>
        ${st.canContinue && this.options.onContinue ? '<button type="button" id="btn-continue" class="btn-continue">Continue</button>' : ''}
      </div>`;
  }

  private renderProposals(): string {
    const visible = this.proposals.filter((p) => p.state !== 'dismissed');
    if (visible.length === 0 || !this.options.onSaveAnswers) return '';
    return `
      <div class="learn-box">
        <div class="learn-title">Remember for next time?</div>
        ${visible
          .map((p, i) => {
            const idx = this.proposals.indexOf(p);
            return `
          <div class="learn-row" data-proposal="${idx}">
            <div class="learn-text"><div class="learn-q">${escapeHtml(p.field.label)}</div><div class="learn-a">${escapeHtml(p.value)}</div></div>
            ${
              p.state === 'saved'
                ? '<span class="learn-saved">Saved</span>'
                : `<button type="button" class="learn-btn" data-learn="save" data-proposal="${idx}" title="Save this answer">✓</button>
                   <button type="button" class="learn-btn secondary" data-learn="dismiss" data-proposal="${idx}" title="Don't save">✕</button>`
            }
          </div>`.replace(/\s+$/, '') + (i < visible.length - 1 ? '' : '');
          })
          .join('')}
      </div>`;
  }

  /**
   * Row for a field that needs human attention: failed/skipped (empty list) or unverified
   * (filled list). Shows the closest candidate and an inline answer control.
   */
  private renderReviewRow(f: FormField, i: number, listType: 'empty' | 'filled'): string {
    const isUnverified = f.status === 'unverified';
    const isSkipped = f.status === 'skipped';
    const suggestion = f.suggestion;
    const canFill = Boolean(this.options.onFillField) && f.type !== 'file';

    let meta: string;
    if (isUnverified) {
      meta = 'Selected, but the page did not confirm it. Check the field.';
    } else if (isSkipped) {
      meta = f.statusReason === 'workday_upload_requires_human' ? 'Attach your resume manually (Workday requires a human click).' : 'Skipped';
    } else if (suggestion) {
      meta = `closest: ${escapeHtml(suggestion.text)} (${Math.round(suggestion.score * 100)}%)`;
    } else {
      meta = 'Left empty for your review';
    }

    let control = '';
    if (canFill) {
      const preset = suggestion?.text || '';
      if (f.options && f.options.length > 0) {
        const opts = f.options
          .map((o) => `<option value="${escapeHtml(o)}" ${o === preset ? 'selected' : ''}>${escapeHtml(o)}</option>`)
          .join('');
        control = `<select aria-label="Choose an answer">${preset ? '' : '<option value="">Choose…</option>'}${opts}</select>`;
      } else {
        control = `<input type="text" placeholder="Type an answer" value="${escapeHtml(preset)}" aria-label="Answer" />`;
      }
    }

    const badge = isUnverified
      ? `<span class="check-badge" title="${escapeHtml(f.matchedValue || '')}">Check: ${escapeHtml(f.matchedValue || '')}</span>`
      : isSkipped
        ? '<span class="skip-badge">Skipped</span>'
        : '<span class="review-badge">Needs input &rarr;</span>';

    return `
      <li class="field-item ${listType === 'empty' ? 'field-item-empty' : 'field-item-unverified'} ${canFill ? 'field-item-stack' : ''}" data-type="${listType}" data-index="${i}">
        <div class="field-row-main">
          <div class="field-info">
            <div class="field-title-row">
              <span class="field-title">${escapeHtml(f.label || f.name || 'Unlabeled field')}</span>
              ${f.required ? '<span class="badge-required">Required</span>' : ''}
            </div>
            <span class="field-meta">${meta}</span>
          </div>
          ${badge}
        </div>
        ${
          canFill
            ? `<div class="inline-answer" data-type="${listType}" data-index="${i}">
                ${control}
                <button type="button" data-action="fill" title="Fill this field">Fill</button>
                <button type="button" class="secondary" data-action="remember" title="Fill and remember this answer for next time">Fill &amp; remember</button>
              </div>`
            : ''
        }
      </li>
    `;
  }

  /**
   * Moves a field between the review/filled lists after an inline fill.
   */
  private applyOutcome(field: FormField, outcome: FillOutcome): void {
    const { filledFields, emptyFields } = this.options;
    const removeFrom = (list: FormField[]) => {
      const idx = list.indexOf(field);
      if (idx >= 0) list.splice(idx, 1);
    };
    if (outcome.status === 'verified' || outcome.status === 'unverified') {
      removeFrom(emptyFields);
      if (!filledFields.includes(field)) filledFields.push(field);
    } else {
      removeFrom(filledFields);
      if (!emptyFields.includes(field)) emptyFields.push(field);
    }
  }

  private filterFieldsBySearch(query: string): void {
    if (!this.shadow) return;
    const cleanQuery = query.toLowerCase().trim();
    const items = this.shadow.querySelectorAll('.field-item');
    items.forEach((item) => {
      const text = item.textContent?.toLowerCase() || '';
      if (!cleanQuery || text.includes(cleanQuery)) {
        (item as HTMLElement).style.display = 'flex';
      } else {
        (item as HTMLElement).style.display = 'none';
      }
    });
  }

  showSubmittedNotice(): void {
    if (!this.shadow) return;
    const body = this.shadow.querySelector('.odos-body');
    if (!body) return;

    const handled = new Set(this.proposals.filter((p) => p.state !== 'pending').map((p) => p.field));
    const edits = (this.options.getManualEdits ? this.options.getManualEdits() : []).filter((e) => !handled.has(e.field));
    const offer =
      edits.length > 0 && this.options.onSaveAnswers
        ? `
        <div class="save-offer" id="save-offer">
          <div style="font-size:12px; font-weight:600; margin-bottom:4px;">Remember ${edits.length} answer${edits.length === 1 ? '' : 's'} you filled by hand?</div>
          ${edits
            .map(
              (e, i) => `
            <label><input type="checkbox" data-edit-index="${i}" checked />
              <span><span class="offer-q">${escapeHtml(e.field.label)}</span><br/><span class="offer-a">${escapeHtml(e.value)}</span></span>
            </label>`
            )
            .join('')}
          <button id="btn-save-answers" style="margin-top:8px; background:#09090b; color:#fafafa; border:1px solid #09090b; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">Save selected</button>
        </div>`
        : '';

    body.innerHTML = `
      <div style="padding: 24px 16px; text-align: center; color: #09090b; display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <div style="width: 36px; height: 36px; border-radius: 50%; background: #09090b; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700;">✓</div>
        <strong style="font-size: 14px; color: #09090b;">Application Recorded</strong>
        <p style="font-size: 12px; color: #71717a; line-height: 1.5; max-width: 280px;">
          Your responses and application record have been saved to your local Odos database.
        </p>
        ${offer}
        <button id="btn-submitted-close" style="margin-top: 8px; background: #f4f4f5; border: 1px solid #e4e4e7; color: #09090b; padding: 7px 16px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">
          Close
        </button>
      </div>
    `;

    const saveBtn = this.shadow.getElementById('btn-save-answers') as HTMLButtonElement | null;
    saveBtn?.addEventListener('click', async () => {
      if (!this.options.onSaveAnswers || !this.shadow) return;
      const boxes = Array.from(this.shadow.querySelectorAll<HTMLInputElement>('#save-offer input[type="checkbox"]'));
      const selected = boxes.filter((b) => b.checked).map((b) => edits[Number(b.getAttribute('data-edit-index'))]).filter(Boolean);
      saveBtn.disabled = true;
      try {
        await this.options.onSaveAnswers(selected);
        saveBtn.textContent = `Saved ${selected.length}`;
      } catch {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Retry save';
      }
    });

    const closeBtn = this.shadow.getElementById('btn-submitted-close');
    closeBtn?.addEventListener('click', () => {
      this.destroy();
    });
  }

  private pulseElement(el: HTMLElement): void {
    const originalOutline = el.style.outline;
    const originalTransition = el.style.transition;
    const originalBoxShadow = el.style.boxShadow;
    el.style.transition = 'all 0.2s ease';
    el.style.outline = '3px solid #2563eb';
    el.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.25)';
    setTimeout(() => {
      el.style.outline = originalOutline;
      el.style.boxShadow = originalBoxShadow;
      el.style.transition = originalTransition;
    }, 1800);
  }

  destroy(): void {
    if (this.host) {
      this.host.remove();
      this.host = null;
      this.shadow = null;
    }
  }
}
