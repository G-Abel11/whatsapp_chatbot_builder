"""Pydantic schemas: webhook payloads and management API request/response bodies."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ── WhatsApp inbound webhook ────────────────────────────────────────────────


class Profile(BaseModel):
    name: str | None = None


class WebhookContact(BaseModel):
    profile: Profile = Field(default_factory=Profile)
    wa_id: str


class TextBody(BaseModel):
    body: str = ""


class MediaBody(BaseModel):
    id: str | None = None
    mime_type: str | None = None
    caption: str | None = None
    filename: str | None = None
    sha256: str | None = None


class LocationBody(BaseModel):
    latitude: float = 0.0
    longitude: float = 0.0
    name: str | None = None
    address: str | None = None


class InteractiveReply(BaseModel):
    id: str | None = None
    title: str | None = None


class InteractiveBody(BaseModel):
    type: str | None = None
    button_reply: InteractiveReply | None = None
    list_reply: InteractiveReply | None = None


class InboundMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    from_: str = Field(alias="from")
    timestamp: str | None = None
    type: str = "text"
    text: TextBody | None = None
    image: MediaBody | None = None
    video: MediaBody | None = None
    audio: MediaBody | None = None
    document: MediaBody | None = None
    sticker: MediaBody | None = None
    location: LocationBody | None = None
    interactive: InteractiveBody | None = None
    button: InteractiveReply | None = None  # legacy quick-reply button

    @property
    def sender(self) -> str:
        return self.from_


class StatusError(BaseModel):
    code: int | None = None
    title: str | None = None
    message: str | None = None


class StatusEntry(BaseModel):
    id: str
    status: str  # sent | delivered | read | failed
    timestamp: str | None = None
    recipient_id: str | None = None
    errors: list[StatusError] = Field(default_factory=list)


class Metadata(BaseModel):
    display_phone_number: str | None = None
    phone_number_id: str | None = None


class ChangeValue(BaseModel):
    model_config = ConfigDict(extra="allow")

    messaging_product: str | None = None
    metadata: Metadata = Field(default_factory=Metadata)
    contacts: list[WebhookContact] = Field(default_factory=list)
    messages: list[InboundMessage] = Field(default_factory=list)
    statuses: list[StatusEntry] = Field(default_factory=list)


class Change(BaseModel):
    field: str | None = None
    value: ChangeValue


class Entry(BaseModel):
    id: str | None = None
    changes: list[Change] = Field(default_factory=list)


class WebhookPayload(BaseModel):
    object: str | None = None
    entry: list[Entry] = Field(default_factory=list)


# ── Management API ──────────────────────────────────────────────────────────


class FlowCreate(BaseModel):
    id: str | None = None
    tenant_id: str = "tenant_default"
    title: str = "Untitled flow"
    status: Literal["draft", "live"] = "draft"
    phone_number_id: str | None = None
    # Write-only: set the bot's own Meta access token. Never echoed back.
    access_token: str | None = None
    graph: dict[str, Any] = Field(default_factory=dict)


class FlowUpdate(BaseModel):
    title: str | None = None
    status: Literal["draft", "live"] | None = None
    phone_number_id: str | None = None
    # Write-only: a non-empty string sets the token, "" clears it (reverting
    # to the server-wide WHATSAPP_ACCESS_TOKEN), None leaves it unchanged.
    access_token: str | None = None
    graph: dict[str, Any] | None = None
    version: int | None = None


class FlowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    title: str
    status: str
    phone_number_id: str | None
    # Masked credential: the raw token never leaves the API.
    has_access_token: bool = False
    version: int
    updated_at: datetime


class FlowDetail(FlowRead):
    graph: dict[str, Any] = Field(default_factory=dict)


class ContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    wa_id: str
    profile_name: str | None
    created_at: datetime


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    direction: str
    kind: str
    body: str | None
    wa_message_id: str | None
    node_id: str | None
    status: str
    error: str | None
    created_at: datetime


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contact_id: int
    flow_id: str
    status: str
    current_node_id: str | None
    awaiting_node_id: str | None
    awaiting_kind: str | None
    variables: dict[str, Any]
    last_inbound_at: datetime | None
    window_expires_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationRead):
    messages: list[MessageRead] = Field(default_factory=list)


# ── Engine-backed simulation (the builder's phone preview) ──────────────────


class SimulateAction(BaseModel):
    """One customer gesture: a typed reply, or a tapped menu option."""

    type: Literal["input", "choice"]
    text: str | None = None
    id: str | None = None
    label: str | None = None


class SimulateRequest(BaseModel):
    # RunnerState from the previous turn; null starts a fresh walkthrough.
    state: dict[str, Any] | None = None
    action: SimulateAction | None = None
    # The builder's "Start at selected node" affordance.
    start_node_id: str | None = None
    # Pretend the customer opened the chat with this message (keyword triggers).
    text: str | None = None


class SimOption(BaseModel):
    id: str
    label: str


class SimCard(BaseModel):
    id: str
    title: str
    body: str | None = None
    url: str | None = None


class SimMessage(BaseModel):
    """One preview row — the exact shape the phone simulator renders."""

    id: str
    role: Literal["bot", "customer", "system"]
    type: Literal[
        "text",
        "media",
        "buttons",
        "list",
        "template",
        "carousel",
        "location",
        "webview",
        "system",
    ]
    node_id: str | None = None
    text: str | None = None
    caption: str | None = None
    media_type: str | None = None
    media_url: str | None = None
    footer: str | None = None
    template_name: str | None = None
    language: str | None = None
    options: list[SimOption] = Field(default_factory=list)
    cards: list[SimCard] = Field(default_factory=list)


class SimPending(BaseModel):
    """What the customer must do next — absent once the walk has ended."""

    type: Literal["input", "options"]
    node_id: str
    placeholder: str | None = None
    options: list[SimOption] = Field(default_factory=list)


class SimulateResponse(BaseModel):
    state: dict[str, Any]
    # Only what THIS turn produced — the client accumulates across turns.
    messages: list[SimMessage] = Field(default_factory=list)
    pending: SimPending | None = None
    ended: bool = False
    status: str = "active"
