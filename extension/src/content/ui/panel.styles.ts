/** Styles for the review panel. Injected into its closed shadow root, so nothing leaks into the host page. */
export const PANEL_CSS = `
        .page-status {
          border: 1px solid #e4e4e7;
          background: #fafafa;
          border-radius: 8px;
          padding: 8px 10px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .page-status-working {
          border-color: #bfdbfe;
          background: #eff6ff;
        }
        .page-status-head {
          font-size: 11px;
          font-weight: 600;
          color: #09090b;
        }
        .page-status-msg {
          font-size: 11px;
          color: #52525b;
          line-height: 1.4;
        }
        .btn-continue {
          align-self: flex-start;
          margin-top: 2px;
          background: #09090b;
          color: #fafafa;
          border: 1px solid #09090b;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-continue:disabled {
          opacity: 0.6;
          cursor: default;
        }
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
        .duplicate-alert {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 9px 12px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 12px;
          color: #92400e;
          line-height: 1.4;
          flex-shrink: 0;
        }
        .duplicate-alert-icon {
          font-size: 15px;
          flex-shrink: 0;
        }
        .duplicate-alert-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }
        .duplicate-alert-title {
          font-weight: 600;
          color: #78350f;
          font-size: 12px;
        }
        .duplicate-alert-desc {
          color: #92400e;
          font-size: 11px;
        }
        .btn-override-protection {
          align-self: flex-start;
          margin-top: 4px;
          background: #78350f;
          color: #ffffff;
          border: none;
          padding: 4px 10px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .btn-override-protection:hover {
          background: #5c2709;
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
        .learn-box {
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          border-radius: 8px;
          padding: 8px 10px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .learn-title {
          font-size: 11px;
          font-weight: 600;
          color: #1e3a8a;
        }
        .learn-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .learn-text {
          flex: 1;
          min-width: 0;
        }
        .learn-q {
          font-size: 11px;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .learn-a {
          font-size: 11px;
          color: #475569;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .learn-btn {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid #1d4ed8;
          background: #1d4ed8;
          color: #fff;
          cursor: pointer;
          font-size: 12px;
          flex-shrink: 0;
        }
        .learn-btn.secondary {
          background: #fff;
          color: #1d4ed8;
        }
        .learn-saved {
          font-size: 11px;
          color: #047857;
          font-weight: 600;
        }
        .link-btn {
          background: none;
          border: none;
          padding: 0;
          margin-left: 6px;
          color: #2563eb;
          font-size: 11px;
          cursor: pointer;
          text-decoration: underline;
          font-family: inherit;
        }
      `;
