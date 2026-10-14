"""Gemini computer-use agent loop for JobAssist (Dry-Run and Form Filling)."""

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from dotenv import load_dotenv
from google import genai
from google.genai import types

from jobassist.actions import (
    click,
    extract_form_fields,
    navigate,
    scroll,
    select_option,
    take_screenshot,
    type_text,
    upload_file,
)
from jobassist.config import AppConfig
from jobassist.logging_utils import create_run_dir, log_turn, save_screenshot, save_summary
from jobassist.profile import UserAnswers, UserProfile, format_profile_context


class AgentError(Exception):
    """Raised for agent execution errors."""
    pass


@dataclass
class AgentResult:
    status: str
    turns: int
    fields_found: List[str] = field(default_factory=list)
    fields_filled: List[Dict[str, Any]] = field(default_factory=list)
    summary: str = ""
    run_dir: Optional[Path] = None
    duration_seconds: float = 0.0


DRY_RUN_SYSTEM_PROMPT = """You are Odos, a local Job Application Assistant operating in read-only / dry-run inspection mode.
Your task is to inspect the target job application page, identify all form fields (e.g. contact inputs, resume upload, experience, disclosures, demographics, custom questions), and report them.

Rules:
1. In dry-run mode, DO NOT fill in values or click submit buttons.
2. If you need to view more content down the page to find all fields, call the scroll tool.
3. If you have inspected the form fields or reached the end of the form, call finish_inspection with the list of fields discovered and a clear summary.
4. If you see a CAPTCHA, a login wall, or an unexpected error, call finish_inspection with an explanation in summary.
"""

FORM_FILLING_SYSTEM_PROMPT = """You are Odos, an assisted local Job Application Assistant.
Your task is to fill out job application forms using ONLY the candidate profile and saved answers provided in the prompt.

Strict Rules:
1. Use only facts and credentials provided in the Candidate Profile Data and Reusable Answers. NEVER invent or hallucinate answers, experience, degrees, or employers.
2. If a required field cannot be determined from the profile or answers, call ask_user_for_input to request the answer from the user.
3. NEVER click final "Submit", "Submit Application", or "Send Application" buttons. Odos is strictly safety-gated: when all fields are filled, you must call finish_form to hand control back to the user for manual review and confirmation.
4. For resume upload, call upload_resume.
5. Never enter payment information, government IDs / SSN, or passwords.
6. If you encounter a CAPTCHA, a login wall, or unexpected page, stop and report it via finish_form or ask_user_for_input.
"""


def _get_inspection_tool() -> types.Tool:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="navigate",
                description="Navigate browser to a given URL.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "url": types.Schema(type=types.Type.STRING, description="Target URL")
                    },
                    required=["url"],
                ),
            ),
            types.FunctionDeclaration(
                name="scroll",
                description="Scroll the page viewport up or down to inspect more fields.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "direction": types.Schema(
                            type=types.Type.STRING,
                            enum=["up", "down"],
                            description="Scroll direction",
                        ),
                        "amount": types.Schema(
                            type=types.Type.INTEGER,
                            description="Pixels to scroll (default 500)",
                        ),
                    },
                    required=["direction"],
                ),
            ),
            types.FunctionDeclaration(
                name="finish_inspection",
                description="Conclude inspection after identifying the application form fields.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "fields_found": types.Schema(
                            type=types.Type.ARRAY,
                            items=types.Schema(type=types.Type.STRING),
                            description="List of discovered form fields and requirements",
                        ),
                        "summary": types.Schema(
                            type=types.Type.STRING,
                            description="Detailed summary of form requirements and fields",
                        ),
                    },
                    required=["fields_found", "summary"],
                ),
            ),
        ]
    )


