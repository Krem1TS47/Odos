import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from jobassist.config import load_config, ConfigError
from jobassist.profile import load_profile, load_answers, ProfileError, AnswersError

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
    console.print(Panel.fit("[bold blue]JobAssist Configuration & Profile Check[/bold blue]"))

    table = Table(title="Validation Results", show_lines=True)
    table.add_column("Component", style="cyan", no_wrap=True)
    table.add_column("Target / Key", style="magenta")
    table.add_column("Status", style="bold")
    table.add_column("Details")

    has_errors = False

    # 1. Check .env and GEMINI_API_KEY
    load_dotenv()
    env_file = Path(".env")
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    placeholder_keys = {"your_gemini_api_key_here", "your_key_here", ""}

    if not env_file.is_file():
        table.add_row(
            "Environment",
            ".env",
            "[yellow]WARN[/yellow]",
            "Missing .env file. Copy .env.example to .env to set your API key.",
        )
    elif not gemini_key or gemini_key in placeholder_keys:
        table.add_row(
            "Environment",
            "GEMINI_API_KEY",
            "[yellow]WARN[/yellow]",
            "GEMINI_API_KEY is not set or still has a placeholder value in .env.",
        )
    else:
        masked_key = gemini_key[:4] + "..." + gemini_key[-4:] if len(gemini_key) > 8 else "***"
        table.add_row(
            "Environment",
            "GEMINI_API_KEY",
            "[green]OK[/green]",
            f"Configured ({masked_key})",
        )

    # 2. Check config.yaml
    cfg = None
    try:
        cfg = load_config(config_path)
        table.add_row(
            "Config",
            str(config_path),
            "[green]OK[/green]",
            f"Model: {cfg.model.name}, Browser: {cfg.browser.channel}, Max turns: {cfg.limits.max_turns}",
        )
    except ConfigError as e:
        has_errors = True
        table.add_row(
            "Config",
            str(config_path),
            "[red]ERROR[/red]",
            str(e),
        )

    # 3. Check profile and answers if config loaded
    if cfg:
        profile_path = cfg.paths.profile
        profile = None
        try:
            profile = load_profile(profile_path)
            applicant_name = f"{profile.personal.first_name} {profile.personal.last_name}".strip() or "Unnamed"
            details = [f"Applicant: {applicant_name}"]
            if profile.personal.email:
                details.append(f"Email: {profile.personal.email}")
            else:
                details.append("[yellow]No email set[/yellow]")
            auth = ", ".join(profile.work_authorization.authorized_to_work_in) if profile.work_authorization.authorized_to_work_in else "None specified"
            details.append(f"Work auth: [{auth}]")

            table.add_row(
                "Profile",
                str(profile_path),
                "[green]OK[/green]",
                ", ".join(details),
            )
        except ProfileError as e:
            has_errors = True
            table.add_row(
                "Profile",
                str(profile_path),
                "[red]ERROR[/red]",
                str(e),
            )

        answers_path = cfg.paths.answers
        try:
            answers = load_answers(answers_path)
            custom_count = len(answers.custom)
            table.add_row(
                "Answers",
                str(answers_path),
                "[green]OK[/green]",
                f"Source: {answers.how_did_you_hear}, Custom answers: {custom_count}",
            )
        except AnswersError as e:
            has_errors = True
            table.add_row(
                "Answers",
                str(answers_path),
                "[red]ERROR[/red]",
                str(e),
            )

        # 4. Check resume file
        resume_target = profile.resumes.default if profile else Path("data/resumes/resume.pdf")
        if resume_target.is_file():
            table.add_row(
                "Resume",
                str(resume_target),
                "[green]OK[/green]",
                f"Size: {resume_target.stat().st_size / 1024:.1f} KB",
            )
        else:
            resumes_dir = cfg.paths.resumes_dir
            available_pdfs = list(resumes_dir.glob("*.pdf")) if resumes_dir.is_dir() else []
            if available_pdfs:
                found_names = ", ".join(p.name for p in available_pdfs)
                msg = f"Default resume '{resume_target}' not found. Available in {resumes_dir}: {found_names}"
            else:
                msg = f"Resume file '{resume_target}' not found on disk."
            table.add_row(
                "Resume",
                str(resume_target),
                "[yellow]WARN[/yellow]",
                msg,
            )

    console.print(table)

    if has_errors:
        console.print("\n[bold red]Configuration validation failed. Please address the errors above.[/bold red]")
        raise typer.Exit(code=1)
    else:
        console.print("\n[bold green]Configuration check completed successfully![/bold green]")


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
