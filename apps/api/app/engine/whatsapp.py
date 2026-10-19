"""WhatsApp Cloud API client and 24-hour window helpers."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

from ..core.config import Settings, get_settings
from .outcome import Outbound

logger = logging.getLogger(__name__)

#: Customers can only be messaged freely for 24h after their last message.
FREE_WINDOW_SECONDS = 24 * 60 * 60


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def within_free_window(window_expires_at: datetime | None, now: datetime | None = None) -> bool:
    """True while a free-form (non-template) message may still be sent."""
    expiry = _as_utc(window_expires_at)
    if expiry is None:
        return False
    moment = now or datetime.now(UTC)
    return moment < expiry


def _safe_json(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        return {"raw": response.text}
    return data if isinstance(data, dict) else {"data": data}


def _error_message(data: dict[str, Any]) -> str | None:
    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("title") or error)
    return None


def _is_unconfigured(token: str | None) -> bool:
    """True when a token is missing or still the placeholder default."""
    stripped = (token or "").strip()
    return not stripped or stripped.startswith("change-me")


def _dry_run_result(phone_number_id: str, to: str, outbound: Outbound) -> SendResult:
    preview = outbound.body or outbound.kind
    logger.info("[dry-run] → %s (%s) via %s: %s", to, outbound.kind, phone_number_id, preview)
    return SendResult(
        ok=True,
        wa_message_id=f"dryrun_{uuid.uuid4().hex[:16]}",
        response={"dry_run": True},
    )


@dataclass(slots=True)
class SendResult:
    ok: bool
    wa_message_id: str | None = None
    error: str | None = None
    response: dict[str, Any] = field(default_factory=dict)


class WhatsAppClient:
    """Thin async wrapper over `POST /{phone_number_id}/messages`."""

    def __init__(
        self,
        settings: Settings | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._client = client
        self._owns_client = client is None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=20.0)
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> WhatsAppClient:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    def _endpoint(self, phone_number_id: str) -> str:
        base = self.settings.whatsapp_api_base.rstrip("/")
        version = self.settings.whatsapp_graph_version
        return f"{base}/{version}/{phone_number_id}/messages"

    async def send(
        self,
        phone_number_id: str,
        to: str,
        outbound: Outbound,
        access_token: str | None = None,
    ) -> SendResult:
        # Per-bot token first, then the server-wide default. With neither
        # configured the send degrades to a logged dry run.
        token = (access_token or "").strip() or self.settings.whatsapp_access_token.strip()
        if _is_unconfigured(token):
            return _dry_run_result(phone_number_id, to, outbound)

        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            **outbound.payload,
        }
        headers = {"Authorization": f"Bearer {token}"}
        try:
            response = await self.client.post(
                self._endpoint(phone_number_id), json=payload, headers=headers
            )
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error=str(exc))

        data = _safe_json(response)
        if response.status_code >= 400:
            return SendResult(
                ok=False,
                error=_error_message(data) or f"HTTP {response.status_code}",
                response=data,
            )

        wa_message_id: str | None = None
        messages = data.get("messages")
        if isinstance(messages, list) and messages and isinstance(messages[0], dict):
            wa_message_id = messages[0].get("id")
        return SendResult(ok=True, wa_message_id=wa_message_id, response=data)


class DryRunWhatsAppClient(WhatsAppClient):
    """Logs instead of calling Meta, regardless of any configured token.

    Lets the whole pipeline be exercised locally: messages are persisted and
    visible through the conversations API, nothing leaves the machine.
    """

    async def send(
        self,
        phone_number_id: str,
        to: str,
        outbound: Outbound,
        access_token: str | None = None,
    ) -> SendResult:
        return _dry_run_result(phone_number_id, to, outbound)


def build_client(settings: Settings | None = None) -> WhatsAppClient:
    """Return the Cloud API client.

    Dry-run fallback now happens per send: a bot with its own token sends even
    when the server-wide WHATSAPP_ACCESS_TOKEN is unset, and a send with no
    token at all is logged instead of hitting Meta.
    """
    settings = settings or get_settings()
    if _is_unconfigured(settings.whatsapp_access_token):
        logger.warning(
            "WHATSAPP_ACCESS_TOKEN not configured — sends without a per-bot "
            "flow token will run in dry-run mode"
        )
    return WhatsAppClient(settings)
