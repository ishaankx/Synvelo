from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.database import get_db, PulseAction, Deal
from app.models.schemas import PulseQuery, PulseActionResponse, PulseProposal
from app.services.erp_mock import run_pulse_sync

router = APIRouter(prefix="/pulse", tags=["pulse-sync"])

@router.post("/query", response_model=PulseActionResponse)
async def pulse_query(payload: PulseQuery, db: AsyncSession = Depends(get_db)):
    """Process a Pulse Sync query against the mock ERP."""
    deal_context = ""
    if payload.deal_id:
        result = await db.execute(select(Deal).where(Deal.id == payload.deal_id))
        deal = result.scalar_one_or_none()
        if deal:
            deal_context = f"Deal: {deal.name}, Company: {deal.company}, Stage: {deal.stage}, Value: ${deal.value:,.0f}"

    # Run the agent
    agent_result = await run_pulse_sync(payload.query, deal_context)

    # Save action to DB
    action = PulseAction(
        id=uuid.uuid4(),
        deal_id=payload.deal_id,
        query=payload.query,
        proposal=agent_result.get("proposal"),
        status="pending"
    )
    db.add(action)
    await db.commit()

    # Build response
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
            requires_approval=True
        )

    return PulseActionResponse(
        action_id=str(action.id),
        query=payload.query,
        proposal=proposal,
        raw_answer=agent_result.get("raw_answer", ""),
        status="pending"
    )

@router.post("/approve/{action_id}")
async def approve_action(action_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PulseAction).where(PulseAction.id == action_id))
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(404, "Action not found")

    action.status = body.get("decision", "approved")
    action.approved_by = body.get("user", "demo_user")
    await db.commit()
    return {"action_id": action_id, "status": action.status}

@router.get("/history")
async def get_history(deal_id: str = None, db: AsyncSession = Depends(get_db)):
    query = select(PulseAction).order_by(PulseAction.created_at.desc()).limit(20)
    if deal_id:
        query = query.where(PulseAction.deal_id == deal_id)
    result = await db.execute(query)
    actions = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "query": a.query,
            "proposal": a.proposal,
            "status": a.status,
            "created_at": a.created_at
        }
        for a in actions
    ]