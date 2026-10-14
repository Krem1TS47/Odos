"""Browser UI action executor for JobAssist."""

from pathlib import Path
from typing import Any, Dict, List, Optional
from playwright.sync_api import Locator, Page


class ActionError(Exception):
    """Raised when executing a browser UI action fails."""
    pass


SUBMIT_KEYWORDS = [
    "submit",
    "submit application",
    "submit my application",
    "send application",
    "apply now",
    "complete application",
]


def is_submit_element(locator: Locator) -> bool:
    """Check if a locator targets a final submission button."""
    try:
        text = (locator.inner_text() or "").lower().strip()
        val = (locator.get_attribute("value") or "").lower().strip()
        aria = (locator.get_attribute("aria-label") or "").lower().strip()
        el_type = (locator.get_attribute("type") or "").lower().strip()

        for kw in SUBMIT_KEYWORDS:
            if kw in text or kw in val or kw in aria:
                return True
        if el_type == "submit" and ("submit" in text or "submit" in val or not text):
            return True
    except Exception:
        pass
    return False


def resolve_locator(page: Page, target: str) -> Locator:
    """Resolve a target string to a Playwright Locator with fallback strategies."""
    # 1. Direct CSS / XPath
    try:
        loc = page.locator(target)
        if loc.count() > 0:
            return loc.first
    except Exception:
        pass

    # 2. Match by label
    try:
        loc = page.get_by_label(target, exact=False)
        if loc.count() > 0:
            return loc.first
    except Exception:
        pass

    # 3. Match by placeholder
    try:
        loc = page.get_by_placeholder(target, exact=False)
        if loc.count() > 0:
            return loc.first
    except Exception:
        pass

    # 4. Match by ID or Name
    try:
        loc = page.locator(f"#{target}, [name='{target}']")
        if loc.count() > 0:
            return loc.first
    except Exception:
        pass

    # 5. Match by visible text or role
    try:
        loc = page.get_by_text(target, exact=False)
        if loc.count() > 0:
            return loc.first
    except Exception:
        pass

    return page.locator(target).first


def navigate(page: Page, url: str) -> Dict[str, Any]:
    """Navigate browser to the given URL."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1000)
        return {
            "status": "ok",
            "url": page.url,
            "title": page.title(),
        }
    except Exception as e:
        raise ActionError(f"Failed to navigate to {url}: {e}") from e


def scroll(page: Page, direction: str = "down", amount: int = 500) -> Dict[str, Any]:
    """Scroll the page up or down."""
    try:
        delta_y = amount if direction.lower() == "down" else -amount
        page.evaluate(f"window.scrollBy(0, {delta_y})")
        page.wait_for_timeout(500)
        scroll_y = page.evaluate("window.scrollY")
        return {
            "status": "ok",
            "direction": direction,
            "amount": amount,
            "scroll_y": scroll_y,
        }
    except Exception as e:
        raise ActionError(f"Failed to scroll {direction}: {e}") from e


def take_screenshot(page: Page) -> bytes:
    """Capture a PNG screenshot of the current visible page viewport."""
    try:
        return page.screenshot(type="png", full_page=False)
    except Exception as e:
        raise ActionError(f"Failed to take screenshot: {e}") from e


def click(page: Page, selector: str) -> Dict[str, Any]:
    """Click an element on the page, with safety gate protecting submit buttons."""
    try:
        loc = resolve_locator(page, selector)
        if loc.count() == 0:
            raise ActionError(f"Element not found for selector: {selector}")

        if is_submit_element(loc):
            raise ActionError(
                f"Blocked click on final submission button ({selector}). "
                "Odos never clicks Submit autonomously. Please finish form and prompt the user."
            )

        loc.scroll_into_view_if_needed()
        loc.click(timeout=10000)
        page.wait_for_timeout(500)
        return {"status": "ok", "action": "click", "selector": selector}
    except ActionError:
        raise
    except Exception as e:
        raise ActionError(f"Failed to click {selector}: {e}") from e


def type_text(page: Page, selector: str, text: str) -> Dict[str, Any]:
    """Fill text into an input field or textarea."""
    try:
        loc = resolve_locator(page, selector)
        if loc.count() == 0:
            raise ActionError(f"Element not found for selector: {selector}")

        loc.scroll_into_view_if_needed()
        loc.fill(text, timeout=10000)
        page.wait_for_timeout(300)
        return {"status": "ok", "action": "type", "selector": selector, "value": text}
    except Exception as e:
        raise ActionError(f"Failed to type into {selector}: {e}") from e


def select_option(page: Page, selector: str, option: str) -> Dict[str, Any]:
    """Select an option in a select dropdown, radio button, or checkbox."""
    try:
        loc = resolve_locator(page, selector)
        if loc.count() == 0:
            raise ActionError(f"Element not found for selector: {selector}")

        loc.scroll_into_view_if_needed()
        tag = loc.evaluate("el => el.tagName.toLowerCase()")
        if tag == "select":
            try:
                loc.select_option(label=option, timeout=5000)
            except Exception:
                loc.select_option(value=option, timeout=5000)
        else:
            el_type = (loc.get_attribute("type") or "").lower()
            if el_type in ("radio", "checkbox"):
                loc.check(timeout=5000)
            else:
                loc.click(timeout=5000)
                page.wait_for_timeout(300)
                page.get_by_text(option, exact=False).first.click(timeout=5000)

        page.wait_for_timeout(300)
        return {"status": "ok", "action": "select", "selector": selector, "option": option}
    except Exception as e:
        raise ActionError(f"Failed to select '{option}' in {selector}: {e}") from e


def upload_file(page: Page, file_path: Path | str, selector: Optional[str] = None) -> Dict[str, Any]:
    """Upload a file to a file input element."""
    resolved = Path(file_path).resolve()
    if not resolved.is_file():
        raise ActionError(f"File to upload does not exist: {resolved}")

    try:
        if selector:
            loc = resolve_locator(page, selector)
        else:
            loc = page.locator("input[type='file']").first

        if loc.count() == 0:
            raise ActionError("No file upload input element found on page.")

        loc.set_input_files(str(resolved), timeout=10000)
        page.wait_for_timeout(500)
        return {"status": "ok", "action": "upload", "file": str(resolved)}
    except ActionError:
        raise
    except Exception as e:
        raise ActionError(f"Failed to upload {file_path}: {e}") from e


def extract_form_fields(page: Page) -> List[Dict[str, Any]]:
    """Extract form inputs, buttons, selects, and textareas from the DOM."""
    try:
        return page.evaluate("""() => {
            const elements = Array.from(document.querySelectorAll('input, select, textarea, button, [role="button"]'));
            return elements
                .filter(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && el.type !== 'hidden';
                })
                .map(el => {
                    let label = '';
                    if (el.id) {
                        const lbl = document.querySelector(`label[for="${el.id}"]`);
                        if (lbl) label = lbl.innerText.trim();
                    }
                    if (!label) {
                        const parentLabel = el.closest('label');
                        if (parentLabel) label = parentLabel.innerText.trim();
                    }
                    return {
                        tag: el.tagName.toLowerCase(),
                        type: el.type || '',
                        name: el.name || '',
                        id: el.id || '',
                        label: label,
                        placeholder: el.placeholder || '',
                        value: el.value || '',
                        aria_label: el.getAttribute('aria-label') || '',
                        required: el.required || el.getAttribute('aria-required') === 'true',
                        text: (el.innerText || '').slice(0, 100).trim()
                    };
                });
        }""")
    except Exception:
        return []
