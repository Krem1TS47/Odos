# Autofill research: how Simplify, Jobright and open-source fillers work, and where Odos stands

Last updated 2026-11-03. Sources are listed at the end. Simplify and Jobright are closed source, so their behaviour comes from their help centres, third-party reviews, and an open-source reconstruction of Jobright's extension. Treat claims about their internals as reconstructions, not confirmed implementation details.

## What the leading tools do

### Simplify Copilot (closed source)

- Builds a profile once and fills standard fields from it. Offers AI-written responses for open questions.
- Reuses a saved answer when **the exact same question** appears again (help centre). Wrong answers are often a bad stored answer, not a fill failure.
- Optional "continuously autofill multipage forms": after you start, it moves through supported pages; otherwise you start each page.
- Per-field toggles ("Fields to autofill") let users turn categories off without deleting data.
- Unsupported sites fall back to a copy-paste view of the profile plus a "request support" button.
- Reviewers report strong results on Greenhouse and Lever and inconsistent results elsewhere, especially custom dropdowns for school, degree and location.

### Jobright (closed source; behaviour from the open-source reconstruction)

The reconstruction is local-only and has no LLM. Its architecture is the most detailed public description of a production-grade filler:

1. **Wait for the page to settle** (DOM quiet for 400 ms) before scanning.
2. **Resume first**, because Workday parses the resume and overwrites fields.
3. **Site adapters only for site quirks** (Workday repeatable panels, Next button). Everything else is a generic engine.
4. **Field scan** with a fixed precedence: comboboxes before text inputs (so the inner input is not double-counted), radios grouped by name or fieldset, Yes/No button groups (Ashby) with the hidden mirror checkbox skipped, rich-text editors, hidden file inputs behind "Attach" buttons.
5. **Question text** read the way a person reads it: Workday `formField-*` label, `aria-labelledby`, `label[for]` or wrapping label preferring its "label"-class child (strips Lever's helper text), `aria-label`, text just before the field, placeholder. If the label is a button word ("Attach"), look outward to the group label.
6. **Classify question → key** with an ordered regex list, most specific first, with `short: true` (only for field-name-like labels) and `not:` exclusions. Learned answers by exact question (0.90), answer bank (all pattern words must appear, 0.88), rules (0.85–0.92), attribute hints (0.70–0.75).
7. **Resolve key → answer** with alternates (`United States`, `USA`, `US`), booleans, "decline" answers, or an explicit **flag for the human** (consent boxes, unknown country-specific eligibility).
8. **Match options** (exact 1.0, prefix 0.9, whole-word contains 0.85, reverse contains 0.8, Jaccard × 0.8). Ties between non-exact options are capped at 0.55 so a coin flip never counts as sure.
9. **Decide:** confidence = classification × match. Below 0.55 flag, 0.55–0.75 fill and flag "check this", above 0.75 fill.
10. **Custom dropdowns:** full pointer sequence, type, wait up to 2.5 s (Workday needs Enter), wait for the list to stop changing, pick, verify the displayed value. Queries tried in order: answer, shorter form, alternate, empty query.
11. **Rescan** after each pass, because answers reveal follow-up questions; keep watching 5 s for late sections.
12. **Learning:** flagged question fields (3+ words, never passwords/SSN/DOB) get change/blur listeners. When the user answers, a proposal is queued and shown in the side panel with ✓/✕.
13. **Multi-page:** clicks Next, waits for the page signature to change, stops at review/submit pages, validation errors, or flagged required fields.
14. **Invisible until Fill:** no DOM changes before the user presses Fill, to avoid breaking React hydration.
15. **Frames:** the background fans the Fill message to every frame; each frame decides whether it has a form.

### Other open-source fillers studied

- **autocomplete (Sri-Ln)**, live-traced on Workday tenants: popups attributed by aria-controls or "appeared since the click", never "any listbox"; pill lists excluded; catalogue prompts search only on Enter; read options only after the list stops growing; never send Escape when nothing is open (it cancels the last answer); blur the field after picking (Workday keeps a pick only once focus leaves).
- **Workday-Autofill-Assistant, Punto, workday-autofill:** native setter + input/change for React; Enter (keydown, keypress, keyup with key codes) for Workday search; button-style dropdowns open a portal listbox.
- **Auto-Apply-Helper (Greenhouse):** react-select via focus, full pointer click on the input, prototype setter + input event, wait for `react-select-<id>-listbox`, click the best option.
- **react-select source:** opens on control mousedown once the input is focused; input blur clears the input and closes the menu; Enter selects the focused option.

## Odos parity

| Capability | Jobright reconstruction | Odos |
|---|---|---|
| Wait for page to settle before scanning | Yes | Yes |
| Host-first adapter selection | Yes | Yes |
| Combobox scanned before its inner input | Yes | Yes |
| Radio / checkbox groups by name or container | Yes | Yes |
| Yes/No toggle button groups (Ashby) | Yes | Yes, with a submit guard |
| Question text without helper/error text | Yes | Yes |
| Ordered classification rules with exclusions | Yes | Yes |
| Answer bank with scored matching | Yes | Yes (scored lexical + optional on-device semantic tier) |
| Confidence floor, "check this" band | Yes | Yes (verified / to check / needs review) |
| Ties between non-exact options capped | Yes | **No** (first best wins) |
| Dropdown: pointer sequence, type, Enter, settle, verify | Yes | Yes |
| Dropdown: shorter / alternate / empty queries | Answer, short, alternate, empty | Answer, one shorter form |
| Rescan for follow-up questions | Repeated + 5 s watch | One extra pass |
| Learning from answers typed on the page | Yes (✓/✕) | Yes (✓/✕ in the panel) |
| Frames: only the frame with the form fills | Yes | Yes |
| Resume first | Yes | Workday skipped by design; others in field order |
| Fill modes: only empty fields / only focused field | Yes | **No** (overwrites) |
| Multi-page Next navigation (Workday) | Yes | **No** |
| Rich-text editors via paste event | Yes | contenteditable via insertText only |
| Hidden file inputs behind "Upload" buttons (SuccessFactors) | Yes | **No** |
| Diagnostics | Live-scan test | Console table, Copy diagnostics, `npm run scan` |

## Recommended next steps, in order

1. **Only-empty fill mode as the default**, with "overwrite" as an option. Prevents Odos from replacing values the user or a resume parser already set.
2. **Tie cap** in `dropdownResolver.resolveOption`: two non-exact options at the same score must not auto-select.
3. **Answer alternates** in the profile (`United States` / `USA` / `US`, school abbreviations) and an empty-query last attempt for dropdowns.
4. **Continuous rescan** for a few seconds after filling, not a single pass.
5. **Workday multi-page:** click Next when no required field is flagged, stop at Review. Never Submit.
6. **Resume first** on Greenhouse/Lever/Ashby when the site parses resumes into fields.
7. **Rich-text paste** for Quill/Draft.js/ProseMirror editors.

## Sources

- [Simplify help: Manage Copilot autofill settings](https://help.simplify.jobs/en/articles/8686025-manage-copilot-autofill-settings)
- [Simplify help: Use Copilot to autofill applications](https://help.simplify.jobs/en/help/articles/2415391-autofill-skills-on-job-application)
- [Simplify help: Autofill not supported?](https://help.simplify.jobs/articles/8717287-autofill-not-supported)
- [Simplify Copilot review (Jobright blog)](https://jobright.ai/blog/simplify-copilot-review-2026-features-pricing-and-top-alternatives/)
- [Simplify extension review (HirePilot)](https://hirepilot.co/simplify-extension-review-does-it-actually-work/)
- [reverse-engineered-jobright (open-source reconstruction)](https://github.com/danishhraza/reverse-engineered-jobright)
- [Jobright vs Simplify (JobWizard, a competitor)](https://jobwizard.ai/blog/jobright-vs-simplify)
- [Sri-Ln/autocomplete](https://github.com/Sri-Ln/autocomplete), [Workday-Autofill-Assistant](https://github.com/ankitsharma38/Workday-Autofill-Assistant), [Punto](https://github.com/puneet20011/Punto), [workday-autofill](https://github.com/Prajay-vats/workday-autofill), [Auto-Apply-Helper](https://github.com/Kaitzz/Auto-Apply-Helper)
- [react-select Select.tsx](https://github.com/JedWatson/react-select/blob/master/packages/react-select/src/Select.tsx)
