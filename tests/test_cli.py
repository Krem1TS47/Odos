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

        result = runner.invoke(app, ["run", "https://example.com/jobs", "--dry-run", "--headless"])
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

        result = runner.invoke(app, ["run", "https://example.com/jobs", "--headless"])
        assert result.exit_code == 0
        assert "Form Filling Complete" in result.output
        assert "Fields Filled" in result.output
        assert "Benjamin Ching" in result.output
        mock_instance.close.assert_called_once()
