from pathlib import Path
import pytest
from jobassist.config import load_config, ConfigError, AppConfig


def test_load_default_config():
    cfg = load_config("config.yaml")
    assert isinstance(cfg, AppConfig)
    assert cfg.model.name == "VERIFY_IN_DOCS"
    assert cfg.browser.channel == "chrome"
    assert cfg.browser.headless is False
    assert cfg.limits.max_turns == 40
    assert cfg.safety.require_confirm_before_submit is True
    assert Path(cfg.paths.profile) == Path("data/profile.yaml")


def test_load_config_missing_file(tmp_path):
    missing_file = tmp_path / "does_not_exist.yaml"
    with pytest.raises(ConfigError, match="Configuration file not found"):
        load_config(missing_file)


def test_load_config_invalid_yaml(tmp_path):
    invalid_file = tmp_path / "invalid.yaml"
    invalid_file.write_text("model:\n  name: [unclosed list", encoding="utf-8")
    with pytest.raises(ConfigError, match="Error parsing YAML"):
        load_config(invalid_file)


def test_load_config_non_dict(tmp_path):
    list_file = tmp_path / "list.yaml"
    list_file.write_text("- item1\n- item2\n", encoding="utf-8")
    with pytest.raises(ConfigError, match="must be a mapping/dictionary"):
        load_config(list_file)


def test_load_config_invalid_schema(tmp_path):
    bad_schema_file = tmp_path / "bad.yaml"
    bad_schema_file.write_text("limits:\n  max_turns: not_an_integer\n", encoding="utf-8")
    with pytest.raises(ConfigError, match="Invalid configuration"):
        load_config(bad_schema_file)
