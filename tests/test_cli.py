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
