from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
import uuid

from app.database import get_db, PulseAction, Deal
from app.models.schemas import PulseQuery, PulseActionResponse, PulseProposal
from app.services.erp_mock import run_pulse_sync
from app.dependencies import get_org_id

router = APIRouter(prefix="/pulse", tags=["pulse-sync"])


@router.post("/query", response_model=PulseActionResponse)
async def pulse_query(
    payload: PulseQuery,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    deal_context = ""
    if payload.deal_id:
        result = await db.execute(text("""
            SELECT name, company, stage, value FROM deals
            WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
        """), {"id": payload.deal_id, "org_id": org_id})
        deal = result.fetchone()
        if deal:
            deal_context = f"Deal: {deal.name}, Company: {deal.company}, Stage: {deal.stage}, Value: ${deal.value:,.0f}"

    agent_result = await run_pulse_sync(payload.query, deal_context)

    action = PulseAction(
        id=uuid.uuid4(),
        deal_id=uuid.UUID(payload.deal_id) if payload.deal_id else None,
        query=payload.query,
        proposal=agent_result.get("proposal"),
        raw_answer=agent_result.get("raw_answer", ""),
        org_id=uuid.UUID(org_id) if isinstance(org_id, str) else org_id,
        status="pending",
    )
    db.add(action)
    await db.commit()

    proposal_data = agent_result.get("proposal", {})
    proposal = None
    if proposal_data:
        split_options = proposal_data.get("split_options", [])
        from app.models.schemas import ShipmentOption
        proposal = PulseProposal(
            summary=proposal_data.get("summary", ""),
            split_options=[ShipmentOption(**s) for s in split_options],
            total_cost=proposal_data.get("total_cost", 0),
            margin_impact=proposal_data.get("margin_impact", 0),
            margin_impact_pct=proposal_data.get("margin_impact_pct", 0),
            recommended=proposal_data.get("recommended", ""),
            win_probability_impact=proposal_data.get("win_probability_impact", 0),
            requires_approval=True,
        )

    return PulseActionResponse(
        action_id=str(action.id),
        query=payload.query,
        proposal=proposal,
        raw_answer=agent_result.get("raw_answer", ""),
        status="pending",
    )


@router.post("/approve/{action_id}")
async def approve_action(
    action_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    result = await db.execute(text("""
        SELECT id FROM pulse_actions
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": action_id, "org_id": org_id})
    if not result.fetchone():
        raise HTTPException(404, "Action not found")

    await db.execute(text("""
        UPDATE pulse_actions
        SET status = :status, decided_by = :decided_by, decided_at = NOW()
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {
        "status": body.get("decision", "approved"),
        "decided_by": body.get("user", "demo_user"),
        "id": action_id,
        "org_id": org_id,
    })
    await db.commit()
    return {"action_id": action_id, "status": body.get("decision", "approved")}


@router.get("/history")
async def get_history(
    deal_id: str = None,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    if deal_id:
        result = await db.execute(text("""
            SELECT id, query, proposal, status, created_at
            FROM pulse_actions
            WHERE org_id = CAST(:org_id AS uuid) AND deal_id = CAST(:deal_id AS uuid)
            ORDER BY created_at DESC LIMIT 20
        """), {"org_id": org_id, "deal_id": deal_id})
    else:
        result = await db.execute(text("""
            SELECT id, query, proposal, status, created_at
            FROM pulse_actions
            WHERE org_id = CAST(:org_id AS uuid)
            ORDER BY created_at DESC LIMIT 20
        """), {"org_id": org_id})

    return [{
        "id":         str(a.id),
        "query":      a.query,
        "proposal":   a.proposal,
        "status":     a.status,
        "created_at": a.created_at,
    } for a in result.fetchall()]