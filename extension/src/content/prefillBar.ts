import { FormField } from './adapters/types';
import { Job, Application } from '../core/models';

export interface PrefillBarOptions {
  job: Partial<Job>;
  application: Application;
  filledFields: FormField[];
  emptyFields: FormField[];
  isDuplicate?: boolean;
  onConfirmSubmitted: () => void;
}

export class PrefillBarController {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private options: PrefillBarOptions;
  private isExpanded: boolean = false;

  constructor(options: PrefillBarOptions) {
    this.options = options;
  }

  render(): void {
    // Remove existing bar if present
    const existing = document.getElementById('odos-prefill-host');
    if (existing) existing.remove();

    this.host = document.createElement('div');
    this.host.id = 'odos-prefill-host';
    this.host.style.position = 'fixed';
    this.host.style.bottom = '16px';
    this.host.style.right = '16px';
    this.host.style.zIndex = '2147483647';
    this.host.style.pointerEvents = 'none';

    // Closed Shadow DOM (Section 6)
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    this.updateUI();
    document.body.appendChild(this.host);
  }

  private updateUI(): void {
    if (!this.shadow) return;

    const { job, filledFields, emptyFields, isDuplicate } = this.options;
    const total = filledFields.length + emptyFields.length;

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .odos-panel {
          pointer-events: auto;
          width: 360px;
          max-width: calc(100vw - 32px);
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #0f172a;
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .odos-header {
          background: #1e1b4b;
          color: #ffffff;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          user-select: none;
        }
        .odos-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .odos-badge {
          background: #4f46e5;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .odos-title {
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;
        }
        .odos-meta {
          font-size: 11px;
          opacity: 0.8;
        }
        .odos-body {
          padding: 12px;
          display: ${this.isExpanded ? 'block' : 'none'};
          max-height: 380px;
          overflow-y: auto;
        }
        .odos-stats {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
        }
        .stat-card {
          flex: 1;
          padding: 8px;
          border-radius: 8px;
          font-size: 11px;
          text-align: center;
        }
        .stat-filled {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #065f46;
          font-weight: 600;
        }
        .stat-empty {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
          font-weight: 600;
        }
        .field-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .field-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          transition: background 0.15s ease;
        }
        .field-item:hover {
          background: #e2e8f0;
        }
        .field-label {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .field-val {
          font-size: 10px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
        }
        .badge-success {
          color: #16a34a;
          font-size: 10px;
          font-weight: 600;
        }
        .badge-pending {
          color: #d97706;
          font-size: 10px;
          font-weight: 600;
        }
        .odos-notice {
          margin-top: 10px;
          padding: 8px 10px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          font-size: 11px;
          color: #166534;
          line-height: 1.4;
        }
        .odos-confirm-bar {
          margin-top: 8px;
          padding: 8px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          font-size: 11px;
          color: #1e40af;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .btn-confirm {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-confirm:hover {
          background: #1d4ed8;
        }
        .toggle-icon {
          font-size: 14px;
          transition: transform 0.2s ease;
          transform: ${this.isExpanded ? 'rotate(180deg)' : 'rotate(0)'};
        }
      </style>

      <div class="odos-panel">
        <div class="odos-header" id="header-btn">
          <div class="odos-header-left">
            <span class="odos-badge">ODOS</span>
            <div>
              <div class="odos-title">${job.company || 'Job Application'}</div>
              <div class="odos-meta">${filledFields.length}/${total} fields filled ${isDuplicate ? '• Re-fill' : ''}</div>
            </div>
          </div>
          <span class="toggle-icon">▼</span>
        </div>

        <div class="odos-body">
          <div class="odos-stats">
            <div class="stat-card stat-filled">
              ✓ ${filledFields.length} Filled
            </div>
            <div class="stat-card stat-empty">
              ! ${emptyFields.length} Unmatched / Empty
            </div>
          </div>

          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">
            Fields Review (Click to Jump)
          </div>

          <ul class="field-list">
            ${emptyFields.map((f, i) => `
              <li class="field-item empty-item" data-index="${i}" data-type="empty">
                <span class="field-label" style="color: #92400e;">! ${f.label || f.name}</span>
                <span class="badge-pending">Review &rarr;</span>
              </li>
            `).join('')}

            ${filledFields.map((f, i) => `
              <li class="field-item filled-item" data-index="${i}" data-type="filled">
                <span class="field-label">${f.label || f.name}</span>
                <span class="field-val">${f.matchedValue || 'Filled'}</span>
              </li>
            `).join('')}
          </ul>

          <div class="odos-notice">
            <strong>Human submission required:</strong> Please review the form fields above and submit manually. Odos will detect confirmation.
          </div>

          <div class="odos-confirm-bar">
            <span>Did you submit?</span>
            <button class="btn-confirm" id="btn-submitted">Mark Submitted</button>
          </div>
        </div>
      </div>
    `;

    // Attach listeners inside shadow DOM
    const headerBtn = this.shadow.getElementById('header-btn');
    headerBtn?.addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;
      this.updateUI();
    });

    const markSubmittedBtn = this.shadow.getElementById('btn-submitted');
    markSubmittedBtn?.addEventListener('click', () => {
      this.options.onConfirmSubmitted();
      this.showSubmittedNotice();
    });

    // Jump to fields on click
    const emptyItems = this.shadow.querySelectorAll('.empty-item');
    emptyItems.forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-index'));
        const field = emptyFields[idx];
        if (field?.element) {
          field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          field.element.focus();
          this.pulseElement(field.element);
        }
      });
    });

    const filledItems = this.shadow.querySelectorAll('.filled-item');
    filledItems.forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-index'));
        const field = filledFields[idx];
        if (field?.element) {
          field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          field.element.focus();
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
        <div style="padding: 16px; text-align: center; color: #166534; font-size: 13px;">
          <div style="font-size: 24px; margin-bottom: 6px;">✓</div>
          <strong>Application logged as Submitted!</strong>
          <p style="font-size: 11px; color: #64748b; margin-top: 4px;">Answers snapshot and resume record saved to your local Odos dashboard.</p>
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
