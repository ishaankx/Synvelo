from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.services.report_service import generate_report, REPORTS_DIR

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/generate/{deal_id}")
async def create_report(deal_id: str, db: AsyncSession = Depends(get_db)):
    """Generate a Deal Intelligence Report PDF from all deal documents."""
    result = await generate_report(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/list/{deal_id}")
async def list_reports(deal_id: str, db: AsyncSession = Depends(get_db)):
    """List all reports generated for a specific deal."""
    res = await db.execute(text("""
        SELECT id, deal_id, filename, page_count, created_at
        FROM deal_reports
        WHERE deal_id = CAST(:id AS uuid)
        ORDER BY created_at DESC
    """), {"id": deal_id})
    return [{
        "report_id":  str(r.id),
        "deal_id":    str(r.deal_id),
        "filename":   r.filename,
        "page_count": r.page_count,
        "created_at": str(r.created_at),
    } for r in res.fetchall()]


@router.get("/all")
async def list_all_reports(db: AsyncSession = Depends(get_db)):
    """List all reports across all deals — for the Reports dashboard."""
    res = await db.execute(text("""
        SELECT r.id, r.deal_id, r.filename, r.page_count, r.created_at,
               d.name AS deal_name, d.company, d.stage, d.win_probability
        FROM deal_reports r
        JOIN deals d ON d.id = r.deal_id
        ORDER BY r.created_at DESC
        LIMIT 100
    """))
    return [{
        "report_id":      str(r.id),
        "deal_id":        str(r.deal_id),
        "deal_name":      r.deal_name,
        "company":        r.company,
        "stage":          r.stage,
        "win_probability":r.win_probability,
        "filename":       r.filename,
        "page_count":     r.page_count,
        "created_at":     str(r.created_at),
    } for r in res.fetchall()]


@router.get("/download/{report_id}")
async def download_report(report_id: str, db: AsyncSession = Depends(get_db)):
    """Download a report PDF by report ID."""
    res = await db.execute(text("""
        SELECT r.filename, d.name AS deal_name
        FROM deal_reports r
        JOIN deals d ON d.id = r.deal_id
        WHERE r.id = CAST(:id AS uuid)
    """), {"id": report_id})
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    file_path = REPORTS_DIR / row.filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Report file not found on disk")

    safe_name = (
        row.deal_name
        .replace('—', '-').replace('–', '-')   # em/en dash
        .replace(' ', '_')
        .encode('ascii', 'ignore').decode('ascii')  # strip any remaining non-ascii
    )[:40]
    safe_name = f"Synvelo_Report_{safe_name}.pdf"
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=safe_name,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.delete("/{report_id}")
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a report record and its PDF file."""
    res = await db.execute(
        text("SELECT filename FROM deal_reports WHERE id = CAST(:id AS uuid)"),
        {"id": report_id}
    )
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    # Remove file
    try:
        (REPORTS_DIR / row.filename).unlink(missing_ok=True)
    except Exception:
        pass

    await db.execute(
        text("DELETE FROM deal_reports WHERE id = CAST(:id AS uuid)"),
        {"id": report_id}
    )
    await db.commit()
    return {"deleted": report_id}