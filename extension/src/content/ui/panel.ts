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
          border-radius: 14px;
          box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.25), 0 8px 10px -6px rgba(15, 23, 42, 0.15);
          border: 1px solid #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
          overflow: hidden;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .odos-header {
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
          color: #ffffff;
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
          background: #4f46e5;
          color: #ffffff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.5px;
          padding: 3px 7px;
          border-radius: 6px;
        }
        .odos-header-titles {
          display: flex;
          flex-direction: column;
        }
        .odos-title {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 210px;
        }
        .odos-subtitle {
          font-size: 11px;
          opacity: 0.8;
          margin-top: 2px;
        }
        .toggle-icon {
          font-size: 12px;
          opacity: 0.75;
          transition: transform 0.2s ease;
          transform: ${this.isExpanded ? 'rotate(180deg)' : 'rotate(0)'};
        }
        .odos-body {
          padding: 14px;
          display: ${this.isExpanded ? 'block' : 'none'};
          max-height: 480px;
          overflow-y: auto;
        }
        .captcha-alert {
          background: #fff7ed;
          border: 1px solid #fdba74;
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 12px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #9a3412;
          line-height: 1.4;
        }
        .captcha-alert strong {
          color: #7c2d12;
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
          transition: all 0.15s ease;
        }
        .stat-box:hover {
          filter: brightness(0.96);
        }
        .stat-box.active {
          box-shadow: 0 0 0 2px #4f46e5;
        }
        .stat-box-green {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
        }
        .stat-box-amber {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }
        .stat-box-blue {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e40af;
        }
        .stat-num {
          font-size: 16px;
          font-weight: 700;
        }
        .stat-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          margin-top: 2px;
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
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .field-item:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .field-item-empty {
          border-color: #fef08a;
          background: #fffdf5;
        }
        .field-item-empty:hover {
          background: #fef9c3;
        }
        .field-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .field-title {
          font-weight: 600;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }
        .field-meta {
          font-size: 10px;
          color: #64748b;
        }
        .field-val-badge {
          font-size: 11px;
          font-weight: 500;
          color: #047857;
          background: #ecfdf5;
          padding: 2px 6px;
          border-radius: 4px;
          max-width: 110px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .review-badge {
          font-size: 10px;
          font-weight: 700;
          color: #b45309;
          background: #fef3c7;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .invariant-notice {
          padding: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 11px;
          color: #475569;
          line-height: 1.4;
          margin-bottom: 12px;
        }
        .invariant-notice strong {
          color: #0f172a;
        }
        .panel-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-submit {
          flex: 2;
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .btn-submit:hover {
          background: #1d4ed8;
        }
        .btn-undo {
          flex: 1;
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-undo:hover {
          background: #e2e8f0;
          color: #0f172a;
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
            <div class="stat-box stat-box-green ${this.activeTab === 'filled' ? 'active' : ''}" id="tab-filled">
              <div class="stat-num">${filledFields.length}</div>
              <div class="stat-label">Filled</div>
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
        <div style="padding: 20px; text-align: center; color: #166534; font-size: 13px;">
          <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
          <strong style="font-size: 14px; color: #14532d;">Application Submitted!</strong>
          <p style="font-size: 11px; color: #64748b; margin-top: 6px; line-height: 1.4;">
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
    el.style.outline = '3px solid #6366f1';
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
