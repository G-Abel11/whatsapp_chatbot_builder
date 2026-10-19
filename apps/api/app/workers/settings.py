"""arq worker configuration: `python -m arq app.workers.settings.WorkerSettings`."""

from __future__ import annotations

from typing import Any

from arq.connections import RedisSettings

from ..core.config import get_settings
from ..db import init_db
from .tasks import process_webhook_event, resume_conversation_job, retry_send_job

_settings = get_settings()


async def on_startup(ctx: dict[str, Any]) -> None:
    """Ensure the schema exists before the worker takes jobs."""
    if _settings.auto_create_tables:
        await init_db()


class WorkerSettings:
    functions = [process_webhook_event, resume_conversation_job, retry_send_job]
    on_startup = on_startup
    redis_settings = RedisSettings.from_dsn(_settings.redis_url)
    max_jobs = 20
    job_timeout = 300
    keep_result = 3600
