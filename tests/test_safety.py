from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from jobassist.config import AppConfig, SafetyConfig
from jobassist.safety import (
    DomainNotAllowedError,
    SafetyError,
    check_action_safety,
    confirm_risky_action,
    detect_page_blockers,
    ensure_domain_allowed,
    extract_domain,
    is_action_blocked,
    is_confirm_required,
    is_domain_allowed,
)
from jobassist.agent import run_form_filling_agent
from jobassist.profile import (
    Demographics,
    Disclosures,
    PersonalInfo,
    ResumesConfig,
    UserAnswers,
    UserProfile,
    WorkAuthorization,
)


def test_extract_domain():
    assert extract_domain("https://boards.greenhouse.io/company/jobs/123") == "boards.greenhouse.io"
    assert extract_domain("http://jobs.lever.co/company") == "jobs.lever.co"
    assert extract_domain("mycompany.workday.com/en-US/apply") == "mycompany.workday.com"
    assert extract_domain("http://localhost:8000/test.html") == "localhost"
    assert extract_domain("file:///C:/Users/test/page.html") == ""
    assert extract_domain("") == ""


def test_is_domain_allowed():
    allowed = ["boards.greenhouse.io", "lever.co", "workday.com"]

    # Exact match
    assert is_domain_allowed("boards.greenhouse.io", allowed) is True

    # Subdomain match
    assert is_domain_allowed("jobs.lever.co", allowed) is True
    assert is_domain_allowed("mycorp.workday.com", allowed) is True

    # Case insensitive
    assert is_domain_allowed("BOARDS.GREENHOUSE.IO", allowed) is True

    # Disallowed domains
    assert is_domain_allowed("evilgreenhouse.io", allowed) is False
    assert is_domain_allowed("phishing-lever.co.uk", allowed) is False
    assert is_domain_allowed("google.com", allowed) is False

    # Empty allowlist
    assert is_domain_allowed("boards.greenhouse.io", []) is False


def test_ensure_domain_allowed_direct_and_session():
    allowed_list = ["greenhouse.io"]
    session_set = set()

    # Allowed by config
    assert ensure_domain_allowed("https://boards.greenhouse.io/job/1", allowed_list, session_set) is True

    # Disallowed without prompt raises DomainNotAllowedError
    with pytest.raises(DomainNotAllowedError) as exc:
        ensure_domain_allowed("https://unapproved.com/job/1", allowed_list, session_set)
    assert "unapproved.com" in str(exc.value)

    # Disallowed with prompt - user approves
    prompt_mock = MagicMock(return_value=True)
    assert ensure_domain_allowed("https://newsite.com/apply", allowed_list, session_set, prompt_fn=prompt_mock) is True
    prompt_mock.assert_called_once_with("newsite.com")
    assert "newsite.com" in session_set

    # Subsequent access uses session cache without calling prompt_fn again
    prompt_mock.reset_mock()
    assert ensure_domain_allowed("https://newsite.com/subpage", allowed_list, session_set, prompt_fn=prompt_mock) is True
    prompt_mock.assert_not_called()

    # Disallowed with prompt - user rejects
    prompt_reject = MagicMock(return_value=False)
    with pytest.raises(DomainNotAllowedError):
        ensure_domain_allowed("https://badsite.com", allowed_list, session_set, prompt_fn=prompt_reject)
    prompt_reject.assert_called_once_with("badsite.com")
    assert "badsite.com" not in session_set


def test_is_confirm_required_and_blocked():
    triggers = ["submit", "send application", "payment", "delete"]

    # Confirm required on matching actions
    assert is_confirm_required("click", "button[type='submit']", triggers) is True
    assert is_confirm_required("click", "#submit-application-btn", triggers) is True
    assert is_confirm_required("click", "Send Application", triggers) is True
    assert is_confirm_required("type_text", "payment_info credit card", triggers) is True
    assert is_confirm_required("click", "delete account", triggers) is True

    # Not required on normal form interactions
    assert is_confirm_required("type_text", "first_name John", triggers) is False
    assert is_confirm_required("select_option", "state California", triggers) is False
    assert is_confirm_required("click", "button#next-step", triggers) is False

    # Blocked actions
    blocked = ["delete", "remove", "pay"]
    assert is_action_blocked("click", "delete button", blocked) is True
    assert is_action_blocked("click", "#pay-fee", blocked) is True
    assert is_action_blocked("click", "next button", blocked) is False


