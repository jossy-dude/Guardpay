import json
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuditLog

logger = logging.getLogger("guardpay.audit")


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def write_audit(
    session: AsyncSession,
    action: str,
    entity: str,
    entity_id: int | None,
    before: dict | None = None,
    after: dict | None = None,
    actor: str = "admin",
) -> None:
    """Best-effort audit write.

    The mutation that precedes this call is already committed, so a failure here
    must never surface as a 500 for an operation that actually succeeded.
    """
    try:
        entry = AuditLog(
            actor=actor,
            action=action,
            entity=entity,
            entity_id=entity_id,
            before_json=json.dumps(before) if before is not None else None,
            after_json=json.dumps(after) if after is not None else None,
            created_at=_ts(),
        )
        session.add(entry)
        await session.commit()
    except Exception:
        logger.exception("audit write failed (mutation already committed)")
        try:
            await session.rollback()
        except Exception:
            pass


async def list_audit(session: AsyncSession, limit: int = 100) -> list[dict]:
    from sqlalchemy import select

    result = await session.execute(
        select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 1000))
    )
    return [
        {
            "id": a.id,
            "actor": a.actor,
            "action": a.action,
            "entity": a.entity,
            "entity_id": a.entity_id,
            "before_json": a.before_json,
            "after_json": a.after_json,
            "created_at": a.created_at,
        }
        for a in result.scalars()
    ]