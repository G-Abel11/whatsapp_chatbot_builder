"""WhatsApp Cloud API webhook: verification + intake."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import ValidationError

from ..core.config import get_settings
from ..core.security import verify_signature
from ..schemas import WebhookPayload
from ..services import process_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhook"])

JOB_PROCESS_EVENT = "process_webhook_event"


def iter_events(payload: WebhookPayload) -> list[dict[str, Any]]:
    """Flatten Meta's nested payload into one job dict per message/status."""
    events: list[dict[str, Any]] = []
    for entry in payload.entry:
        for change in entry.changes:
            value = change.value
            phone_number_id = value.metadata.phone_number_id
            names = {c.wa_id: (c.profile.name if c.profile else None) for c in value.contacts}

            for message in value.messages:
                events.append(
                    {
                        "kind": "message",
                        "event_key": f"msg:{message.id}",
                        "phone_number_id": phone_number_id,
                        "contact_name": names.get(message.sender),
                        "message": message.model_dump(by_alias=True, exclude_none=True),
                    }
                )

            for status in value.statuses:
                events.append(
                    {
                        "kind": "status",
                        "event_key": f"status:{status.id}:{status.status}",
                        "status": status.model_dump(exclude_none=True),
                    }
                )
    return events


@router.get("/webhook", response_class=PlainTextResponse)
async def verify_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
) -> PlainTextResponse:
    """Meta's subscription handshake (`hub.mode` / `hub.verify_token` / `hub.challenge`)."""
    settings = get_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return PlainTextResponse(hub_challenge or "")
    return PlainTextResponse("Forbidden", status_code=403)


@router.post("/webhook")
async def receive_webhook(request: Request, background: BackgroundTasks) -> dict[str, str]:
    """Receive a webhook, verify its signature and fan out to the queue."""
    raw = await request.body()
    settings = get_settings()

    if settings.verify_signature:
        signature = request.headers.get("X-Hub-Signature-256")
        if not verify_signature(settings.whatsapp_app_secret, raw, signature):
            raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = WebhookPayload.model_validate_json(raw or b"{}")
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Malformed payload") from exc

    pool = getattr(request.app.state, "arq", None)
    events = iter_events(payload)
    for event in events:
        if pool is not None:
            await pool.enqueue_job(JOB_PROCESS_EVENT, event)
        else:
            # No queue available (e.g. Redis down): process after the response.
            background.add_task(process_event, event, pool=None)

    logger.info("webhook received: %s event(s)", len(events))
    return {"status": "ok", "events": str(len(events))}
