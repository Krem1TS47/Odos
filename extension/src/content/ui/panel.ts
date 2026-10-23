import { FormField } from '../adapters/types';
import { Job, Application } from '../../core/models';
import { CaptchaDetection } from '../captcha';
import { DetectionResult } from '../../detect';

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
  onUndoPrefill?: () => void;
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
                <div class="stat-label">Filled</div>
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
                          .map(
                            (f, i) => `
                      <li class="field-item field-item-empty" data-type="empty" data-index="${i}">
                        <div class="field-info">
                          <div class="field-title-row">
                            <span class="field-title">${f.label || f.name || 'Unlabeled field'}</span>
                            ${f.required ? '<span class="badge-required">Required</span>' : ''}
                          </div>
                          <span class="field-meta">Left empty for your review</span>
                        </div>
                        <span class="review-badge">Needs input &rarr;</span>
                      </li>
                    `
                          )
                          .join('')
                      : ''
                  }

                  ${
                    showFilled
                      ? filledFields
                          .map(
                            (f, i) => `
                      <li class="field-item" data-type="filled" data-index="${i}">
                        <div class="field-info">
                          <div class="field-title-row">
                            <span class="field-title">${f.label || f.name || 'Unlabeled field'}</span>
                            ${f.required ? '<span class="badge-required">Required</span>' : ''}
                          </div>
                          <span class="field-meta">${f.canonical || 'Prefilled'}</span>
                        </div>
                        <span class="field-val-badge" title="${f.matchedValue || 'Filled'}">${f.matchedValue || 'Filled'}</span>
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

      // Jump to empty fields on click
      const emptyElements = this.shadow.querySelectorAll('.field-item-empty');
      emptyElements.forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.getAttribute('data-index'));
          const field = emptyFields[idx];
          if (field?.element && typeof field.element.scrollIntoView === 'function') {
            field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof field.element.focus === 'function') {
              field.element.focus();
            }
            this.pulseElement(field.element);
          }
        });
      });

      // Jump to filled fields on click
      const filledElements = this.shadow.querySelectorAll('.field-item:not(.field-item-empty)');
      filledElements.forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.getAttribute('data-index'));
          const field = filledFields[idx];
          if (field?.element && typeof field.element.scrollIntoView === 'function') {
            field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof field.element.focus === 'function') {
              field.element.focus();
            }
            this.pulseElement(field.element);
          }
        });
      });
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
    if (body) {
      body.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: #09090b; display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #09090b; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700;">✓</div>
          <strong style="font-size: 14px; color: #09090b;">Application Recorded</strong>
          <p style="font-size: 12px; color: #71717a; line-height: 1.5; max-width: 280px;">
            Your responses and application record have been saved to your local Odos database.
          </p>
          <button id="btn-submitted-close" style="margin-top: 8px; background: #f4f4f5; border: 1px solid #e4e4e7; color: #09090b; padding: 7px 16px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">
            Close
          </button>
        </div>
      `;

      const closeBtn = this.shadow.getElementById('btn-submitted-close');
      closeBtn?.addEventListener('click', () => {
        this.destroy();
      });
    }
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
