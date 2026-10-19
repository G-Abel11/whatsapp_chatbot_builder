from __future__ import annotations

import hashlib
import hmac

from app.core.security import compute_signature, verify_signature


def test_compute_signature_matches_meta_format() -> None:
    body = b'{"hello":"world"}'
    secret = "s3cret"
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert compute_signature(secret, body) == f"sha256={expected}"


def test_verify_signature_accepts_valid_header() -> None:
    body = b"payload"
    header = compute_signature("secret", body)
    assert verify_signature("secret", body, header) is True


def test_verify_signature_rejects_tampered_body() -> None:
    header = compute_signature("secret", b"payload")
    assert verify_signature("secret", b"tampered", header) is False


def test_verify_signature_rejects_missing_header() -> None:
    assert verify_signature("secret", b"payload", None) is False
