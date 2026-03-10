import uuid
import aiofiles
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from app.database import get_db, AsyncSessionLocal
from app.services.transcription_service import transcribe_audio_file, download_and_transcribe_url
from app.config import settings

router = APIRouter(prefix="/transcribe", tags=["transcription"])
UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class URLRequest(BaseModel):
    deal_id:    str
    url:        str
    platform:   Optional[str] = "zoom"
    call_title: Optional[str] = ""
    attendees:  Optional[str] = ""


# Background task wrappers use their own DB session
async def _bg_file(audio_path, deal_id, tid, deal_name, call_title, platform, attendees, doc_id):
    async with AsyncSessionLocal() as db:
        await transcribe_audio_file(
            audio_path, deal_id, tid, deal_name, call_title, platform, attendees, doc_id, db
        )


async def _bg_url(url, deal_id, tid, deal_name, call_title, platform, attendees, doc_id):
    async with AsyncSessionLocal() as db:
        await download_and_transcribe_url(
            url, deal_id, tid, deal_name, call_title, platform, attendees, doc_id, db
        )


@router.post("/upload")
async def upload_and_transcribe(
    bg:         BackgroundTasks,
    deal_id:    str        = Form(...),
    call_title: str        = Form(default=""),
    attendees:  str        = Form(default=""),
    platform:   str        = Form(default="upload"),
    file:       UploadFile = File(...),
    db:         AsyncSession = Depends(get_db),
):
    deal_res = await db.execute(
        text("SELECT id, name FROM deals WHERE id = CAST(:id AS uuid)"), {"id": deal_id}
    )
    deal = deal_res.fetchone()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    tid   = str(uuid.uuid4())
    docid = str(uuid.uuid4())
    audio_path = str(UPLOAD_DIR / f"call_{tid[:8]}_{file.filename}")

    async with aiofiles.open(audio_path, "wb") as f:
        await f.write(await file.read())

    await db.execute(text("""
        INSERT INTO call_transcriptions
            (id, deal_id, platform, status, call_title, attendees, created_at)
        VALUES (CAST(:id AS uuid), CAST(:did AS uuid), :platform, 'pending', :title, :att, NOW())
    """), {"id": tid, "did": deal_id, "platform": platform, "title": call_title, "att": attendees})

    await db.execute(text("""
        INSERT INTO documents (id, deal_id, filename, source_type, status, created_at)
        VALUES (CAST(:id AS uuid), CAST(:did AS uuid), :fname, 'audio', 'processing', NOW())
    """), {"id": docid, "did": deal_id, "fname": call_title or file.filename or "call_recording"})

    await db.commit()

    bg.add_task(
        _bg_file, audio_path, deal_id, tid, deal.name,
        call_title, platform, attendees, docid
    )

    return {
        "transcription_id": tid,
        "status":           "pending",
        "message":          "Transcription started. Poll /transcribe/status/{id} for progress.",
    }


@router.post("/url")
async def transcribe_from_url(
    req: URLRequest,
    bg:  BackgroundTasks,
    db:  AsyncSession = Depends(get_db),
):
    deal_res = await db.execute(
        text("SELECT id, name FROM deals WHERE id = CAST(:id AS uuid)"), {"id": req.deal_id}
    )
    deal = deal_res.fetchone()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    tid   = str(uuid.uuid4())
    docid = str(uuid.uuid4())

    await db.execute(text("""
        INSERT INTO call_transcriptions
            (id, deal_id, source_url, platform, status, call_title, attendees, created_at)
        VALUES (CAST(:id AS uuid), CAST(:did AS uuid), :url, :platform, 'pending', :title, :att, NOW())
    """), {
        "id": tid, "did": req.deal_id, "url": req.url,
        "platform": req.platform, "title": req.call_title, "att": req.attendees,
    })

    await db.execute(text("""
        INSERT INTO documents (id, deal_id, filename, source_type, status, created_at)
        VALUES (CAST(:id AS uuid), CAST(:did AS uuid), :fname, 'audio', 'processing', NOW())
    """), {
        "id": docid, "did": req.deal_id,
        "fname": req.call_title or f"{req.platform}_recording",
    })

    await db.commit()

    bg.add_task(
        _bg_url, req.url, req.deal_id, tid, deal.name,
        req.call_title, req.platform, req.attendees, docid
    )

    return {"transcription_id": tid, "status": "pending"}


@router.get("/status/{tid}")
async def get_status(tid: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(text("""
        SELECT id, deal_id, platform, status, call_title, attendees,
               duration_seconds, pdf_filename, error_message, created_at, completed_at
        FROM call_transcriptions WHERE id = CAST(:id AS uuid)
    """), {"id": tid})
    r = res.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Transcription job not found")
    return {
        "id":              str(r.id),
        "deal_id":         str(r.deal_id),
        "platform":        r.platform,
        "status":          r.status,
        "call_title":      r.call_title,
        "attendees":       r.attendees,
        "duration_seconds":r.duration_seconds,
        "pdf_filename":    r.pdf_filename,
        "error_message":   r.error_message,
        "created_at":      str(r.created_at),
        "completed_at":    str(r.completed_at) if r.completed_at else None,
    }


@router.get("/list/{deal_id}")
async def list_transcriptions(deal_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(text("""
        SELECT id, platform, status, call_title, attendees,
               duration_seconds, error_message, created_at, completed_at
        FROM call_transcriptions
        WHERE deal_id = CAST(:id AS uuid)
        ORDER BY created_at DESC
    """), {"id": deal_id})
    return [{
        "id":               str(r.id),
        "platform":         r.platform,
        "status":           r.status,
        "call_title":       r.call_title,
        "duration_seconds": r.duration_seconds,
        "error_message":    r.error_message,
        "created_at":       str(r.created_at),
        "completed_at":     str(r.completed_at) if r.completed_at else None,
    } for r in res.fetchall()]
