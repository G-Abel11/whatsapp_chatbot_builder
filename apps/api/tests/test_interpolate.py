from __future__ import annotations

from app.engine.interpolate import interpolate, lookup


def test_replaces_known_variables() -> None:
    assert interpolate("Hi {{name}}!", {"name": "Ada"}) == "Hi Ada!"


def test_leaves_unknown_variables_untouched() -> None:
    assert interpolate("Hi {{name}}", {}) == "Hi {{name}}"


def test_tolerates_whitespace_inside_braces() -> None:
    assert interpolate("Hi {{  name  }}", {"name": "Ada"}) == "Hi Ada"


def test_handles_empty_and_none() -> None:
    assert interpolate(None, {"name": "Ada"}) == ""
    assert interpolate("", {"name": "Ada"}) == ""


def test_dotted_lookup() -> None:
    variables = {"profile": {"first": "Ada"}}
    assert interpolate("{{profile.first}}", variables) == "Ada"
    assert lookup(variables, "profile.missing") is None


def test_coerces_numbers_and_booleans() -> None:
    assert interpolate("{{n}}/{{b}}", {"n": 42, "b": True}) == "42/true"


def test_does_not_reuse_a_missing_value_as_blank() -> None:
    assert interpolate("a{{x}}b", {"x": ""}) == "a{{x}}b"
