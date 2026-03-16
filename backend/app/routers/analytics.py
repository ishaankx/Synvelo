from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_org_id
from app.services.analytics_service import get_pipeline_summary

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def analytics_summary(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    return await get_pipeline_summary(db, org_id)