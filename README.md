# Odos: Local Job Application Assistant

A local command-line tool using the Gemini Computer Use model and Playwright to drive a visible Chrome window and assist in filling out job application forms using your stored profile, resume, and answers.

> **Safety Notice:** Odos **never** clicks the final Submit button on its own. It fills the form, stops, and prompts you to review and confirm.

---

## Prerequisites

- **Python 3.11+**
- **Google Chrome** (stable channel installed locally)
- **Google AI Studio Account & API Key** (with access to the Gemini Computer Use model)
- **Git**

---

## One-Time Setup

Perform these steps once when setting up the project on your machine.

### 1. Clone & Navigate to Repository
```bash
git clone <repo-url>
cd Odos
```

### 2. Create Virtual Environment
```bash
python -m venv .venv
```

### 3. Install Package & Dependencies
Activate the virtual environment first to install dependencies inside it:

**On Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
```

**On macOS/Linux:**
```bash
source .venv/bin/activate
```

Then install the package (in editable mode with dev dependencies) and download Playwright browser binaries:
```bash
pip install -e ".[dev]"
playwright install chromium
```

### 4. Configure Secrets (.env)
Copy `.env.example` to `.env` and set your Gemini API key:

**On Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**On macOS/Linux:**
```bash
cp .env.example .env
```

Inside `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 5. Configure Profile, Resume, and Answers
Set up your personal data inside the `data/` directory:
- **Profile:** Edit `data/profile.yaml` with your contact details, work authorization, education, and experience.
- **Resume:** Place your resume PDF in `data/resumes/` (e.g., `data/resumes/resume.pdf` or update `config.yaml`).
- **Answers:** Edit `data/answers.yaml` with answers to common job application questions.

---

## Running the Application (Every Time)

Run these commands each time you want to boot and use Odos in a new terminal session.

### 1. Activate Virtual Environment
Open your terminal in the project root directory and activate the virtual environment:

**On Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
```

**On macOS/Linux:**
```bash
source .venv/bin/activate
```

### 2. Run Odos Commands

#### Validate Configuration (Optional Sanity Check)
```bash
jobassist check-config
```

#### Launch the Job Application Assistant
Start the assistant to fill out a job application at a target URL or local HTML file:
```bash
jobassist run <job_url>
```

Options:
- `--dry-run`: Read-only mode to inspect the form without filling in fields.
- `--resume <path>` / `-r <path>`: Override the default resume file for this run.
- `--company <name>`: Specify or override company name for the tracker.
- `--role <title>`: Specify or override job role/title for the tracker.
- `--headless`: Run browser in headless mode (useful for automated testing/scripts).
- `--config <path>` / `-c <path>`: Path to custom `config.yaml`.

```bash
# Example: Dry-run inspection
jobassist run https://example.com/jobs/123 --dry-run

# Example: Run with a specific resume
jobassist run https://example.com/jobs/123 --resume data/resumes/resume.pdf

# Example: Run against the local static test form
jobassist run data/test_form.html
```

#### Additional Session Commands
- **Manual Login Session:** Open a persistent Chrome session to log in to job boards and save cookies:
  ```bash
  jobassist login
  ```
  Options: `--url <url>` / `-u <url>` to navigate directly to a login portal.

- **List Tracked Applications:** View logged applications and their statuses:
  ```bash
  jobassist list
  ```
  Options:
  - `--status <status>` / `-s <status>`: Filter by status (`filled`, `submitted`, `abandoned`, `error`).
  - `--limit <n>` / `-n <n>`: Limit number of displayed applications.

- **Update Application Status:** Update the status of an application (e.g., `filled`, `submitted`, `abandoned`, `error`):
  ```bash
  jobassist mark <id> <status> [--notes <notes>]
  ```

- **Help Menu:**
  ```bash
  jobassist --help
  ```

---

## Testing & Local Simulation

### 1. Local Test Form
Odos provides a realistic static job application form in `data/test_form.html` to exercise the assistant end-to-end without interacting with live job boards:
```bash
# Dry-run inspection on test form
jobassist run data/test_form.html --dry-run

# Form filling on test form
jobassist run data/test_form.html
```

### 2. Automated Test Suite
Run the test suite using `pytest`:
```bash
pytest
```
The test suite covers:
- Configuration and schema validation (`tests/test_config.py`)
- Candidate profile and answers loading and context formatting (`tests/test_profile.py`)
- Browser session and Playwright management (`tests/test_browser.py`)
- Action execution: typing, selecting, clicking, uploading, scrolling (`tests/test_actions.py`)
- Safety gates, domain allowlists, blocker detection, and confirmation prompts (`tests/test_safety.py`)
- SQLite application tracker and job detail extraction (`tests/test_tracker.py`)
- CLI command tests for check-config, login, run, list, and mark (`tests/test_cli.py`)
- End-to-end form inspection and filling on `test_form.html` (`tests/test_e2e_form.py`)

---

## Milestones Roadmap

- [x] **M0: Scaffold** - Repository structure, packaging, templates, CLI skeleton
- [x] **M1: Config & Profile Loading** - Pydantic validation for config and profile YAML
- [x] **M2: Browser Session** - Persistent Chrome session via Playwright
- [x] **M3: Agent Loop (Read-Only)** - Gemini computer-use loop, screenshot & dry-run inspection
- [x] **M4: Form Filling** - Fill actions (click, type, select, upload) using stored profile
- [x] **M5: Safety Gates** - Domain allowlists, confirmation prompts, review before submit
- [x] **M6: Tracker** - SQLite local job application tracker
- [x] **M7: Tests & Polish** - Unit tests, local test form, end-to-end polish
