"""Orchestration: bind the pure runner to the database, the sender and the queue.

The engine's control flow lives in :mod:`app.engine.runner`; this module adds
persistence (conversations, variables, message log), outbound delivery and
scheduling of delayed resumptions and failed-send retries.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..models import Contact, Conversation, Flow, Message, utcnow
from ..schemas import InboundMessage
from .graph import Graph
from .outcome import Outbound
from .runner import Runner, RunnerState
from .whatsapp import FREE_WINDOW_SECONDS, SendResult

logger = logging.getLogger(__name__)


class Sender(Protocol):
    async def __call__(
        self,
        phone_number_id: str,
        to: str,
        outbound: Outbound,
        access_token: str | None = None,
    ) -> SendResult: ...


#: `(id, delay_seconds)` → schedule an async job.
Scheduler = Callable[[int, float], Awaitable[None]]


@dataclass(slots=True)
class Delivery:
    """Everything the engine needs to talk to the outside world."""

    sender: Sender
    resume: Scheduler | None = None
    retry_send: Scheduler | None = None


# ── Inbound helpers ─────────────────────────────────────────────────────────


def inbound_text(message: InboundMessage) -> str:
    """A human-readable rendering of an inbound message (used for logs/vars)."""
    if message.text and message.text.body:
        return message.text.body
    if message.interactive:
        reply = message.interactive.button_reply or message.interactive.list_reply
        if reply:
            return reply.title or reply.id or ""
    if message.button:
        return message.button.title or message.button.id or ""
    if message.location:
        location = message.location
        return f"{location.latitude},{location.longitude}"
    for media in (message.image, message.video, message.audio, message.document, message.sticker):
        if media is not None:
            return media.caption or f"[{message.type}]"
    return ""


def inbound_choice(message: InboundMessage) -> tuple[str, str] | None:
    """Extract an interactive reply as `(id, title)`, if present."""
    if message.interactive:
        reply = message.interactive.button_reply or message.interactive.list_reply
        if reply and (reply.id or reply.title):
            return (reply.id or "", reply.title or reply.id or "")
    if message.button and (message.button.id or message.button.title):
        return (message.button.id or "", message.button.title or message.button.id or "")
    return None


# ── Lookups ─────────────────────────────────────────────────────────────────


async def resolve_flow(session: AsyncSession, phone_number_id: str | None) -> Flow | None:
    """Find the flow that answers on a phone number id (falls back to newest live flow)."""
    if phone_number_id:
        result = await session.execute(
            select(Flow).where(Flow.phone_number_id == phone_number_id).limit(1)
        )
        flow = result.scalar_one_or_none()
        if flow is not None:
            return flow
    result = await session.execute(
        select(Flow).where(Flow.status == "live").order_by(Flow.updated_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def get_or_create_contact(
    session: AsyncSession, wa_id: str, profile_name: str | None = None
) -> Contact:
    result = await session.execute(select(Contact).where(Contact.wa_id == wa_id).limit(1))
    contact = result.scalar_one_or_none()
    if contact is None:
        contact = Contact(wa_id=wa_id, profile_name=profile_name)
        session.add(contact)
        await session.flush()
    elif profile_name and contact.profile_name != profile_name:
        contact.profile_name = profile_name
    return contact


async def get_or_create_conversation(
    session: AsyncSession, flow: Flow, contact: Contact
) -> Conversation:
    result = await session.execute(
        select(Conversation)
        .where(Conversation.contact_id == contact.id, Conversation.flow_id == flow.id)
        .order_by(Conversation.id.desc())
        .limit(1)
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        conversation = Conversation(contact_id=contact.id, flow_id=flow.id, variables={})
        session.add(conversation)
        await session.flush()
    return conversation


# ── State <-> model ─────────────────────────────────────────────────────────


def _state_from(conversation: Conversation, graph: Graph) -> RunnerState:
    state = RunnerState(
        variables=dict(conversation.variables or {}),
        current_node_id=conversation.current_node_id,
        awaiting_node_id=conversation.awaiting_node_id,
        awaiting_kind=conversation.awaiting_kind,
        status=conversation.status,
    )
    # `awaiting_variable` is not persisted: derive it from the pending node.
    node = graph.node(state.awaiting_node_id)
    if node is not None and node.kind in {"ask_question", "request_location"}:
        variable = str(node.config.get("variable") or "").strip()
        state.awaiting_variable = variable or None
    return state


def _apply_state(conversation: Conversation, state: RunnerState) -> None:
    conversation.variables = dict(state.variables)
    conversation.awaiting_node_id = state.awaiting_node_id
    conversation.awaiting_kind = state.awaiting_kind
    conversation.status = state.status
    # After a delay the walker should continue from the post-delay node.
    if state.delay_seconds is not None:
        conversation.current_node_id = state.resume_node_id
    else:
        conversation.current_node_id = state.current_node_id
    conversation.updated_at = utcnow()


# ── Persistence of log rows ─────────────────────────────────────────────────


async def _log_inbound(
    session: AsyncSession, conversation: Conversation, message: InboundMessage
) -> None:
    session.add(
        Message(
            conversation_id=conversation.id,
            direction="inbound",
            kind=message.type,
            body=inbound_text(message),
            wa_message_id=message.id,
            payload=message.model_dump(by_alias=True, exclude_none=True),
            status="received",
        )
    )
    await session.flush()


async def _log_note(
    session: AsyncSession, conversation: Conversation, note: str, node_id: str | None
) -> None:
    session.add(
        Message(
            conversation_id=conversation.id,
            direction="system",
            kind="note",
            body=note,
            node_id=node_id,
            status="logged",
        )
    )
    await session.flush()


async def _send_outbound(
    session: AsyncSession,
    *,
    conversation: Conversation,
    phone_number_id: str,
    to: str,
    outbound: Outbound,
    delivery: Delivery,
    row: Message | None = None,
    access_token: str | None = None,
) -> Message:
    """Send one outbound message, creating or updating its log row."""
    if row is None:
        row = Message(
            conversation_id=conversation.id,
            direction="outbound",
            kind=outbound.kind,
            body=outbound.body,
            recipient=to,
            node_id=outbound.node_id,
            payload=dict(outbound.payload),
            status="queued",
            attempts=0,
        )
        session.add(row)
        await session.flush()

    row.attempts += 1
    try:
        result = await delivery.sender(
            phone_number_id, to, outbound, access_token=access_token
        )
    except Exception as exc:  # a sender must never crash the run
        result = SendResult(ok=False, error=str(exc))

    if result.ok:
        row.status = "sent"
        row.wa_message_id = result.wa_message_id
        row.error = None
    else:
        row.status = "failed"
        row.error = result.error
        max_attempts = get_settings().max_send_attempts
        if delivery.retry_send is not None and row.attempts < max_attempts:
            await delivery.retry_send(row.id, float(get_settings().send_retry_delay_seconds))
        else:
            logger.warning(
                "outbound send failed for conversation %s after %s attempt(s): %s",
                conversation.id,
                row.attempts,
                result.error,
            )
    row.updated_at = utcnow()
    await session.flush()
    return row


# ── Finish ──────────────────────────────────────────────────────────────────


async def _finish(
    session: AsyncSession,
    *,
    conversation: Conversation,
    flow: Flow,
    contact: Contact,
    state: RunnerState,
    outputs: list[Outbound],
    notes: list[str],
    delivery: Delivery,
) -> Conversation:
    _apply_state(conversation, state)
    await session.flush()

    for note in notes:
        await _log_note(session, conversation, note, state.current_node_id)

    for outbound in outputs:
        await _send_outbound(
            session,
            conversation=conversation,
            phone_number_id=flow.phone_number_id or "",
            to=contact.wa_id,
            outbound=outbound,
            delivery=delivery,
            access_token=flow.access_token,
        )

    if state.delay_seconds is not None and state.resume_node_id and delivery.resume is not None:
        await delivery.resume(conversation.id, state.delay_seconds)

    await session.commit()
    await session.refresh(conversation)
    return conversation


# ── Entry points ────────────────────────────────────────────────────────────


async def handle_inbound(
    session: AsyncSession,
    *,
    phone_number_id: str | None,
    message: InboundMessage,
    contact_name: str | None = None,
    delivery: Delivery,
) -> Conversation | None:
    """Process one inbound WhatsApp message end-to-end."""
    flow = await resolve_flow(session, phone_number_id)
    if flow is None:
        logger.warning("no flow configured for phone_number_id=%s", phone_number_id)
        return None

    # Idempotency: ignore a redelivered message id.
    if message.id:
        existing = await session.execute(
            select(Message).where(Message.wa_message_id == message.id).limit(1)
        )
        if existing.scalar_one_or_none() is not None:
            logger.info("duplicate inbound message %s ignored", message.id)
            return None

    contact = await get_or_create_contact(session, message.sender, contact_name)
    conversation = await get_or_create_conversation(session, flow, contact)

    now = utcnow()
    conversation.last_inbound_at = now
    conversation.window_expires_at = now + timedelta(seconds=FREE_WINDOW_SECONDS)
    await _log_inbound(session, conversation, message)

    graph = Graph.from_document(flow.graph)
    text = inbound_text(message)
    keyword_node = graph.match_keyword(text)

    # A handed-off conversation only responds if a keyword trigger matches.
    if conversation.status == "handed_off" and keyword_node is None:
        await session.commit()
        await session.refresh(conversation)
        return conversation

    # A closed conversation restarts cleanly.
    if conversation.status == "closed":
        conversation.status = "active"
        conversation.awaiting_node_id = None
        conversation.awaiting_kind = None
        conversation.current_node_id = None
        conversation.variables = {}

    runner = Runner(graph, _state_from(conversation, graph))

    if conversation.awaiting_node_id:
        if conversation.awaiting_kind == "options":
            choice = inbound_choice(message)
            if choice is not None:
                result = await runner.resume_with_choice(choice[0], choice[1])
            else:
                result = await runner.resume_with_input(text)
        else:
            result = await runner.resume_with_input(text)
    elif keyword_node is not None:
        if conversation.status == "handed_off":
            conversation.status = "active"
            runner.state.status = "active"
        result = await runner.start(keyword_node)
    else:
        result = await runner.start(None)

    return await _finish(
        session,
        conversation=conversation,
        flow=flow,
        contact=contact,
        state=result.state,
        outputs=result.outputs,
        notes=result.notes,
        delivery=delivery,
    )


async def resume_conversation(
    session: AsyncSession,
    *,
    conversation_id: int,
    delivery: Delivery,
) -> Conversation | None:
    """Continue a conversation that paused on a Delay node."""
    conversation = await session.get(Conversation, conversation_id)
    if conversation is None:
        logger.warning("resume: conversation %s not found", conversation_id)
        return None

    flow = await session.get(Flow, conversation.flow_id)
    if flow is None:
        logger.warning("resume: flow %s not found", conversation.flow_id)
        return None

    contact = await session.get(Contact, conversation.contact_id)
    if contact is None:
        logger.warning("resume: contact %s not found", conversation.contact_id)
        return None

    if conversation.status != "active":
        return conversation

    graph = Graph.from_document(flow.graph)
    runner = Runner(graph, _state_from(conversation, graph))
    result = await runner.start(conversation.current_node_id)

    return await _finish(
        session,
        conversation=conversation,
        flow=flow,
        contact=contact,
        state=result.state,
        outputs=result.outputs,
        notes=result.notes,
        delivery=delivery,
    )


async def resend_message(
    session: AsyncSession,
    *,
    message_id: int,
    delivery: Delivery,
) -> Message | None:
    """Retry a previously failed outbound message."""
    row = await session.get(Message, message_id)
    if row is None or row.direction != "outbound":
        return None
    if row.status == "sent":
        return row

    conversation = await session.get(Conversation, row.conversation_id)
    flow = await session.get(Flow, conversation.flow_id) if conversation else None
    if conversation is None or flow is None or not row.recipient:
        return row

    outbound = Outbound(
        kind=row.kind,
        body=row.body,
        payload=dict(row.payload or {}),
        node_id=row.node_id,
    )
    row = await _send_outbound(
        session,
        conversation=conversation,
        phone_number_id=flow.phone_number_id or "",
        to=row.recipient,
        outbound=outbound,
        delivery=delivery,
        row=row,
        access_token=flow.access_token,
    )
    await session.commit()
    return row
