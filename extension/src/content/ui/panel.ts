import { FormField } from '../adapters/types';
import { Job, Application } from '../../core/models';
import { CaptchaDetection } from '../captcha';
import { DetectionResult } from '../../detect';
import { FillOutcome } from '../../core/filler';

export interface ManualEdit {
  field: FormField;
  value: string;
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
  onConfirmSubmitted: () => void;
  onUndoPrefill?: () => void | Promise<void>;
  /** Fills a field from the panel (same filler as autofill); `remember` stores the answer. */
  onFillField?: (field: FormField, value: string, remember: boolean) => Promise<FillOutcome>;
  /** Fields the user filled by hand since discovery (offered for saving on submit). */
  getManualEdits?: () => ManualEdit[];
  onSaveAnswers?: (edits: ManualEdit[]) => Promise<void>;
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
      isDuplicate
    } = this.options;

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
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          line-height: 1.45;
          color: #09090b;
          -webkit-font-smoothing: antialiased;
        }
        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .odos-panel {
          pointer-events: auto;
          width: 390px;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 40px);
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.16), 0 6px 12px -3px rgba(0, 0, 0, 0.08);
          border: 1px solid #e4e4e7;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.15s ease;
        }
        .odos-panel-collapsed {
          width: 330px;
        }
        .odos-header {
          background: #09090b;
          color: #fafafa;
          padding: 11px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          user-select: none;
          cursor: pointer;
          flex-shrink: 0;
        }
        .odos-header:hover {
          background: #18181b;
        }
        .odos-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
          flex: 1;
        }
        .odos-brand-pill {
          background: #27272a;
          color: #fafafa;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #3f3f46;
          flex-shrink: 0;
        }
        .odos-header-titles {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }
        .odos-title {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.3;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .odos-subtitle {
          font-size: 11px;
          color: #a1a1aa;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .odos-collapsed-title {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 140px;
        }
        .odos-collapsed-stat {
          font-size: 11px;
          color: #a1a1aa;
          white-space: nowrap;
          margin-left: auto;
        }
        .odos-header-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .icon-btn {
          background: transparent;
          border: none;
          color: #a1a1aa;
          cursor: pointer;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          line-height: 1;
          transition: all 0.15s ease;
        }
        .icon-btn:hover {
          background: #27272a;
          color: #ffffff;
        }
        .odos-body {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1 1 auto;
          padding: 12px 14px;
          background: #ffffff;
          gap: 10px;
        }
        .captcha-alert {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 9px 12px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #991b1b;
          line-height: 1.4;
          flex-shrink: 0;
        }
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          flex-shrink: 0;
        }
        .stat-box {
          padding: 7px 6px;
          border-radius: 8px;
          text-align: center;
          cursor: pointer;
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          color: #71717a;
          transition: all 0.15s ease;
          user-select: none;
        }
        .stat-box:hover {
          background: #e4e4e7;
          color: #09090b;
        }
        .stat-box.active {
          background: #09090b;
          color: #fafafa;
          border-color: #09090b;
        }
        .stat-box.active .stat-label {
          color: #a1a1aa;
        }
        .stat-num {
          font-size: 16px;
          font-weight: 700;
          line-height: 1.2;
        }
        .stat-label {
          font-size: 11px;
          font-weight: 500;
          margin-top: 1px;
        }
        .search-wrapper {
          position: relative;
          flex-shrink: 0;
        }
        .field-search-input {
          width: 100%;
          padding: 7px 10px;
          border: 1px solid #e4e4e7;
          border-radius: 6px;
          font-size: 12px;
          color: #09090b;
          background: #fafafa;
          outline: none;
          font-family: inherit;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .field-search-input:focus {
          border-color: #09090b;
          background: #ffffff;
        }
        .field-list-wrapper {
          flex: 1 1 auto;
          min-height: 80px;
          max-height: 300px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 2px;
          scrollbar-width: thin;
          scrollbar-color: #d4d4d8 transparent;
        }
        .field-list-wrapper::-webkit-scrollbar {
          width: 5px;
        }
        .field-list-wrapper::-webkit-scrollbar-thumb {
          background: #d4d4d8;
          border-radius: 4px;
        }
        .field-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          border: 1px solid #e4e4e7;
          background: #ffffff;
          transition: all 0.15s ease;
          gap: 8px;
        }
        .field-item:hover {
          background: #f4f4f5;
          border-color: #d4d4d8;
        }
        .field-item-empty {
          background: #fafafa;
          border-color: #e4e4e7;
        }
        .field-item-empty:hover {
          background: #fefce8;
          border-color: #fde047;
        }
        .field-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
          min-width: 0;
          flex: 1;
        }
        .field-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .field-title {
          font-weight: 500;
          color: #09090b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
        }
        .badge-required {
          font-size: 9px;
          font-weight: 600;
          color: #dc2626;
          background: #fee2e2;
          border: 1px solid #fca5a5;
          padding: 1px 4px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .field-meta {
          font-size: 11px;
          color: #71717a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .field-val-badge {
          font-size: 11px;
          font-weight: 500;
          color: #047857;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          padding: 3px 7px;
          border-radius: 5px;
          max-width: 130px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 0;
        }
        .review-badge {
          font-size: 11px;
          font-weight: 600;
          color: #b45309;
          background: #fffbeb;
          border: 1px solid #fde68a;
          padding: 3px 7px;
          border-radius: 5px;
          white-space: nowrap;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .empty-state {
          text-align: center;
          padding: 24px 12px;
          color: #71717a;
          font-size: 12px;
        }
        .invariant-notice {
          padding: 8px 10px;
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          border-radius: 6px;
          font-size: 11px;
          color: #71717a;
          line-height: 1.4;
          flex-shrink: 0;
        }
        .invariant-notice strong {
          color: #09090b;
        }
        .panel-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .btn-submit {
          flex: 2;
          background: #09090b;
          color: #fafafa;
          border: 1px solid #09090b;
          padding: 9px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-submit:hover {
          background: #27272a;
        }
        .btn-undo {
          flex: 1;
          background: #ffffff;
          color: #09090b;
          border: 1px solid #e4e4e7;
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-undo:hover {
          background: #f4f4f5;
        }
        .field-item-unverified {
          border-color: #fde68a;
          background: #fffdf5;
        }
        .check-badge {
          font-size: 11px;
          font-weight: 600;
          color: #b45309;
          background: #fffbeb;
          border: 1px solid #fde68a;
          padding: 3px 7px;
          border-radius: 5px;
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 0;
        }
        .skip-badge {
          font-size: 11px;
          font-weight: 500;
          color: #52525b;
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          padding: 3px 7px;
          border-radius: 5px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .field-item-stack {
          flex-direction: column;
          align-items: stretch;
        }
        .field-row-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
        }
        .inline-answer {
          display: flex;
          gap: 6px;
          align-items: center;
          margin-top: 6px;
          width: 100%;
        }
        .inline-answer select,
        .inline-answer input {
          flex: 1;
          min-width: 0;
          padding: 5px 7px;
          border: 1px solid #e4e4e7;
          border-radius: 6px;
          font-size: 12px;
          font-family: inherit;
          color: #09090b;
          background: #ffffff;
        }
        .inline-answer button {
          padding: 5px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid #09090b;
          background: #09090b;
          color: #fafafa;
          white-space: nowrap;
        }
        .inline-answer button.secondary {
          background: #ffffff;
          color: #09090b;
        }
        .inline-answer button:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .field-source {
          font-size: 10px;
          color: #71717a;
          margin-left: 4px;
        }
        .save-offer {
          text-align: left;
          width: 100%;
          max-width: 320px;
          border: 1px solid #e4e4e7;
          border-radius: 8px;
          padding: 10px;
          margin-top: 10px;
        }
        .save-offer label {
          display: flex;
          gap: 6px;
          align-items: flex-start;
          font-size: 12px;
          padding: 3px 0;
          cursor: pointer;
        }
        .save-offer .offer-q {
          font-weight: 500;
          color: #09090b;
        }
        .save-offer .offer-a {
          color: #52525b;
        }
      </style>

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
                <div class="odos-subtitle">${atsLabel} ${confidenceText ? '&bull; ' + confidenceText : ''} ${isDuplicate ? '&bull; Re-fill' : ''}</div>
              </div>
            </div>
            <div class="odos-header-actions">
              <button class="icon-btn" id="btn-toggle-expand" title="Minimize panel">&minus;</button>
              <button class="icon-btn" id="btn-close-panel" title="Dismiss panel">&times;</button>
            </div>
          </div>

          <div class="odos-body">
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

    const edits = this.options.getManualEdits ? this.options.getManualEdits() : [];
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
