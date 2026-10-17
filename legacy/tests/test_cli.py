from unittest.mock import patch, MagicMock
from typer.testing import CliRunner
from jobassist.cli import app

runner = CliRunner()


def test_cli_help():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "check-config" in result.output
    assert "login" in result.output
    assert "run" in result.output
    assert "list" in result.output
    assert "mark" in result.output


def test_check_config_success():
    result = runner.invoke(app, ["check-config"])
    assert result.exit_code == 0
    assert "Configuration check completed successfully!" in result.output


def test_check_config_missing_file(tmp_path):
    missing_config = tmp_path / "missing.yaml"
    result = runner.invoke(app, ["check-config", "-c", str(missing_config)])
    assert result.exit_code == 1
    assert "Configuration validation failed" in result.output


def test_login_command_mocked():
    with patch("jobassist.cli.BrowserSession") as mock_session_cls:
        mock_instance = MagicMock()
        mock_session_cls.return_value = mock_instance
        mock_instance.start.return_value = MagicMock()

        result = runner.invoke(app, ["login"], input="\n")
        assert result.exit_code == 0
        assert "Persistent Browser Session" in result.output
        assert "saved and closed cleanly" in result.output
        mock_instance.close.assert_called_once()


def test_login_command_invalid_config(tmp_path):
    missing_config = tmp_path / "missing.yaml"
    result = runner.invoke(app, ["login", "-c", str(missing_config)])
    assert result.exit_code == 1
    assert "Configuration error" in result.output


def test_run_command_dry_run_mocked(tmp_path):
    with patch("jobassist.cli.BrowserSession") as mock_session_cls, \
         patch("jobassist.cli.run_dry_run_agent") as mock_run_agent:
        mock_instance = MagicMock()
        mock_session_cls.return_value = mock_instance
        mock_instance.start.return_value = MagicMock()

        from jobassist.agent import AgentResult
        mock_run_agent.return_value = AgentResult(
            status="completed",
            turns=1,
            fields_found=["Name", "Email"],
            summary="Test summary",
            run_dir=tmp_path / "run_001",
            duration_seconds=1.5,
        )

        result = runner.invoke(app, ["run", "https://example.com/jobs", "--dry-run", "--headless"], input="y\n")
        assert result.exit_code == 0
        assert "Inspection Complete" in result.output
        assert "Name" in result.output
        assert "Test summary" in result.output
        mock_instance.close.assert_called_once()


def test_run_command_filling_mocked(tmp_path):
    with patch("jobassist.cli.BrowserSession") as mock_session_cls, \
         patch("jobassist.cli.run_form_filling_agent") as mock_run_agent:
        mock_instance = MagicMock()
        mock_session_cls.return_value = mock_instance
        mock_instance.start.return_value = MagicMock()

        from jobassist.agent import AgentResult
        mock_run_agent.return_value = AgentResult(
            status="completed",
            turns=1,
            fields_filled=[{"field": "name", "action": "type", "value": "Benjamin Ching"}],
            summary="All fields filled.",
            run_dir=tmp_path / "run_002",
            duration_seconds=2.0,
        )

        result = runner.invoke(app, ["run", "https://example.com/jobs", "--headless"], input="y\n")
        assert result.exit_code == 0
        assert "Form Filling Complete" in result.output
        assert "Fields Filled" in result.output
        assert "Benjamin Ching" in result.output
        mock_instance.close.assert_called_once()


def test_run_command_disallowed_domain_aborts():
    result = runner.invoke(app, ["run", "https://unapproved.com/jobs", "--headless"], input="n\n")
    assert result.exit_code == 1
    assert "Safety Gate Abort" in result.output


def test_run_command_blocked_halt(tmp_path):
    with patch("jobassist.cli.BrowserSession") as mock_session_cls, \
         patch("jobassist.cli.run_form_filling_agent") as mock_run_agent:
        mock_instance = MagicMock()
        mock_session_cls.return_value = mock_instance
        mock_instance.start.return_value = MagicMock()

        from jobassist.agent import AgentResult
        mock_run_agent.return_value = AgentResult(
            status="blocked",
            turns=1,
            summary="Safety Gate: Cloudflare Turnstile challenge detected.",
            run_dir=tmp_path / "run_blocked",
            duration_seconds=1.0,
        )

        result = runner.invoke(app, ["run", "https://example.com/jobs", "--headless"], input="y\n")
        assert result.exit_code == 0
        assert "Safety Gate Halt" in result.output
        assert "Cloudflare Turnstile" in result.output
        mock_instance.close.assert_called_once()


def test_run_command_blocker_callback_force_resume(tmp_path):
    with patch("jobassist.cli.BrowserSession") as mock_session_cls, \
         patch("jobassist.cli.run_form_filling_agent") as mock_run_agent:
        mock_instance = MagicMock()
        mock_session_cls.return_value = mock_instance
        mock_instance.start.return_value = MagicMock()

        from jobassist.agent import AgentResult

        def fake_agent(**kwargs):
            on_blocker = kwargs.get("on_blocker")
            if on_blocker:
                ignored = set()
                res = on_blocker("CAPTCHA: reCAPTCHA detected", ignored)
                assert res is True
                assert "CAPTCHA: reCAPTCHA detected" in ignored
            return AgentResult(status="completed", turns=1, summary="Done")

        mock_run_agent.side_effect = fake_agent

        # input: "y\n" for domain, "2\n" for force resume option, "1\n" for review step, "\n" for press enter
        result = runner.invoke(app, ["run", "https://example.com/jobs"], input="y\n2\n1\n\n")
        assert result.exit_code == 0
        assert "Ignoring blocker signature and resuming agent" in result.output
        mock_instance.close.assert_called_once()


