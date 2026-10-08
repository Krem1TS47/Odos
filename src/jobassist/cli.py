from typing import Optional
from pathlib import Path
import typer
from rich.console import Console

app = typer.Typer(
    name="jobassist",
    help="Local Job Application Assistant using Gemini Computer Use and Playwright.",
    no_args_is_help=True,
)
console = Console()


@app.command("check-config")
def check_config(
    config_path: Path = typer.Option(Path("config.yaml"), "--config", "-c", help="Path to config.yaml"),
) -> None:
    """Validate configuration, profile, and answers YAML files."""
    console.print("[yellow]check-config will be fully implemented in M1.[/yellow]")


@app.command("login")
def login() -> None:
    """Open a persistent Chrome browser session for manual login."""
    console.print("[yellow]login will be implemented in M2.[/yellow]")


@app.command("run")
def run(
    job_url: str = typer.Argument(..., help="Target job application URL"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Read-only mode: inspect form without filling"),
    resume: Optional[Path] = typer.Option(None, "--resume", "-r", help="Path to resume file override"),
) -> None:
    """Run the job application assistant on a given job application URL."""
    console.print(f"[yellow]run for {job_url} will be implemented in M3/M4.[/yellow]")


@app.command("list")
def list_applications() -> None:
    """List tracked job applications and statuses."""
    console.print("[yellow]list will be implemented in M6.[/yellow]")


@app.command("mark")
def mark(
    application_id: int = typer.Argument(..., help="Application ID to update"),
    status: str = typer.Argument(..., help="New status (filled, submitted, abandoned, error)"),
) -> None:
    """Update status of a tracked job application."""
    console.print(f"[yellow]mark application #{application_id} -> {status} will be implemented in M6.[/yellow]")


if __name__ == "__main__":
    app()
