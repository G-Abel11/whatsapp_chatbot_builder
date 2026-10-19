"""HTTP-level tests (no database required)."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import get_settings
from app.core.security import compute_signature
from app.main import app


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_health() -> None:
    async with _client() as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_webhook_verification_returns_challenge() -> None:
    settings = get_settings()
    async with _client() as client:
        response = await client.get(
            "/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": settings.whatsapp_verify_token,
                "hub.challenge": "1234567890",
            },
        )
    assert response.status_code == 200
    assert response.text == "1234567890"


async def test_webhook_verification_rejects_wrong_token() -> None:
    async with _client() as client:
        response = await client.get(
            "/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "definitely-wrong",
                "hub.challenge": "123",
            },
        )
    assert response.status_code == 403


async def test_webhook_rejects_bad_signature() -> None:
    if not get_settings().verify_signature:
        pytest.skip("signature verification disabled in settings")
    async with _client() as client:
        response = await client.post(
            "/webhook",
            json={"object": "whatsapp_business_account", "entry": []},
            headers={"X-Hub-Signature-256": "sha256=deadbeef"},
        )
    assert response.status_code == 403


async def test_webhook_accepts_valid_signature_with_no_events() -> None:
    settings = get_settings()
    body = b'{"object":"whatsapp_business_account","entry":[]}'
    headers = {"Content-Type": "application/json"}
    if settings.verify_signature:
        headers["X-Hub-Signature-256"] = compute_signature(settings.whatsapp_app_secret, body)
    async with _client() as client:
        response = await client.post("/webhook", content=body, headers=headers)
    assert response.status_code == 200
    assert response.json()["events"] == "0"
