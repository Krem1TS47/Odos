import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
import typer
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm
from rich.table import Table

from jobassist.config import load_config, ConfigError
from jobassist.profile import load_profile, load_answers, ProfileError, AnswersError
from jobassist.browser import BrowserSession
from jobassist.agent import run_dry_run_agent, run_form_filling_agent, AgentError
from jobassist.safety import DomainNotAllowedError, ensure_domain_allowed, detect_page_blockers
from jobassist.tracker import (
    ApplicationTracker,
    VALID_STATUSES,
    extract_job_details,
    TrackerError,
)

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

        # 5. Check Safety configuration
        safety_items = []
        if cfg.safety.allowed_domains:
            safety_items.append(f"Allowed domains: {', '.join(cfg.safety.allowed_domains)}")
        else:
            safety_items.append("Allowed domains: None (prompts per domain)")
        safety_items.append(f"Confirm submit: {cfg.safety.require_confirm_before_submit}")
        if cfg.safety.require_confirm_on:
            safety_items.append(f"Confirm triggers: [{', '.join(cfg.safety.require_confirm_on)}]")
        table.add_row(
            "Safety",
            "safety",
            "[green]OK[/green]",
            "; ".join(safety_items),
        )

        # 6. Check Application Tracker database
        tracker_path = cfg.paths.tracker_db
        try:
            tracker = ApplicationTracker(tracker_path)
            total_apps = len(tracker.list_applications())
            table.add_row(
                "Tracker",
                str(tracker_path),
                "[green]OK[/green]",
                f"SQLite database ready ({total_apps} applications tracked)",
            )
        except Exception as e:
            has_errors = True
            table.add_row(
                "Tracker",
                str(tracker_path),
                "[red]ERROR[/red]",
                f"Error initializing tracker: {e}",
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
    company: Optional[str] = typer.Option(None, "--company", help="Company name (optional, auto-detected if omitted)"),
    role: Optional[str] = typer.Option(None, "--role", help="Job role/title (optional, auto-detected if omitted)"),
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

    session_allowed: set[str] = set()

    def on_confirm_domain(domain: str) -> bool:
        console.print(f"\n[bold yellow]Safety Gate Alert:[/bold yellow] Target domain '[bold cyan]{domain}[/bold cyan]' is not in your configured allowed domains.")
        return Confirm.ask("Do you want to allow navigation to this domain for this session?", default=False)

    def on_confirm_action(action_name: str, details: str) -> bool:
        console.print(f"\n[bold yellow]Safety Gate Alert:[/bold yellow] Action '[bold magenta]{action_name}[/bold magenta]' on [cyan]{details}[/cyan] requires confirmation.")
        return Confirm.ask("Do you approve executing this action?", default=False)

    # Pre-check domain allowlist before launching browser
    try:
        ensure_domain_allowed(job_url, cfg.safety.allowed_domains, session_allowed, on_confirm_domain)
    except DomainNotAllowedError as e:
        console.print(f"\n[bold red]Safety Gate Abort:[/bold red] {e}")
        raise typer.Exit(code=1)

    run_status = "error"
    run_notes = ""
    run_dir_str = ""
    run_company = (company or "").strip()
    run_role = (role or "").strip()

    session = BrowserSession(config=cfg.browser, headless=headless)
    try:
        page = session.start()

        # Attempt to infer company and role from URL and page title
        try:
            title_str = page.title() if hasattr(page, "title") and callable(page.title) else ""
            if not isinstance(title_str, str):
                title_str = ""
        except Exception:
            title_str = ""

        det_comp, det_role = extract_job_details(job_url, title_str, run_company, run_role)
        run_company = run_company or det_comp
        run_role = run_role or det_role

        def on_turn_update(turn: int, msg: str) -> None:
            console.print(f"[blue]>[/blue] {msg}")

        def on_ask_user(question: str, field_name: str) -> str:
            console.print(f"\n[bold yellow]Agent asks ({field_name}):[/bold yellow] {question}")
            return console.input("[bold cyan]Your answer: [/bold cyan]").strip()

        def on_blocker_callback(blocker_msg: str) -> bool:
            if headless:
                console.print(f"\n[bold red]Safety Gate Alert: Blocker detected in headless mode:[/bold red] {blocker_msg}")
                return False

            console.print(f"\n[bold red]Safety Gate Alert: Blocker / CAPTCHA Detected[/bold red]")
            console.print(f"Details: [yellow]{blocker_msg}[/yellow]")
            console.print("[dim]The browser window remains active and open on your screen.[/dim]")

            while True:
                console.print("\nPlease choose an action:")
                console.print("  [bold cyan]1[/bold cyan]: Resume agent (I have resolved the challenge in the browser)")
                console.print("  [bold cyan]2[/bold cyan]: Keep browser open for manual review/submit (hand control to human)")
                console.print("  [bold cyan]3[/bold cyan]: Abandon / Quit run")
                choice = console.input("[bold]Select an option [1/2/3] (default 1): [/bold]").strip() or "1"

                if choice == "1":
                    still_blocked = detect_page_blockers(page)
                    if still_blocked:
                        console.print(f"[bold yellow]Blocker is still detected on the page:[/bold yellow] {still_blocked}")
                        console.print("Please complete the challenge or verification in the browser before resuming.")
                        continue
                    else:
                        console.print("[bold green]Verification passed: Blocker cleared! Resuming agent...[/bold green]")
                        return True
                elif choice == "2":
                    console.print("[bold yellow]Handing control over to you. Agent execution halted.[/bold yellow]")
                    return False
                elif choice == "3":
                    console.print("[yellow]Abandoning run.[/yellow]")
                    return False
                else:
                    console.print("[red]Invalid choice. Please select 1, 2, or 3.[/red]")

        if dry_run:
            result = run_dry_run_agent(
                page=page,
                job_url=job_url,
                config=cfg,
                on_turn=on_turn_update,
                session_allowed=session_allowed,
                on_confirm_domain=on_confirm_domain,
                on_confirm_action=on_confirm_action,
                on_blocker=on_blocker_callback,
            )
            run_dir_str = str(result.run_dir) if result.run_dir else ""
            if result.status == "completed":
                run_status = "abandoned"
                run_notes = f"[dry-run] Inspection complete ({len(result.fields_found)} fields)"
            elif result.status == "blocked":
                run_status = "abandoned"
                run_notes = f"[dry-run] Blocked: {result.summary}"
            else:
                run_status = "error"
                run_notes = f"[dry-run] {result.summary}"
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
                session_allowed=session_allowed,
                on_confirm_domain=on_confirm_domain,
                on_confirm_action=on_confirm_action,
                on_blocker=on_blocker_callback,
            )
            run_dir_str = str(result.run_dir) if result.run_dir else ""
            if result.status == "completed":
                run_status = "filled"
                run_notes = result.summary or "Form filled successfully."
            elif result.status == "blocked":
                run_status = "abandoned"
                run_notes = f"Blocked: {result.summary}"
            else:
                run_status = "error"
                run_notes = result.summary or f"Agent status: {result.status}"
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

        if result.status == "blocked":
            console.print(f"\n[bold yellow]Safety Gate Halt:[/bold yellow] {result.summary}")
            console.print("[bold cyan]The browser remains open so you can inspect or resolve the blocker manually.[/bold cyan]")
            if not headless:
                console.input("[dim]Press Enter when finished to close the browser session... [/dim]")

        elif not dry_run and not headless:
            console.print("\n[bold yellow]Safety Gate: Final Review Step[/bold yellow]")
            console.print("Every field filled has been summarized above. Odos will NEVER submit without your explicit confirmation.")
            console.print("Please choose how to proceed:")
            console.print("  [bold cyan]1[/bold cyan]: Keep browser open to review and submit manually (Recommended)")
            console.print("  [bold cyan]2[/bold cyan]: Approve Odos to click Submit for you")
            console.print("  [bold cyan]3[/bold cyan]: Discard / Exit without submitting")
            choice = console.input("\n[bold]Select an option [1/2/3] (default 1): [/bold]").strip() or "1"
            if choice == "2":
                console.print("Locating submit button...")
                try:
                    submit_loc = page.locator("button[type='submit'], input[type='submit'], button:has-text('Submit'), button:has-text('Apply')")
                    if submit_loc.count() > 0:
                        submit_loc.first.click()
                        run_status = "submitted"
                        run_notes = "Form submitted with user confirmation."
                        console.print("[bold green]Submit button clicked with your explicit approval.[/bold green]")
                    else:
                        run_status = "filled"
                        run_notes = "Form filled; could not automatically click submit button."
                        console.print("[yellow]Could not automatically locate a submit button. Please submit manually in the browser.[/yellow]")
                except Exception as err:
                    run_status = "filled"
                    run_notes = f"Form filled; submit click error: {err}"
                    console.print(f"[yellow]Could not click submit button: {err}[/yellow]")
                console.input("[dim]Press Enter to close the browser session and exit... [/dim]")
            elif choice == "3":
                run_status = "abandoned"
                run_notes = "Discarded by user during review."
                console.print("[yellow]Exiting without submitting.[/yellow]")
            else:
                run_status = "filled"
                run_notes = "Form filled; kept open for manual review and submission."
                console.print("[bold green]Browser is active. Review the form and submit manually whenever you are ready.[/bold green]")
                console.input("[dim]Press Enter when finished to close the browser session and exit... [/dim]")

    except DomainNotAllowedError as e:
        run_status = "abandoned"
        run_notes = f"Domain disallowed: {e}"
        console.print(f"\n[bold red]Safety Gate Abort:[/bold red] {e}")
        raise typer.Exit(code=1)
    except AgentError as e:
        run_status = "error"
        run_notes = f"Agent error: {e}"
        console.print(f"\n[bold red]Agent error:[/bold red] {e}")
        raise typer.Exit(code=1)
    except Exception as e:
        run_status = "error"
        run_notes = f"Unexpected error: {e}"
        console.print(f"\n[bold red]Unexpected error:[/bold red] {e}")
        raise typer.Exit(code=1)
    finally:
        session.close()
        # Record or update application row in tracker
        try:
            tracker = ApplicationTracker(cfg.paths.tracker_db)
            app_id = tracker.record_run(
                url=job_url,
                status=run_status,
                company=run_company,
                role=run_role,
                notes=run_notes,
                run_folder_path=run_dir_str,
            )
            console.print(f"[bold cyan]Tracker:[/bold cyan] Application #{app_id} recorded with status '[bold]{run_status}[/bold]'.")
        except Exception as tr_err:
            console.print(f"[yellow]Warning: Could not update tracker: {tr_err}[/yellow]")