def _create_test_config(tmp_path):
    cfg_path = tmp_path / "test_config.yaml"
    tracker_db = tmp_path / "tracker.db"
    content = f"""
model:
  name: "gemini-3.1-flash-lite"
paths:
  tracker_db: "{tracker_db.as_posix()}"
"""
    cfg_path.write_text(content, encoding="utf-8")
    return cfg_path, tracker_db


def test_list_command_empty(tmp_path):
    cfg_path, _ = _create_test_config(tmp_path)
    result = runner.invoke(app, ["list", "-c", str(cfg_path)])
    assert result.exit_code == 0
    assert "No tracked job applications found" in result.output


def test_list_command_populated_and_filtering(tmp_path):
    cfg_path, db_path = _create_test_config(tmp_path)
    from jobassist.tracker import ApplicationTracker

    tracker = ApplicationTracker(db_path)
    tracker.add_application(
        url="https://jobs.lever.co/stripe/123",
        status="filled",
        company="Stripe",
        role="Backend Engineer",
    )
    tracker.add_application(
        url="https://boards.greenhouse.io/airbnb/456",
        status="submitted",
        company="Airbnb",
        role="Product Designer",
    )

    # List all
    res_all = runner.invoke(app, ["list", "-c", str(cfg_path)])
    assert res_all.exit_code == 0
    assert "Stripe" in res_all.output
    assert "Airbnb" in res_all.output
    assert "filled" in res_all.output
    assert "submitted" in res_all.output

    # Filter by status
    res_sub = runner.invoke(app, ["list", "-c", str(cfg_path), "--status", "submitted"])
    assert res_sub.exit_code == 0
    assert "Airbnb" in res_sub.output
    assert "Stripe" not in res_sub.output

    # Filter with no matching status
    res_none = runner.invoke(app, ["list", "-c", str(cfg_path), "--status", "abandoned"])
    assert res_none.exit_code == 0
    assert "No tracked applications found with status 'abandoned'" in res_none.output


def test_list_command_invalid_status(tmp_path):
    cfg_path, _ = _create_test_config(tmp_path)
    result = runner.invoke(app, ["list", "-c", str(cfg_path), "--status", "invalid_status"])
    assert result.exit_code == 1
    assert "Invalid status filter" in result.output


def test_mark_command_success(tmp_path):
    cfg_path, db_path = _create_test_config(tmp_path)
    from jobassist.tracker import ApplicationTracker

    tracker = ApplicationTracker(db_path)
    app_id = tracker.add_application(
        url="https://example.com/apply/1",
        status="filled",
        company="TechCorp",
    )

    result = runner.invoke(
        app,
        ["mark", str(app_id), "submitted", "--notes", "Applied via email confirmation", "-c", str(cfg_path)],
    )
    assert result.exit_code == 0
    assert f"Application #{app_id} status updated to 'submitted'" in result.output

    updated = tracker.get_application(app_id)
    assert updated.status == "submitted"
    assert updated.notes == "Applied via email confirmation"


def test_mark_command_invalid_status(tmp_path):
    cfg_path, db_path = _create_test_config(tmp_path)
    result = runner.invoke(app, ["mark", "1", "nonexistent_status", "-c", str(cfg_path)])
    assert result.exit_code == 1
    assert "Invalid status" in result.output


def test_mark_command_not_found(tmp_path):
    cfg_path, db_path = _create_test_config(tmp_path)
    result = runner.invoke(app, ["mark", "999", "submitted", "-c", str(cfg_path)])
    assert result.exit_code == 1
    assert "Application #999 not found" in result.output


def test_run_command_records_to_tracker(tmp_path):
    cfg_path, db_path = _create_test_config(tmp_path)

    with patch("jobassist.cli.BrowserSession") as mock_session_cls, \
         patch("jobassist.cli.run_form_filling_agent") as mock_run_agent:
        mock_instance = MagicMock()
        mock_session_cls.return_value = mock_instance
        page_mock = MagicMock()
        page_mock.title.return_value = "Software Engineer at Google"
        mock_instance.start.return_value = page_mock

        from jobassist.agent import AgentResult
        mock_run_agent.return_value = AgentResult(
            status="completed",
            turns=1,
            fields_filled=[{"field": "name", "action": "type", "value": "Test User"}],
            summary="All fields filled.",
            run_dir=tmp_path / "run_999",
            duration_seconds=1.2,
        )

        result = runner.invoke(
            app,
            ["run", "https://example.com/jobs/99", "--headless", "-c", str(cfg_path)],
            input="y\n",
        )
        assert result.exit_code == 0
        assert "Tracker:" in result.output
        assert "recorded with status 'filled'" in result.output

        from jobassist.tracker import ApplicationTracker
        tracker = ApplicationTracker(db_path)
        apps = tracker.list_applications()
        assert len(apps) == 1
        assert apps[0].url == "https://example.com/jobs/99"
        assert apps[0].status == "filled"
        assert apps[0].company == "Google"
        assert apps[0].role == "Software Engineer"

