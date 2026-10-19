"""FastAPI application entrypoint."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import conversations, dev, flows, simulate, webhook
from .core.config import get_settings
from .db import SessionLocal, engine, init_db
from .seed import ensure_seed

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logging.basicConfig(level=settings.log_level)

    # Schema + demo data (dev convenience; production should run Alembic).
    if settings.auto_create_tables:
        await init_db()
        if settings.auto_seed:
            async with SessionLocal() as session:
                created = await ensure_seed(session)
                if created is not None:
                    logger.info("seeded demo flow %s", created.id)

    # Optional arq/Redis pool. Without it the webhook processes inline.
    app.state.arq = None
    try:
        app.state.arq = await asyncio.wait_for(
            create_pool(RedisSettings.from_dsn(settings.redis_url)), timeout=2.0
        )
        logger.info("connected to Redis — webhook events will be queued")
    except Exception as exc:  # noqa: BLE001 — any connection failure degrades gracefully
        logger.warning("Redis unavailable (%s) — webhook events will process inline", exc)

    try:
        yield
    finally:
        if app.state.arq is not None:
            close = getattr(app.state.arq, "aclose", None) or getattr(app.state.arq, "close", None)
            if close is not None:
                await close()
        await engine.dispose()


app = FastAPI(
    title="OpesChatbot API",
    description="WhatsApp chatbot execution engine (Phase 6).",
    version="0.1.0",
    lifespan=lifespan,
)

# The web app runs on a different origin (localhost:3000) than the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook.router)
app.include_router(flows.router)
app.include_router(simulate.router)
app.include_router(conversations.router)
if settings.environment != "production":
    app.include_router(dev.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
