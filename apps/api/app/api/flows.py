"""Flow management API (create/read/update/delete the exported graphs)."""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Flow, utcnow
from ..schemas import FlowCreate, FlowDetail, FlowRead, FlowUpdate

router = APIRouter(prefix="/flows", tags=["flows"])


def _new_flow_id() -> str:
    return f"flow_{uuid4().hex[:8]}"


def _sanitize_token(token: str | None) -> str | None:
    """Normalize a write-only token: blank/whitespace means "unset"."""
    return token.strip() or None if token is not None else None


def to_read(flow: Flow) -> FlowRead:
    """FlowRead with the raw access token masked to a boolean."""
    data = flow.model_dump(exclude={"access_token", "graph"})
    data["has_access_token"] = bool(flow.access_token)
    return FlowRead.model_validate(data)


def to_detail(flow: Flow) -> FlowDetail:
    """FlowDetail with the raw access token masked to a boolean."""
    data = flow.model_dump(exclude={"access_token"})
    data["has_access_token"] = bool(flow.access_token)
    return FlowDetail.model_validate(data)


@router.get("", response_model=list[FlowRead])
async def list_flows(session: AsyncSession = Depends(get_session)) -> list[FlowRead]:
    result = await session.execute(select(Flow).order_by(Flow.updated_at.desc()))
    return [to_read(flow) for flow in result.scalars().all()]


@router.post("", response_model=FlowRead, status_code=201)
async def create_flow(body: FlowCreate, session: AsyncSession = Depends(get_session)) -> FlowRead:
    flow_id = body.id or _new_flow_id()
    if await session.get(Flow, flow_id) is not None:
        raise HTTPException(status_code=409, detail=f"Flow {flow_id} already exists")
    flow = Flow(
        id=flow_id,
        tenant_id=body.tenant_id,
        title=body.title,
        status=body.status,
        phone_number_id=body.phone_number_id,
        access_token=_sanitize_token(body.access_token),
        graph=body.graph,
    )
    session.add(flow)
    await session.commit()
    await session.refresh(flow)
    return to_read(flow)


@router.get("/{flow_id}", response_model=FlowDetail)
async def get_flow(flow_id: str, session: AsyncSession = Depends(get_session)) -> FlowDetail:
    flow = await session.get(Flow, flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    return to_detail(flow)


@router.put("/{flow_id}", response_model=FlowRead)
async def update_flow(
    flow_id: str, body: FlowUpdate, session: AsyncSession = Depends(get_session)
) -> FlowRead:
    flow = await session.get(Flow, flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")

    if body.title is not None:
        flow.title = body.title
    if body.status is not None:
        flow.status = body.status
    if body.phone_number_id is not None:
        flow.phone_number_id = body.phone_number_id
    if body.access_token is not None:
        # Blank clears the per-bot token (revert to the server-wide default).
        flow.access_token = _sanitize_token(body.access_token)
    if body.graph is not None:
        flow.graph = body.graph
        flow.version = (body.version if body.version is not None else flow.version) + 1
    flow.updated_at = utcnow()

    session.add(flow)
    await session.commit()
    await session.refresh(flow)
    return to_read(flow)


@router.delete("/{flow_id}", status_code=204)
async def delete_flow(flow_id: str, session: AsyncSession = Depends(get_session)) -> None:
    flow = await session.get(Flow, flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    await session.delete(flow)
    await session.commit()
