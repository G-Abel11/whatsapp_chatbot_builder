"""Small management CLI: `python -m app.cli <command>`."""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from uuid import uuid4


def _upgrade() -> None:
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config("alembic.ini"), "head")


async def _create_tables() -> None:
    from .db import init_db

    await init_db()
    print("tables created")


async def _seed() -> None:
    from .db import SessionLocal, init_db
    from .seed import ensure_seed

    await init_db()
    async with SessionLocal() as session:
        flow = await ensure_seed(session)
    print(f"seeded {flow.id}" if flow is not None else "demo flow already present")


async def _simulate(args: argparse.Namespace) -> None:
    from sqlalchemy import select

    from .db import SessionLocal, init_db
    from .models import Contact, Conversation, Message
    from .seed import ensure_seed
    from .services import process_event

    await init_db()
    async with SessionLocal() as session:
        await ensure_seed(session)

    message_id = f"cli_{uuid4().hex}"
    event = {
        "kind": "message",
        "event_key": f"cli:{message_id}",
        "phone_number_id": args.phone_number_id,
        "contact_name": "CLI",
        "message": {
            "id": message_id,
            "from": args.sender,
            "type": "text",
            "timestamp": str(int(time.time())),
            "text": {"body": args.text},
        },
    }
    await process_event(event, pool=None)

    async with SessionLocal() as session:
        contact = (
            await session.execute(select(Contact).where(Contact.wa_id == args.sender).limit(1))
        ).scalar_one_or_none()
        if contact is None:
            print("no conversation produced")
            return
        conversation = (
            await session.execute(
                select(Conversation)
                .where(Conversation.contact_id == contact.id)
                .order_by(Conversation.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if conversation is None:
            print("no conversation produced")
            return
        rows = (
            await session.execute(
                select(Message)
                .where(Message.conversation_id == conversation.id)
                .order_by(Message.id)
            )
        ).scalars().all()

    print(f"\nconversation #{conversation.id} — status={conversation.status}")
    print(f"variables: {conversation.variables}")
    print("-" * 60)
    for row in rows:
        labels = {"inbound": "customer", "outbound": "bot", "system": "note"}
        label = labels.get(row.direction, row.direction)
        print(f"[{label:8}] {row.body}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="app.cli", description="OpesChatbot API utilities")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("migrate", help="run Alembic migrations (upgrade head)")
    sub.add_parser("create-tables", help="create tables from the SQLModel metadata")
    sub.add_parser("seed", help="insert the demo flow if missing")

    simulate = sub.add_parser("simulate", help="process a fake inbound message")
    simulate.add_argument("--from", dest="sender", default="254700000000")
    simulate.add_argument("--text", required=True)
    simulate.add_argument("--phone-number-id", default=None)

    args = parser.parse_args(argv)

    if args.command == "migrate":
        _upgrade()
    elif args.command == "create-tables":
        asyncio.run(_create_tables())
    elif args.command == "seed":
        asyncio.run(_seed())
    elif args.command == "simulate":
        asyncio.run(_simulate(args))


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        # The console often defaults to cp1252, which cannot print emoji.
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        except (AttributeError, OSError):
            pass
    main()
