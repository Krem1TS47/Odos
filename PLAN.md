# PLAN.md: Local Job Application Assistant (Gemini + Playwright)

> **Instructions for Gemini CLI:** Read this whole file before writing any code. Build the project milestone by milestone, in order. After each milestone, stop, summarize what you built, show me how to run it, and wait for my go-ahead. Do not add features outside the scope below. Ask me before installing anything not listed in this plan.

---

## 1. Goal

A command-line tool, run **locally on my machine only**, that uses the Gemini Computer Use model to drive a visible Chrome window and **fill out job application forms** using my stored profile, resume, and saved answers.

The tool **never clicks the final Submit button on its own.** It fills the form, stops, and asks me to review and confirm.

## 2. Scope

### In scope (v1)
- Single-user, local CLI app
- Visible (non-headless) Chromium/Chrome browser via Playwright
- Reusable browser profile so I can log in manually once and stay logged in
- Profile + answers loaded from local YAML files
- Agent loop: screenshot -> Gemini -> action -> execute -> repeat
- Human confirmation before submit and before any risky action
- Local application tracker (SQLite)
- Local logs and screenshots of each run

### Out of scope (do NOT build)
- Web UI, server, API, Docker, cloud deployment, or authentication
- Scraping or searching for jobs. I will paste the job URL myself.
- Bulk or unattended "apply to everything" mode
- CAPTCHA solving, anti-bot-detection evasion, stealth flags, or fingerprint spoofing
- Auto-creating accounts or handling email verification
- Multi-user support, billing, or analytics

## 3. Design principles

1. **Human in the loop.** Review before submit is mandatory, not optional.
2. **Local and private.** My personal data never leaves the machine except in prompts/screenshots sent to the Gemini API.
3. **Bounded.** Hard limits on turns, time, and allowed domains per run.
4. **Honest.** The agent only uses facts from my profile and answers files. If a required answer is missing, it must pause and ask me instead of inventing one.
5. **Simple.** Plain Python modules, minimal dependencies, readable code.

## 4. Tools and prerequisites

### Accounts and access
| Item | Notes |
|---|---|
| Google AI Studio account | Create a Gemini API key at aistudio.google.com |
| Gemini Computer Use model access | May require requesting access. **Verify the current model ID in the official Gemini API docs** (computer use section) before hardcoding it. |

### Software
| Tool | Purpose |
|---|---|
| Python 3.11+ | Main language |
| `uv` (or `pip` + `venv`) | Dependency and virtualenv management |
| Google Chrome (stable) | Browser the agent drives |
| Node.js 20+ | Only needed to run Gemini CLI itself |
| Git | Version control |

### Python packages
| Package | Purpose |
|---|---|
| `google-genai` | Gemini API client |
| `playwright` | Browser control (run `playwright install chromium` afterward) |
| `pydantic` | Validate config and profile data |
| `pyyaml` | Load YAML config/profile files |
| `python-dotenv` | Load `.env` secrets |
| `typer` | CLI commands |
| `rich` | Readable terminal output and confirmation prompts |
| `pytest` | Tests |

SQLite is used via Python's built-in `sqlite3`. No extra package needed.

## 5. Project structure

```
job-assistant/
├── PLAN.md
├── README.md
├── pyproject.toml
├── .env                  # secrets (never commit)
├── .env.example
├── .gitignore
├── config.yaml           # runtime settings
├── data/
│   ├── profile.yaml      # my personal info (never commit)
│   ├── answers.yaml      # reusable answers to common questions (never commit)
│   ├── resumes/          # PDFs/DOCX I upload to forms (never commit)
│   ├── browser_profile/  # persistent Chrome profile (never commit)
│   ├── tracker.db        # SQLite application tracker (never commit)
│   └── runs/             # per-run logs + screenshots (never commit)
├── src/jobassist/
│   ├── __init__.py
│   ├── cli.py            # Typer commands
│   ├── config.py         # Pydantic settings loader
│   ├── profile.py        # profile/answers loading + lookup
│   ├── browser.py        # Playwright session management
│   ├── agent.py          # Gemini computer-use loop
│   ├── actions.py        # Execute model-requested UI actions
│   ├── safety.py         # Allowlist, turn limits, confirmation gates
│   ├── tracker.py        # SQLite tracker
│   └── logging_utils.py  # Run logs and screenshots
└── tests/
```

## 6. Configuration

### 6.1 `.env`
```
GEMINI_API_KEY=your_key_here
```
`.env.example` must contain the same key with a blank value. `.env` must be in `.gitignore`.

### 6.2 `config.yaml`
```yaml
model:
  name: "VERIFY_IN_DOCS"        # Gemini computer-use model ID
  temperature: 0.2

browser:
  channel: "chrome"             # use installed Chrome
  headless: false               # must stay false
  user_data_dir: "data/browser_profile"
  viewport: { width: 1280, height: 900 }
  slow_mo_ms: 150               # small delay between actions

limits:
  max_turns: 40                 # hard cap on agent loop iterations per run
  max_runtime_seconds: 900
  max_applications_per_session: 3

safety:
  allowed_domains: []           # e.g. ["boards.greenhouse.io", "jobs.lever.co"]; empty = prompt me per new domain
  require_confirm_before_submit: true     # must stay true
  require_confirm_on:
    - "submit"
    - "send application"
    - "payment"
    - "delete"
  blocked_actions: []

paths:
  profile: "data/profile.yaml"
  answers: "data/answers.yaml"
  resumes_dir: "data/resumes"
  runs_dir: "data/runs"
  tracker_db: "data/tracker.db"
```

