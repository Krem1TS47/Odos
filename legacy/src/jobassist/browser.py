"""Playwright browser session management for JobAssist."""

from pathlib import Path
from typing import Optional
from playwright.sync_api import sync_playwright, BrowserContext, Page, Playwright

from jobassist.config import BrowserConfig


class BrowserError(Exception):
    """Raised for browser launch, session, or navigation errors."""
    pass


class BrowserSession:
    """Manages a Playwright persistent browser session with Chrome/Chromium."""

    def __init__(
        self,
        config: Optional[BrowserConfig] = None,
        headless: Optional[bool] = None,
        user_data_dir: Optional[Path | str] = None,
    ):
        self.config = config or BrowserConfig()
        self.headless = headless if headless is not None else self.config.headless
        self.user_data_dir = Path(user_data_dir or self.config.user_data_dir)
        self._playwright: Optional[Playwright] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None

    def start(self) -> Page:
        """Start the persistent browser context and return an active page.

        Returns:
            The primary active Page instance.

        Raises:
            BrowserError: If browser launch fails.
        """
        if self._context is not None:
            return self.get_page()

        self.user_data_dir.mkdir(parents=True, exist_ok=True)

        try:
            self._playwright = sync_playwright().start()

            launch_args = {
                "user_data_dir": str(self.user_data_dir),
                "headless": self.headless,
                "args": ["--disable-blink-features=AutomationControlled"],
                "viewport": {
                    "width": self.config.viewport.width,
                    "height": self.config.viewport.height,
                },
                "slow_mo": self.config.slow_mo_ms,
            }
            if self.config.channel:
                launch_args["channel"] = self.config.channel

            try:
                self._context = self._playwright.chromium.launch_persistent_context(**launch_args)
            except Exception as e:
                # If channel="chrome" fails (e.g. in test or CI environment), fallback to bundled chromium
                if self.config.channel:
                    launch_args.pop("channel", None)
                    self._context = self._playwright.chromium.launch_persistent_context(**launch_args)
                else:
                    raise e

            if self._context.pages:
                self._page = self._context.pages[0]
            else:
                self._page = self._context.new_page()

            return self._page
        except Exception as e:
            self.close()
            raise BrowserError(f"Failed to launch browser session: {e}") from e

    def get_page(self) -> Page:
        """Get the current active page or create one if none exist.

        Returns:
            Active Page instance.

        Raises:
            BrowserError: If browser session is not running.
        """
        if self._context is None:
            raise BrowserError("Browser session has not been started.")
        if self._page is None or self._page.is_closed():
            open_pages = [p for p in self._context.pages if not p.is_closed()]
            if open_pages:
                self._page = open_pages[0]
            else:
                self._page = self._context.new_page()
        return self._page

    @property
    def context(self) -> Optional[BrowserContext]:
        """Return the underlying BrowserContext, if started."""
        return self._context

    @property
    def page(self) -> Optional[Page]:
        """Return the primary active Page, if started."""
        return self._page

    def close(self) -> None:
        """Close browser context and stop Playwright cleanly."""
        if self._context is not None:
            try:
                self._context.close()
            except Exception:
                pass
            self._context = None
            self._page = None

        if self._playwright is not None:
            try:
                self._playwright.stop()
            except Exception:
                pass
            self._playwright = None

    def __enter__(self) -> "BrowserSession":
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