def _get_filling_tool() -> types.Tool:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="type_text",
                description="Type text into a form input field or textarea. Use the field ID, name, or CSS selector.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "selector": types.Schema(type=types.Type.STRING, description="CSS selector, ID, or name of input"),
                        "text": types.Schema(type=types.Type.STRING, description="Text value to enter from candidate profile"),
                        "field_name": types.Schema(type=types.Type.STRING, description="Human readable description of field"),
                    },
                    required=["selector", "text"],
                ),
            ),
            types.FunctionDeclaration(
                name="click",
                description="Click an interactive UI element (e.g. checkbox, tab, dropdown toggle). Final submit is blocked.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "selector": types.Schema(type=types.Type.STRING, description="CSS selector or ID of element"),
                        "description": types.Schema(type=types.Type.STRING, description="Purpose of click"),
                    },
                    required=["selector"],
                ),
            ),
            types.FunctionDeclaration(
                name="select_option",
                description="Select an option from a dropdown, radio button, or checkbox.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "selector": types.Schema(type=types.Type.STRING, description="CSS selector, ID, or name"),
                        "option": types.Schema(type=types.Type.STRING, description="Option text or value to choose"),
                        "description": types.Schema(type=types.Type.STRING, description="Field description"),
                    },
                    required=["selector", "option"],
                ),
            ),
            types.FunctionDeclaration(
                name="upload_resume",
                description="Upload the candidate's resume PDF to the file upload input field.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "selector": types.Schema(type=types.Type.STRING, description="Optional CSS selector of file input"),
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="scroll",
                description="Scroll page viewport up or down to reveal subsequent form sections.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "direction": types.Schema(type=types.Type.STRING, enum=["up", "down"]),
                        "amount": types.Schema(type=types.Type.INTEGER),
                    },
                    required=["direction"],
                ),
            ),
            types.FunctionDeclaration(
                name="ask_user_for_input",
                description="Pause execution and ask the human user for an answer when a required question is missing from the stored profile.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "question": types.Schema(type=types.Type.STRING, description="The question text to ask user"),
                        "field_name": types.Schema(type=types.Type.STRING, description="Field identifier"),
                    },
                    required=["question", "field_name"],
                ),
            ),
            types.FunctionDeclaration(
                name="finish_form",
                description="Conclude form filling when all form fields are filled. DO NOT submit; call this to hand control to user.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "summary": types.Schema(type=types.Type.STRING, description="Summary of filled fields and review instructions"),
                    },
                    required=["summary"],
                ),
            ),
        ]
    )


def run_dry_run_agent(
    page: Any,
    job_url: str,
    config: AppConfig,
    run_dir: Optional[Path] = None,
    on_turn: Optional[Callable[[int, str], None]] = None,
) -> AgentResult:
    """Execute the Gemini agent inspection loop on a target job application page."""
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise AgentError("GEMINI_API_KEY is not set in environment or .env file.")

    actual_run_dir = run_dir or create_run_dir(config.paths.runs_dir)
    actual_run_dir.mkdir(parents=True, exist_ok=True)

    model_name = config.model.name
    if not model_name or model_name == "VERIFY_IN_DOCS":
        model_name = "gemini-3.1-flash-lite"

    client = genai.Client(api_key=api_key)
    tool = _get_inspection_tool()

    chat = client.chats.create(
        model=model_name,
        config=types.GenerateContentConfig(
            system_instruction=DRY_RUN_SYSTEM_PROMPT,
            tools=[tool],
            temperature=config.model.temperature,
        ),
    )

    if on_turn:
        on_turn(0, f"Navigating to {job_url}")
    nav_result = navigate(page, job_url)
    log_turn(actual_run_dir, 0, "navigate", nav_result, f"Initial navigation to {job_url}")

    start_time = time.time()
    max_turns = config.limits.max_turns
    max_runtime = config.limits.max_runtime_seconds

    turn = 1
    fields_found: List[str] = []
    summary_text = ""
    status = "running"

    while turn <= max_turns:
        elapsed = time.time() - start_time
        if elapsed > max_runtime:
            status = "timeout"
            summary_text = f"Agent reached maximum runtime limit ({max_runtime}s)."
            log_turn(actual_run_dir, turn, "timeout", {"elapsed_seconds": elapsed})
            break

        if on_turn:
            on_turn(turn, f"Turn {turn}/{max_turns}: Capturing viewport & analyzing page...")

        screenshot_bytes = take_screenshot(page)
        save_screenshot(actual_run_dir, turn, screenshot_bytes)
        dom_elements = extract_form_fields(page)

        prompt_text = (
            f"Turn {turn} of {max_turns}.\n"
            f"Current URL: {page.url}\n"
            f"Page Title: {page.title()}\n"
            f"Visible Form Elements from DOM: {json.dumps(dom_elements[:40])}\n\n"
            f"Inspect the form. If you need to see lower sections, call scroll(direction='down'). "
            f"If you have identified the fields, call finish_inspection(fields_found=[...], summary='...')."
        )
        parts = [
            types.Part.from_bytes(data=screenshot_bytes, mime_type="image/png"),
            prompt_text,
        ]

        try:
            response = chat.send_message(parts)
        except Exception as e:
            status = "error"
            summary_text = f"Gemini API error during turn {turn}: {e}"
            log_turn(actual_run_dir, turn, "api_error", {"error": str(e)})
            break

        function_calls = response.function_calls or []
        if not function_calls:
            text_resp = response.text or ""
            log_turn(actual_run_dir, turn, "model_text", notes=text_resp)
            fields_found = [
                f.get("label") or f.get("name") or f.get("placeholder")
                for f in dom_elements
                if (f.get("label") or f.get("name") or f.get("placeholder"))
            ]
            summary_text = text_resp
            status = "completed"
            break

        finished = False
        for fc in function_calls:
            args = fc.args or {}
            if fc.name == "finish_inspection":
                fields_found = args.get("fields_found", [])
                summary_text = args.get("summary", "")
                log_turn(actual_run_dir, turn, "finish_inspection", args, "Inspection concluded by agent.")
                finished = True
                status = "completed"
                break
            elif fc.name == "scroll":
                direction = args.get("direction", "down")
                amount = int(args.get("amount", 500))
                scroll_res = scroll(page, direction=direction, amount=amount)
                log_turn(actual_run_dir, turn, "scroll", scroll_res)
                chat.send_message([
                    types.Part.from_function_response(
                        name="scroll",
                        response={"result": scroll_res},
                    )
                ])
            elif fc.name == "navigate":
                nav_url = args.get("url", "")
                nav_res = navigate(page, nav_url)
                log_turn(actual_run_dir, turn, "navigate", nav_res)
                chat.send_message([
                    types.Part.from_function_response(
                        name="navigate",
                        response={"result": nav_res},
                    )
                ])

        if finished:
            break

        turn += 1

    if turn > max_turns and status != "completed":
        status = "max_turns_exceeded"
        summary_text = f"Agent reached maximum turn limit ({max_turns}) without completing inspection."

    duration = time.time() - start_time
    summary_data = {
        "status": status,
        "turns": min(turn, max_turns),
        "fields_found": fields_found,
        "summary": summary_text,
        "duration_seconds": round(duration, 2),
        "job_url": job_url,
    }
    save_summary(actual_run_dir, summary_data)

    return AgentResult(
        status=status,
        turns=min(turn, max_turns),
        fields_found=fields_found,
        summary=summary_text,
        run_dir=actual_run_dir,
        duration_seconds=round(duration, 2),
    )


