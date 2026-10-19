from __future__ import annotations

from datetime import UTC, datetime

from app.engine.handlers import evaluate_condition, is_open_now, is_valid_input


def test_condition_equals_and_contains() -> None:
    assert evaluate_condition({"variable": "x", "operator": "equals", "value": "5"}, {"x": "5"})
    assert evaluate_condition(
        {"variable": "x", "operator": "contains", "value": "ad"}, {"x": "Ada"}
    )


def test_condition_numeric_comparison() -> None:
    assert evaluate_condition(
        {"variable": "score", "operator": "greater_than", "value": "50"}, {"score": 75}
    )
    assert not evaluate_condition(
        {"variable": "score", "operator": "less_than", "value": "50"}, {"score": 75}
    )


def test_condition_exists_operators() -> None:
    assert evaluate_condition({"variable": "x", "operator": "exists"}, {"x": "y"})
    assert evaluate_condition({"variable": "x", "operator": "not_exists"}, {})
    assert not evaluate_condition({"variable": "x", "operator": "exists"}, {"x": ""})


def test_condition_is_case_insensitive_by_default() -> None:
    config = {"variable": "x", "operator": "equals", "value": "ada"}
    assert evaluate_condition(config, {"x": "ADA"})
    config["caseSensitive"] = True
    assert not evaluate_condition(config, {"x": "ADA"})


def test_input_validation() -> None:
    assert is_valid_input("email", "a@b.co")
    assert not is_valid_input("email", "nope")
    assert is_valid_input("number", "42.5")
    assert not is_valid_input("number", "abc")
    assert is_valid_input("phone", "+254 712 000 111")
    assert not is_valid_input("url", "ftp://x")
    assert is_valid_input("text", "anything")
    assert not is_valid_input("text", "   ")


def test_business_hours_open_and_closed() -> None:
    monday_noon = datetime(2026, 1, 5, 12, 0, tzinfo=UTC)  # a Monday
    assert is_open_now("UTC", "Mon-Fri, 09:00-17:00", monday_noon)
    sunday = datetime(2026, 1, 4, 12, 0, tzinfo=UTC)
    assert not is_open_now("UTC", "Mon-Fri, 09:00-17:00", sunday)


def test_business_hours_defaults_open_when_schedule_missing() -> None:
    assert is_open_now("UTC", "")
