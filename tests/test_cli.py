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
