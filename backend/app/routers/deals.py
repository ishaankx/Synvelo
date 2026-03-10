import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.services.scoring import score_deal
from app.services.rag import rag_answer
from app.services.brief_service import generate_brief, generate_followup

router = APIRouter(prefix="/deals", tags=["deals"])


class DealCreate(BaseModel):
    name:    str
    company: Optional[str] = ""
    stage:   Optional[str] = "Qualification"
    value:   Optional[float] = 0
    owner:   Optional[str] = ""


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
async def create_deal(body: DealCreate, db: AsyncSession = Depends(get_db)):
    did = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO deals (id, name, company, stage, value, owner,
            risk_flags, signals, meddic, created_at)
        VALUES (CAST(:id AS uuid), :name, :company, :stage, :value, :owner,
            '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW())
    """), {
        "id": did, "name": body.name, "company": body.company,
        "stage": body.stage, "value": body.value, "owner": body.owner,
    })
    await db.commit()
    return {
        "id": did, "name": body.name, "company": body.company,
        "stage": body.stage, "value": body.value, "owner": body.owner,
    }


@router.get("/")
async def list_deals(db: AsyncSession = Depends(get_db)):
    res = await db.execute(text("""
        SELECT id, name, company, stage, value, owner,
               win_probability, probability_low, probability_high,
               time_to_close_days, score_summary, risk_flags, signals,
               last_scored_at, created_at
        FROM deals ORDER BY created_at DESC
    """))
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
async def get_deal(deal_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(text("""
        SELECT id, name, company, stage, value, owner,
               win_probability, probability_low, probability_high,
               time_to_close_days, score_summary, risk_flags, signals,
               meddic, brief, brief_generated_at, last_scored_at, created_at
        FROM deals WHERE id = CAST(:id AS uuid)
    """), {"id": deal_id})
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


# ── Actions ───────────────────────────────────────────────────────────────────

@router.post("/{deal_id}/score")
async def score(deal_id: str, db: AsyncSession = Depends(get_db)):
    result = await score_deal(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{deal_id}/ask")
async def ask(deal_id: str, req: AskRequest, db: AsyncSession = Depends(get_db)):
    return await rag_answer(req.query, db, deal_id=deal_id)


@router.post("/{deal_id}/brief")
async def brief(deal_id: str, db: AsyncSession = Depends(get_db)):
    result = await generate_brief(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{deal_id}/followup")
async def followup(deal_id: str, db: AsyncSession = Depends(get_db)):
    result = await generate_followup(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/{deal_id}/score-history")
async def score_history(deal_id: str, db: AsyncSession = Depends(get_db)):
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
