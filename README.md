# Odos: Local-First Job Application Hub

A fast, local-first Manifest V3 browser extension (Chrome first) that fills job applications deterministically in under a second, keeps the human as the sole reviewer and submitter, and automatically logs every application into local IndexedDB.

> **Safety Notice:** Odos **never** clicks the final Submit button. It fills the form, presents a review panel in a closed Shadow DOM, and requires you to review and submit the application yourself.

---

## Architecture & Principles

1. **Real Browser Profile**: Runs inside your normal everyday browser, eliminating invisible score-based bot detection.
2. **Deterministic-First**: Fills form fields using structured profiles and stored answer patterns. LLMs are invoked only for unmatched open-ended questions.
3. **Local-First & Private**: All profile data, resumes, stored answers, and application histories are stored locally in IndexedDB (via Dexie.js). No server, no telemetry.
4. **Performance Budget**: Content script bundle is under 50 KB gzipped with zero external runtime UI frameworks on host pages.

---

## Getting Started (Development)

### Prerequisites
- **Node.js 20+**
- **npm 10+**
- **Google Chrome**

### Setup & Build
1. Install dependencies:
   ```powershell
   npm install
   ```

2. Run typecheck and unit tests:
   ```powershell
   npm run typecheck
   npm test
   ```

3. Build the extension:
   ```powershell
   npm run build
   ```
   The built extension will be located in `extension/dist/`.

4. Check the content script performance budget:
   ```powershell
   npm run check-budget
   ```

### Loading the Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the directory:
   `C:\Users\benbe\Projects\Personal Projects\Odos\extension\dist`
4. The Odos extension icon will appear in your browser toolbar. Click it to open the popup or access the full-tab Dashboard.


