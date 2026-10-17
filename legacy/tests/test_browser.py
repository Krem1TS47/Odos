import time
from pathlib import Path
import pytest
from jobassist.config import BrowserConfig, ViewportConfig
from jobassist.browser import BrowserSession, BrowserError


def test_browser_session_init():
    config = BrowserConfig(
        channel="chrome",
        headless=True,
        user_data_dir=Path("data/test_profile"),
        viewport=ViewportConfig(width=1000, height=800),
        slow_mo_ms=50,
    )
    session = BrowserSession(config=config, headless=True)
    assert session.headless is True
    assert session.user_data_dir == Path("data/test_profile")
    assert session.context is None
    assert session.page is None


def test_browser_session_lifecycle(tmp_path):
    profile_dir = tmp_path / "profile_lifecycle"
    session = BrowserSession(
        headless=True,
        user_data_dir=profile_dir,
    )
    page = session.start()
    assert session.context is not None
    assert page is not None
    assert not page.is_closed()

    page.goto("https://example.com")
    assert "Example Domain" in page.title()

    session.close()
    assert session.context is None
    assert session.page is None


def test_browser_session_context_manager(tmp_path):
    profile_dir = tmp_path / "profile_context"
    with BrowserSession(headless=True, user_data_dir=profile_dir) as session:
        page = session.get_page()
        page.goto("https://example.com")
        assert "Example" in page.title()

    assert session.context is None


def test_session_persistence_across_runs(tmp_path):
    """Verify that browser cookies/session state persist across distinct BrowserSession runs."""
    shared_profile = tmp_path / "persistent_profile"

    # Run 1: Launch session and store cookie
    session1 = BrowserSession(headless=True, user_data_dir=shared_profile)
    page1 = session1.start()
    page1.goto("https://example.com")
    session1.context.add_cookies([
        {
            "name": "odos_auth_token",
            "value": "secret_session_token_xyz",
            "domain": ".example.com",
            "path": "/",
            "expires": int(time.time()) + 3600,
        }
    ])
    cookies1 = session1.context.cookies()
    token_names = [c["name"] for c in cookies1]
    assert "odos_auth_token" in token_names
    session1.close()

    # Run 2: Launch a new distinct BrowserSession with the same profile dir
    session2 = BrowserSession(headless=True, user_data_dir=shared_profile)
    session2.start()
    cookies2 = session2.context.cookies()
    saved_tokens = {c["name"]: c["value"] for c in cookies2}

    assert "odos_auth_token" in saved_tokens
    assert saved_tokens["odos_auth_token"] == "secret_session_token_xyz"
    session2.close()


def test_get_page_before_start():
    session = BrowserSession(headless=True)
    with pytest.raises(BrowserError, match="Browser session has not been started"):
        session.get_page()
