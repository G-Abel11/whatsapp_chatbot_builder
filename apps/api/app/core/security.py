"""Verification of WhatsApp Cloud API webhook requests."""

from __future__ import annotations

import hashlib
import hmac


def compute_signature(app_secret: str, raw_body: bytes) -> str:
    """`sha256=<hex>` signature Meta sends in `X-Hub-Signature-256`."""
    digest = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def verify_signature(app_secret: str, raw_body: bytes, header: str | None) -> bool:
    """Constant-time comparison of the webhook signature header."""
    if not header:
        return False
    expected = compute_signature(app_secret, raw_body)
    return hmac.compare_digest(expected, header)