### 6.3 `data/profile.yaml` (template)
```yaml
personal:
  first_name: ""
  last_name: ""
  email: ""
  phone: ""
  location: { city: "", region: "", country: "" }
  linkedin: ""
  github: ""
  portfolio: ""

work_authorization:
  authorized_to_work_in: []
  requires_sponsorship: false

preferences:
  desired_salary: ""
  notice_period: ""
  willing_to_relocate: false
  remote_preference: ""

disclosures:
  at_least_18_years_of_age: true
  is_government_official: false
  has_government_official_relative: false

demographics:
  gender: ""
  race: ""
  disability_status: ""
  veteran_status: ""

education:
  - school: ""
    degree: ""
    field: ""
    start: ""
    end: ""

experience:
  - company: ""
    title: ""
    start: ""
    end: ""
    summary: ""

resumes:
  default: "data/resumes/resume.pdf"
```

### 6.4 `data/answers.yaml` (template)
```yaml
# Reusable answers to common free-text questions.
# The agent may only reuse these. It must ask me if nothing matches.
why_interested_template: ""
strengths: ""
biggest_achievement: ""
how_did_you_hear: "Company website"
custom: {}
```

### 6.5 `.gitignore` must include
```
.env
data/
__pycache__/
.venv/
*.pyc
```

## 7. Milestones

### M0: Scaffold
- Create the structure above, `pyproject.toml`, `.env.example`, `.gitignore`, template config/profile/answers files
- `README.md` with setup steps
- **Done when:** `uv sync` (or pip install) works and `jobassist --help` prints commands

### M1: Config and profile loading
- Pydantic models for `config.yaml`, `profile.yaml`, `answers.yaml`
- Clear error messages for missing or invalid fields
- **Done when:** `jobassist check-config` validates everything and reports problems

### M2: Browser session
- Playwright launches Chrome with the persistent profile, non-headless
- Command `jobassist login` opens the browser so I can log into sites manually, then closes cleanly
- **Done when:** a login persists across separate runs

### M3: Agent loop (read-only first)
- Implement the Gemini computer-use loop: take screenshot -> send with task and tool config -> receive action -> execute -> send result -> repeat
- First version only supports navigate, scroll, and screenshot; no typing or clicking yet
- Enforce `max_turns` and `max_runtime_seconds`
- Save a screenshot and log line per turn in `data/runs/<timestamp>/`
- **Done when:** `jobassist run <url> --dry-run` navigates to the page, describes the form fields it sees, and exits

### M4: Form filling
- Add click, type, select, and file upload actions
- Inject profile and answers as context in the prompt, with rules: use only provided data, never invent facts, pause and ask if a required answer is missing
- Resume upload from `resumes.default`
- **Done when:** on a test form, fields are filled correctly and the agent stops before submit

### M5: Safety gates
- Domain allowlist check before navigation; prompt me to approve new domains
- Confirmation prompt (via `rich`) before any action matching `require_confirm_on`
- Final review step: summarize every field filled, then ask me to submit manually or approve the click
- Stop immediately and hand control to me if a CAPTCHA, login wall, or unexpected page appears
- **Done when:** the agent can never submit without my explicit confirmation (add tests proving this)

### M6: Tracker
- SQLite table: id, company, role, url, date, status (`filled`, `submitted`, `abandoned`, `error`), notes, run folder path
- Commands: `jobassist list`, `jobassist mark <id> <status>`
- **Done when:** each run creates or updates a tracker row

### M7: Tests and polish
- Unit tests: config loading, safety gates, tracker, profile lookup
- A local static HTML test form to exercise the agent without touching real sites
- Final README with usage examples
- **Done when:** `pytest` passes and the test form is filled end to end

## 8. CLI commands (target)

```
jobassist check-config
jobassist login
jobassist run <job_url> [--dry-run] [--resume <path>]
jobassist list
jobassist mark <id> <status>
```

## 9. Agent prompt rules (to embed in the system prompt)

1. Use only information from the provided profile and answers. Never fabricate experience, credentials, or dates.
2. If a required field has no matching data, stop and ask me.
3. Never click a final submit/send button. Stop and report when the form is complete.
4. Never enter payment info, government ID numbers, or passwords.
5. If you see a CAPTCHA, a login wall, or anything unexpected, stop and report.
6. Do not navigate away from the application domain unless I approve.
7. Keep each turn's action minimal and verify the result with the next screenshot.

## 10. Risks and notes

- Many job sites prohibit automated applications in their terms of service and may use bot detection. Use this for assisted form-filling on sites where I am comfortable doing so, with a human reviewing every application.
- Screenshots of forms containing my personal data are sent to the Gemini API. Do not use this on pages showing sensitive data I don't want shared.
- Computer-use models can misread fields or click the wrong thing. Review everything before submitting.
- Costs are billed per token through the Gemini API. The turn and runtime limits exist to keep runs bounded; log approximate token usage per run if the API returns it.
- Model names and API shapes for computer use change. Check the current official Gemini API documentation before implementing M3.

## 11. Definition of done (v1)

I can run `jobassist run <url>` on a real application page, watch Chrome fill the form from my profile, review a summary, and submit it myself, with a log, screenshots, and a tracker entry saved locally, and with no network services running beyond calls to the Gemini API.
