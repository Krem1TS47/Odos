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
from jobassist.browser import BrowserSession
from jobassist.agent import run_dry_run_agent, run_form_filling_agent, AgentError

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
            details.append(f"18+: {profile.disclosures.at_least_18_years_of_age}")
            details.append(f"Gov official: {profile.disclosures.is_government_official}")

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
def login(
    config_path: Path = typer.Option(Path("config.yaml"), "--config", "-c", help="Path to config.yaml"),
    url: Optional[str] = typer.Option(None, "--url", "-u", help="Initial URL to open for login"),
) -> None:
    """Open a persistent Chrome browser session for manual login."""
    try:
        cfg = load_config(config_path)
    except ConfigError as e:
        console.print(f"[bold red]Configuration error:[/bold red] {e}")
        raise typer.Exit(code=1)

    console.print(Panel.fit("[bold blue]JobAssist Persistent Browser Session[/bold blue]"))
    console.print(f"Opening browser with persistent profile at: [cyan]{cfg.browser.user_data_dir}[/cyan]")
    console.print("Use this session to log in manually to job boards (LinkedIn, Greenhouse, Lever, etc.).")
    console.print("[dim]Your session cookies and login state will be saved automatically when closed.[/dim]\n")

    session = BrowserSession(config=cfg.browser, headless=False)
    try:
        page = session.start()
        if url:
            console.print(f"Navigating to [cyan]{url}[/cyan]...")
            page.goto(url)
        else:
            page.goto("https://www.google.com")

        console.print("[bold yellow]Browser window is active.[/bold yellow]")
        console.input("[bold green]Press Enter when you have finished logging in to save and exit... [/bold green]")
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted by user.[/yellow]")
    except Exception as e:
        console.print(f"\n[bold red]Browser error:[/bold red] {e}")
        raise typer.Exit(code=1)
    finally:
        session.close()
        console.print("[bold green]Browser session saved and closed cleanly.[/bold green]")


@app.command("run")
def run(
    job_url: str = typer.Argument(..., help="Target job application URL"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Read-only mode: inspect form without filling"),
    resume: Optional[Path] = typer.Option(None, "--resume", "-r", help="Path to resume file override"),
    config_path: Path = typer.Option(Path("config.yaml"), "--config", "-c", help="Path to config.yaml"),
    headless: bool = typer.Option(False, "--headless", help="Run browser in headless mode"),
) -> None:
    """Run the job application assistant on a given job application URL."""
    try:
        cfg = load_config(config_path)
    except ConfigError as e:
        console.print(f"[bold red]Configuration error:[/bold red] {e}")
        raise typer.Exit(code=1)

    load_dotenv()
    if not os.getenv("GEMINI_API_KEY", "").strip():
        console.print("[bold red]GEMINI_API_KEY is not configured in .env. Please run 'jobassist check-config'.[/bold red]")
        raise typer.Exit(code=1)

    mode_label = "Dry-Run / Inspection" if dry_run else "Interactive Form Filling"
    console.print(Panel.fit(f"[bold blue]JobAssist Agent Run ({mode_label})[/bold blue]"))
    console.print(f"Target URL: [cyan]{job_url}[/cyan]")
    console.print(f"Model: [cyan]{cfg.model.name}[/cyan] | Max turns: [cyan]{cfg.limits.max_turns}[/cyan]\n")

    profile = None
    answers = None
    if not dry_run:
        try:
            profile = load_profile(cfg.paths.profile)
            answers = load_answers(cfg.paths.answers)
        except (ProfileError, AnswersError) as e:
            console.print(f"[bold red]Profile / Answers error:[/bold red] {e}")
            raise typer.Exit(code=1)
        applicant_name = f"{profile.personal.first_name} {profile.personal.last_name}".strip()
        console.print(f"Candidate: [bold]{applicant_name}[/bold] ({profile.personal.email})\n")

    session = BrowserSession(config=cfg.browser, headless=headless)
    try:
        page = session.start()

        def on_turn_update(turn: int, msg: str) -> None:
            console.print(f"[blue]>[/blue] {msg}")

        def on_ask_user(question: str, field_name: str) -> str:
            console.print(f"\n[bold yellow]Agent asks ({field_name}):[/bold yellow] {question}")
            return console.input("[bold cyan]Your answer: [/bold cyan]").strip()

        if dry_run:
            result = run_dry_run_agent(page, job_url, cfg, on_turn=on_turn_update)
            console.print(f"\n[bold green]Inspection Complete! ({result.status})[/bold green]")
        else:
            result = run_form_filling_agent(
                page=page,
                job_url=job_url,
                config=cfg,
                profile=profile,
                answers=answers,
                resume_path=resume,
                on_turn=on_turn_update,
                on_ask_user=on_ask_user,
            )
            console.print(f"\n[bold green]Form Filling Complete! ({result.status})[/bold green]")

        console.print(f"Turns: [bold]{result.turns}[/bold] | Duration: [bold]{result.duration_seconds}s[/bold]")
        console.print(f"Artifacts saved to: [cyan]{result.run_dir}[/cyan]\n")

        if dry_run and result.fields_found:
            console.print("[bold cyan]Discovered Form Fields:[/bold cyan]")
            for f in result.fields_found:
                console.print(f"  * {f}")
            console.print()

        if not dry_run and result.fields_filled:
            filled_table = Table(title="Fields Filled", show_lines=True)
            filled_table.add_column("Field / Selector", style="cyan")
            filled_table.add_column("Action", style="magenta")
            filled_table.add_column("Value / Option")
            for item in result.fields_filled:
                filled_table.add_row(
                    item.get("field", ""),
                    item.get("action", ""),
                    str(item.get("value", "")),
                )
            console.print(filled_table)
            console.print()

        if result.summary:
            console.print(Panel(result.summary, title="[bold]Summary[/bold]", expand=False))

        if not dry_run and not headless:
            console.print("\n[bold yellow]Safety Gate: Odos never clicks Submit automatically.[/bold yellow]")
            console.print("[bold green]Please review the filled application in the browser window and submit manually.[/bold green]")
            console.input("[dim]Press Enter to close the browser session and exit... [/dim]")

    except AgentError as e:
        console.print(f"\n[bold red]Agent error:[/bold red] {e}")
        raise typer.Exit(code=1)
    except Exception as e:
        console.print(f"\n[bold red]Unexpected error:[/bold red] {e}")
        raise typer.Exit(code=1)
    finally:
        session.close()


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
