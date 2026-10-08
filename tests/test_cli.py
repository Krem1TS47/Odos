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
