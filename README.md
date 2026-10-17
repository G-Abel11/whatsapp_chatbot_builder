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
| Backend *(later phase)* | NestJS (TypeScript), PostgreSQL, Redis |
| Messaging | WhatsApp Cloud API (Meta) |

## Monorepo layout

```
opeschatbot/
├─ apps/
│  └─ web/                Next.js 15 app (builder, templates, debugging)
├─ packages/
│  └─ shared/             Flow schema, node registry, WhatsApp constraints
├─ assets/                Brand assets (logo)
└─ package.json           npm workspaces root
```

`packages/shared` is the single source of truth for everything a flow node is:
zod schema, category, icon, defaults, property fields, and its WhatsApp Cloud API
payload mapping. The canvas, the properties panel, the phone simulator — and later
the server-side execution engine — all consume this one registry so they can never
drift apart.

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
| `canvas` | `#FFFFFF` | Builder canvas |
| `border` | `#E2E8F0` | 1px hairlines |

Typography: **Inter** (with system fallbacks to SF Pro).

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: monorepo, design tokens, UI primitives, app shell, mock data | 🚧 in progress |
| 2 | View A — flow builder canvas (React Flow, node library, drag & drop, quick-add) | ⏳ |
| 2b | WhatsApp constraints on canvas (24h window, max 3 buttons) | ⏳ |
| 3 | View B — node properties panel + live phone simulator | ⏳ |
| 4 | View C — template manager + tenant health | ⏳ |
| 5 | View D — execution debugging (active path, console drawer) | ⏳ |
| 6 | Backend — NestJS, Postgres, Redis queue, webhook, execution engine | ⏳ |

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

## License

Proprietary — © Opes Technologies.
