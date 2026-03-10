from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db, Organisation
from app.schemas import OrganisationCreate, OrganisationResponse
import uuid

router = APIRouter(prefix="/organisations", tags=["organisations"])


@router.post("/", response_model=OrganisationResponse)
async def create_organisation(
    payload: OrganisationCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check slug uniqueness
    existing = await db.execute(
        select(Organisation).where(Organisation.slug == payload.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already taken")

    org = Organisation(
        id=str(uuid.uuid4()),
        name=payload.name,
        slug=payload.slug,
        plan=payload.plan
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrganisationResponse)
async def get_organisation(
    org_id: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Organisation).where(Organisation.id == org_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    return org