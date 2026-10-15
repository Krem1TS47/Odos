"""Unit tests for SQLite ApplicationTracker and extraction utilities."""

import pytest
from pathlib import Path
from jobassist.tracker import (
    ApplicationTracker,
    ApplicationRecord,
    TrackerError,
    VALID_STATUSES,
    extract_job_details,
)


def test_tracker_init_and_table_creation(tmp_path: Path):
    db_file = tmp_path / "subdir" / "test_tracker.db"
    tracker = ApplicationTracker(db_file)
    assert db_file.is_file()
    assert tracker.list_applications() == []


def test_tracker_validate_status():
    for status in VALID_STATUSES:
        assert ApplicationTracker.validate_status(status) == status
        assert ApplicationTracker.validate_status(status.upper()) == status
        assert ApplicationTracker.validate_status(f"  {status}  ") == status

    with pytest.raises(TrackerError, match="Invalid status"):
        ApplicationTracker.validate_status("in_progress")

    with pytest.raises(TrackerError, match="cannot be empty"):
        ApplicationTracker.validate_status("")


def test_add_and_get_application(tmp_path: Path):
    db_file = tmp_path / "test.db"
    tracker = ApplicationTracker(db_file)

    app_id = tracker.add_application(
        url="https://boards.greenhouse.io/acme/jobs/123",
        status="filled",
        company="Acme Corp",
        role="Senior Engineer",
        date="2026-10-15 10:00:00",
        notes="Filled cleanly",
        run_folder_path="data/runs/run_01",
    )
    assert isinstance(app_id, int)
    assert app_id > 0

    record = tracker.get_application(app_id)
    assert record is not None
    assert record.id == app_id
    assert record.url == "https://boards.greenhouse.io/acme/jobs/123"
    assert record.company == "Acme Corp"
    assert record.role == "Senior Engineer"
    assert record.status == "filled"
    assert record.date == "2026-10-15 10:00:00"
    assert record.notes == "Filled cleanly"
    assert record.run_folder_path == "data/runs/run_01"

    d = record.to_dict()
    assert d["id"] == app_id
    assert d["status"] == "filled"


def test_add_application_empty_url_raises(tmp_path: Path):
    tracker = ApplicationTracker(tmp_path / "test.db")
    with pytest.raises(TrackerError, match="URL cannot be empty"):
        tracker.add_application(url="")


def test_get_application_nonexistent(tmp_path: Path):
    tracker = ApplicationTracker(tmp_path / "test.db")
    assert tracker.get_application(999) is None


def test_get_by_url(tmp_path: Path):
    tracker = ApplicationTracker(tmp_path / "test.db")
    url = "https://example.com/jobs/456"
    assert tracker.get_by_url(url) is None

    app_id = tracker.add_application(url=url, status="filled", company="TestCo")
    rec = tracker.get_by_url(url)
    assert rec is not None
    assert rec.id == app_id
    assert rec.company == "TestCo"


def test_update_status(tmp_path: Path):
    tracker = ApplicationTracker(tmp_path / "test.db")
    app_id = tracker.add_application(
        url="https://example.com/apply",
        status="filled",
        notes="Initial note",
    )

    # Update status only
    success = tracker.update_status(app_id, "submitted")
    assert success is True
    rec = tracker.get_application(app_id)
    assert rec.status == "submitted"
    assert rec.notes == "Initial note"

    # Update status and notes
    success2 = tracker.update_status(app_id, "abandoned", notes="Changed mind")
    assert success2 is True
    rec2 = tracker.get_application(app_id)
    assert rec2.status == "abandoned"
    assert rec2.notes == "Changed mind"

    # Updating nonexistent record
    assert tracker.update_status(999, "submitted") is False

    # Invalid status raises error
    with pytest.raises(TrackerError):
        tracker.update_status(app_id, "unknown_status")


def test_list_applications_filtering_and_limits(tmp_path: Path):
    tracker = ApplicationTracker(tmp_path / "test.db")
    tracker.add_application(url="https://example.com/1", status="filled")
    tracker.add_application(url="https://example.com/2", status="submitted")
    tracker.add_application(url="https://example.com/3", status="abandoned")
    tracker.add_application(url="https://example.com/4", status="submitted")

    all_apps = tracker.list_applications()
    assert len(all_apps) == 4
    # Ordered by ID descending
    assert all_apps[0].url == "https://example.com/4"

    submitted = tracker.list_applications(status="submitted")
    assert len(submitted) == 2
    assert all(a.status == "submitted" for a in submitted)

    limited = tracker.list_applications(limit=2)
    assert len(limited) == 2


def test_record_run_create_and_update(tmp_path: Path):
    tracker = ApplicationTracker(tmp_path / "test.db")
    url = "https://boards.greenhouse.io/stripe/jobs/999"

    # First run creates row
    id1 = tracker.record_run(
        url=url,
        status="filled",
        company="Stripe",
        role="Frontend Dev",
        notes="First attempt",
        run_folder_path="data/runs/run_1",
    )
    assert id1 > 0
    rec1 = tracker.get_application(id1)
    assert rec1.status == "filled"
    assert rec1.notes == "First attempt"

    # Second run with same URL updates the row
    id2 = tracker.record_run(
        url=url,
        status="submitted",
        company="Stripe",
        role="Frontend Dev",
        notes="Submitted after review",
        run_folder_path="data/runs/run_2",
    )
    assert id2 == id1
    rec2 = tracker.get_application(id2)
    assert rec2.status == "submitted"
    assert rec2.notes == "Submitted after review"
    assert rec2.run_folder_path == "data/runs/run_2"
    assert len(tracker.list_applications()) == 1


def test_extract_job_details():
    # ATS URLs
    comp, role = extract_job_details("https://boards.greenhouse.io/uber/jobs/123", "")
    assert comp == "Uber"

    comp, role = extract_job_details("https://jobs.lever.co/spotify/abc", "")
    assert comp == "Spotify"

    comp, role = extract_job_details("https://jobs.ashbyhq.com/openai/xyz", "")
    assert comp == "OpenAI"

    # Title with "at" or "@"
    comp, role = extract_job_details(
        "https://example.com/job/1",
        page_title="Staff Software Engineer at Acme Corp",
    )
    assert comp == "Acme Corp"
    assert role == "Staff Software Engineer"

    # Title with "Company - Role"
    comp, role = extract_job_details(
        "https://example.com/job/2",
        page_title="Netflix - Senior Data Engineer",
    )
    assert comp == "Netflix"
    assert role == "Senior Data Engineer"

    # Default overrides
    comp, role = extract_job_details(
        "https://example.com/job/3",
        page_title="Whatever",
        default_company="CustomCo",
        default_role="CustomRole",
    )
    assert comp == "CustomCo"
    assert role == "CustomRole"
