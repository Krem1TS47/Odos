"""Profile and answers loader and models for JobAssist."""

from pathlib import Path
from typing import Any, Dict, List
import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class ProfileError(Exception):
    """Raised when profile file is missing, invalid YAML, or fails schema validation."""
    pass


class AnswersError(Exception):
    """Raised when answers file is missing, invalid YAML, or fails schema validation."""
    pass


class LocationInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    city: str = ""
    region: str = ""
    state: str = ""
    country: str = ""


class PersonalInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    first_name: str = ""
    last_name: str = ""
    email: str = ""
    area: str = ""
    phone: str = ""
    location: LocationInfo = Field(default_factory=LocationInfo)
    linkedin: str = ""
    github: str = ""
    portfolio: str = ""


class WorkAuthorization(BaseModel):
    model_config = ConfigDict(extra="allow")

    authorized_to_work_in: List[str] = Field(default_factory=list)
    requires_sponsorship: bool = False


class Preferences(BaseModel):
    model_config = ConfigDict(extra="allow")

    desired_salary: str = ""
    notice_period: str = ""
    willing_to_relocate: bool = False
    remote_preference: str = ""


class EducationItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    school: str = ""
    degree: str = ""
    field: str = ""
    start: str = ""
    end: str = ""


class ExperienceItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    company: str = ""
    title: str = ""
    start: str = ""
    end: str = ""
    summary: str = ""


class ResumesConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    default: Path = Path("data/resumes/resume.pdf")


class UserProfile(BaseModel):
    model_config = ConfigDict(extra="allow")

    personal: PersonalInfo = Field(default_factory=PersonalInfo)
    work_authorization: WorkAuthorization = Field(default_factory=WorkAuthorization)
    preferences: Preferences = Field(default_factory=Preferences)
    education: List[EducationItem] = Field(default_factory=list)
    experience: List[ExperienceItem] = Field(default_factory=list)
    resumes: ResumesConfig = Field(default_factory=ResumesConfig)


class UserAnswers(BaseModel):
    model_config = ConfigDict(extra="allow")

    why_interested_template: str = ""
    strengths: str = ""
    biggest_achievement: str = ""
    how_did_you_hear: str = "Company website"
    custom: Dict[str, Any] = Field(default_factory=dict)


def load_profile(path: Path | str = "data/profile.yaml") -> UserProfile:
    """Load and validate user profile from YAML file.

    Args:
        path: Path to profile.yaml.

    Returns:
        Validated UserProfile instance.

    Raises:
        ProfileError: If file not found, unparseable, or schema validation fails.
    """
    profile_path = Path(path)
    if not profile_path.is_file():
        raise ProfileError(f"Profile file not found: {profile_path}")

    try:
        with open(profile_path, "r", encoding="utf-8") as f:
            raw_data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise ProfileError(f"Error parsing YAML from {profile_path}: {e}") from e
    except Exception as e:
        raise ProfileError(f"Error reading {profile_path}: {e}") from e

    data: dict[str, Any] = raw_data or {}
    if not isinstance(data, dict):
        raise ProfileError(f"Profile in {profile_path} must be a mapping/dictionary, got {type(data).__name__}")

    try:
        return UserProfile.model_validate(data)
    except ValidationError as e:
        errors = []
        for err in e.errors():
            loc = " -> ".join(str(p) for p in err["loc"])
            errors.append(f"{loc}: {err['msg']}")
        raise ProfileError(f"Invalid profile in {profile_path}:\n" + "\n".join(f"  - {msg}" for msg in errors)) from e


def load_answers(path: Path | str = "data/answers.yaml") -> UserAnswers:
    """Load and validate answers from YAML file.

    Args:
        path: Path to answers.yaml.

    Returns:
        Validated UserAnswers instance.

    Raises:
        AnswersError: If file not found, unparseable, or schema validation fails.
    """
    answers_path = Path(path)
    if not answers_path.is_file():
        raise AnswersError(f"Answers file not found: {answers_path}")

    try:
        with open(answers_path, "r", encoding="utf-8") as f:
            raw_data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise AnswersError(f"Error parsing YAML from {answers_path}: {e}") from e
    except Exception as e:
        raise AnswersError(f"Error reading {answers_path}: {e}") from e

    data: dict[str, Any] = raw_data or {}
    if not isinstance(data, dict):
        raise AnswersError(f"Answers in {answers_path} must be a mapping/dictionary, got {type(data).__name__}")

    try:
        return UserAnswers.model_validate(data)
    except ValidationError as e:
        errors = []
        for err in e.errors():
            loc = " -> ".join(str(p) for p in err["loc"])
            errors.append(f"{loc}: {err['msg']}")
        raise AnswersError(f"Invalid answers in {answers_path}:\n" + "\n".join(f"  - {msg}" for msg in errors)) from e
