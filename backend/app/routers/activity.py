"""
Activity Monitoring Router — GET /activity
Paginated, filterable, searchable activity feed.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from app.database import get_db
from app.dependencies import get_org_id

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("/")
async def list_activity(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
    event_type: Optional[str] = Query(default=None, description="Filter by event type e.g. deal_created"),
    entity_type: Optional[str] = Query(default=None, description="Filter by entity type e.g. deal, document"),
    entity_id: Optional[str] = Query(default=None, description="Filter by entity ID"),
    actor_id: Optional[str] = Query(default=None, description="Filter by actor ID"),
    search: Optional[str] = Query(default=None, description="Search in entity_name, actor_name, event_type"),
    date_from: Optional[str] = Query(default=None, description="ISO date lower bound"),
    date_to: Optional[str] = Query(default=None, description="ISO date upper bound"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Return paginated, filtered activity feed for the organisation."""
    where_clauses = ["org_id = CAST(:org_id AS uuid)"]
    params: dict = {"org_id": org_id, "limit": limit, "offset": offset}

    if event_type:
        where_clauses.append("event_type = :event_type")
        params["event_type"] = event_type

    if entity_type:
        where_clauses.append("entity_type = :entity_type")
        params["entity_type"] = entity_type

    if entity_id:
        where_clauses.append("entity_id = :entity_id")
        params["entity_id"] = entity_id

    if actor_id:
        where_clauses.append("actor_id = :actor_id")
        params["actor_id"] = actor_id

    if search:
        where_clauses.append("""
            (entity_name ILIKE :search
             OR actor_name ILIKE :search
             OR event_type ILIKE :search)
        """)
        params["search"] = f"%{search}%"

    if date_from:
        where_clauses.append("created_at >= :date_from::timestamptz")
        params["date_from"] = date_from

    if date_to:
        where_clauses.append("created_at <= :date_to::timestamptz")
        params["date_to"] = date_to

    where_sql = " AND ".join(where_clauses)

    # Total count for pagination
    count_res = await db.execute(text(f"""
        SELECT COUNT(*) AS total FROM activity_logs WHERE {where_sql}
    """), params)
    total = count_res.scalar() or 0

    # Fetch rows
    rows = await db.execute(text(f"""
        SELECT id, event_type, actor_id, actor_name,
               entity_type, entity_id, entity_name,
               old_value, new_value, metadata_extra,
               created_at
        FROM activity_logs
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """), params)

    items = []
    for r in rows.fetchall():
        items.append({
            "id":           str(r.id),
            "event_type":   r.event_type,
            "actor_id":     r.actor_id,
            "actor_name":   r.actor_name,
            "entity_type":  r.entity_type,
            "entity_id":    r.entity_id,
            "entity_name":  r.entity_name,
            "old_value":    r.old_value,
            "new_value":    r.new_value,
            "metadata":     r.metadata_extra,
            "created_at":   r.created_at.isoformat() if r.created_at else None,
        })

    return {
        "total":  total,
        "limit":  limit,
        "offset": offset,
        "items":  items,
    }


@router.get("/event-types")
async def list_event_types(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Return distinct event types for the filter dropdown."""
    res = await db.execute(text("""
        SELECT DISTINCT event_type FROM activity_logs
        WHERE org_id = CAST(:org_id AS uuid)
        ORDER BY event_type
    """), {"org_id": org_id})
    return [r.event_type for r in res.fetchall()]
