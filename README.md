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

## Installation & Setup

### 1. Clone & Navigate to Repository
```bash
git clone <repo-url>
cd Odos
```

### 2. Set Up Virtual Environment
```bash
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# On macOS/Linux:
source .venv/bin/activate
```

### 3. Install Package & Dependencies
```bash
# Editable install with dev dependencies (pytest)
pip install -e ".[dev]"

# Install Playwright browser binaries
playwright install chromium
```

### 4. Configure Secrets
Copy `.env.example` to `.env` and fill in your Gemini API key:
```bash
cp .env.example .env
```
In `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 5. Configure Profile and Answers
Ensure `data/profile.yaml` and `data/answers.yaml` are populated with your information:
- Edit `data/profile.yaml` with your personal contact info, work authorization, education, and experience.
- Place your PDF resume in `data/resumes/resume.pdf` (or update `resumes.default` in `data/profile.yaml`).
- Edit `data/answers.yaml` with your reusable answers.

---

## CLI Commands

```bash
# View help and available commands
jobassist --help

# Validate configuration and profile files (M1)
jobassist check-config

# Open browser to log in manually and persist session cookies (M2)
jobassist login

# Run form filling assistant on a job URL (M3/M4)
jobassist run <job_url> [--dry-run] [--resume <path>]

# List tracked applications (M6)
jobassist list

# Mark application status (M6)
jobassist mark <id> <status>
```

---

## Milestones Roadmap

- [x] **M0: Scaffold** - Repository structure, packaging, templates, CLI skeleton
- [ ] **M1: Config & Profile Loading** - Pydantic validation for config and profile YAML
- [ ] **M2: Browser Session** - Persistent Chrome session via Playwright
- [ ] **M3: Agent Loop (Read-Only)** - Gemini computer-use loop, screenshot & dry-run inspection
- [ ] **M4: Form Filling** - Fill actions (click, type, select, upload) using stored profile
- [ ] **M5: Safety Gates** - Domain allowlists, confirmation prompts, review before submit
- [ ] **M6: Tracker** - SQLite local job application tracker
- [ ] **M7: Tests & Polish** - Unit tests, local test form, end-to-end polish
