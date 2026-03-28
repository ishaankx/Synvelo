import asyncio
import json
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from app.database import get_db
from app.models.schemas import DealCreate, StageTransitionRequest
from app.services.scoring import score_deal
from app.services.rag import rag_answer
from app.services.brief_service import generate_brief, generate_followup
from app.dependencies import get_org_id
from app.rate_limit import limiter, AI_RATE, track_ai_usage
from app.stages import STAGE_CONFIGS, STAGE_ORDER, TERMINAL_STAGES, can_transition, get_next_stage
from app.services.activity_service import log_activity
from app.services.tracking_service import track_field_edit, track_ai_feature

router = APIRouter(prefix="/deals", tags=["deals"])


class AskRequest(BaseModel):
    query: str


class DealUpdate(BaseModel):
    value: float | None = None
    currency: str | None = None
    company: str | None = None
    owner: str | None = None
    time_to_close_days: int | None = None


def _parse(val):
    if val is None:
        return []
    if isinstance(val, (list, dict)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return []


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("/")
async def create_deal(
    body: DealCreate,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    did = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO deals (id, name, company, stage, value, currency, owner,
            time_to_close_days, risk_flags, signals, meddic, org_id,
            created_at, stage_entered_at)
        VALUES (CAST(:id AS uuid), :name, :company, :stage, :value, :currency, :owner,
            :time_to_close_days, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
            CAST(:org_id AS uuid), NOW(), NOW())
    """), {
        "id":                 did,
        "name":               body.name,
        "company":            body.company,
        "stage":              body.stage,
        "value":              body.value,
        "currency":           body.currency,
        "owner":              body.owner,
        "time_to_close_days": body.time_to_close_days,
        "org_id":             org_id,
    })
    # Record initial stage in history
    await db.execute(text("""
        INSERT INTO deal_stage_history
            (id, deal_id, from_stage, to_stage, changed_at, triggered_by, org_id)
        VALUES (gen_random_uuid(), CAST(:deal_id AS uuid), NULL, :stage, NOW(), 'system',
                CAST(:org_id AS uuid))
    """), {"deal_id": did, "stage": body.stage, "org_id": org_id})
    await db.commit()

    await log_activity(
        org_id=org_id, event_type="deal_created", entity_type="deal",
        entity_id=did, entity_name=body.name,
        new_value={"company": body.company, "stage": body.stage,
                   "value": body.value, "owner": body.owner},
    )

    return {
        "id":                 did,
        "name":               body.name,
        "company":            body.company,
        "stage":              body.stage,
        "value":              body.value,
        "currency":           body.currency,
        "owner":              body.owner,
        "time_to_close_days": body.time_to_close_days,
        "org_id":             org_id,
    }


@router.get("/")
async def list_deals(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    res = await db.execute(text("""
        SELECT id, name, company, stage, value, currency, owner,
               win_probability, probability_low, probability_high,
               time_to_close_days, score_summary, risk_flags, signals,
               last_scored_at, created_at, stage_entered_at,
               EXTRACT(DAY FROM NOW() - COALESCE(stage_entered_at, created_at))::INTEGER
                 AS days_in_current_stage
        FROM deals
        WHERE org_id = CAST(:org_id AS uuid)
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """), {"org_id": org_id, "limit": limit, "offset": offset})
    out = []
    for r in res.fetchall():
        signals      = _parse(r.signals)
        red_count    = sum(1 for s in signals if isinstance(s, dict) and s.get("color") == "red")
        yellow_count = sum(1 for s in signals if isinstance(s, dict) and s.get("color") == "yellow")
        out.append({
            "id":                    str(r.id),
            "name":                  r.name,
            "company":               r.company,
            "stage":                 r.stage,
            "value":                 float(r.value or 0),
            "currency":              r.currency or "USD",
            "owner":                 r.owner,
            "win_probability":       r.win_probability,
            "probability_low":       r.probability_low,
            "probability_high":      r.probability_high,
            "time_to_close_days":    r.time_to_close_days,
            "score_summary":         r.score_summary,
            "risk_flags":            _parse(r.risk_flags),
            "signals":               signals,
            "red_signals":           red_count,
            "yellow_signals":        yellow_count,
            "last_scored_at":        str(r.last_scored_at) if r.last_scored_at else None,
            "created_at":            str(r.created_at),
            "stage_entered_at":      str(r.stage_entered_at) if r.stage_entered_at else None,
            "days_in_current_stage": r.days_in_current_stage or 0,
        })
    return out


# ── Stage Management (static routes BEFORE /{deal_id}) ──────────────────────

@router.get("/stage-configs")
async def get_stage_configs():
    """Return all stage configurations in pipeline order."""
    return {"stages": [STAGE_CONFIGS[s] for s in STAGE_ORDER]}


@router.get("/pipeline/overview")
async def get_pipeline_overview(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Return all deals grouped by stage for the Kanban/pipeline view."""
    res = await db.execute(text("""
        SELECT id, name, company, value, currency, stage, win_probability,
               stage_entered_at,
               EXTRACT(DAY FROM NOW() - COALESCE(stage_entered_at, created_at))::INTEGER
                 AS days_in_current_stage
        FROM deals
        WHERE org_id = CAST(:org_id AS uuid)
        ORDER BY stage_entered_at DESC
    """), {"org_id": org_id})

    pipeline: dict[str, dict] = {
        stage: {
            "stage":       stage,
            "config":      STAGE_CONFIGS[stage],
            "deals":       [],
            "total_value": 0,
            "count":       0,
        }
        for stage in STAGE_ORDER
    }

    for r in res.fetchall():
        stage = r.stage
        if stage not in pipeline:
            continue
        pipeline[stage]["deals"].append({
            "id":                    str(r.id),
            "name":                  r.name,
            "company":               r.company,
            "value":                 float(r.value or 0),
            "currency":              r.currency or "USD",
            "stage":                 r.stage,
            "win_probability":       r.win_probability,
            "days_in_current_stage": r.days_in_current_stage or 0,
        })
        pipeline[stage]["total_value"] += float(r.value or 0)
        pipeline[stage]["count"] += 1

    return {"pipeline": [pipeline[s] for s in STAGE_ORDER]}


# ── CRUD (continued) ────────────────────────────────────────────────────────

@router.get("/{deal_id}")
async def get_deal(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id, name, company, stage, value, currency, owner,
               win_probability, probability_low, probability_high,
               time_to_close_days, score_summary, risk_flags, signals,
               meddic, brief, brief_generated_at, last_scored_at, created_at,
               stage_entered_at,
               EXTRACT(DAY FROM NOW() - COALESCE(stage_entered_at, created_at))::INTEGER
                 AS days_in_current_stage
        FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    r = res.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Deal not found")

    brief_data = None
    if r.brief:
        try:
            brief_data = json.loads(r.brief)
        except Exception:
            brief_data = None

    return {
        "id":                    str(r.id),
        "name":                  r.name,
        "company":               r.company,
        "stage":                 r.stage,
        "value":                 float(r.value or 0),
        "currency":              r.currency or "USD",
        "owner":                 r.owner,
        "win_probability":       r.win_probability,
        "probability_low":       r.probability_low,
        "probability_high":      r.probability_high,
        "time_to_close_days":    r.time_to_close_days,
        "score_summary":         r.score_summary,
        "risk_flags":            _parse(r.risk_flags),
        "signals":               _parse(r.signals),
        "meddic":                _parse(r.meddic) if r.meddic else {},
        "brief":                 brief_data,
        "brief_generated_at":    str(r.brief_generated_at) if r.brief_generated_at else None,
        "last_scored_at":        str(r.last_scored_at) if r.last_scored_at else None,
        "created_at":            str(r.created_at),
        "stage_entered_at":      str(r.stage_entered_at) if r.stage_entered_at else None,
        "days_in_current_stage": r.days_in_current_stage or 0,
    }


@router.delete("/{deal_id}")
async def delete_deal(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id, name, company, stage, value, owner FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    deal = res.fetchone()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal_name = deal.name

    await db.execute(text("""
        DELETE FROM deals WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    await db.commit()

    await log_activity(
        org_id=org_id, event_type="deal_deleted", entity_type="deal",
        entity_id=deal_id, entity_name=deal_name,
        old_value={"company": deal.company, "stage": deal.stage,
                   "value": float(deal.value or 0), "owner": deal.owner},
    )

    return {"deleted": deal_id}


@router.patch("/{deal_id}")
async def update_deal(
    deal_id: str,
    body: DealUpdate,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Update editable deal fields (value, company, owner, time_to_close_days)."""
    res = await db.execute(text("""
        SELECT id, name, value, company, owner, time_to_close_days FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    existing = res.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Deal not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Capture old values for activity log
    old_vals = {}
    new_vals = {}
    for k, v in updates.items():
        old_v = getattr(existing, k, None)
        if old_v is not None and isinstance(old_v, (float, Decimal)):
            old_v = float(old_v)
        if old_v != v:
            old_vals[k] = old_v
            new_vals[k] = v

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "id": deal_id, "org_id": org_id}

    await db.execute(text(f"""
        UPDATE deals SET {set_clauses}
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), params)
    await db.commit()

    # Log each changed field as a discrete event + track field edits
    for field_key in old_vals:
        await log_activity(
            org_id=org_id,
            event_type=f"deal_{field_key}_changed",
            entity_type="deal",
            entity_id=deal_id,
            entity_name=existing.name,
            old_value={field_key: old_vals[field_key]},
            new_value={field_key: new_vals[field_key]},
        )
        asyncio.create_task(track_field_edit(
            deal_id=deal_id, field_name=field_key,
            old_value=old_vals[field_key], new_value=new_vals[field_key],
            org_id=org_id,
        ))

    row = await db.execute(text("""
        SELECT * FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    r = row.fetchone()
    return {
        "id":                str(r.id),
        "name":              r.name,
        "company":           r.company,
        "stage":             r.stage,
        "value":             float(r.value) if r.value else 0,
        "currency":          r.currency or "USD",
        "owner":             r.owner,
        "time_to_close_days": r.time_to_close_days,
    }


# ── Actions ───────────────────────────────────────────────────────────────────

@router.post("/{deal_id}/score")
@limiter.limit(AI_RATE)
async def score(
    request: Request,
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    # Fetch deal name for logging
    name_row = await db.execute(text("SELECT name FROM deals WHERE id = CAST(:id AS uuid)"), {"id": deal_id})
    d_name = (name_row.fetchone() or {})

    await track_ai_usage(org_id, "score")
    result = await score_deal(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    await log_activity(
        org_id=org_id, event_type="deal_scored", entity_type="deal",
        entity_id=deal_id, entity_name=getattr(d_name, "name", None),
        new_value={"win_probability": result.get("win_probability"),
                   "score_summary": (result.get("score_summary") or "")[:200]},
        metadata={"trigger": "manual"},
    )
    asyncio.create_task(track_ai_feature(
        deal_id=deal_id, feature_name="nexus_score", org_id=org_id,
        result_summary={"win_probability": result.get("win_probability")},
    ))

    return result


@router.post("/{deal_id}/ask")
@limiter.limit(AI_RATE)
async def ask(
    request: Request,
    deal_id: str,
    req: AskRequest,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id, name FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    deal_row = res.fetchone()
    if not deal_row:
        raise HTTPException(status_code=404, detail="Deal not found")

    await track_ai_usage(org_id, "ask")
    result = await rag_answer(req.query, db, deal_id=deal_id)

    await log_activity(
        org_id=org_id, event_type="deal_ask_ai", entity_type="deal",
        entity_id=deal_id, entity_name=deal_row.name,
        new_value={"query": req.query[:200]},
        metadata={"answer_preview": (result.get("answer") or "")[:200] if isinstance(result, dict) else None},
    )
    asyncio.create_task(track_ai_feature(
        deal_id=deal_id, feature_name="ask_ai", org_id=org_id,
        result_summary={"query": req.query[:100]},
    ))

    return result


@router.post("/{deal_id}/brief")
@limiter.limit(AI_RATE)
async def brief(
    request: Request,
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    name_row = await db.execute(text("SELECT name FROM deals WHERE id = CAST(:id AS uuid)"), {"id": deal_id})
    d_name = name_row.fetchone()

    await track_ai_usage(org_id, "brief")
    result = await generate_brief(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    await log_activity(
        org_id=org_id, event_type="brief_generated", entity_type="deal",
        entity_id=deal_id, entity_name=getattr(d_name, "name", None),
    )
    asyncio.create_task(track_ai_feature(
        deal_id=deal_id, feature_name="brief_gen", org_id=org_id,
    ))

    return result


@router.post("/{deal_id}/followup")
@limiter.limit(AI_RATE)
async def followup(
    request: Request,
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    name_row = await db.execute(text("SELECT name FROM deals WHERE id = CAST(:id AS uuid)"), {"id": deal_id})
    d_name = name_row.fetchone()

    await track_ai_usage(org_id, "followup")
    result = await generate_followup(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    await log_activity(
        org_id=org_id, event_type="followup_generated", entity_type="deal",
        entity_id=deal_id, entity_name=getattr(d_name, "name", None),
    )
    asyncio.create_task(track_ai_feature(
        deal_id=deal_id, feature_name="followup_email", org_id=org_id,
    ))

    return result


@router.get("/{deal_id}/score-history")
async def score_history(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    res = await db.execute(text("""
        SELECT id, scored_at, win_probability, probability_low, probability_high,
               sentiment_avg, trigger_type, trigger_document
        FROM score_history
        WHERE deal_id = CAST(:id AS uuid)
        ORDER BY scored_at ASC
    """), {"id": deal_id})
    return [{
        "id":               str(r.id),
        "scored_at":        str(r.scored_at),
        "win_probability":  r.win_probability,
        "probability_low":  r.probability_low,
        "probability_high": r.probability_high,
        "sentiment_avg":    r.sentiment_avg,
        "trigger_type":     r.trigger_type,
        "trigger_document": r.trigger_document,
    } for r in res.fetchall()]


@router.get("/{deal_id}/sentiment-timeline")
async def sentiment_timeline(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    res = await db.execute(text("""
        SELECT id, filename, source_type, sentiment_score, sentiment_label, created_at
        FROM documents
        WHERE deal_id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
          AND sentiment_score IS NOT NULL
        ORDER BY created_at ASC
    """), {"id": deal_id, "org_id": org_id})
    return [{
        "id":              str(r.id),
        "filename":        r.filename,
        "source_type":     r.source_type,
        "sentiment_score": float(r.sentiment_score),
        "sentiment_label": r.sentiment_label,
        "created_at":      str(r.created_at),
    } for r in res.fetchall()]


# ── Stage Transitions ────────────────────────────────────────────────────────

@router.patch("/{deal_id}/stage")
async def transition_deal_stage(
    deal_id: str,
    body: StageTransitionRequest,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """
    Transition a deal from its current stage to a new stage.
    Validates the transition, writes history, updates the deal atomically.
    """
    res = await db.execute(text("""
        SELECT id, stage FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    deal = res.fetchone()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found.")

    current_stage = deal.stage
    to_stage = body.to_stage

    allowed, reason_msg = can_transition(current_stage, to_stage)
    if not allowed:
        raise HTTPException(status_code=400, detail=reason_msg)

    # Update deal stage
    await db.execute(text("""
        UPDATE deals
        SET stage = :to_stage, stage_entered_at = NOW()
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"to_stage": to_stage, "id": deal_id, "org_id": org_id})

    # Insert stage history record
    history_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO deal_stage_history
            (id, deal_id, from_stage, to_stage, changed_at, reason, triggered_by, org_id)
        VALUES (CAST(:hid AS uuid), CAST(:deal_id AS uuid), :from_stage, :to_stage,
                NOW(), :reason, :triggered_by, CAST(:org_id AS uuid))
    """), {
        "hid":          history_id,
        "deal_id":      deal_id,
        "from_stage":   current_stage,
        "to_stage":     to_stage,
        "reason":       body.reason,
        "triggered_by": body.triggered_by,
        "org_id":       org_id,
    })

    await db.commit()

    # Fetch deal name for activity log
    name_res = await db.execute(text("""
        SELECT name FROM deals WHERE id = CAST(:id AS uuid)
    """), {"id": deal_id})
    deal_name_row = name_res.fetchone()

    await log_activity(
        org_id=org_id, event_type="deal_stage_changed", entity_type="deal",
        entity_id=deal_id, entity_name=deal_name_row.name if deal_name_row else None,
        old_value={"stage": current_stage},
        new_value={"stage": to_stage},
        metadata={"reason": body.reason, "triggered_by": body.triggered_by},
    )

    # ═══ NEXUS INTEGRATION: auto-extract features on terminal transition ═══
    if to_stage in TERMINAL_STAGES:
        outcome = 1 if to_stage == "Closed Won" else 0
        asyncio.create_task(_fire_nexus_extraction(deal_id, org_id, outcome))

    now_iso = datetime.now(timezone.utc).isoformat()
    new_stage_config = STAGE_CONFIGS.get(to_stage, {})

    return {
        "success":        True,
        "deal_id":        deal_id,
        "previous_stage": current_stage,
        "new_stage":      to_stage,
        "history_entry": {
            "id":           history_id,
            "deal_id":      deal_id,
            "from_stage":   current_stage,
            "to_stage":     to_stage,
            "changed_at":   now_iso,
            "reason":       body.reason,
            "triggered_by": body.triggered_by,
        },
        "next_stage":   get_next_stage(to_stage),
        "stage_config": new_stage_config,
        "message":      f"Deal moved from '{current_stage}' to '{to_stage}' successfully.",
    }


async def _fire_nexus_extraction(deal_id: str, org_id: str, outcome: int):
    """
    Background task: extract NEXUS features after terminal stage transition.
    Uses a dedicated DB session so it never affects the caller's transaction.
    Silently logs errors — a NEXUS failure must never affect the stage response.
    """
    import logging
    logger = logging.getLogger("nexus")
    try:
        from nexus.feature_extractor import extract_and_store_features
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            row_id = await extract_and_store_features(db, deal_id, org_id, outcome)
            if row_id:
                logger.info(f"NEXUS auto-extracted features for deal {deal_id} -> {row_id}")
            else:
                logger.warning(f"NEXUS auto-extraction returned None for deal {deal_id}")
    except Exception as e:
        logger.warning(f"NEXUS auto-extraction failed for {deal_id}: {e}")


@router.get("/{deal_id}/stage/history")
async def get_stage_history(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Return the full stage transition history for a deal."""
    res = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found.")

    rows = await db.execute(text("""
        SELECT id, from_stage, to_stage, changed_at, reason, triggered_by
        FROM deal_stage_history
        WHERE deal_id = CAST(:deal_id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY changed_at ASC
    """), {"deal_id": deal_id, "org_id": org_id})

    return {
        "deal_id": deal_id,
        "history": [
            {
                "id":           str(r.id),
                "from_stage":   r.from_stage,
                "to_stage":     r.to_stage,
                "changed_at":   r.changed_at.isoformat() if r.changed_at else None,
                "reason":       r.reason,
                "triggered_by": r.triggered_by,
            }
            for r in rows.fetchall()
        ],
    }


# ── Exit Criteria ────────────────────────────────────────────────────────────

class ExitCriterionCreate(BaseModel):
    criterion_text: str
    stage: str | None = None  # defaults to current deal stage


@router.get("/{deal_id}/exit-criteria")
async def get_exit_criteria(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """
    Return exit criteria for the deal's current stage.
    Auto-seeds default criteria from STAGE_CONFIGS on first access.
    """
    # Verify deal exists and get current stage
    res = await db.execute(text("""
        SELECT id, stage FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    deal = res.fetchone()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    stage = deal.stage

    # Check if criteria exist for this deal + stage
    existing = await db.execute(text("""
        SELECT id FROM deal_exit_criteria
        WHERE deal_id = CAST(:deal_id AS uuid) AND stage = :stage
        LIMIT 1
    """), {"deal_id": deal_id, "stage": stage})

    if not existing.fetchone():
        # Seed default criteria from STAGE_CONFIGS
        config = STAGE_CONFIGS.get(stage, {})
        defaults = config.get("exit_criteria", [])
        for criterion in defaults:
            await db.execute(text("""
                INSERT INTO deal_exit_criteria
                    (id, deal_id, stage, criterion_text, is_completed, is_custom, org_id, created_at)
                VALUES (gen_random_uuid(), CAST(:deal_id AS uuid), :stage,
                        :text, FALSE, FALSE, CAST(:org_id AS uuid), NOW())
            """), {"deal_id": deal_id, "stage": stage, "text": criterion, "org_id": org_id})
        await db.commit()

    # Fetch all criteria for this deal + stage
    rows = await db.execute(text("""
        SELECT id, criterion_text, is_completed, is_custom, completed_at, created_at
        FROM deal_exit_criteria
        WHERE deal_id = CAST(:deal_id AS uuid) AND stage = :stage
        ORDER BY is_custom ASC, created_at ASC
    """), {"deal_id": deal_id, "stage": stage})

    return {
        "deal_id": deal_id,
        "stage": stage,
        "criteria": [
            {
                "id":             str(r.id),
                "criterion_text": r.criterion_text,
                "is_completed":   r.is_completed,
                "is_custom":      r.is_custom,
                "completed_at":   r.completed_at.isoformat() if r.completed_at else None,
                "created_at":     r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows.fetchall()
        ],
    }


@router.patch("/{deal_id}/exit-criteria/{criterion_id}")
async def toggle_exit_criterion(
    deal_id: str,
    criterion_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Toggle the completion state of an exit criterion."""
    res = await db.execute(text("""
        SELECT id, is_completed FROM deal_exit_criteria
        WHERE id = CAST(:cid AS uuid)
          AND deal_id = CAST(:deal_id AS uuid)
          AND org_id = CAST(:org_id AS uuid)
    """), {"cid": criterion_id, "deal_id": deal_id, "org_id": org_id})
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Criterion not found")

    new_state = not row.is_completed
    await db.execute(text("""
        UPDATE deal_exit_criteria
        SET is_completed = :completed,
            completed_at = CASE WHEN :completed THEN NOW() ELSE NULL END
        WHERE id = CAST(:cid AS uuid)
    """), {"completed": new_state, "cid": criterion_id})
    await db.commit()

    return {"id": criterion_id, "is_completed": new_state}


@router.post("/{deal_id}/exit-criteria")
async def add_custom_criterion(
    deal_id: str,
    body: ExitCriterionCreate,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Add a custom exit criterion to the deal's current (or specified) stage."""
    res = await db.execute(text("""
        SELECT id, stage FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    deal = res.fetchone()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    stage = body.stage or deal.stage
    cid = str(uuid.uuid4())

    await db.execute(text("""
        INSERT INTO deal_exit_criteria
            (id, deal_id, stage, criterion_text, is_completed, is_custom, org_id, created_at)
        VALUES (CAST(:cid AS uuid), CAST(:deal_id AS uuid), :stage,
                :text, FALSE, TRUE, CAST(:org_id AS uuid), NOW())
    """), {"cid": cid, "deal_id": deal_id, "stage": stage, "text": body.criterion_text, "org_id": org_id})
    await db.commit()

    return {
        "id":             cid,
        "criterion_text": body.criterion_text,
        "is_completed":   False,
        "is_custom":      True,
        "stage":          stage,
    }


@router.delete("/{deal_id}/exit-criteria/{criterion_id}")
async def delete_custom_criterion(
    deal_id: str,
    criterion_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Delete a custom exit criterion. Cannot delete default criteria."""
    res = await db.execute(text("""
        SELECT id, is_custom FROM deal_exit_criteria
        WHERE id = CAST(:cid AS uuid)
          AND deal_id = CAST(:deal_id AS uuid)
          AND org_id = CAST(:org_id AS uuid)
    """), {"cid": criterion_id, "deal_id": deal_id, "org_id": org_id})
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Criterion not found")
    if not row.is_custom:
        raise HTTPException(status_code=400, detail="Cannot delete default criteria — only custom criteria can be removed")

    await db.execute(text("""
        DELETE FROM deal_exit_criteria
        WHERE id = CAST(:cid AS uuid)
    """), {"cid": criterion_id})
    await db.commit()

    return {"deleted": criterion_id}