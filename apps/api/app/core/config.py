"""Application settings, loaded from the environment (and an optional `.env`)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── App ────────────────────────────────────────────────────────────────
    environment: str = "local"
    log_level: str = "INFO"
    base_url: str = "http://localhost:8000"

    # Browser origins allowed to call the management API (the Next.js app).
    # Comma-separated; "*" allows any origin.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    # ── Persistence ────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://opes:opes@localhost:5432/opes"
    redis_url: str = "redis://localhost:6379/0"

    # Create tables + seed a demo flow on startup (handy for local dev).
    # Production should rely on Alembic instead.
    auto_create_tables: bool = True
    auto_seed: bool = True

    # ── WhatsApp Cloud API ─────────────────────────────────────────────────
    whatsapp_verify_token: str = "change-me-verify-token"
    whatsapp_app_secret: str = "change-me-app-secret"
    whatsapp_access_token: str = "change-me-access-token"
    whatsapp_graph_version: str = "v21.0"
    whatsapp_api_base: str = "https://graph.facebook.com"

    # Verify `X-Hub-Signature-256` on inbound webhooks. Keep on in any real
    # deployment; turn off only when replaying captured payloads locally.
    verify_signature: bool = True

    # Delay (seconds) used before retrying a failed outbound send.
    send_retry_delay_seconds: int = 15
    max_send_attempts: int = 3


@lru_cache
def get_settings() -> Settings:
    return Settings()
