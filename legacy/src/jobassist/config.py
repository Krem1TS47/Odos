"""Configuration loader and models for JobAssist."""

from pathlib import Path
from typing import Any, List
import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class ConfigError(Exception):
    """Raised when configuration file is missing, invalid YAML, or fails schema validation."""
    pass


class ModelConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = "VERIFY_IN_DOCS"
    temperature: float = 0.2


class ViewportConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    width: int = 1280
    height: int = 900


class BrowserConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    channel: str = "chrome"
    headless: bool = False
    user_data_dir: Path = Path("data/browser_profile")
    viewport: ViewportConfig = Field(default_factory=ViewportConfig)
    slow_mo_ms: int = 150


class LimitsConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    max_turns: int = 40
    max_runtime_seconds: int = 900
    max_applications_per_session: int = 3


class SafetyConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    allowed_domains: List[str] = Field(default_factory=list)
    require_confirm_before_submit: bool = True
    require_confirm_on: List[str] = Field(
        default_factory=lambda: ["submit", "send application", "payment", "delete"]
    )
    blocked_actions: List[str] = Field(default_factory=list)


class PathsConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    profile: Path = Path("data/profile.yaml")
    answers: Path = Path("data/answers.yaml")
    resumes_dir: Path = Path("data/resumes")
    runs_dir: Path = Path("data/runs")
    tracker_db: Path = Path("data/tracker.db")


class AppConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: ModelConfig = Field(default_factory=ModelConfig)
    browser: BrowserConfig = Field(default_factory=BrowserConfig)
    limits: LimitsConfig = Field(default_factory=LimitsConfig)
    safety: SafetyConfig = Field(default_factory=SafetyConfig)
    paths: PathsConfig = Field(default_factory=PathsConfig)


def load_config(path: Path | str = "config.yaml") -> AppConfig:
    """Load and validate application configuration from YAML file.

    Args:
        path: Path to config.yaml.

    Returns:
        Validated AppConfig instance.

    Raises:
        ConfigError: If file not found, unparseable, or schema validation fails.
    """
    config_path = Path(path)
    if not config_path.is_file():
        raise ConfigError(f"Configuration file not found: {config_path}")

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            raw_data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise ConfigError(f"Error parsing YAML from {config_path}: {e}") from e
    except Exception as e:
        raise ConfigError(f"Error reading {config_path}: {e}") from e

    data: dict[str, Any] = raw_data or {}
    if not isinstance(data, dict):
        raise ConfigError(f"Configuration in {config_path} must be a mapping/dictionary, got {type(data).__name__}")

    try:
        return AppConfig.model_validate(data)
    except ValidationError as e:
        errors = []
        for err in e.errors():
            loc = " -> ".join(str(p) for p in err["loc"])
            errors.append(f"{loc}: {err['msg']}")
        raise ConfigError(f"Invalid configuration in {config_path}:\n" + "\n".join(f"  - {msg}" for msg in errors)) from e
