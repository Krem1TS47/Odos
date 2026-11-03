# Odos: Local-First Job Application Autofill

Odos is a Manifest V3 Chrome extension that fills job applications from your own profile and answer bank, shows you what it did in a review panel, and logs every application locally. Nothing leaves your machine.

> **Safety:** Odos never clicks the final Submit button. It fills, you review, you submit.

---

## Contents

1. [How Odos gets its data (read this first)](#1-how-odos-gets-its-data-read-this-first)
2. [First-time setup](#2-first-time-setup)
3. [The update loop: after every code or config change](#3-the-update-loop-after-every-code-or-config-change)
4. [Using Odos on an application](#4-using-odos-on-an-application)
5. [Teaching Odos new answers](#5-teaching-odos-new-answers)
6. [Troubleshooting](#6-troubleshooting)
7. [Diagnosing a page that fills badly](#7-diagnosing-a-page-that-fills-badly)
8. [Supported sites](#8-supported-sites)
9. [Development](#9-development)

---

## 1. How Odos gets its data (read this first)

Odos fills from data **stored inside the extension** (IndexedDB), not from the YAML files directly.

```
config/profile.yaml ─┐
config/answers.yaml ─┼─ npm run build ─► bundled into extension/dist ─► copied into the
config/resumes/*.pdf ┘                                                   extension's database
                                                                          on install / reload
                                                                                 │
                                         Dashboard edits and answers ────────────┤
                                         learned on pages                        ▼
                                                                         what Odos fills from
```

Rules for that copy:

- **First install:** profile, answers and resume are copied from the bundle.
- **Later builds:** after you rebuild and reload the extension, the profile is re-copied **only if you have not edited it in the dashboard since the last sync**. Bundled answers are always updated (by their `ans_N` id); answers you taught Odos on pages are never touched.
- **When they differ:** the dashboard shows a blue banner, "Odos is not using your latest config files", listing what differs, with a **Reload from YAML** button. That button overwrites the stored profile with the YAML version (uploaded resumes are kept).

If Odos fills old or missing values, this is the first thing to check.

### What to put in the YAML

Odos can only fill what it knows. Fields commonly left blank because the data is missing:

| Question on forms | Where Odos reads it | Add it to |
|---|---|---|
| Gender, race, veteran, disability | Stored answers (category `demographic`) | `config/answers.yaml` |
| Street address, postal code | Profile address | Dashboard → Profile → Address |
| Earliest start date, notice period, years of experience, salary, relocation | Profile preferences | Dashboard → Profile → Availability & Preferences |
| Pronouns, Twitter/X | Profile contact | Dashboard → Profile → Contact |
| Custom screening questions | Stored answers | `config/answers.yaml`, or teach Odos on the page (section 5) |

In `config/answers.yaml`, write several phrasings per question under `patterns`. Matching is by meaning-carrying words, so "How did you hear about this job?" also matches "How did you hear about us?", but a one-word pattern such as `Race` only matches short labels. Answers with `answer: ""` are ignored.

---

## 2. First-time setup

### Prerequisites

- Node.js 20+ and npm 10+
- Google Chrome (Edge and Brave work the same way)

### Install dependencies

```bash
npm install
```

**Behind a corporate proxy** (error `SELF_SIGNED_CERT_IN_CHAIN`): export your system certificates and point npm at them once.

macOS:

```bash
security find-certificate -a -p /Library/Keychains/System.keychain /System/Library/Keychains/SystemRootCertificates.keychain > ~/.npm-ca.pem
npm config set cafile ~/.npm-ca.pem
npm install
```

Windows (PowerShell): ask IT for the proxy root certificate (`.pem` or `.cer`), then `npm config set cafile C:\path\to\root.pem`.

### Fill in your data

Edit `config/profile.yaml` and `config/answers.yaml`, and put your resume at the path named in `profile.yaml` (default `config/resumes/<name>.pdf`).

### Build

```bash
npm run build
```

The build prints a **build id** such as `Build id: 20261103-1530`. The extension is written to `extension/dist/`.

### Load into Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension/dist` folder **inside this repository**, for example:
   - macOS: `/Users/<you>/ben/Odos/extension/dist`
   - Windows: `C:\Users\<you>\...\Odos\extension\dist`
4. Check the Odos card: its version reads `2.0.0 (build <id>)` and the id matches the one your build printed.
5. Pin the Odos icon to the toolbar.

---

## 3. The update loop: after every code or config change

Refreshing the extension alone is **not** enough. Do all four steps, in order:

1. **Rebuild:** `npm run build`. Chrome runs what is in `extension/dist`, which only changes when you build.
2. **Reload the extension:** on `chrome://extensions`, click the circular arrow on the Odos card. Confirm the build id in the version matches the build you just ran.
3. **Reload the application tab** (Cmd/Ctrl+R). Tabs opened before the reload keep running the old content script, or none at all.
4. **If you changed YAML:** open the dashboard. If the blue banner appears, click **Reload from YAML**.

The review panel's subtitle also shows `build <id>`. If it shows a different id than your last build, Chrome is running old code.

---

## 4. Using Odos on an application

1. Open the **application form itself** (the page with the inputs), not the job description.
2. Click the Odos toolbar icon, then **Run Odos**, or press **Alt+Shift+O**.
3. Odos waits for the page to finish rendering, adds education/experience rows if the form has "+ Add" buttons, fills, then scans once more for questions that appeared because of earlier answers.
4. The review panel opens at the bottom right:
   - **Filled**: Odos set the value and the page shows it.
   - **to check**: Odos picked an option but the widget did not confirm it. Look at the field.
   - **Needs Review**: Odos left it blank, often with "closest: …" as a hint. Answer inline with **Fill** or **Fill & remember**.
5. Review the whole form and submit it yourself. Then click **Mark Submitted** (Odos also detects most confirmation pages on its own).

### Multi-page applications

On step-by-step applications (Workday, and wizards on other sites), Odos fills a page, clicks **Next** / **Save and Continue**, and fills the next one, under one application record. The panel shows the page number and step name. Odos stops, and tells you why, when:

| Stop | What to do |
|---|---|
| Reached the review page | Check everything and submit yourself. Odos never clicks Submit |
| Required fields need your answer | Answer them, then press **Continue** in the panel |
| The page shows errors, or did not change after Next | Fix the errors, then **Continue** |
| The Next button submits the page to the server | Click Next yourself. Odos fills the next page automatically when it loads |
| Page limit reached | **Continue** to keep going |

Greenhouse, Lever and Ashby applications are a single page, so Odos stops after filling. Turn automatic page advance off, or change the page limit, in **Dashboard → Settings → Multi-page applications**. Closing the panel stops a run.

Embedded forms (a company careers page with a Greenhouse or Lever form inside an iframe) are handled: only the frame that holds the form is filled.

On a careers site outside the built-in list, the first **Run Odos** click injects Odos into the tab and runs it. Pages Chrome protects (`chrome://`, the Web Store) cannot be filled.

---

## 5. Teaching Odos new answers

Odos learns from answers you give, in three ways:

- **On the page:** answer a question Odos left blank (or fix one marked "to check"). The panel shows **Remember for next time?** with that question and your answer. Click ✓ to save, ✕ to ignore.
- **In the panel:** use **Fill & remember** on a needs-review row.
- **On submit:** **Mark Submitted** offers to save every answer you typed by hand. If the panel was closed when the confirmation page appeared, those answers are saved as drafts with autofill off.

Saved answers appear in **Dashboard → Answers**, where you can edit their phrasings, change the answer, or turn autofill on or off.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing changes after editing code | Not rebuilt, or tab not reloaded | Section 3, all four steps |
| Old name, email, school or job filled | Stored profile older than YAML | Dashboard banner → **Reload from YAML** |
| Resume never attached | Resume not in the stored profile, or the site is Workday | Check Dashboard → Profile → Resumes. Workday uploads must be done by hand (Workday breaks on scripted uploads) |
| "No application form found in this tab" | You are on the job description, or the form has not loaded | Open the application page, wait for it to load, run again |
| "Odos cannot run on this page" | A browser-protected page | Use a normal tab |
| Panel shows a build id that is not your latest | Chrome loaded a different folder or an old build | `chrome://extensions` → Odos → **Details** → check the source path, then section 3 |
| Gender, address, start date, salary left blank | No data for them | Section 1, "What to put in the YAML" |
| A dropdown shows "to check" | The widget ignored the scripted click | Pick the option by hand. Then send diagnostics (section 7) |
| A custom question is left blank | No stored answer close enough | Answer it once on the page and click ✓ |
| Answer typed into the wrong field | Bug | Copy diagnostics (section 7) and report it |

---

## 7. Diagnosing a page that fills badly

**From the browser:**

1. Open DevTools (Cmd+Option+I / Ctrl+Shift+I) → **Console**, set the level filter to include **Verbose**.
2. Run Odos.
3. Expand `[Odos] run diagnostics — build …`: a table of every field with its question text, type, status, reason and value. `[Odos:combobox]` lines show each dropdown step (opened, typed, pressed Enter, which list it read, what it clicked).
4. In the panel, **Copy diagnostics** puts the same report on your clipboard.

The `reason` column explains each outcome:

| Reason | Meaning |
|---|---|
| `no_match` | No profile value or stored answer for this question |
| `no_option_match` | Odos had an answer but no option was a close enough match |
| `no_results:enter:…` | The dropdown's search returned nothing |
| `popup_not_found` | The dropdown's list never appeared |
| `selection_not_confirmed` | Odos clicked an option but the widget did not show it |
| `workday_upload_requires_human` | Workday resume upload, by design |

Multi-page runs also print a status line per page. The panel's page box gives the stop reason in plain words.

**Offline, from a saved page:** save the application page (File → Save Page As → "Webpage, HTML only"), then:

```bash
npm run scan -- ~/Downloads/application.html https://jobs.lever.co/company/id/apply
```

This prints the adapter Odos picks and, for every field, the question text it reads, what it maps to, and the value it would use. Site JavaScript does not run in a saved page, so custom dropdowns show `popup_not_found` there; everything else is accurate.

---

## 8. Supported sites

| ATS | Detection | Pages | Notes |
|---|---|---|---|
| Greenhouse (classic and job-boards) | host, form markers | single | React-Select dropdowns, async School/Location search |
| Lever | host, form markers | single | Native selects, radio and checkbox cards |
| Ashby | host, `_systemfield_` markers | single | Yes/No toggle buttons, location typeahead |
| Workday | host, `data-automation-id` markers | multi: footer "Save and Continue", stops at Review | Prompt typeaheads that search on Enter, "+ Add" sections. Resume upload is manual |
| Anything else | Generic adapter | multi: buttons labelled Next / Continue | Any page that looks like an application form |

Content scripts load automatically on Greenhouse, Lever, Ashby and Workday hosts. Elsewhere, Odos is injected when you click **Run Odos**.

---

## 9. Development

```bash
npm run typecheck   # TypeScript
npm test            # unit tests (vitest + jsdom), including behavioural simulations of react-select and Workday prompts
npm run build       # writes extension/dist and prints the build id
npm run scan -- <saved.html> [url]   # dry-run Odos on a saved real page
```

`npm run build` rewrites `extension/src/core/config/bundledConfig.json` (it contains your profile and resume). Do not commit it with personal data.

Where things live:

| Path | Responsibility |
|---|---|
| `extension/src/content/index.ts` | Content-script bootstrap and message listener only |
| `extension/src/content/run/applicationRun.ts` | One run across pages: fill, decide, advance, panel, submission |
| `extension/src/content/run/pageFill.ts` | Fill the step on screen |
| `extension/src/content/run/{messaging,fieldValues,learning,frameGate}.ts` | Background calls, reading field values, learning listeners, frame selection |
| `extension/src/core/navigation.ts` | PageNavigator contract, generic navigator, safe Next click |
| `extension/src/content/adapters/*` | Per-ATS detection, field discovery, and navigator |
| `extension/src/content/autofillEngine.ts` | Field → value → filler, under the verified-fill contract |
| `extension/src/core/*` | Classifier, label reading, matching, fillers, models, storage, settings |

Architecture and the reasoning behind the fill engine: `docs/AUTOFILL_RESEARCH.md` and the header of `extension/src/content/autofillEngine.ts`.
