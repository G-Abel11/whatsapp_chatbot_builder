# OpesChatbot

A premium, multi-tenant SaaS platform for building and deploying WhatsApp chatbots —
with an elegant, minimal interface and a streamlined visual node-based builder.

> **Design principle:** the builder is purely visual (drag & drop logic). There is
> intentionally **no AI copilot**.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React, TypeScript |
| Canvas engine | [React Flow `@xyflow/react`](https://reactflow.dev) |
| State | Zustand + Immer (immutable graph updates, undo/redo) |
| Styling | Tailwind CSS v4 + shadcn/ui primitives |
| Backend *(Phase 6)* | FastAPI (Python), PostgreSQL, Redis (arq) |
| Messaging | WhatsApp Cloud API (Meta) |

## Monorepo layout

```
opeschatbot/
├─ apps/
│  ├─ web/                Next.js 15 app (builder, templates, debugging)
│  └─ api/                FastAPI execution engine (webhook, flow runner, sends)
├─ packages/
│  └─ shared/             Flow schema, node registry, WhatsApp constraints
├─ assets/                Brand assets (logo)
└─ package.json           npm workspaces root
```

`packages/shared` is the single source of truth for everything a flow node is:
zod schema, category, icon, defaults, property fields, and its WhatsApp Cloud API
payload mapping. The canvas, the properties panel, the phone simulator and the
server-side execution engine all consume this one registry so they can never
drift apart — a backend contract test guards the Python mirror against the TS
registry.

## Brand

Sampled from the Opes logo:

| Token | Value | Use |
| --- | --- | --- |
| `brand` | `#181860` | Logo, primary actions, navigation |
| `brand-accent` | `#F04818` | Alerts, 24-hour-window warnings |
| `whatsapp` | `#00A884` | WhatsApp messaging surfaces |
| `logic` | `#6366F1` | Logic and integration nodes |
| `text` | `#475569` | Body copy (Slate) |
| `surface` | `#F8F9FA` | Sidebars and panels |
| `canvas` | `#EEF1F4` | Builder canvas (faint grey so nodes read clearly) |
| `border` | `#E2E8F0` | 1px hairlines |

Typography: **Inter** (with system fallbacks to SF Pro).

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: monorepo, design tokens, UI primitives, app shell, mock data | ✅ |
| 2 | View A — flow builder canvas (React Flow, node library, drag & drop, quick-add) | ✅ |
| 2b | WhatsApp constraints on canvas (24h window, max 3 buttons) | ✅ |
| 3 | View B — node properties panel + live phone simulator | ✅ |
| 4 | View C — template manager + tenant health | ✅ |
| 5 | View D — execution debugging (active path, console drawer) | ✅ |
| 6 | Backend — FastAPI execution engine, Postgres, arq/Redis queue, webhook, sends | ✅ |
| 6b | Wire the web app to the API (flows CRUD, publish, phone number id, connection status) | ✅ |
| 6c | Engine-backed phone preview (`POST /flows/{id}/simulate`, dry-run runner, save-then-restart on edits) | ✅ |
| 6d | Per-bot WhatsApp credentials — each flow stores its own Meta access token (write-only, masked in the API); resolution: flow token → server default → dry run | ✅ |

## Getting started

Two processes: the API (bots live there) and the web app.

```bash
# 1. API — see apps/api/README.md for full setup (Docker, venv, migrations)
cd apps/api
docker compose up -d
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# 2. Web app — from the repo root
npm install
npm run dev          # http://localhost:3000
```

The web app is **API-backed** — the workspace lists `GET /flows`, the builder loads
and autosaves the graph, and *Publish* flips the flow's status — so it needs the API
running. Point it elsewhere with `NEXT_PUBLIC_API_URL` (see `apps/web/.env.example`);
the API allows the web origin via `CORS_ORIGINS`. Without Docker, run the API on
SQLite by setting `DATABASE_URL=sqlite+aiosqlite:///./opes.db`.

The API seeds a demo bot (`OpesChatbot Demo`) on first run, so the workspace has
something to open immediately.

Each bot can carry **its own Meta access token** (set it in the builder's
WhatsApp-credentials control, next to the phone number ID). Sends resolve the
token per message: the flow's token → the server-wide `WHATSAPP_ACCESS_TOKEN` →
a logged dry run (nothing leaves the machine). The token is write-only — the
API returns only `has_access_token`, never the raw value.

## License

Proprietary — © Opes Technologies.
