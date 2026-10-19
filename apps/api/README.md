# OpesChatbot API

FastAPI execution engine for OpesChatbot: receives WhatsApp Cloud API webhooks,
runs the visual flow graph per conversation, and sends replies.

This is **Phase 6** of the project. The web app (`apps/web`) is API-backed: it lists
flows, loads/saves graphs and publishes straight against these endpoints.

## Stack

- **FastAPI** — HTTP layer (webhook + management endpoints)
- **SQLModel** on **Postgres** (`asyncpg`) — persistence
- **Alembic** — migrations
- **arq** + **Redis** — delays, retries and scheduled sends
- **httpx** — WhatsApp Cloud API client

## Layout

```
app/
  main.py              FastAPI app + lifespan
  core/config.py       settings (env)
  core/security.py     X-Hub-Signature-256 verification
  db.py                async engine + session
  models.py            SQLModel tables
  schemas.py           request/response + webhook payloads
  nodes.py             node-kind registry (mirrors @opes/shared)
  engine/
    interpolate.py     {{variable}} substitution
    graph.py           read model over an exported React Flow document
    handlers.py        kind -> execution handler
    runner.py          pure graph walker (no I/O)
    executor.py        binds the walker to sessions, sender and queue
    outcome.py         the result of one step
    whatsapp.py        Cloud API client + 24h window rules
  api/
    webhook.py         GET verify + POST receive
    flows.py           flow CRUD
    simulate.py        dry-run run of a saved flow (the builder's phone preview)
    conversations.py   read / monitor
    dev.py             local-only message simulator
  workers/
    tasks.py           arq jobs (send, delay, retry)
    settings.py        arq WorkerSettings
```

## Quick start

```bash
# 1. infrastructure
docker compose up -d

# 2. deps
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"

# 3. config
copy .env.example .env

# 4. migrate + seed
.venv\Scripts\python -m app.cli migrate
.venv\Scripts\python -m app.cli seed

# 5. run api + worker (two terminals)
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
.venv\Scripts\python -m arq app.workers.settings.WorkerSettings
```

### No Docker?

Postgres and Redis are both optional for local development:

```bash
# SQLite instead of Postgres (set in .env; ships in the local .env already)
DATABASE_URL=sqlite+aiosqlite:///./opes.db
```

Tables and the demo flow are created on startup (`AUTO_CREATE_TABLES` /
`AUTO_SEED`), and without Redis the webhook processes events inline instead of
enqueueing them.

### WhatsApp credentials

Outbound sends authenticate with a Meta access token, resolved per message in
this order:

1. **Per-bot token** — `flows.access_token`, set per flow via the builder's
   credentials control or `PUT /flows/{id}` (`access_token`; blank clears it).
   The API masks it: reads return `has_access_token: bool` only.
2. **Server-wide default** — `WHATSAPP_ACCESS_TOKEN` in `.env`.
3. **Dry run** — neither configured: the send is logged and persisted with a
   `dryrun_…` message id; nothing is called at Meta.

`WHATSAPP_APP_SECRET` (webhook signature verification) and
`WHATSAPP_VERIFY_TOKEN` (Meta's verification handshake) stay server-wide — they
belong to the Meta app, not an individual bot.

### The web app

`apps/web` calls this service directly, so the API must allow its origin — see
`CORS_ORIGINS` in `.env` (defaults to `http://localhost:3000`). Point the web app
at a different API with `NEXT_PUBLIC_API_URL`.

## Testing

```bash
.venv\Scripts\python -m pytest
```
