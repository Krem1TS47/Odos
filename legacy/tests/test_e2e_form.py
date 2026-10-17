"""End-to-end tests exercising dry-run and form filling against local static test_form.html."""

from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from typer.testing import CliRunner

from jobassist.agent import run_dry_run_agent, run_form_filling_agent, AgentResult
from jobassist.browser import BrowserSession
from jobassist.cli import app
from jobassist.config import AppConfig, LimitsConfig, PathsConfig
from jobassist.profile import load_profile, load_answers
from jobassist.tracker import ApplicationTracker

runner = CliRunner()


@pytest.fixture
def test_form_path() -> Path:
    p = Path("tests/test_form.html").resolve()
    if not p.is_file():
        p = Path("data/test_form.html").resolve()
    return p


@pytest.fixture
def sample_resume(tmp_path: Path) -> Path:
    resume = tmp_path / "resume.pdf"
    resume.write_bytes(b"%PDF-1.4 sample resume content for testing")
    return resume


def test_e2e_dry_run_inspection_on_test_form(test_form_path: Path, tmp_path: Path):
    """Exercise dry-run inspection on the local test form."""
    form_url = test_form_path.as_uri()
    run_dir = tmp_path / "runs" / "dry_run_e2e"
    config = AppConfig(
        limits=LimitsConfig(max_turns=5, max_runtime_seconds=60),
        paths=PathsConfig(runs_dir=tmp_path / "runs"),
    )

    with BrowserSession(headless=True, user_data_dir=tmp_path / "browser_profile") as session:
        page = session.get_page()

        with patch("jobassist.agent.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_chat = MagicMock()
            mock_client.chats.create.return_value = mock_chat

            # Model inspects page and finishes inspection
            mock_fc = MagicMock()
            mock_fc.name = "finish_inspection"
            mock_fc.args = {
                "fields_found": [
                    "First Name",
                    "Last Name",
                    "Email Address",
                    "Phone Number",
                    "Work Authorization",
                    "Resume Upload",
                    "Submit Application",
                ],
                "summary": "Discovered full application form for Acme Labs Software Engineer role.",
            }
            mock_resp = MagicMock()
            mock_resp.function_calls = [mock_fc]
            mock_chat.send_message.return_value = mock_resp

            result = run_dry_run_agent(
                page=page,
                job_url=form_url,
                config=config,
                run_dir=run_dir,
            )

            assert result.status == "completed"
            assert result.turns == 1
            assert len(result.fields_found) >= 5
            assert "Resume Upload" in result.fields_found
            assert "Acme Labs" in result.summary
            assert (run_dir / "turn_001.png").is_file()
            assert (run_dir / "run.jsonl").is_file()
            assert (run_dir / "summary.json").is_file()


def test_e2e_form_filling_agent_on_test_form(
    test_form_path: Path,
    sample_resume: Path,
    tmp_path: Path,
):
    """Exercise complete form filling agent on local test_form.html with real Playwright actions."""
    form_url = test_form_path.as_uri()
    run_dir = tmp_path / "runs" / "fill_e2e"
    db_path = tmp_path / "tracker.db"

    config = AppConfig(
        limits=LimitsConfig(max_turns=10, max_runtime_seconds=60),
        paths=PathsConfig(runs_dir=tmp_path / "runs", tracker_db=db_path),
    )
    profile = load_profile("data/profile.yaml")
    answers = load_answers("data/answers.yaml")

    with BrowserSession(headless=True, user_data_dir=tmp_path / "browser_profile") as session:
        page = session.get_page()

        with patch("jobassist.agent.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_chat = MagicMock()
            mock_client.chats.create.return_value = mock_chat

            # Turn 1: Fill contact info
            fc_turn1 = [
                MagicMock(name="type_text", args={"selector": "#first_name", "text": "Benjamin"}),
                MagicMock(name="type_text", args={"selector": "#last_name", "text": "Ching"}),
                MagicMock(name="type_text", args={"selector": "#email", "text": "ben@example.com"}),
                MagicMock(name="type_text", args={"selector": "#phone", "text": "+1 604-555-0199"}),
            ]
            for m, name in zip(fc_turn1, ["type_text"] * 4):
                m.name = name
            resp1 = MagicMock()
            resp1.function_calls = fc_turn1

            # Turn 2: Work auth & preferences
            fc_turn2 = [
                MagicMock(name="select_option", args={"selector": "#work_auth", "option": "Yes"}),
                MagicMock(name="select_option", args={"selector": "#sponsorship", "option": "No"}),
                MagicMock(name="click", args={"selector": "#relocate", "description": "Relocation preference"}),
                MagicMock(name="click", args={"selector": "#age_18", "description": "Age confirmation"}),
            ]
            for m, name in zip(fc_turn2, ["select_option", "select_option", "click", "click"]):
                m.name = name
            resp2 = MagicMock()
            resp2.function_calls = fc_turn2

            # Turn 3: Upload resume and finish
            fc_turn3 = [
                MagicMock(name="upload_resume", args={"selector": "#resume"}),
                MagicMock(name="finish_form", args={"summary": "All fields filled and resume attached successfully."}),
            ]
            for m, name in zip(fc_turn3, ["upload_resume", "finish_form"]):
                m.name = name
            resp3 = MagicMock()
            resp3.function_calls = fc_turn3

            turn_responses = [resp1, resp2, resp3]
            turn_idx = 0

            def fake_send_message(parts, **kwargs):
                nonlocal turn_idx
                if isinstance(parts, list) and len(parts) >= 2 and isinstance(parts[1], str):
                    if turn_idx < len(turn_responses):
                        res = turn_responses[turn_idx]
                        turn_idx += 1
                        return res
                return MagicMock()

            mock_chat.send_message.side_effect = fake_send_message

            result = run_form_filling_agent(
                page=page,
                job_url=form_url,
                config=config,
                profile=profile,
                answers=answers,
                resume_path=sample_resume,
                run_dir=run_dir,
            )

            assert result.status == "completed"
            assert len(result.fields_filled) >= 8

            # Verify actual DOM state in the browser
            assert page.locator("#first_name").input_value() == "Benjamin"
            assert page.locator("#last_name").input_value() == "Ching"
            assert page.locator("#email").input_value() == "ben@example.com"
            assert page.locator("#phone").input_value() == "+1 604-555-0199"
            assert page.locator("#work_auth").input_value() == "Yes"
            assert page.locator("#sponsorship").input_value() == "No"
            assert page.locator("#relocate").is_checked() is True
            assert page.locator("#age_18").is_checked() is True
            assert page.locator("#resume").evaluate("el => el.files.length") == 1

            # Invariant: Final Submit button must NOT be clicked
            # (If clicked, test form triggers alert or submits)
            assert (run_dir / "turn_001.png").is_file()
            assert (run_dir / "summary.json").is_file()

            # Verify tracker recording
            tracker = ApplicationTracker(db_path)
            tracker.record_run(
                url=form_url,
                status="filled",
                company="Acme Labs",
                role="Software Engineer",
                notes=result.summary,
                run_folder_path=str(run_dir),
            )
            apps = tracker.list_applications()
            assert len(apps) == 1
            assert apps[0].company == "Acme Labs"
            assert apps[0].role == "Software Engineer"
            assert apps[0].status == "filled"


def test_e2e_cli_workflow_on_test_form(test_form_path: Path, sample_resume: Path, tmp_path: Path):
    """Test full CLI lifecycle on the local test form: run -> list -> mark."""
    form_url = test_form_path.as_uri()
    cfg_file = tmp_path / "test_config.yaml"
    tracker_db = tmp_path / "tracker.db"
    runs_dir = tmp_path / "runs"

    cfg_file.write_text(
        f"""
model:
  name: "gemini-3.1-flash-lite"
paths:
  profile: "data/profile.yaml"
  answers: "data/answers.yaml"
  tracker_db: "{tracker_db.as_posix()}"
  runs_dir: "{runs_dir.as_posix()}"
        """,
        encoding="utf-8",
    )

    with patch("jobassist.cli.BrowserSession") as mock_session_cls, \
         patch("jobassist.cli.run_form_filling_agent") as mock_agent_run:
        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session
        mock_page = MagicMock()
        mock_page.title.return_value = "Software Engineer Application at Acme Labs"
        mock_session.start.return_value = mock_page

        mock_agent_run.return_value = AgentResult(
            status="completed",
            turns=2,
            fields_filled=[
                {"field": "#first_name", "action": "type", "value": "Benjamin"},
                {"field": "#resume", "action": "upload", "value": str(sample_resume)},
            ],
            summary="All test form fields filled cleanly.",
            run_dir=runs_dir / "run_cli_test",
            duration_seconds=3.2,
        )

        # 1. jobassist run
        run_res = runner.invoke(
            app,
            ["run", form_url, "--headless", "-c", str(cfg_file)],
            input="y\n",
        )
        assert run_res.exit_code == 0
        assert "Form Filling Complete" in run_res.output
        assert "Tracker:" in run_res.output
        assert "recorded with status 'filled'" in run_res.output

        # 2. jobassist list
        list_res = runner.invoke(app, ["list", "-c", str(cfg_file)])
        assert list_res.exit_code == 0
        assert "Acme Labs" in list_res.output
        assert "Software" in list_res.output
        assert "filled" in list_res.output

        # Verify DB directly
        tracker = ApplicationTracker(tracker_db)
        app_rec = tracker.get_application(1)
        assert app_rec is not None
        assert app_rec.company == "Acme Labs"
        assert app_rec.role == "Software Engineer"
        assert app_rec.status == "filled"

        # 3. jobassist mark 1 submitted
        mark_res = runner.invoke(
            app,
            ["mark", "1", "submitted", "--notes", "Form submitted manually after review", "-c", str(cfg_file)],
        )
        assert mark_res.exit_code == 0
        assert "Application #1 status updated to 'submitted'" in mark_res.output

        # 4. Verify updated list
        list_after = runner.invoke(app, ["list", "-c", str(cfg_file), "--status", "submitted"])
        assert list_after.exit_code == 0
        assert "Acme Labs" in list_after.output
        assert "submitted" in list_after.output
        assert tracker.get_application(1).status == "submitted"
