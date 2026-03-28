import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.services.report_service import generate_report, REPORTS_DIR
from app.services.journey_report_service import generate_journey_report
from app.database import get_db, DealReport, Deal
from app.dependencies import get_org_id
from app.rate_limit import limiter, AI_RATE, track_ai_usage
from app.services.activity_service import log_activity
from app.services.tracking_service import track_ai_feature

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/generate/{deal_id}")
@limiter.limit(AI_RATE)
async def create_report(
    request: Request,
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    # Verify deal belongs to this org
    res = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    # Fetch deal name for logging
    dn = await db.execute(text("SELECT name FROM deals WHERE id = CAST(:id AS uuid)"), {"id": deal_id})
    deal_row = dn.fetchone()

    await track_ai_usage(org_id, "report")
    result = await generate_report(deal_id, db, org_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    await log_activity(
        org_id=org_id, event_type="report_generated", entity_type="report",
        entity_id=result.get("report_id"), entity_name=result.get("filename"),
        metadata={"deal_id": deal_id, "deal_name": deal_row.name if deal_row else None,
                   "page_count": result.get("page_count")},
    )
    asyncio.create_task(track_ai_feature(
        deal_id=deal_id, feature_name="report_intelligence", org_id=org_id,
        result_summary={"report_id": result.get("report_id")},
    ))

    return result


@router.get("/list/{deal_id}")
async def list_reports(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT id, deal_id, filename, page_count, created_at,
               COALESCE(report_type, 'intelligence') AS report_type
        FROM deal_reports
        WHERE deal_id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY created_at DESC
    """), {"id": deal_id, "org_id": org_id})
    return [{
        "report_id":   str(r.id),
        "deal_id":     str(r.deal_id),
        "filename":    r.filename,
        "page_count":  r.page_count,
        "report_type": r.report_type,
        "created_at":  str(r.created_at),
    } for r in res.fetchall()]


@router.get("/all")
async def list_all_reports(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT r.id, r.deal_id, r.filename, r.page_count, r.created_at,
               COALESCE(r.report_type, 'intelligence') AS report_type,
               d.name AS deal_name, d.company, d.stage, d.win_probability
        FROM deal_reports r
        JOIN deals d ON d.id = r.deal_id
        WHERE r.org_id = CAST(:org_id AS uuid)
        ORDER BY r.created_at DESC
        LIMIT 100
    """), {"org_id": org_id})
    return [{
        "report_id":       str(r.id),
        "deal_id":         str(r.deal_id),
        "deal_name":       r.deal_name,
        "company":         r.company,
        "stage":           r.stage,
        "win_probability": r.win_probability,
        "filename":        r.filename,
        "page_count":      r.page_count,
        "report_type":     r.report_type,
        "created_at":      str(r.created_at),
    } for r in res.fetchall()]


@router.get("/download/{report_id}")
async def download_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT r.filename, d.name AS deal_name
        FROM deal_reports r
        JOIN deals d ON d.id = r.deal_id
        WHERE r.id = CAST(:id AS uuid) AND r.org_id = CAST(:org_id AS uuid)
    """), {"id": report_id, "org_id": org_id})
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    file_path = (REPORTS_DIR / row.filename).resolve()
    if not file_path.is_relative_to(REPORTS_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid report path")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Report file not found on disk")

    safe_name = (
        row.deal_name
        .replace("—", "-").replace("–", "-")
        .replace(" ", "_")
        .encode("ascii", "ignore").decode("ascii")
    )[:40]
    safe_name = f"Synvelo_Report_{safe_name}.pdf"
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=safe_name,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.delete("/{report_id}")
async def delete_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT filename FROM deal_reports
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": report_id, "org_id": org_id})
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        del_path = (REPORTS_DIR / row.filename).resolve()
        if del_path.is_relative_to(REPORTS_DIR.resolve()):
            del_path.unlink(missing_ok=True)
    except Exception:
        pass

    await db.execute(text("""
        DELETE FROM deal_reports
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": report_id, "org_id": org_id})
    await db.commit()

    await log_activity(
        org_id=org_id, event_type="report_deleted", entity_type="report",
        entity_id=report_id, entity_name=row.filename,
    )

    return {"deleted": report_id}


# ── Journey Report (Type 2) ─────────────────────────────────────────────────

@router.post("/journey/{deal_id}/generate")
@limiter.limit(AI_RATE)
async def create_journey_report(
    request: Request,
    deal_id: str,
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

    await track_ai_usage(org_id, "journey_report")
    result = await generate_journey_report(deal_id, db, org_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    await log_activity(
        org_id=org_id, event_type="journey_report_generated", entity_type="report",
        entity_id=result.get("report_id"), entity_name=result.get("filename"),
        metadata={"deal_id": deal_id, "deal_name": deal_row.name,
                   "page_count": result.get("page_count")},
    )
    asyncio.create_task(track_ai_feature(
        deal_id=deal_id, feature_name="report_journey", org_id=org_id,
        result_summary={"report_id": result.get("report_id")},
    ))

    return result


@router.get("/journey/{deal_id}/list")
async def list_journey_reports(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT r.id, r.deal_id, r.filename, r.page_count, r.created_at, r.report_json,
               d.name AS deal_name, d.company
        FROM deal_reports r
        JOIN deals d ON d.id = r.deal_id
        WHERE r.deal_id = CAST(:id AS uuid)
          AND r.org_id = CAST(:org_id AS uuid)
          AND r.report_type = 'journey'
        ORDER BY r.created_at DESC
    """), {"id": deal_id, "org_id": org_id})
    return [{
        "report_id":  str(r.id),
        "deal_id":    str(r.deal_id),
        "deal_name":  r.deal_name,
        "company":    r.company,
        "filename":   r.filename,
        "page_count": r.page_count,
        "created_at": str(r.created_at),
    } for r in res.fetchall()]


@router.get("/journey/{report_id}/view")
async def view_journey_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    res = await db.execute(text("""
        SELECT r.id, r.deal_id, r.filename, r.page_count, r.report_json, r.created_at,
               d.name AS deal_name, d.company, d.stage
        FROM deal_reports r
        JOIN deals d ON d.id = r.deal_id
        WHERE r.id = CAST(:id AS uuid)
          AND r.org_id = CAST(:org_id AS uuid)
          AND r.report_type = 'journey'
    """), {"id": report_id, "org_id": org_id})
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Journey report not found")

    return {
        "report_id":   str(row.id),
        "deal_id":     str(row.deal_id),
        "deal_name":   row.deal_name,
        "company":     row.company,
        "stage":       row.stage,
        "filename":    row.filename,
        "page_count":  row.page_count,
        "report_json": row.report_json,
        "created_at":  str(row.created_at),
    }