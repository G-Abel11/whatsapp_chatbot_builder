"""Async database engine and session factory."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from .core.config import get_settings

_settings = get_settings()

engine = create_async_engine(
    _settings.database_url,
    echo=False,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a request-scoped session."""
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create tables from the SQLModel metadata (local/dev convenience).

    Import `app.models` first so the tables are registered on the metadata.
    """
    from . import models  # noqa: F401  (registers tables)

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
