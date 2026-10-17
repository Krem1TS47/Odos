from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from jobassist.agent import run_dry_run_agent, run_form_filling_agent, AgentResult
from jobassist.config import AppConfig, LimitsConfig, PathsConfig
from jobassist.profile import load_profile, load_answers
from jobassist.browser import BrowserSession


def test_dry_run_agent_finish_inspection(tmp_path):
    html_file = tmp_path / "page.html"
    html_file.write_text("<html><body><input name='test_input'/></body></html>", encoding="utf-8")
    page_url = html_file.as_uri()

    run_dir = tmp_path / "test_run"
    config = AppConfig(
        limits=LimitsConfig(max_turns=5, max_runtime_seconds=60),
        paths=PathsConfig(runs_dir=tmp_path / "runs"),
    )

    with BrowserSession(headless=True, user_data_dir=tmp_path / "profile") as session:
        page = session.get_page()

        # Mock Gemini Client and Chat
        with patch("jobassist.agent.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client

            mock_chat = MagicMock()
            mock_client.chats.create.return_value = mock_chat

            mock_fc = MagicMock()
            mock_fc.name = "finish_inspection"
            mock_fc.args = {
                "fields_found": ["Full Name", "Email Address", "Resume"],
                "summary": "Standard Greenhouse application form requiring personal info and resume.",
            }

            mock_response = MagicMock()
            mock_response.function_calls = [mock_fc]
            mock_chat.send_message.return_value = mock_response

            result = run_dry_run_agent(page, page_url, config, run_dir=run_dir)

            assert isinstance(result, AgentResult)
            assert result.status == "completed"
            assert result.turns == 1
            assert "Full Name" in result.fields_found
            assert "Standard Greenhouse" in result.summary
            assert (run_dir / "turn_001.png").is_file()
            assert (run_dir / "run.jsonl").is_file()
            assert (run_dir / "summary.json").is_file()


def test_dry_run_agent_max_turns_enforcement(tmp_path):
    html_file = tmp_path / "page.html"
    html_file.write_text("<html><body><h1>Form</h1></body></html>", encoding="utf-8")
    page_url = html_file.as_uri()

    config = AppConfig(
        limits=LimitsConfig(max_turns=2, max_runtime_seconds=60),
        paths=PathsConfig(runs_dir=tmp_path / "runs"),
    )

    with BrowserSession(headless=True, user_data_dir=tmp_path / "profile") as session:
        page = session.get_page()

        with patch("jobassist.agent.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_chat = MagicMock()
            mock_client.chats.create.return_value = mock_chat

            mock_fc = MagicMock()
            mock_fc.name = "scroll"
            mock_fc.args = {"direction": "down", "amount": 200}
            mock_response = MagicMock()
            mock_response.function_calls = [mock_fc]
            mock_chat.send_message.return_value = mock_response

            result = run_dry_run_agent(page, page_url, config, run_dir=tmp_path / "run_max_turns")

            assert result.status == "max_turns_exceeded"
            assert result.turns == 2


def test_dry_run_agent_runtime_timeout(tmp_path):
    html_file = tmp_path / "page.html"
    html_file.write_text("<html><body><h1>Form</h1></body></html>", encoding="utf-8")
    page_url = html_file.as_uri()

    config = AppConfig(
        limits=LimitsConfig(max_turns=5, max_runtime_seconds=-1),
        paths=PathsConfig(runs_dir=tmp_path / "runs"),
    )

    with BrowserSession(headless=True, user_data_dir=tmp_path / "profile") as session:
        page = session.get_page()

        with patch("jobassist.agent.genai.Client"):
            result = run_dry_run_agent(page, page_url, config, run_dir=tmp_path / "run_timeout")
            assert result.status == "timeout"


def test_form_filling_agent_flow(tmp_path):
    html_file = tmp_path / "apply.html"
    html_file.write_text(
        """
        <html><body>
        <form>
            <input id="candidate_name" name="name" />
            <input id="resume_upload" type="file" />
            <button id="submit_app" type="submit">Submit Application</button>
        </form>
        </body></html>
        """,
        encoding="utf-8",
    )
    page_url = html_file.as_uri()
    resume_file = tmp_path / "resume.pdf"
    resume_file.write_bytes(b"%PDF-1.4 test resume")

    profile = load_profile("data/profile.yaml")
    answers = load_answers("data/answers.yaml")
    config = AppConfig(paths=PathsConfig(runs_dir=tmp_path / "runs"))

    with BrowserSession(headless=True, user_data_dir=tmp_path / "profile") as session:
        page = session.get_page()

        with patch("jobassist.agent.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_chat = MagicMock()
            mock_client.chats.create.return_value = mock_chat

            mock_fc1 = MagicMock()
            mock_fc1.name = "type_text"
            mock_fc1.args = {"selector": "#candidate_name", "text": "Benjamin Ching"}

            mock_fc2 = MagicMock()
            mock_fc2.name = "upload_resume"
            mock_fc2.args = {"selector": "#resume_upload"}

            mock_finish = MagicMock()
            mock_finish.name = "finish_form"
            mock_finish.args = {"summary": "Application filled successfully. Awaiting user review."}

            resp1 = MagicMock()
            resp1.function_calls = [mock_fc1, mock_fc2]

            resp2 = MagicMock()
            resp2.function_calls = [mock_finish]

            mock_chat.send_message.side_effect = [resp1, MagicMock(), MagicMock(), resp2]

            result = run_form_filling_agent(
                page=page,
                job_url=page_url,
                config=config,
                profile=profile,
                answers=answers,
                resume_path=resume_file,
                run_dir=tmp_path / "run_fill",
            )

            assert result.status == "completed"
            assert len(result.fields_filled) >= 2
            assert page.locator("#candidate_name").input_value() == "Benjamin Ching"
            assert page.locator("#resume_upload").evaluate("el => el.files.length") == 1
            assert (tmp_path / "run_fill" / "turn_001.png").is_file()
            assert (tmp_path / "run_fill" / "summary.json").is_file()


def test_dry_run_agent_blocker_pause_and_resume(tmp_path):
    html_file = tmp_path / "page.html"
    html_file.write_text("<html><body><input name='test_input'/></body></html>", encoding="utf-8")
    page_url = html_file.as_uri()

    config = AppConfig(
        limits=LimitsConfig(max_turns=5, max_runtime_seconds=60),
        paths=PathsConfig(runs_dir=tmp_path / "runs"),
    )

    with BrowserSession(headless=True, user_data_dir=tmp_path / "profile") as session:
        page = session.get_page()

        blocker_states = ["CAPTCHA: Turnstile challenge", None, None, None]
        def fake_detect(p):
            if blocker_states:
                return blocker_states.pop(0)
            return None

        on_blocker_mock = MagicMock(return_value=True)

        with patch("jobassist.agent.genai.Client") as mock_client_cls, \
             patch("jobassist.agent.detect_page_blockers", side_effect=fake_detect):
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_chat = MagicMock()
            mock_client.chats.create.return_value = mock_chat

            mock_fc = MagicMock()
            mock_fc.name = "finish_inspection"
            mock_fc.args = {"fields_found": ["Test Input"], "summary": "Inspection done"}

            mock_resp = MagicMock()
            mock_resp.function_calls = [mock_fc]
            mock_chat.send_message.return_value = mock_resp

            result = run_dry_run_agent(
                page=page,
                job_url=page_url,
                config=config,
                run_dir=tmp_path / "run_resume",
                on_blocker=on_blocker_mock,
            )

            assert on_blocker_mock.called
            assert result.status == "completed"
            assert "Test Input" in result.fields_found


def test_dry_run_agent_blocker_unresolved_halts(tmp_path):
    html_file = tmp_path / "page.html"
    html_file.write_text("<html><body><h1>Blocked</h1></body></html>", encoding="utf-8")
    page_url = html_file.as_uri()

    config = AppConfig(
        limits=LimitsConfig(max_turns=5, max_runtime_seconds=60),
        paths=PathsConfig(runs_dir=tmp_path / "runs"),
    )

    with BrowserSession(headless=True, user_data_dir=tmp_path / "profile") as session:
        page = session.get_page()

        on_blocker_mock = MagicMock(return_value=False)

        with patch("jobassist.agent.genai.Client") as mock_client_cls, \
             patch("jobassist.agent.detect_page_blockers", return_value="CAPTCHA: Cloudflare Turnstile"):
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client

            result = run_dry_run_agent(
                page=page,
                job_url=page_url,
                config=config,
                run_dir=tmp_path / "run_block_halt",
                on_blocker=on_blocker_mock,
            )

            assert on_blocker_mock.called
            assert result.status == "blocked"
            assert "Execution paused" in result.summary


def test_agent_model_calls_report_blocker(tmp_path):
    html_file = tmp_path / "page.html"
    html_file.write_text("<html><body><h1>Challenge</h1></body></html>", encoding="utf-8")
    page_url = html_file.as_uri()

    config = AppConfig(
        limits=LimitsConfig(max_turns=5, max_runtime_seconds=60),
        paths=PathsConfig(runs_dir=tmp_path / "runs"),
    )

    with BrowserSession(headless=True, user_data_dir=tmp_path / "profile") as session:
        page = session.get_page()

        on_blocker_mock = MagicMock(return_value=True)

        with patch("jobassist.agent.genai.Client") as mock_client_cls, \
             patch("jobassist.agent.detect_page_blockers", return_value=None):
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_chat = MagicMock()
            mock_client.chats.create.return_value = mock_chat

            fc_blocker = MagicMock()
            fc_blocker.name = "report_blocker"
            fc_blocker.args = {"blocker_type": "recaptcha", "description": "Interactive image puzzle"}
            resp1 = MagicMock()
            resp1.function_calls = [fc_blocker]

            fc_finish = MagicMock()
            fc_finish.name = "finish_inspection"
            fc_finish.args = {"fields_found": ["field1"], "summary": "Form analyzed after captcha solved"}
            resp2 = MagicMock()
            resp2.function_calls = [fc_finish]

            mock_chat.send_message.side_effect = [resp1, MagicMock(), resp2]

            result = run_dry_run_agent(
                page=page,
                job_url=page_url,
                config=config,
                run_dir=tmp_path / "run_report_blocker",
                on_blocker=on_blocker_mock,
            )

            assert on_blocker_mock.called
            assert result.status == "completed"


def test_form_filling_agent_blocker_pause_and_resume(tmp_path):
    html_file = tmp_path / "apply.html"
    html_file.write_text("<html><body><form><input id='name' name='name'/></form></body></html>", encoding="utf-8")
    page_url = html_file.as_uri()

    profile = load_profile("data/profile.yaml")
    answers = load_answers("data/answers.yaml")
    config = AppConfig(paths=PathsConfig(runs_dir=tmp_path / "runs"))

    with BrowserSession(headless=True, user_data_dir=tmp_path / "profile") as session:
        page = session.get_page()

        blocker_states = ["CAPTCHA: Arkose Labs puzzle", None, None, None]
        def fake_detect(p):
            if blocker_states:
                return blocker_states.pop(0)
            return None

        on_blocker_mock = MagicMock(return_value=True)

        with patch("jobassist.agent.genai.Client") as mock_client_cls, \
             patch("jobassist.agent.detect_page_blockers", side_effect=fake_detect):
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_chat = MagicMock()
            mock_client.chats.create.return_value = mock_chat

            mock_finish = MagicMock()
            mock_finish.name = "finish_form"
            mock_finish.args = {"summary": "Application filled."}

            mock_resp = MagicMock()
            mock_resp.function_calls = [mock_finish]
            mock_chat.send_message.return_value = mock_resp

            result = run_form_filling_agent(
                page=page,
                job_url=page_url,
                config=config,
                profile=profile,
                answers=answers,
                run_dir=tmp_path / "run_form_resume",
                on_blocker=on_blocker_mock,
            )

            assert on_blocker_mock.called
            assert result.status == "completed"

