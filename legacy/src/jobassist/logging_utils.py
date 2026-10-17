"""Run logs and screenshot utilities for JobAssist."""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


def create_run_dir(base_dir: Path | str = "data/runs") -> Path:
    """Create a uniquely timestamped directory for the current run.

    Args:
        base_dir: Base directory where runs are stored.

    Returns:
        Path to the created run directory.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = Path(base_dir) / f"run_{timestamp}"
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def save_screenshot(run_dir: Path, turn: int, screenshot_bytes: bytes) -> Path:
    """Save turn screenshot as PNG.

    Args:
        run_dir: Path to the active run directory.
        turn: Turn number (1-indexed).
        screenshot_bytes: Raw PNG bytes.

    Returns:
        Path to the saved screenshot file.
    """
    screenshot_path = run_dir / f"turn_{turn:03d}.png"
    screenshot_path.write_bytes(screenshot_bytes)
    return screenshot_path


def log_turn(
    run_dir: Path,
    turn: int,
    action: str,
    details: Optional[Dict[str, Any]] = None,
    notes: str = "",
) -> None:
    """Record a turn event in both JSONL and human-readable text log files.

    Args:
        run_dir: Path to the active run directory.
        turn: Turn number.
        action: Name of the action taken or requested.
        details: Structured dictionary of parameters or result.
        notes: Free-text remarks from agent or environment.
    """
    timestamp = datetime.now().isoformat()
    entry = {
        "timestamp": timestamp,
        "turn": turn,
        "action": action,
        "details": details or {},
        "notes": notes,
    }

    # Ensure run_dir exists
    run_dir.mkdir(parents=True, exist_ok=True)

    # Append to JSON Lines file
    jsonl_path = run_dir / "run.jsonl"
    with open(jsonl_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")

    # Append to human-readable log file
    log_path = run_dir / "run.log"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] Turn {turn} | Action: {action}\n")
        if details:
            f.write(f"  Details: {details}\n")
        if notes:
            f.write(f"  Notes: {notes}\n")


def save_summary(run_dir: Path, data: Dict[str, Any]) -> Path:
    """Save the final summary of the run.

    Args:
        run_dir: Path to the active run directory.
        data: Summary dictionary.

    Returns:
        Path to the saved summary.json file.
    """
    run_dir.mkdir(parents=True, exist_ok=True)
    summary_path = run_dir / "summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return summary_path
