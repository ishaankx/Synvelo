"""
Centralized Activity Logging Service.

Every loggable action in Synvelo calls `log_activity()` which inserts a row
into the `activity_logs` table.  The helper is non-blocking: it uses its own
short-lived DB session so the caller never waits for the INSERT and a logging
failure can never break the primary operation.
"""
import logging
from typing import Optional

from sqlalchemy import text

from app.database import AsyncSessionLocal

logger = logging.getLogger("synvelo.activity")


async def log_activity(
    org_id: str,
    event_type: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    entity_name: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    metadata: Optional[dict] = None,
    **kwargs,
) -> None:
    """
    Insert one activity-log row.  Always uses a dedicated short-lived session
    so the caller's transaction is never affected.
    """
    try:
        async with AsyncSessionLocal() as session:
            await _insert(session, org_id, event_type, entity_type,
                          entity_id, entity_name, actor_id, actor_name,
                          old_value, new_value, metadata)
            await session.commit()
    except Exception:
        logger.exception("Failed to log activity event_type=%s", event_type)


async def _insert(
    db,
    org_id: str,
    event_type: str,
    entity_type: str,
    entity_id: Optional[str],
    entity_name: Optional[str],
    actor_id: Optional[str],
    actor_name: Optional[str],
    old_value: Optional[dict],
    new_value: Optional[dict],
    metadata: Optional[dict],
) -> None:
    import json as _json

    await db.execute(text("""
        INSERT INTO activity_logs
            (id, event_type, actor_id, actor_name, entity_type, entity_id,
             entity_name, old_value, new_value, metadata_extra, created_at, org_id)
        VALUES (
            gen_random_uuid(),
            :event_type,
            :actor_id,
            :actor_name,
            :entity_type,
            :entity_id,
            :entity_name,
            CAST(:old_value AS jsonb),
            CAST(:new_value AS jsonb),
            CAST(:metadata_extra AS jsonb),
            NOW(),
            CAST(:org_id AS uuid)
        )
    """), {
        "event_type":     event_type,
        "actor_id":       actor_id,
        "actor_name":     actor_name,
        "entity_type":    entity_type,
        "entity_id":      entity_id,
        "entity_name":    entity_name,
        "old_value":      _json.dumps(old_value) if old_value else None,
        "new_value":      _json.dumps(new_value) if new_value else None,
        "metadata_extra": _json.dumps(metadata) if metadata else None,
        "org_id":         org_id,
    })
