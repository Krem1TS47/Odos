# ADR-001: IndexedDB as the Primary Source of Truth for v2

## Status
Accepted

## Context
Odos v1 stored user applications in a local SQLite database (`data/tracker.db`) and user profiles/answers in YAML files (`data/profile.yaml`, `data/answers.yaml`), driven by a Python CLI and Playwright. 
In practice:
1. Automated Playwright/CDP sessions were scored and blocked by invisible bot detection (Cloudflare, DataDome, Greenhouse).
2. Odos v2 moves inside the user's real browser as a Manifest V3 Chrome extension.
3. We considered whether to maintain a local Python/Tauri companion daemon running SQLite and communicate with the extension via Chrome Native Messaging, or make IndexedDB inside the browser extension the primary source of truth.

## Decision
For v2, the primary source of truth is IndexedDB inside the extension (managed via Dexie.js).
1. A standalone local companion process (Python or Tauri) is deferred. If one is added in the future, it will communicate via native messaging and the extension remains the primary client.
2. Full JSON backup/restore and CSV export will be provided in the extension dashboard to guarantee data portability.
3. The v1 Python codebase moves to `legacy/` as an archived, read-only reference.

## Consequences
- **Pros**:
  - Zero local daemon installation or background process management for users.
  - Zero socket / native messaging connection failures or OS permission hurdles.
  - Instant prefill (< 1 second) directly from in-memory/IndexedDB queries.
  - Complete local-first privacy (no telemetry, no remote servers).
- **Cons**:
  - IndexedDB storage is scoped to the browser profile. Full backup/restore features are essential to protect against accidental browser profile deletion.
