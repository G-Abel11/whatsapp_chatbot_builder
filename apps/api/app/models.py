"""SQLModel tables.

Note on JSONB columns: SQLAlchemy does not track in-place mutation of JSON
values, so always **reassign** the attribute (`conversation.vars = {...}`)
rather than mutating the existing dict.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

# Postgres gets JSONB (indexable, efficient); other dialects — SQLite in tests —
# fall back to plain JSON so the same models work everywhere.
JsonType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(UTC)


class Flow(SQLModel, table=True):
    """An exported chatbot graph, as produced by the builder."""

    __tablename__ = "flows"

    id: str = Field(primary_key=True)
    tenant_id: str = Field(default="tenant_default", index=True)
    title: str = Field(default="Untitled flow")
    status: str = Field(default="draft", index=True)  # draft | live
    # WhatsApp Business phone number id this flow answers on.
    phone_number_id: str | None = Field(default=None, index=True)
    # Meta access token used to send on this bot's behalf. Falls back to the
    # server-wide WHATSAPP_ACCESS_TOKEN when unset; never returned by the API.
    access_token: str | None = Field(default=None)
    # React Flow graph: { nodes: [...], edges: [...], viewport: {...} }
    graph: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JsonType, nullable=False, default=dict),
    )
    version: int = Field(default=1)
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class Contact(SQLModel, table=True):
    """A WhatsApp end user, keyed by their `wa_id` (phone number)."""

    __tablename__ = "contacts"

    id: int | None = Field(default=None, primary_key=True)
    wa_id: str = Field(index=True, unique=True)
    profile_name: str | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class Conversation(SQLModel, table=True):
    """Runtime state for one contact's journey through one flow."""

    __tablename__ = "conversations"

    id: int | None = Field(default=None, primary_key=True)
    contact_id: int = Field(foreign_key="contacts.id", index=True)
    flow_id: str = Field(foreign_key="flows.id", index=True)

    status: str = Field(default="active", index=True)  # active | handed_off | closed

    # Where the walker is; kept so a resumed job (e.g. after a delay) knows where to continue.
    current_node_id: str | None = Field(default=None)

    # Pending interaction: the node we're waiting on and what kind of reply we expect.
    awaiting_node_id: str | None = Field(default=None)
    awaiting_kind: str | None = Field(default=None)  # input | options

    # Captured {{variables}} for this conversation. This is what makes
    # "Hi {{name}}" echo the customer's actual reply.
    variables: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JsonType, nullable=False, default=dict),
    )

    # 24-hour customer service window bookkeeping.
    last_inbound_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    window_expires_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    __table_args__ = (
        Index("ix_conversations_contact_flow", "contact_id", "flow_id"),
    )


class Message(SQLModel, table=True):
    """Inbound and outbound message log."""

    __tablename__ = "messages"

    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversations.id", index=True)

    direction: str = Field(index=True)  # inbound | outbound
    kind: str = Field(default="text")  # text | media | template | interactive | ...
    body: str | None = Field(default=None)

    # WhatsApp message id (wamid...). Unique so a redelivered webhook is a no-op.
    wa_message_id: str | None = Field(default=None, index=True, unique=True)

    # Recipient wa_id for outbound rows (needed to retry a failed send).
    recipient: str | None = Field(default=None)
    attempts: int = Field(default=0)

    node_id: str | None = Field(default=None)
    payload: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JsonType, nullable=False, default=dict),
    )
    # received | queued | sent | delivered | read | failed
    status: str = Field(default="received", index=True)
    error: str | None = Field(default=None, sa_column=Column(String, nullable=True))

    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class WebhookEvent(SQLModel, table=True):
    """Raw inbound webhook payload, kept for idempotency and replay."""

    __tablename__ = "webhook_events"

    id: int | None = Field(default=None, primary_key=True)
    # Idempotency key: message id for messages, status id + state for statuses.
    event_key: str = Field(index=True, unique=True)
    kind: str = Field(default="unknown")  # message | status | unknown
    payload: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JsonType, nullable=False, default=dict),
    )
    processed: bool = Field(default=False, index=True)
    error: str | None = Field(default=None)
    received_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
