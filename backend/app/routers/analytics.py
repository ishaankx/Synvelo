from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_org_id
from app.services.analytics_service import get_pipeline_summary
from app.rate_limit import get_ai_usage

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def analytics_summary(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    return await get_pipeline_summary(db, org_id)


@router.get("/usage")
async def ai_usage(
    org_id: str = Depends(get_org_id),
    month: str = Query(default=None, description="YYYY-MM format"),
):
    usage = await get_ai_usage(org_id, month)
    return {"org_id": org_id, "month": month, "usage": usage}