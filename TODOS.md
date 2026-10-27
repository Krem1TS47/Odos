# TODOS

## Infrastructure

### Move vendored `.agents/skills/**` reference docs out of the product repo

**What:** Replace the 217 vendored agent-guide files (chrome-extensions, modern-web-guidance; ~34k lines added in 3bb3c75) with the skills-lock.json pin plus an install step, so the repo carries only product code.

**Why:** The docs are not built, tested or shipped; they inflate clones, diffs and code search and dominated the review diff for the dropdown-handling work.

**Context:** skills-lock.json already records the skills and their provenance. Start by checking the install mechanism it implies, delete `.agents/skills/*`, and document the install step in README so agents working in the repo can fetch the guides locally.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Answer matching

### Hosted LLM provider for the SemanticMatcher (user key, explicit opt-in)

**What:** A second SemanticMatcher provider calling a hosted model (Claude API) with a user-supplied key behind a settings opt-in, using the same constrained output (one stored answer id / option index / none + confidence) and the 0.75 acceptance gate as the on-device provider.

**Why:** Chrome's on-device model is not available on every machine (version, disk, GPU). Machines without it get only the lexical matcher, so paraphrased custom questions stay unfilled there.

**Context:** Decided at plan-eng-review D8/D19 (2026-10-26): ship lexical + on-device first, then measure how often runs fall back to lexical-only. If that is most runs, this becomes the main lever on fill rate. Privacy posture must be explicit: only question text, section heading, field options and the answer bank are sent; nothing is sent without the opt-in. Start: implement HostedProvider against the SemanticMatcher interface; add the opt-in toggle and key field to dashboard settings; mark AI-sourced fills with source "ai" in the panel.

**Effort:** M
**Priority:** P3
**Depends on:** SemanticMatcher interface and on-device provider (eng review R6) shipped

## QA

### Real-browser end-to-end runs against live ATS pages

**What:** A repeatable browser run (gstack /qa or a Playwright script loading the unpacked extension) over a saved list of real Greenhouse, Lever, Ashby, Workday and generic postings, reporting filled / unverified / needs-review counts and screenshots.

**Why:** The regression net from the eng review is jsdom fixtures. jsdom cannot reproduce React-Select or Workday event handling, portal timing or the isolated-world boundary, which is where the "typed text into a dropdown" and "value shown but not registered" failures live.

**Context:** After the fill-contract, classifier, matcher and learning-loop work (eng review R1-R15) lands, run 5-10 postings per ATS and record fill rate and unverified rate as the baseline for "Odos does not fill enough". Live pages change and need public postings or test accounts, so this is a scheduled manual-assisted run, not CI. Start: /qa with the eng-review Test Plan artifact as input.

**Effort:** M
**Priority:** P2
**Depends on:** Eng review tasks R1-R15 implemented; an unpacked build

## Completed
