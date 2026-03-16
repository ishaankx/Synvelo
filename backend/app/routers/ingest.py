import uuid
import aiofiles
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.services.embeddings import ingest_file
from app.dependencies import get_org_id
from app.config import settings

router = APIRouter(prefix="/ingest", tags=["ingest"])
UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def detect_source_type(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        return "pdf"
    if ext in ("mp3", "mp4", "wav", "m4a", "ogg", "webm"):
        return "audio"
    return "text"


@router.post("/upload")
async def upload_document(
    deal_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    # Verify deal exists AND belongs to this org
    result = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    doc_id      = str(uuid.uuid4())
    source_type = detect_source_type(file.filename or "file.txt")
    safe_name   = f"{doc_id[:8]}_{file.filename}"
    file_path   = str(UPLOAD_DIR / safe_name)

    # Save to disk
    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # Create document record with org_id
    await db.execute(text("""
        INSERT INTO documents (id, deal_id, filename, source_type, status, org_id, created_at)
        VALUES (
            CAST(:id AS uuid),
            CAST(:deal_id AS uuid),
            :filename,
            :source_type,
            'processing',
            CAST(:org_id AS uuid),
            NOW()
        )
    """), {
        "id": doc_id, "deal_id": deal_id,
        "filename": file.filename, "source_type": source_type,
        "org_id": org_id,
    })
    await db.commit()

    # Ingest: extract text, run sentiment, chunk, embed
    chunks_created = await ingest_file(
        file_path, file.filename, source_type, deal_id, doc_id, db
    )

    return {
        "document_id":    doc_id,
        "filename":       file.filename,
        "source_type":    source_type,
        "chunks_created": chunks_created,
        "status":         "done",
    }


@router.get("/documents/{deal_id}")
async def list_documents(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    # Verify deal ownership first
    ownership = await db.execute(text("""
        SELECT id FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    if not ownership.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    result = await db.execute(text("""
        SELECT id, filename, source_type, status,
               sentiment_score, sentiment_label, created_at
        FROM documents
        WHERE deal_id = CAST(:deal_id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY created_at DESC
    """), {"deal_id": deal_id, "org_id": org_id})

    return [{
        "id":              str(r.id),
        "filename":        r.filename,
        "source_type":     r.source_type,
        "status":          r.status,
        "sentiment_score": r.sentiment_score,
        "sentiment_label": r.sentiment_label,
        "created_at":      str(r.created_at),
    } for r in result.fetchall()]