@app.command("list")
def list_applications(
    status: Optional[str] = typer.Option(None, "--status", "-s", help="Filter by status (filled, submitted, abandoned, error)"),
    limit: Optional[int] = typer.Option(None, "--limit", "-n", help="Limit number of applications displayed"),
    config_path: Path = typer.Option(Path("config.yaml"), "--config", "-c", help="Path to config.yaml"),
) -> None:
    """List tracked job applications and statuses."""
    try:
        cfg = load_config(config_path)
    except ConfigError as e:
        console.print(f"[bold red]Configuration error:[/bold red] {e}")
        raise typer.Exit(code=1)

    tracker = ApplicationTracker(cfg.paths.tracker_db)
    if status:
        status_clean = status.strip().lower()
        if status_clean not in VALID_STATUSES:
            console.print(
                f"[bold red]Invalid status filter '{status}'. Must be one of: {', '.join(VALID_STATUSES)}[/bold red]"
            )
            raise typer.Exit(code=1)
    else:
        status_clean = None

    records = tracker.list_applications(status=status_clean, limit=limit)
    if not records:
        if status_clean:
            console.print(f"[yellow]No tracked applications found with status '{status_clean}'.[/yellow]")
        else:
            console.print("[yellow]No tracked job applications found.[/yellow]")
        return

    table_title = f"Tracked Job Applications ({status_clean.upper()})" if status_clean else "Tracked Job Applications"
    table = Table(title=table_title, show_lines=True)
    table.add_column("ID", style="bold cyan", justify="right")
    table.add_column("Date", style="dim")
    table.add_column("Company", style="bold")
    table.add_column("Role", style="magenta")
    table.add_column("Status", justify="center")
    table.add_column("URL", style="blue")
    table.add_column("Notes", style="italic")

    status_styles = {
        "submitted": "[bold green]submitted[/bold green]",
        "filled": "[bold cyan]filled[/bold cyan]",
        "abandoned": "[bold yellow]abandoned[/bold yellow]",
        "error": "[bold red]error[/bold red]",
    }

    for r in records:
        status_text = status_styles.get(r.status, r.status)
        url_display = r.url if len(r.url) <= 50 else r.url[:47] + "..."
        notes_display = r.notes if len(r.notes) <= 60 else r.notes[:57] + "..."
        table.add_row(
            str(r.id),
            r.date,
            r.company or "-",
            r.role or "-",
            status_text,
            url_display,
            notes_display or "-",
        )

    console.print(table)


