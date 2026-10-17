# Odos v2 Architecture Specification

## Overview
Odos v2 is a local-first browser extension (Manifest V3, Chrome first) written in TypeScript. It replaces the v1 Python/Playwright automation CLI with in-browser form prefilling, human-in-the-loop review, and automatic IndexedDB logging.

## Core Architectural Principles
1. **Human Submits**: No code path clicks or dispatches submission triggers on a submit button or form. Enforced by static code scanning and runtime `SubmitGuardViolationError`.
2. **One Tool, One Log**: Applications enter the log when the user triggers Odos.
3. **Local-First**: All data is stored in IndexedDB on the user's machine (via Dexie.js).
4. **Deterministic Before Generative**: Standard fields are populated using stored profiles and answer patterns. LLM is invoked only for unmatched open-ended questions.
5. **Minimal Footprint**: Content script bundle is strictly under 50 KB gzipped; prefill UI is rendered in a closed Shadow DOM to avoid host page CSS pollution or layout shift.
6. **Untrusted Input**: Page DOM and job descriptions are treated as data, never instructions.

## Component Layout
- `extension/src/core/`:
  - `models/`: Zod schemas and TypeScript types for `Profile`, `StoredAnswer`, `Job`, `Application`.
  - `storage/`: Dexie database schema and `StorageRepository` interface.
  - `dedupe.ts`: Canonical URL formatting and `dedupeKey` calculation.
  - `importer/`: Parser for v1 `profile.yaml` and `answers.yaml`.
- `extension/src/content/`:
  - Injected script running on matching ATS domains.
  - `submitGuard.ts`: Invariant 1 enforcement.
  - Shadow DOM UI for the prefill bar and review panel.
- `extension/src/background/`:
  - Ephemeral MV3 service worker.
  - Message router between content scripts, popup, and storage.
  - Alarms and reminder scheduling (`chrome.alarms`).
- `extension/src/dashboard/`:
  - Full-tab options page (React 18 + Tailwind CSS).
  - Profile & Resumes editor.
  - Stored Answers editor.
  - Applications tracker.
  - Settings, backup/export, and wipe data.
- `extension/src/popup/`:
  - Quick popup for checking page recognition status and running Odos.
