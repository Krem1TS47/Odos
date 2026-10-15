"""SQLite application tracker for JobAssist."""

import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse


VALID_STATUSES = ("filled", "submitted", "abandoned", "error")


class TrackerError(Exception):
    """Raised for errors in ApplicationTracker operations."""
    pass


@dataclass
class ApplicationRecord:
    id: int
    company: str
    role: str
    url: str
    date: str
    status: str
    notes: str = ""
    run_folder_path: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "company": self.company,
            "role": self.role,
            "url": self.url,
            "date": self.date,
            "status": self.status,
            "notes": self.notes,
            "run_folder_path": self.run_folder_path,
        }


def extract_job_details(
    url: str,
    page_title: str = "",
    default_company: str = "",
    default_role: str = "",
) -> Tuple[str, str]:
    """Extract or infer company name and job role from a URL and page title.

    Args:
        url: Job posting or application URL.
        page_title: Title of the browser page.
        default_company: Fallback company name.
        default_role: Fallback role name.

    Returns:
        Tuple of (company, role).
    """
    company = default_company.strip()
    role = default_role.strip()

    # 1. Try extracting from page title first (usually most descriptive: "Role at Company")
    clean_title = page_title.strip()
    if clean_title:
        # Common title formats:
        # "Job Title at Company" or "Job Title @ Company"
        m_at = re.search(r"^(.*?)\s+(?:at|@)\s+(.*?)(?:\s*[-|–—:]\s*.*)?$", clean_title, re.IGNORECASE)
        if m_at:
            detected_role = m_at.group(1).strip()
            detected_company = m_at.group(2).strip()
            detected_role = re.sub(
                r"^(?:apply\s+for|job\s+application\s+for|application\s+for)\s+",
                "",
                detected_role,
                flags=re.IGNORECASE,
            ).strip()
            if not role and detected_role:
                role = detected_role
            if not company and detected_company:
                company = detected_company

        # "Company - Job Title" or "Company | Job Title" or "Company : Job Title"
        elif any(sep in clean_title for sep in [" - ", " | ", " – ", " — ", " : "]):
            for sep in [" - ", " | ", " – ", " — ", " : "]:
                if sep in clean_title:
                    parts = clean_title.split(sep, 1)
                    p1, p2 = parts[0].strip(), parts[1].strip()
                    if not company and not role:
                        role_keywords = {
                            "engineer",
                            "developer",
                            "manager",
                            "designer",
                            "scientist",
                            "analyst",
                            "intern",
                            "lead",
                            "specialist",
                        }
                        if any(kw in p1.lower() for kw in role_keywords):
                            role = p1
                            company = p2
                        else:
                            company = p1
                            role = p2
                    break
        elif not role:
            cand_role = re.sub(
                r"^(?:job\s+application|application)\s*(?:for\s*)?",
                "",
                clean_title,
                flags=re.IGNORECASE,
            ).strip()
            if cand_role:
                role = cand_role

    # 2. If company still not found, try extracting from common ATS URL patterns
    if not company and url:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        path_parts = [p for p in parsed.path.split("/") if p]

        known_companies = {
            "openai": "OpenAI",
            "uber": "Uber",
            "spotify": "Spotify",
            "airbnb": "Airbnb",
            "stripe": "Stripe",
            "google": "Google",
            "meta": "Meta",
            "apple": "Apple",
            "amazon": "Amazon",
            "microsoft": "Microsoft",
            "netflix": "Netflix",
        }

        def format_comp(name: str) -> str:
            lower = name.lower()
            return known_companies.get(lower, name.capitalize())

        if "greenhouse.io" in hostname and path_parts:
            # https://boards.greenhouse.io/<company>/jobs/...
            company = format_comp(path_parts[0])
        elif "lever.co" in hostname and path_parts:
            # https://jobs.lever.co/<company>/...
            company = format_comp(path_parts[0])
        elif "ashbyhq.com" in hostname and path_parts:
            # https://jobs.ashbyhq.com/<company>/...
            company = format_comp(path_parts[0])
        elif "workable.com" in hostname and path_parts:
            # https://apply.workable.com/<company>/...
            company = format_comp(path_parts[0])
        elif "myworkdayjobs.com" in hostname:
            # https://<company>.wd5.myworkdayjobs.com/...
            subdomain = hostname.split(".")[0]
            company = format_comp(subdomain)
        elif hostname:
            parts = hostname.split(".")
            ignored_domains = {
                "example",
                "localhost",
                "test",
                "jobs",
                "careers",
                "apply",
                "boards",
                "www",
                "com",
                "co",
                "io",
                "org",
                "net",
            }
            if len(parts) >= 2 and parts[-2] not in ignored_domains:
                candidate = parts[-2]
                company = format_comp(candidate)

    return company, role


