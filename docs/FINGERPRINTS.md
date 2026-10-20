# ATS Fingerprint Catalog & Verification Log

This document records verified selectors, URL structures, and DOM fingerprints for all supported Applicant Tracking Systems (ATS). Each fingerprint is scored as data in Odos's detection engine.

> **Verification Rule:** Every selector below was confirmed against real rendered DOM fixtures stored in `tests/fixtures/<ats>/`.

---

## 1. Greenhouse

### Signals & Weights
- **Hostnames (Weight: 20)**:
  - Legacy boards: `boards.greenhouse.io`, `boards.eu.greenhouse.io`
  - Modern boards: `job-boards.greenhouse.io`, `job-boards.eu.greenhouse.io`
  - API endpoints: `boards-api.greenhouse.io`
- **Embed Markers on Custom Domains (Weight: 35)**:
  - DOM container: `#grnhse_app`, `iframe#grnhse_iframe`
  - Embed script: `script[src*="greenhouse.io/embed/job_board"]`
  - URL parameters: `gh_jid`, `gh_src`
  - Custom integrations: Script sources referencing `*greenhouse*` (e.g. `careers.withwaymo.com` uses `sites/controllers/call_to_action/greenhouse/...`)
- **DOM Form Roots (Weight: 30)**:
  - Classic: `form#application_form`, `#application`
  - Modern React board: Form containers inside `#app` with Greenhouse question identifiers

### Verified Field Selectors
| Field | Classic Board (`greenhouse_classic.html`) | Modern Board (`greenhouse_new_board.html`) |
|---|---|---|
| **First Name** | `#first_name`, `[name="job_application[first_name]"]` | `#first_name`, `input[name="first_name"]` |
| **Last Name** | `#last_name`, `[name="job_application[last_name]"]` | `#last_name`, `input[name="last_name"]` |
| **Email** | `#email`, `[name="job_application[email]"]` | `#email`, `input[name="email"]` |
| **Phone** | `#phone`, `[name="job_application[phone]"]` | `#phone`, `input[name="phone"]` |
| **Resume** | `#resume`, `input[name="job_application[resume]"]` | `input[type="file"][id*="resume"]` |
| **Location** | `#job_application_location`, `[name="job_application[location]"]` | `#location`, `[role="combobox"]` |
| **Custom Questions** | `[name^="job_application[answers_attributes]"]` | `input[id^="question_"]`, `textarea[id^="question_"]` |
| **Dropdowns** | Standard `<select>` elements | Custom `[role="combobox"]` widgets |

---

## 2. Lever

### Signals & Weights
- **Hostnames (Weight: 20)**:
  - `jobs.lever.co`, `jobs.eu.lever.co`
  - API endpoint: `api.lever.co`
- **URL Shape (Weight: 25)**:
  - `/<company>/<uuid>` (posting)
  - `/<company>/<uuid>/apply` (application form)
- **Embed Markers (Weight: 35)**:
  - `script[src*="lever.co"]`, `a[href*="jobs.lever.co"]`
- **DOM Form Root (Weight: 30)**:
  - `form#application-form`, `.application-form`, `.posting-page`

### Verified Field Selectors (`tests/fixtures/lever/lever_application.html`)
| Field | Selector / Name | Notes |
|---|---|---|
| **Full Name** | `input[name="name"]` | Lever uses a single full name field, not first/last. |
| **Email** | `input[name="email"]` | Standard email type. |
| **Phone** | `input[name="phone"]` | Standard phone type. |
| **Current Company** | `input[name="org"]` | Maps to `current_company`. |
| **LinkedIn URL** | `input[name="urls[LinkedIn]"]` | Explicit bracketed URL notation. |
| **GitHub URL** | `input[name="urls[GitHub]"]` | Explicit bracketed URL notation. |
| **Portfolio URL** | `input[name="urls[Portfolio]"]` | Explicit bracketed URL notation. |
| **Other URL** | `input[name="urls[Other]"]` | Explicit bracketed URL notation. |
| **Additional Info** | `textarea[name="comments"]` | Optional cover letter / comments. |
| **Resume File** | `input[name="resume"][type="file"]` | File input. |
| **Custom Questions** | `[name^="cards["]` | e.g. `cards[<uuid>][field0]`. Radio/checkbox groups and text. |
| **Security / CAPTCHA** | `.h-captcha`, `iframe[src*="hcaptcha.com"]` | **Invariant:** Detect and surface to user; do not bypass. |