def run_form_filling_agent(
    page: Any,
    job_url: str,
    config: AppConfig,
    profile: UserProfile,
    answers: UserAnswers,
    resume_path: Optional[Path] = None,
    run_dir: Optional[Path] = None,
    on_turn: Optional[Callable[[int, str], None]] = None,
    on_ask_user: Optional[Callable[[str, str], str]] = None,
) -> AgentResult:
    """Execute the Gemini agent form filling loop using stored profile, resume, and answers."""
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise AgentError("GEMINI_API_KEY is not set in environment or .env file.")

    actual_run_dir = run_dir or create_run_dir(config.paths.runs_dir)
    actual_run_dir.mkdir(parents=True, exist_ok=True)

    # Resolve resume file
    resolved_resume: Optional[Path] = None
    target_resume = resume_path or profile.resumes.default
    if Path(target_resume).is_file():
        resolved_resume = Path(target_resume).resolve()
    else:
        # Search resumes directory for fallback PDF
        resumes_dir = Path(config.paths.resumes_dir)
        candidates = list(resumes_dir.glob("*.pdf")) if resumes_dir.is_dir() else []
        if candidates:
            resolved_resume = candidates[0].resolve()

    model_name = config.model.name
    if not model_name or model_name == "VERIFY_IN_DOCS":
        model_name = "gemini-3.1-flash-lite"

    client = genai.Client(api_key=api_key)
    tool = _get_filling_tool()

    profile_context = format_profile_context(profile, answers)

    chat = client.chats.create(
        model=model_name,
        config=types.GenerateContentConfig(
            system_instruction=FORM_FILLING_SYSTEM_PROMPT,
            tools=[tool],
            temperature=config.model.temperature,
        ),
    )

    if on_turn:
        on_turn(0, f"Navigating to {job_url}")
    nav_result = navigate(page, job_url)
    log_turn(actual_run_dir, 0, "navigate", nav_result, f"Initial navigation to {job_url}")

    start_time = time.time()
    max_turns = config.limits.max_turns
    max_runtime = config.limits.max_runtime_seconds

    turn = 1
    fields_filled: List[Dict[str, Any]] = []
    summary_text = ""
    status = "running"

    while turn <= max_turns:
        elapsed = time.time() - start_time
        if elapsed > max_runtime:
            status = "timeout"
            summary_text = f"Agent reached maximum runtime limit ({max_runtime}s)."
            log_turn(actual_run_dir, turn, "timeout", {"elapsed_seconds": elapsed})
            break

        if on_turn:
            on_turn(turn, f"Turn {turn}/{max_turns}: Inspecting and filling form fields...")

        screenshot_bytes = take_screenshot(page)
        save_screenshot(actual_run_dir, turn, screenshot_bytes)
        dom_elements = extract_form_fields(page)

        prompt_text = (
            f"Turn {turn} of {max_turns}.\n"
            f"{profile_context}\n\n"
            f"Current URL: {page.url}\n"
            f"Page Title: {page.title()}\n"
            f"Interactive Form Elements currently visible on page: {json.dumps(dom_elements[:40])}\n\n"
            f"Fill in the relevant form fields using candidate profile data. "
            f"If all fields are filled, call finish_form(summary='...'). DO NOT submit the form."
        )
        parts = [
            types.Part.from_bytes(data=screenshot_bytes, mime_type="image/png"),
            prompt_text,
        ]

        try:
            response = chat.send_message(parts)
        except Exception as e:
            status = "error"
            summary_text = f"Gemini API error during turn {turn}: {e}"
            log_turn(actual_run_dir, turn, "api_error", {"error": str(e)})
            break

        function_calls = response.function_calls or []
        if not function_calls:
            text_resp = response.text or ""
            log_turn(actual_run_dir, turn, "model_text", notes=text_resp)
            summary_text = text_resp
            status = "completed"
            break

        finished = False
        for fc in function_calls:
            args = fc.args or {}
            action_name = fc.name

            if action_name == "finish_form":
                summary_text = args.get("summary", "Form fields filled. Ready for user review.")
                log_turn(actual_run_dir, turn, "finish_form", args, "Agent concluded filling form.")
                finished = True
                status = "completed"
                break

            elif action_name == "type_text":
                selector = args.get("selector", "")
                text_val = args.get("text", "")
                res = type_text(page, selector, text_val)
                fields_filled.append({"field": selector, "value": text_val, "action": "type"})
                log_turn(actual_run_dir, turn, "type_text", res)
                chat.send_message([types.Part.from_function_response(name="type_text", response={"result": res})])

            elif action_name == "select_option":
                selector = args.get("selector", "")
                option = args.get("option", "")
                res = select_option(page, selector, option)
                fields_filled.append({"field": selector, "value": option, "action": "select"})
                log_turn(actual_run_dir, turn, "select_option", res)
                chat.send_message([types.Part.from_function_response(name="select_option", response={"result": res})])

            elif action_name == "click":
                selector = args.get("selector", "")
                res = click(page, selector)
                fields_filled.append({"field": selector, "action": "click"})
                log_turn(actual_run_dir, turn, "click", res)
                chat.send_message([types.Part.from_function_response(name="click", response={"result": res})])

            elif action_name == "upload_resume":
                selector = args.get("selector")
                if not resolved_resume:
                    res = {"status": "error", "message": "No resume file available to upload."}
                else:
                    res = upload_file(page, resolved_resume, selector)
                    fields_filled.append({"field": selector or "resume", "value": str(resolved_resume), "action": "upload"})
                log_turn(actual_run_dir, turn, "upload_resume", res)
                chat.send_message([types.Part.from_function_response(name="upload_resume", response={"result": res})])

            elif action_name == "scroll":
                direction = args.get("direction", "down")
                amount = int(args.get("amount", 500))
                res = scroll(page, direction=direction, amount=amount)
                log_turn(actual_run_dir, turn, "scroll", res)
                chat.send_message([types.Part.from_function_response(name="scroll", response={"result": res})])

            elif action_name == "ask_user_for_input":
                question = args.get("question", "")
                field_name = args.get("field_name", "")
                user_answer = ""
                if on_ask_user:
                    user_answer = on_ask_user(question, field_name)
                res = {"field": field_name, "user_answer": user_answer}
                log_turn(actual_run_dir, turn, "ask_user_for_input", res)
                chat.send_message([types.Part.from_function_response(name="ask_user_for_input", response={"result": res})])

        if finished:
            break

        turn += 1

    if turn > max_turns and status != "completed":
        status = "max_turns_exceeded"
        summary_text = f"Agent reached maximum turn limit ({max_turns}) without completing form filling."

    duration = time.time() - start_time
    summary_data = {
        "status": status,
        "turns": min(turn, max_turns),
        "fields_filled": fields_filled,
        "summary": summary_text,
        "duration_seconds": round(duration, 2),
        "job_url": job_url,
    }
    save_summary(actual_run_dir, summary_data)

    return AgentResult(
        status=status,
        turns=min(turn, max_turns),
        fields_filled=fields_filled,
        summary=summary_text,
        run_dir=actual_run_dir,
        duration_seconds=round(duration, 2),
    )