@app.command("mark")
def mark(
    application_id: int = typer.Argument(..., help="Application ID to update"),
    status: str = typer.Argument(..., help="New status (filled, submitted, abandoned, error)"),
    notes: Optional[str] = typer.Option(None, "--notes", "-n", help="Optional notes to update"),
    config_path: Path = typer.Option(Path("config.yaml"), "--config", "-c", help="Path to config.yaml"),
) -> None:
    """Update status of a tracked job application."""
    try:
        cfg = load_config(config_path)
    except ConfigError as e:
        console.print(f"[bold red]Configuration error:[/bold red] {e}")
        raise typer.Exit(code=1)

    tracker = ApplicationTracker(cfg.paths.tracker_db)
    status_clean = status.strip().lower()
    if status_clean not in VALID_STATUSES:
        console.print(
            f"[bold red]Invalid status '{status}'. Must be one of: {', '.join(VALID_STATUSES)}[/bold red]"
        )
        raise typer.Exit(code=1)

    app_record = tracker.get_application(application_id)
    if not app_record:
        console.print(f"[bold red]Application #{application_id} not found in tracker.[/bold red]")
        raise typer.Exit(code=1)

    tracker.update_status(application_id, status_clean, notes=notes)
    console.print(f"[bold green]Application #{application_id} status updated to '[bold]{status_clean}[/bold]'.[/bold green]")


if __name__ == "__main__":
    app()
