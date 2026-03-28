"""
tracking_service.py — Non-blocking hooks for deal field edits and AI usage logging.

These helpers use their own short-lived DB sessions so callers are never slowed down.
"""

import json
import logging
from typing import Optional

from sqlalchemy import text
from app.database import AsyncSessionLocal

logger = logging.getLogger("synvelo.tracking")


async def track_field_edit(
    deal_id: str,
    field_name: str,
    old_value,
    new_value,
    org_id: str,
    changed_by: Optional[str] = None,
) -> None:
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("""
                INSERT INTO deal_field_edits
                    (id, deal_id, field_name, old_value, new_value, changed_by, changed_at, org_id)
                VALUES (
                    gen_random_uuid(),
                    CAST(:deal_id AS uuid),
                    :field_name,
                    :old_value,
                    :new_value,
                    :changed_by,
                    NOW(),
                    CAST(:org_id AS uuid)
                )
            """), {
                "deal_id": deal_id,
                "field_name": field_name,
                "old_value": str(old_value) if old_value is not None else None,
                "new_value": str(new_value) if new_value is not None else None,
                "changed_by": changed_by,
                "org_id": org_id,
            })
            await session.commit()
    except Exception:
        logger.exception("Failed to track field edit deal_id=%s field=%s", deal_id, field_name)


async def track_ai_feature(
    deal_id: str,
    feature_name: str,
    org_id: str,
    triggered_by: Optional[str] = None,
    result_summary: Optional[dict] = None,
) -> None:
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("""
                INSERT INTO deal_ai_usage_log
                    (id, deal_id, feature_name, triggered_by, triggered_at, result_summary, org_id)
                VALUES (
                    gen_random_uuid(),
                    CAST(:deal_id AS uuid),
                    :feature_name,
                    :triggered_by,
                    NOW(),
                    CAST(:result AS jsonb),
                    CAST(:org_id AS uuid)
                )
            """), {
                "deal_id": deal_id,
                "feature_name": feature_name,
                "triggered_by": triggered_by,
                "result": json.dumps(result_summary) if result_summary else None,
                "org_id": org_id,
            })
            await session.commit()
    except Exception:
        logger.exception("Failed to track AI usage deal_id=%s feature=%s", deal_id, feature_name)
