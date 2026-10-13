from pathlib import Path
import pytest
from jobassist.profile import (
    load_profile,
    load_answers,
    ProfileError,
    AnswersError,
    UserProfile,
    UserAnswers,
    Disclosures,
    Demographics,
)


def test_load_default_profile():
    profile = load_profile("data/profile.yaml")
    assert isinstance(profile, UserProfile)
    assert profile.personal.first_name == "Benjamin"
    assert profile.personal.last_name == "Ching"
    assert "United States" in profile.work_authorization.authorized_to_work_in
    assert profile.preferences.willing_to_relocate is True
    assert profile.disclosures.at_least_18_years_of_age is True
    assert profile.disclosures.is_government_official is False
    assert profile.disclosures.has_government_official_relative is False
    assert isinstance(profile.demographics, Demographics)
    assert len(profile.education) > 0
    assert profile.education[0].school == "University of British Columbia"


def test_disclosures_and_demographics_aliases(tmp_path):
    custom_profile_file = tmp_path / "custom_profile.yaml"
    custom_profile_file.write_text(
        """
personal:
  first_name: "Test"
legal:
  is_18_or_older: true
  government_official: true
  relative_of_government_official: false
eeoc:
  race_ethnicity: "Asian"
  disability: "No"
  veteran: "I am not a veteran"
        """,
        encoding="utf-8",
    )
    profile = load_profile(custom_profile_file)
    assert profile.disclosures.at_least_18_years_of_age is True
    assert profile.disclosures.is_government_official is True
    assert profile.disclosures.has_government_official_relative is False
    assert profile.demographics.race == "Asian"
    assert profile.demographics.disability_status == "No"
    assert profile.demographics.veteran_status == "I am not a veteran"


def test_load_default_answers():
    answers = load_answers("data/answers.yaml")
    assert isinstance(answers, UserAnswers)
    assert answers.how_did_you_hear == "Company website"
    assert isinstance(answers.custom, dict)


def test_load_profile_missing_file(tmp_path):
    missing_file = tmp_path / "missing_profile.yaml"
    with pytest.raises(ProfileError, match="Profile file not found"):
        load_profile(missing_file)


def test_load_answers_missing_file(tmp_path):
    missing_file = tmp_path / "missing_answers.yaml"
    with pytest.raises(AnswersError, match="Answers file not found"):
        load_answers(missing_file)


def test_load_profile_invalid_yaml(tmp_path):
    invalid_file = tmp_path / "invalid.yaml"
    invalid_file.write_text("personal:\n  first_name: [invalid", encoding="utf-8")
    with pytest.raises(ProfileError, match="Error parsing YAML"):
        load_profile(invalid_file)


def test_load_answers_invalid_type(tmp_path):
    bad_file = tmp_path / "bad.yaml"
    bad_file.write_text("- not a dict\n", encoding="utf-8")
    with pytest.raises(AnswersError, match="must be a mapping/dictionary"):
        load_answers(bad_file)


def test_load_profile_invalid_schema(tmp_path):
    bad_schema = tmp_path / "bad_schema.yaml"
    bad_schema.write_text("education: not_a_list\n", encoding="utf-8")
    with pytest.raises(ProfileError, match="Invalid profile"):
        load_profile(bad_schema)
