# ADR-001: IndexedDB as the Primary Source of Truth

## Status
Accepted

## Context
Odos runs as a local-first Manifest V3 Chrome extension inside the user's real browser profile.
We considered whether to maintain a standalone local companion daemon (running SQLite) communicating with the extension via Chrome Native Messaging, or make IndexedDB inside the browser extension the primary source of truth.

## Decision
The primary source of truth is IndexedDB inside the extension (managed via Dexie.js).
1. Running directly inside the browser extension eliminates external daemon installations, socket errors, and OS permissions.
2. Form prefill operations query local IndexedDB directly in under a second with zero network latency.
3. Full JSON backup/restore and CSV export are provided in the extension dashboard to guarantee complete data portability.

## Consequences
- **Pros**:
  - Zero local daemon installation or background process management for users.
  - Zero socket / native messaging connection failures or OS permission hurdles.
  - Instant prefill (< 1 second) directly from local IndexedDB queries.
  - Complete local-first privacy (no telemetry, no remote servers).
- **Cons**:
  - IndexedDB storage is scoped to the browser profile. Full backup/restore features are essential to protect against accidental browser profile deletion.
