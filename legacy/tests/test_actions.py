from pathlib import Path
import pytest
from jobassist.browser import BrowserSession
from jobassist.actions import (
    ActionError,
    click,
    extract_form_fields,
    navigate,
    scroll,
    select_option,
    take_screenshot,
    type_text,
    upload_file,
)


def test_actions_on_local_page(tmp_path):
    resume_file = tmp_path / "sample_resume.pdf"
    resume_file.write_bytes(b"%PDF-1.4 sample resume content")

    html_file = tmp_path / "form.html"
    html_file.write_text(
        """
        <!DOCTYPE html>
        <html>
        <head><title>Job Form</title></head>
        <body style="height: 3000px;">
            <h1>Job Application</h1>
            <form id="app_form">
                <label for="full_name">Full Name</label>
                <input id="full_name" name="name" type="text" placeholder="John Doe" required />

                <label for="user_email">Email</label>
                <input id="user_email" name="email" type="email" />

                <label for="work_auth">Work Authorization</label>
                <select id="work_auth" name="work_auth">
                    <option value="">Select...</option>
                    <option value="authorized">Authorized to work</option>
                    <option value="sponsorship">Requires sponsorship</option>
                </select>

                <label for="resume">Resume Upload</label>
                <input id="resume" name="resume" type="file" />

                <button id="safe_btn" type="button">Help / Info</button>
                <button id="submit_btn" type="submit">Submit Application</button>
            </form>
        </body>
        </html>
        """,
        encoding="utf-8",
    )

    url = html_file.as_uri()

    with BrowserSession(headless=True, user_data_dir=tmp_path / "browser_profile") as session:
        page = session.get_page()

        # 1. Navigate
        nav_res = navigate(page, url)
        assert nav_res["status"] == "ok"
        assert nav_res["title"] == "Job Form"

        # 2. Extract form fields
        fields = extract_form_fields(page)
        assert len(fields) >= 5

        # 3. Type text
        type_res = type_text(page, "#full_name", "Benjamin Ching")
        assert type_res["status"] == "ok"
        assert page.locator("#full_name").input_value() == "Benjamin Ching"

        type_email = type_text(page, "user_email", "ben@example.com")
        assert type_email["status"] == "ok"
        assert page.locator("#user_email").input_value() == "ben@example.com"

        # 4. Select option
        sel_res = select_option(page, "#work_auth", "Authorized to work")
        assert sel_res["status"] == "ok"
        assert page.locator("#work_auth").input_value() == "authorized"

        # 5. Upload file
        upload_res = upload_file(page, resume_file, selector="#resume")
        assert upload_res["status"] == "ok"
        assert page.locator("#resume").evaluate("el => el.files.length") == 1

        # 6. Click safe button
        click_res = click(page, "#safe_btn")
        assert click_res["status"] == "ok"

        # 7. Safety Gate: Click on submit button must be blocked!
        with pytest.raises(ActionError, match="Blocked click on final submission"):
            click(page, "#submit_btn")

        # 8. Take screenshot
        sc = take_screenshot(page)
        assert isinstance(sc, bytes)
        assert len(sc) > 100

        # 9. Scroll
        scroll_res = scroll(page, direction="down", amount=300)
        assert scroll_res["status"] == "ok"
        assert scroll_res["scroll_y"] >= 200