def test_detect_page_blockers():
    # 1. Cloudflare title detection
    cf_page = MagicMock()
    cf_page.title.return_value = "Just a moment... Attention Required! | Cloudflare"
    assert "Cloudflare" in (detect_page_blockers(cf_page) or "")

    # 2. CAPTCHA selector detection
    recaptcha_page = MagicMock()
    recaptcha_page.title.return_value = "Job Application"
    # Return count > 0 for iframe[src*='recaptcha']
    def locator_mock(selector):
        loc = MagicMock()
        loc.count.return_value = 1 if "recaptcha" in selector else 0
        return loc
    recaptcha_page.locator.side_effect = locator_mock
    assert "CAPTCHA" in (detect_page_blockers(recaptcha_page) or "")

    # 3. Text pattern detection in body
    text_page = MagicMock()
    text_page.title.return_value = "Application Form"
    body_loc = MagicMock()
    body_loc.count.return_value = 0
    body_loc.inner_text.return_value = "Please verify you are a human to continue."
    text_page.locator.return_value = body_loc
    assert "Human verification" in (detect_page_blockers(text_page) or "")

    # 4. Login wall detection
    login_page = MagicMock()
    login_page.title.return_value = "Sign In"
    login_body = MagicMock()
    login_body.count.return_value = 0
    login_body.inner_text.return_value = "Please sign in to apply for this job."
    login_page.locator.return_value = login_body
    assert "Login wall" in (detect_page_blockers(login_page) or "")

    # 5. Clean page returns None
    clean_page = MagicMock()
    clean_page.title.return_value = "Software Engineer Application"
    clean_body = MagicMock()
    clean_body.count.return_value = 0
    clean_body.inner_text.return_value = "Welcome. Please fill out the form fields below."
    clean_page.locator.return_value = clean_body
    assert detect_page_blockers(clean_page) is None


def test_check_action_safety():
    cfg = SafetyConfig(
        require_confirm_before_submit=True,
        require_confirm_on=["submit", "send application", "payment"],
        blocked_actions=["destroy", "format"],
    )

    # 1. Blocked action
    allowed, reason = check_action_safety("click", "destroy database", cfg)
    assert allowed is False
    assert "blocked" in (reason or "")

    # 2. Risky action with user confirmation approved
    confirm_yes = MagicMock(return_value=True)
    allowed, reason = check_action_safety("click", "#submit-btn", cfg, on_confirm=confirm_yes)
    assert allowed is True
    assert reason is None
    confirm_yes.assert_called_once_with("click", "#submit-btn")

    # 3. Risky action with user confirmation denied
    confirm_no = MagicMock(return_value=False)
    allowed, reason = check_action_safety("click", "button[type='submit']", cfg, on_confirm=confirm_no)
    assert allowed is False
    assert "declined" in (reason or "")
    confirm_no.assert_called_once_with("click", "button[type='submit']")

    # 4. Safe action passes without confirmation prompt
    prompt_mock = MagicMock()
    allowed, reason = check_action_safety("type_text", "first_name Jane", cfg, on_confirm=prompt_mock)
    assert allowed is True
    assert reason is None
    prompt_mock.assert_not_called()