---

## 3. Ashby

### Signals & Weights
- **Hostnames (Weight: 20)**:
  - `jobs.ashbyhq.com`
- **URL Shape (Weight: 25)**:
  - `/<company>/<uuid>` (posting)
  - `/<company>/<uuid>/application` (application form)
- **Embed Markers (Weight: 35)**:
  - `#ashby_embed`, `script[src*="jobs.ashbyhq.com"][src*="embed"]`, URL parameter `ashby_jid`
- **Client App Hook (Weight: 35)**:
  - `window.__appData` in initial script containing job board metadata
  - `script[src*="ashbyprd.com"]`

### Verified Field Selectors (`tests/fixtures/ashby/ashby_application.html`)
> **Important:** Ashby uses Vite + React with dynamic CSS module classes (e.g. `_input_d7ago_28`). **Never select by class name.** Always select by `name`, `id`, `type`, or `<label for="...">`.

| Field | Selector / Attribute | Notes |
|---|---|---|
| **Full Name** | `input[name="_systemfield_name"]`, `#_systemfield_name` | Maps to `full_name`. |
| **Email** | `input[name="_systemfield_email"]`, `#_systemfield_email` | Standard email input. |
| **Resume File** | `input[type="file"][accept*="pdf"]` | Resume upload field. |
| **Custom Text Questions** | `input[name="<uuid>"]`, `textarea[name="<uuid>"]` | Matched via associated `<label for="<uuid>">`. |
| **Radio Groups** | `input[type="radio"][id*="labeled-radio"]` | Options grouped by question UUID. |
| **Checkbox Groups** | `input[type="checkbox"][id*="labeled-checkbox"]` | Options grouped by question UUID. |
| **Location Autocomplete** | `input[aria-autocomplete="list"]` | Autocomplete combobox. |

---

## 4. Workday

### Signals & Weights
- **Hostnames (Weight: 20)**:
  - `*.myworkdayjobs.com` (including `wd1`, `wd3`, `wd5`, `wd12` subdomains)
  - `*.myworkdaysite.com`
- **URL Shape (Weight: 25)**:
  - `/<locale>/<site>/job/<location>/<title>_<reqid>`
  - `.../apply`, `.../apply/applyManually`
- **Primary Hook (Weight: 40)**:
  - Universal `[data-automation-id]` attribute usage throughout the DOM.

### Verified Field Selectors (`tests/fixtures/workday/workday_listing.html`)
| Field | `data-automation-id` | Notes |
|---|---|---|
| **First Name** | `legalNameSection_firstName` | In personal info step. |
| **Last Name** | `legalNameSection_lastName` | In personal info step. |
| **Email** | `email` | In contact step. |
| **Phone Number** | `phone-number` | In contact step. |
| **Phone Device Type** | `phone-device-type` | Custom dropdown. |
| **Address Line 1** | `addressSection_addressLine1` | In address section. |
| **City** | `addressSection_city` | In address section. |
| **Postal Code** | `addressSection_postalCode` | In address section. |
| **Resume Upload** | `file-upload-input-ref` | File input ref. |
| **Navigation Next** | `bottom-navigation-next-button` | **Stop here:** Let human click Next. |
| **Dropdown / Combobox** | `button[aria-haspopup="listbox"]` | Custom listbox with `[role="option"]`. |

---

## 5. Site-Agnostic / Generic Heuristics

1. **JSON-LD Schema (`JobPosting`)**:
   - `script[type="application/ld+json"]` containing `"@type": "JobPosting"` (or in `@graph`).
   - Supplies `title`, `company` (`hiringOrganization.name`), `location` (`jobLocation.address`), and `description`.
2. **Generic Application Form Detection**:
   - Container has `<form>` or form role.
   - Contains an `input[type="file"]`.
   - Contains at least one contact field matching name, email, or telephone.
3. **Shadow DOM Piercing**:
   - Open shadow roots are recursively walked (`el.shadowRoot`) to discover inputs and labels.