class ApplicationTracker:
    """Manages SQLite storage and tracking for job applications."""

    def __init__(self, db_path: Path | str = "data/tracker.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Create applications table and indexes if they do not exist."""
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS applications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    company TEXT,
                    role TEXT,
                    url TEXT NOT NULL,
                    date TEXT NOT NULL,
                    status TEXT NOT NULL,
                    notes TEXT,
                    run_folder_path TEXT
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_applications_url ON applications (url)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status)")
            conn.commit()

    @staticmethod
    def validate_status(status: str) -> str:
        """Validate and normalize an application status string."""
        if not status:
            raise TrackerError("Status cannot be empty.")
        norm_status = status.strip().lower()
        if norm_status not in VALID_STATUSES:
            raise TrackerError(
                f"Invalid status '{status}'. Must be one of: {', '.join(VALID_STATUSES)}"
            )
        return norm_status

    def add_application(
        self,
        url: str,
        status: str = "filled",
        company: str = "",
        role: str = "",
        date: Optional[str] = None,
        notes: str = "",
        run_folder_path: str = "",
    ) -> int:
        """Add a new job application record to the tracker.

        Args:
            url: Job application URL.
            status: Initial application status (filled, submitted, abandoned, error).
            company: Company name.
            role: Job role / title.
            date: Timestamp string (defaults to current local time).
            notes: Optional notes.
            run_folder_path: Optional path to run artifacts directory.

        Returns:
            The newly inserted record ID.
        """
        if not url:
            raise TrackerError("URL cannot be empty.")
        norm_status = self.validate_status(status)
        timestamp = date or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO applications (company, role, url, date, status, notes, run_folder_path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    company.strip(),
                    role.strip(),
                    url.strip(),
                    timestamp,
                    norm_status,
                    notes.strip(),
                    str(run_folder_path).strip(),
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def update_status(
        self,
        app_id: int,
        status: str,
        notes: Optional[str] = None,
    ) -> bool:
        """Update the status (and optionally notes) of an existing application.

        Args:
            app_id: Record ID to update.
            status: New status (filled, submitted, abandoned, error).
            notes: Optional new notes to overwrite or update.

        Returns:
            True if row was updated, False if application ID was not found.
        """
        norm_status = self.validate_status(status)

        with self._get_connection() as conn:
            if notes is not None:
                cursor = conn.execute(
                    """
                    UPDATE applications
                    SET status = ?, notes = ?
                    WHERE id = ?
                    """,
                    (norm_status, notes.strip(), app_id),
                )
            else:
                cursor = conn.execute(
                    """
                    UPDATE applications
                    SET status = ?
                    WHERE id = ?
                    """,
                    (norm_status, app_id),
                )
            conn.commit()
            return cursor.rowcount > 0

    def get_application(self, app_id: int) -> Optional[ApplicationRecord]:
        """Retrieve an application record by its ID."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, company, role, url, date, status, notes, run_folder_path
                FROM applications
                WHERE id = ?
                """,
                (app_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return ApplicationRecord(
                id=row["id"],
                company=row["company"] or "",
                role=row["role"] or "",
                url=row["url"],
                date=row["date"],
                status=row["status"],
                notes=row["notes"] or "",
                run_folder_path=row["run_folder_path"] or "",
            )

    def get_by_url(self, url: str) -> Optional[ApplicationRecord]:
        """Retrieve the most recent application record matching a given URL."""
        if not url:
            return None
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, company, role, url, date, status, notes, run_folder_path
                FROM applications
                WHERE url = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (url.strip(),),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return ApplicationRecord(
                id=row["id"],
                company=row["company"] or "",
                role=row["role"] or "",
                url=row["url"],
                date=row["date"],
                status=row["status"],
                notes=row["notes"] or "",
                run_folder_path=row["run_folder_path"] or "",
            )

    def list_applications(
        self,
        status: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[ApplicationRecord]:
        """List tracked applications, optionally filtered by status and limited in quantity."""
        query = "SELECT id, company, role, url, date, status, notes, run_folder_path FROM applications"
        params: List[Any] = []

        if status:
            norm_status = self.validate_status(status)
            query += " WHERE status = ?"
            params.append(norm_status)

        query += " ORDER BY id DESC"

        if limit is not None and limit > 0:
            query += " LIMIT ?"
            params.append(limit)

        with self._get_connection() as conn:
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            return [
                ApplicationRecord(
                    id=row["id"],
                    company=row["company"] or "",
                    role=row["role"] or "",
                    url=row["url"],
                    date=row["date"],
                    status=row["status"],
                    notes=row["notes"] or "",
                    run_folder_path=row["run_folder_path"] or "",
                )
                for row in rows
            ]

    def record_run(
        self,
        url: str,
        status: str,
        company: str = "",
        role: str = "",
        notes: str = "",
        run_folder_path: str = "",
    ) -> int:
        """Create or update a tracker row for a job assist run.

        If a record for the URL already exists, it updates the record with the
        new status, date, notes, and run artifacts folder. Otherwise, inserts a new row.

        Args:
            url: Job application URL.
            status: Status of the run (filled, submitted, abandoned, error).
            company: Company name.
            role: Job role / title.
            notes: Run summary or notes.
            run_folder_path: Path to the run artifacts folder.

        Returns:
            The application ID (existing or newly created).
        """
        norm_status = self.validate_status(status)
        existing = self.get_by_url(url)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if existing:
            upd_company = company.strip() or existing.company
            upd_role = role.strip() or existing.role
            upd_notes = notes.strip() or existing.notes
            upd_path = str(run_folder_path).strip() or existing.run_folder_path

            with self._get_connection() as conn:
                conn.execute(
                    """
                    UPDATE applications
                    SET company = ?, role = ?, date = ?, status = ?, notes = ?, run_folder_path = ?
                    WHERE id = ?
                    """,
                    (upd_company, upd_role, timestamp, norm_status, upd_notes, upd_path, existing.id),
                )
                conn.commit()
            return existing.id
        else:
            return self.add_application(
                url=url,
                status=norm_status,
                company=company,
                role=role,
                date=timestamp,
                notes=notes,
                run_folder_path=str(run_folder_path),
            )
