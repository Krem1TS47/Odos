"""Safety checks, domain allowlist, turn limits, and confirmation gates."""

from typing import Any, Callable, Dict, List, Optional, Set
from urllib.parse import urlparse
from rich.console import Console
from rich.prompt import Confirm
from rich.table import Table


from jobassist.config import SafetyConfig


class SafetyError(Exception):
    """Base exception for safety gate violations."""
    pass


class DomainNotAllowedError(SafetyError):
    """Raised when navigation to an unapproved domain is attempted."""
    pass


class ActionBlockedError(SafetyError):
    """Raised when a prohibited action is attempted."""
    pass


CAPTCHA_SELECTORS = [
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    "iframe[src*='turnstile']",
    "iframe[src*='challenges.cloudflare.com']",
    "iframe[src*='arkoselabs']",
    "iframe[src*='funcaptcha']",
    "iframe[src*='awswaf']",
    "iframe[src*='datadome']",
    "iframe[src*='perimeterx']",
    "iframe[src*='kasada']",
    ".g-recaptcha",
    ".h-captcha",
    "#cf-challenge-running",
    "#challenge-stage",
    "#challenge-form",
    "#fc-iframe-wrap",
    "#aws-waf-captcha",
    "div#datadome",
    "#px-captcha",
    ".geetest_holder",
    ".geetest_radar",
]

CAPTCHA_TEXT_PATTERNS = [
    "verify you are human",
    "verify that you are a human",
    "please verify you are a human",
    "just a moment...",
    "security check to continue",
    "complete the captcha",
    "press & hold",
    "press and hold",
    "bot detection",
    "unusual traffic",
    "solve the puzzle",
    "solve this puzzle",
]

LOGIN_WALL_PATTERNS = [
    "sign in to continue",
    "log in to continue",
    "please sign in to apply",
    "sign in to apply",
    "sign in to your account",
    "create an account to apply",
    "sign in or register",
]


def extract_domain(url: str) -> str:
    """Extract and normalize the hostname from a URL.

    Args:
        url: Full or partial web URL.

    Returns:
        Normalized lowercased domain (e.g. 'boards.greenhouse.io'), or empty string for local files.
    """
    if not url:
        return ""
    url = url.strip()
    if url.startswith(("file://", "data:", "about:", "chrome:")):
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    parsed = urlparse(url)
    return (parsed.hostname or "").lower()



def is_domain_allowed(domain: str, allowed_domains: List[str]) -> bool:
    """Check if a domain matches the allowed domain list (including subdomains).

    Args:
        domain: Target hostname.
        allowed_domains: List of allowed domains.

    Returns:
        True if domain is explicitly permitted.
    """
    domain = domain.lower()
    for allowed in allowed_domains:
        allowed = allowed.lower().strip()
        if not allowed:
            continue
        if domain == allowed or domain.endswith("." + allowed):
            return True
    return False


def ensure_domain_allowed(
    url: str,
    allowed_domains: List[str],
    session_allowed: Optional[Set[str]] = None,
    prompt_fn: Optional[Callable[[str], bool]] = None,
) -> bool:
    """Verify that navigation to the URL's domain is allowed, prompting if unapproved.

    Args:
        url: Destination URL.
        allowed_domains: Configured domain allowlist.
        session_allowed: Mutable set of domains approved for the current session.
        prompt_fn: Optional interactive confirmation callback.

    Returns:
        True if allowed.

    Raises:
        DomainNotAllowedError: If domain is not permitted.
    """
    domain = extract_domain(url)
    if not domain:
        return True  # Local file or data URL

    # 1. Check persistent config allowlist
    if is_domain_allowed(domain, allowed_domains):
        return True

    # 2. Check session-approved domains
    if session_allowed is not None and domain in session_allowed:
        return True

    # 3. Prompt user if callback provided
    if prompt_fn:
        approved = prompt_fn(domain)
        if approved:
            if session_allowed is not None:
                session_allowed.add(domain)
            return True

    raise DomainNotAllowedError(
        f"Domain '{domain}' is not in the allowed domains list and was not approved."
    )