def test_agent_never_submits_without_confirmation(tmp_path: Path):
    """Verify that the agent cannot execute a submit click if user denies confirmation."""
    cfg = AppConfig()
    cfg.paths.runs_dir = tmp_path / "runs"
    cfg.safety.require_confirm_before_submit = True
    cfg.safety.require_confirm_on = ["submit"]

    profile = UserProfile(
        personal=PersonalInfo(first_name="Alice", last_name="Smith", email="alice@example.com"),
        work_authorization=WorkAuthorization(),
        disclosures=Disclosures(),
        demographics=Demographics(),
        resumes=ResumesConfig(default=Path("data/resumes/resume.pdf")),
    )
    answers = UserAnswers()

    # Model attempts to click the submit button
    mock_fc = MagicMock()
    mock_fc.name = "click"
    mock_fc.args = {"selector": "button#submit-application", "description": "Submit final application"}

    mock_response = MagicMock()
    mock_response.function_calls = [mock_fc]
    mock_response.text = None

    mock_chat = MagicMock()
    # Turn 1: model tries to submit -> blocked. Turn 2: model concludes finish_form.
    finish_fc = MagicMock()
    finish_fc.name = "finish_form"
    finish_fc.args = {"summary": "Completed"}
    finish_response = MagicMock()
    finish_response.function_calls = [finish_fc]

    mock_chat.send_message.side_effect = [mock_response, MagicMock(), finish_response]

    mock_client = MagicMock()
    mock_client.chats.create.return_value = mock_chat

    mock_page = MagicMock()
    mock_page.url = "https://boards.greenhouse.io/job/1"
    mock_page.title.return_value = "Application Form"
    mock_page.locator.return_value.count.return_value = 0
    mock_page.locator.return_value.inner_text.return_value = "Normal form"

    # User explicitly denies the submit click
    deny_confirm = MagicMock(return_value=False)

    with patch("jobassist.agent.genai.Client", return_value=mock_client), \
         patch("jobassist.agent.take_screenshot", return_value=b"fake_png"), \
         patch("jobassist.agent.extract_form_fields", return_value=[]), \
         patch("jobassist.agent.click") as mock_click_action, \
         patch.dict("os.environ", {"GEMINI_API_KEY": "test_key"}):

        result = run_form_filling_agent(
            page=mock_page,
            job_url="https://boards.greenhouse.io/job/1",
            config=cfg,
            profile=profile,
            answers=answers,
            session_allowed={"boards.greenhouse.io"},
            on_confirm_action=deny_confirm,
        )

        # Invariant: click action was NEVER executed on the page!
        mock_click_action.assert_not_called()
        deny_confirm.assert_called_once()
        assert "submit" in deny_confirm.call_args[0][1].lower()


def test_agent_stops_on_captcha_blocker(tmp_path: Path):
    """Verify that agent halts immediately when a CAPTCHA blocker is detected."""
    cfg = AppConfig()
    cfg.paths.runs_dir = tmp_path / "runs"

    profile = UserProfile(
        personal=PersonalInfo(first_name="Bob", last_name="Jones", email="bob@example.com"),
        work_authorization=WorkAuthorization(),
        disclosures=Disclosures(),
        demographics=Demographics(),
        resumes=ResumesConfig(default=Path("data/resumes/resume.pdf")),
    )
    answers = UserAnswers()

    mock_client = MagicMock()
    mock_page = MagicMock()
    mock_page.url = "https://boards.greenhouse.io/job/1"
    # Page has Cloudflare challenge title
    mock_page.title.return_value = "Attention Required! | Cloudflare"
    mock_page.locator.return_value.count.return_value = 0

    with patch("jobassist.agent.genai.Client", return_value=mock_client), \
         patch.dict("os.environ", {"GEMINI_API_KEY": "test_key"}):

        result = run_form_filling_agent(
            page=mock_page,
            job_url="https://boards.greenhouse.io/job/1",
            config=cfg,
            profile=profile,
            answers=answers,
            session_allowed={"boards.greenhouse.io"},
        )

        # Agent should have stopped with status 'blocked' without calling Gemini model
        assert result.status == "blocked"
        assert "Cloudflare" in result.summary
        mock_client.chats.create.return_value.send_message.assert_not_called()
