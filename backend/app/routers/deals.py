import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from app.database import get_db
from app.models.schemas import DealCreate
from app.services.scoring import score_deal
from app.services.rag import rag_answer
from app.services.brief_service import generate_brief, generate_followup
from app.dependencies import get_org_id
from app.rate_limit import limiter, AI_RATE, track_ai_usage

router = APIRouter(prefix="/deals", tags=["deals"])


class AskRequest(BaseModel):
    query: str


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
        INSERT INTO deals (id, name, company, stage, value, owner,
            time_to_close_days, risk_flags, signals, meddic, org_id, created_at)
        VALUES (CAST(:id AS uuid), :name, :company, :stage, :value, :owner,
            :time_to_close_days, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
            CAST(:org_id AS uuid), NOW())
    """), {
        "id":                 did,
        "name":               body.name,
        "company":            body.company,
        "stage":              body.stage,
        "value":              body.value,
        "owner":              body.owner,
        "time_to_close_days": body.time_to_close_days,
        "org_id":             org_id,
    })
    await db.commit()
    return {
        "id":                 did,
        "name":               body.name,
        "company":            body.company,
        "stage":              body.stage,
        "value":              body.value,
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
        SELECT id, name, company, stage, value, owner,
               win_probability, probability_low, probability_high,
               time_to_close_days, score_summary, risk_flags, signals,
               last_scored_at, created_at
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
            "id":                 str(r.id),
            "name":               r.name,
            "company":            r.company,
            "stage":              r.stage,
            "value":              float(r.value or 0),
            "owner":              r.owner,
            "win_probability":    r.win_probability,
            "probability_low":    r.probability_low,
            "probability_high":   r.probability_high,
            "time_to_close_days": r.time_to_close_days,
            "score_summary":      r.score_summary,
            "risk_flags":         _parse(r.risk_flags),
            "signals":            signals,
            "red_signals":        red_count,
            "yellow_signals":     yellow_count,
            "last_scored_at":     str(r.last_scored_at) if r.last_scored_at else None,
            "created_at":         str(r.created_at),
        })
    return out


@router.get("/{deal_id}")
async def get_deal(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id, name, company, stage, value, owner,
               win_probability, probability_low, probability_high,
               time_to_close_days, score_summary, risk_flags, signals,
               meddic, brief, brief_generated_at, last_scored_at, created_at
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
        "id":                  str(r.id),
        "name":                r.name,
        "company":             r.company,
        "stage":               r.stage,
        "value":               float(r.value or 0),
        "owner":               r.owner,
        "win_probability":     r.win_probability,
        "probability_low":     r.probability_low,
        "probability_high":    r.probability_high,
        "time_to_close_days":  r.time_to_close_days,
        "score_summary":       r.score_summary,
        "risk_flags":          _parse(r.risk_flags),
        "signals":             _parse(r.signals),
        "meddic":              _parse(r.meddic) if r.meddic else {},
        "brief":               brief_data,
        "brief_generated_at":  str(r.brief_generated_at) if r.brief_generated_at else None,
        "last_scored_at":      str(r.last_scored_at) if r.last_scored_at else None,
        "created_at":          str(r.created_at),
    }


@router.delete("/{deal_id}")
async def delete_deal(
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

    await db.execute(text("""
        DELETE FROM deals WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    await db.commit()
    return {"deleted": deal_id}


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

    await track_ai_usage(org_id, "score")
    result = await score_deal(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
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
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    await track_ai_usage(org_id, "ask")
    return await rag_answer(req.query, db, deal_id=deal_id)


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

    await track_ai_usage(org_id, "brief")
    result = await generate_brief(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
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

    await track_ai_usage(org_id, "followup")
    result = await generate_followup(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
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