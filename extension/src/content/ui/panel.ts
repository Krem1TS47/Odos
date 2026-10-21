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
    const confidenceText = detection ? `${Math.round(detection.confidence * 100)}% confidence` : '';

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .odos-panel {
          pointer-events: auto;
          width: 380px;
          max-width: calc(100vw - 32px);
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
          border: 1px solid #e4e4e7;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #09090b;
          overflow: hidden;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .odos-header {
          background: #09090b;
          color: #fafafa;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          user-select: none;
        }
        .odos-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
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
        }
        .odos-header-titles {
          display: flex;
          flex-direction: column;
        }
        .odos-title {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 210px;
        }
        .odos-subtitle {
          font-size: 11px;
          color: #a1a1aa;
          margin-top: 2px;
        }
        .toggle-icon {
          font-size: 11px;
          color: #a1a1aa;
          transition: transform 0.2s ease;
          transform: ${this.isExpanded ? 'rotate(180deg)' : 'rotate(0)'};
        }
        .odos-body {
          padding: 14px;
          display: ${this.isExpanded ? 'block' : 'none'};
          max-height: 480px;
          overflow-y: auto;
          background: #ffffff;
        }
        .captcha-alert {
          background: #fafafa;
          border: 1px solid #e4e4e7;
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 12px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 11px;
          color: #09090b;
          line-height: 1.4;
        }
        .captcha-alert strong {
          color: #09090b;
        }
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }
        .stat-box {
          padding: 8px;
          border-radius: 8px;
          text-align: center;
          cursor: pointer;
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          color: #71717a;
          transition: all 0.15s ease;
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
          font-size: 15px;
          font-weight: 700;
          line-height: 1.2;
        }
        .stat-label {
          font-size: 10px;
          font-weight: 500;
          text-transform: uppercase;
          margin-top: 2px;
          letter-spacing: 0.3px;
        }
        .field-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
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
        }
        .field-item:hover {
          background: #f4f4f5;
          border-color: #d4d4d8;
        }
        .field-item-empty {
          border-color: #e4e4e7;
          background: #fafafa;
        }
        .field-item-empty:hover {
          background: #f4f4f5;
        }
        .field-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .field-title {
          font-weight: 500;
          color: #09090b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }
        .field-meta {
          font-size: 10px;
          color: #71717a;
        }
        .field-val-badge {
          font-size: 11px;
          font-weight: 500;
          color: #09090b;
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          padding: 2px 6px;
          border-radius: 4px;
          max-width: 110px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .review-badge {
          font-size: 10px;
          font-weight: 600;
          color: #09090b;
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .invariant-notice {
          padding: 10px;
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          border-radius: 8px;
          font-size: 11px;
          color: #71717a;
          line-height: 1.4;
          margin-bottom: 12px;
        }
        .invariant-notice strong {
          color: #09090b;
        }
        .panel-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-submit {
          flex: 2;
          background: #09090b;
          color: #fafafa;
          border: 1px solid #09090b;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .btn-submit:hover {
          background: #27272a;
        }
        .btn-undo {
          flex: 1;
          background: #ffffff;
          color: #09090b;
          border: 1px solid #e4e4e7;
          padding: 8px 10px;
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

      <div class="odos-panel">
        <div class="odos-header" id="panel-header-btn">
          <div class="odos-header-left">
            <span class="odos-brand-pill">ODOS</span>
            <div class="odos-header-titles">
              <div class="odos-title">${job.company || 'Job Application'}</div>
              <div class="odos-subtitle">${atsLabel} ${confidenceText ? '• ' + confidenceText : ''} ${isDuplicate ? '• Re-fill' : ''}</div>
            </div>
          </div>
          <span class="toggle-icon">▼</span>
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
            <div class="stat-box ${this.activeTab === 'filled' ? 'active' : ''}" id="tab-filled">
              <div class="stat-num">${filledFields.length}</div>
              <div class="stat-label">Filled</div>
            </div>
            <div class="stat-box ${this.activeTab === 'needs_review' ? 'active' : ''}" id="tab-review">
              <div class="stat-num">${emptyFields.length}</div>
              <div class="stat-label">Needs Review</div>
            </div>
            <div class="stat-box ${this.activeTab === 'all' ? 'active' : ''}" id="tab-all">
              <div class="stat-num">${totalFields}</div>
              <div class="stat-label">Total</div>
            </div>
          </div>
            <div class="stat-box stat-box-amber ${this.activeTab === 'needs_review' ? 'active' : ''}" id="tab-review">
              <div class="stat-num">${emptyFields.length}</div>
              <div class="stat-label">Needs Review</div>
            </div>
            <div class="stat-box stat-box-blue ${this.activeTab === 'all' ? 'active' : ''}" id="tab-all">
              <div class="stat-num">${totalFields}</div>
              <div class="stat-label">Total</div>
            </div>
          </div>

          <ul class="field-list">
            ${
              this.activeTab !== 'filled'
                ? emptyFields
                    .map(
                      (f, i) => `
                <li class="field-item field-item-empty" data-type="empty" data-index="${i}">
                  <div class="field-info">
                    <span class="field-title">${f.label || f.name}</span>
                    <span class="field-meta">${f.required ? 'Required • ' : ''}Left empty for review</span>
                  </div>
                  <span class="review-badge">Review &rarr;</span>
                </li>
              `
                    )
                    .join('')
                : ''
            }

            ${
              this.activeTab !== 'needs_review'
                ? filledFields
                    .map(
                      (f, i) => `
                <li class="field-item" data-type="filled" data-index="${i}">
                  <div class="field-info">
                    <span class="field-title">${f.label || f.name}</span>
                    <span class="field-meta">${f.canonical ? f.canonical : 'Mapped'}</span>
                  </div>
                  <span class="field-val-badge" title="${f.matchedValue || 'Filled'}">${f.matchedValue || 'Filled'}</span>
                </li>
              `
                    )
                    .join('')
                : ''
            }
          </ul>

          <div class="invariant-notice">
            <strong>Human submission required:</strong> Odos does not click submit controls. Review your responses above and submit manually.
          </div>

          <div class="panel-actions">
            ${
              this.options.onUndoPrefill
                ? `<button class="btn-undo" id="btn-undo">Undo</button>`
                : ''
            }
            <button class="btn-submit" id="btn-mark-submitted">Mark Submitted</button>
          </div>
        </div>
      </div>
    `;

    // Attach Shadow DOM event listeners
    const headerBtn = this.shadow.getElementById('panel-header-btn');
    headerBtn?.addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;
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

    const tabAll = this.shadow.getElementById('tab-all');
    tabAll?.addEventListener('click', () => {
      this.activeTab = 'all';
      this.updateUI();
    });

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

    // Jump to fields on click
    const emptyElements = this.shadow.querySelectorAll('.field-item-empty');
    emptyElements.forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-index'));
        const field = emptyFields[idx];
        if (field?.element) {
          field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof field.element.focus === 'function') {
            field.element.focus();
          }
          this.pulseElement(field.element);
        }
      });
    });

    const filledElements = this.shadow.querySelectorAll('.field-item:not(.field-item-empty)');
    filledElements.forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-index'));
        const field = filledFields[idx];
        if (field?.element) {
          field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof field.element.focus === 'function') {
            field.element.focus();
          }
          this.pulseElement(field.element);
        }
      });
    });
  }

  showSubmittedNotice(): void {
    if (!this.shadow) return;
    const body = this.shadow.querySelector('.odos-body');
    if (body) {
      body.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: #09090b; font-size: 13px;">
          <div style="font-size: 24px; margin-bottom: 8px; font-weight: 700;">✓</div>
          <strong style="font-size: 14px; color: #09090b;">Application Submitted</strong>
          <p style="font-size: 12px; color: #71717a; margin-top: 6px; line-height: 1.5;">
            Your answers and application record have been saved to your local Odos database.
          </p>
        </div>
      `;
    }
  }

  private pulseElement(el: HTMLElement): void {
    const originalOutline = el.style.outline;
    const originalTransition = el.style.transition;
    el.style.transition = 'outline 0.15s ease';
    el.style.outline = '2px solid #09090b';
    setTimeout(() => {
      el.style.outline = originalOutline;
      el.style.transition = originalTransition;
    }, 1500);
  }

  destroy(): void {
    if (this.host) {
      this.host.remove();
      this.host = null;
      this.shadow = null;
    }
  }
}