def is_confirm_required(
    action_name: str,
    details: str,
    require_confirm_on: List[str],
) -> bool:
    """Check if an action matches keywords requiring user confirmation.

    Args:
        action_name: Action type (e.g. 'click', 'submit').
        details: Target description, selector, or value.
        require_confirm_on: List of trigger keywords.

    Returns:
        True if user confirmation is required before execution.
    """
    combined = f"{action_name} {details}".lower()
    for trigger in require_confirm_on:
        trigger = trigger.lower().strip()
        if trigger and trigger in combined:
            return True
    return False


def is_action_blocked(action_name: str, details: str, blocked_actions: List[str]) -> bool:
    """Check if an action matches any pattern in the blocked_actions list."""
    combined = f"{action_name} {details}".lower()
    for pattern in blocked_actions:
        pattern = pattern.lower().strip()
        if pattern and pattern in combined:
            return True
    return False


def detect_page_blockers(page: Any) -> Optional[str]:
    """Detect if page displays a CAPTCHA, bot challenge, or login wall.

    Args:
        page: Playwright Page instance.

    Returns:
        String description of detected blocker, or None.
    """
    try:
        title = (page.title() or "").lower()
        if "just a moment..." in title or "attention required! | cloudflare" in title:
            return "Cloudflare bot challenge screen detected."

        for selector in CAPTCHA_SELECTORS:
            try:
                if page.locator(selector).count() > 0:
                    return f"CAPTCHA element detected ({selector})."
            except Exception:
                pass

        # Check nested frames
        if hasattr(page, "frames"):
            for frame in page.frames:
                for selector in CAPTCHA_SELECTORS:
                    try:
                        if frame.locator(selector).count() > 0:
                            return f"CAPTCHA element detected in frame ({selector})."
                    except Exception:
                        pass

        try:
            body_text = (page.locator("body").inner_text(timeout=1000) or "").lower()
        except Exception:
            body_text = ""

        for phrase in CAPTCHA_TEXT_PATTERNS:
            if phrase in body_text:
                return f"Human verification prompt detected ('{phrase}')."

        for phrase in LOGIN_WALL_PATTERNS:
            if phrase in body_text or phrase in title:
                return f"Login wall detected ('{phrase}'). Please log in first."

    except Exception:
        pass
    return None


def confirm_risky_action(
    action_name: str,
    details: str,
    console: Optional[Console] = None,
    prompt_fn: Optional[Callable[[str], bool]] = None,
) -> bool:
    """Prompt user to confirm a sensitive action.

    Args:
        action_name: Action type.
        details: Action description.
        console: Optional Rich console.
        prompt_fn: Optional custom prompt callable.

    Returns:
        True if user approved.
    """
    msg = f"Action '{action_name}' on '{details}' requires confirmation. Proceed?"
    if prompt_fn:
        return prompt_fn(msg)

    c = console or Console()
    c.print(f"\n[bold yellow]Safety Gate Alert:[/bold yellow] {msg}")
    return Confirm.ask("Do you approve this action?", default=False)


def check_action_safety(
    action_name: str,
    details: str,
    safety_config: SafetyConfig,
    on_confirm: Optional[Callable[[str, str], bool]] = None,
) -> tuple[bool, Optional[str]]:
    """Check if an action is allowed, blocked, or requires user confirmation.

    Args:
        action_name: The action name (e.g. 'click', 'type_text', 'navigate').
        details: Details string (selectors, arguments, descriptions).
        safety_config: The SafetyConfig instance from AppConfig.
        on_confirm: Optional callback for prompting user: fn(action_name, details) -> bool.

    Returns:
        tuple (allowed: bool, reason: Optional[str])
    """
    # 1. Check blocked_actions
    if is_action_blocked(action_name, details, safety_config.blocked_actions):
        return False, f"Action '{action_name}' on '{details}' is blocked by safety configuration."

    # 2. Check if confirmation is required
    requires_confirm = is_confirm_required(action_name, details, safety_config.require_confirm_on)
    if not requires_confirm and safety_config.require_confirm_before_submit:
        submit_keywords = ["submit", "send application", "apply now"]
        combined = f"{action_name} {details}".lower()
        if any(kw in combined for kw in submit_keywords):
            requires_confirm = True

    if requires_confirm:
        confirmed = False
        if on_confirm:
            confirmed = on_confirm(action_name, details)
        else:
            confirmed = confirm_risky_action(action_name, details)

        if not confirmed:
            return False, f"Action '{action_name}' on '{details}' requires confirmation and was declined by the user."

    return True, None

