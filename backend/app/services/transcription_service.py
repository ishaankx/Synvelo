import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import settings
from app.services.embeddings import ingest_file

client = AsyncOpenAI(api_key=settings.openai_api_key)
UPLOAD_DIR = Path(settings.UPLOAD_DIR)


async def _format_transcript(raw: str, attendees: str, call_title: str) -> str:
    """GPT-4o cleans and speaker-labels a raw Whisper transcript."""
    hint = f"Known attendees: {attendees}." if attendees else ""
    prompt = f"""Format this raw call transcript into a clean professional document.
{f"Title: {call_title}" if call_title else ""} {hint}

Rules:
- Add speaker labels (Speaker 1 / Speaker 2, or use names from attendees if provided)
- Break into paragraphs at natural topic changes
- Clean obvious transcription errors but keep all content
- Add a "Key Points" section with 5 bullets at the top

Raw transcript:
{raw[:12000]}

Return the formatted transcript as plain text only."""

    resp = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=6000,
    )
    return resp.choices[0].message.content


def _make_pdf(
    transcript: str,
    deal_name: str,
    call_title: str,
    platform: str,
    attendees: str,
    duration_seconds: int,
    output_path: str,
) -> None:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

    doc = SimpleDocTemplate(
        output_path, pagesize=letter,
        rightMargin=0.8 * inch, leftMargin=0.8 * inch,
        topMargin=0.8 * inch,  bottomMargin=0.8 * inch,
    )

    accent = HexColor("#4f46e5")
    dark   = HexColor("#111827")
    gray   = HexColor("#6b7280")
    body_c = HexColor("#374151")

    styles = getSampleStyleSheet()
    title_s = ParagraphStyle("T", parent=styles["Normal"], fontSize=18, fontName="Helvetica-Bold", textColor=dark, spaceAfter=6)
    meta_s  = ParagraphStyle("M", parent=styles["Normal"], fontSize=9,  fontName="Helvetica",      textColor=gray, spaceAfter=3)
    body_s  = ParagraphStyle("B", parent=styles["Normal"], fontSize=10, fontName="Helvetica",      textColor=body_c, leading=16, spaceAfter=8)
    head_s  = ParagraphStyle("H", parent=styles["Normal"], fontSize=11, fontName="Helvetica-Bold", textColor=accent, spaceBefore=14, spaceAfter=6)

    dur_str = f"{duration_seconds // 60}m {duration_seconds % 60}s" if duration_seconds else "Unknown"
    story = [
        Paragraph(call_title or "Call Transcript", title_s),
        Paragraph(f"Deal: {deal_name} &nbsp;·&nbsp; Platform: {platform.title()}", meta_s),
        Paragraph(f"Attendees: {attendees or 'Not specified'} &nbsp;·&nbsp; Duration: {dur_str}", meta_s),
        Paragraph(f"Generated: {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}", meta_s),
        Spacer(1, 10),
        HRFlowable(width="100%", thickness=2, color=accent),
        Spacer(1, 14),
    ]

    for line in transcript.split("\n"):
        line = line.strip()
        if not line:
            story.append(Spacer(1, 5))
        elif (line.upper() == line and len(line) < 80) or line.startswith(("Speaker", "Key Points")):
            story.append(Paragraph(line, head_s))
        else:
            safe = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(safe, body_s))

    doc.build(story)


async def transcribe_audio_file(
    audio_path: str,
    deal_id: str,
    transcription_id: str,
    deal_name: str,
    call_title: str,
    platform: str,
    attendees: str,
    document_id: str,
    db: AsyncSession,
) -> None:
    try:
        await db.execute(text("""
            UPDATE call_transcriptions SET status = 'processing'
            WHERE id = CAST(:id AS uuid)
        """), {"id": transcription_id})
        await db.commit()

        # Whisper
        with open(audio_path, "rb") as f:
            whisper = await client.audio.transcriptions.create(
                model="whisper-1", file=f, response_format="verbose_json"
            )
        raw_text = whisper.text
        duration = int(getattr(whisper, "duration", 0) or 0)

        # Format
        formatted = await _format_transcript(raw_text, attendees, call_title)

        # PDF
        safe_name = (call_title or "transcript").replace(" ", "_").replace("/", "-")[:40]
        pdf_name  = f"transcript_{deal_id[:8]}_{safe_name}.pdf"
        pdf_path  = str(UPLOAD_DIR / pdf_name)
        _make_pdf(formatted, deal_name, call_title or "Sales Call", platform, attendees, duration, pdf_path)

        # Update transcription record
        await db.execute(text("""
            UPDATE call_transcriptions
            SET status = 'done',
                transcript_text  = :txt,
                pdf_filename     = :pdf,
                duration_seconds = :dur,
                completed_at     = NOW()
            WHERE id = CAST(:id AS uuid)
        """), {"txt": formatted, "pdf": pdf_name, "dur": duration, "id": transcription_id})
        await db.commit()

        # Ingest PDF into deal pipeline
        await ingest_file(pdf_path, pdf_name, "pdf", deal_id, document_id, db)

    except Exception as e:
        await db.execute(text("""
            UPDATE call_transcriptions
            SET status = 'error', error_message = :err
            WHERE id = CAST(:id AS uuid)
        """), {"err": str(e)[:500], "id": transcription_id})
        await db.commit()
        raise


async def download_and_transcribe_url(
    url: str,
    deal_id: str,
    transcription_id: str,
    deal_name: str,
    call_title: str,
    platform: str,
    attendees: str,
    document_id: str,
    db: AsyncSession,
) -> None:
    try:
        await db.execute(text("""
            UPDATE call_transcriptions SET status = 'downloading'
            WHERE id = CAST(:id AS uuid)
        """), {"id": transcription_id})
        await db.commit()

        with tempfile.TemporaryDirectory() as tmpdir:
            out_tmpl = os.path.join(tmpdir, "audio.%(ext)s")
            result = subprocess.run(
                ["yt-dlp", "--extract-audio", "--audio-format", "mp3",
                 "--audio-quality", "5", "--output", out_tmpl, "--no-playlist", url],
                capture_output=True, text=True, timeout=300,
            )
            if result.returncode != 0:
                raise ValueError(f"yt-dlp failed: {result.stderr[:200]}")

            files = list(Path(tmpdir).glob("*.mp3")) or list(Path(tmpdir).glob("*"))
            if not files:
                raise ValueError("No audio file produced by yt-dlp")

            dest = str(UPLOAD_DIR / f"call_{transcription_id[:8]}.mp3")
            shutil.copy(str(files[0]), dest)

        await transcribe_audio_file(
            dest, deal_id, transcription_id, deal_name,
            call_title, platform, attendees, document_id, db,
        )

    except Exception as e:
        await db.execute(text("""
            UPDATE call_transcriptions
            SET status = 'error', error_message = :err
            WHERE id = CAST(:id AS uuid)
        """), {"err": str(e)[:500], "id": transcription_id})
        await db.commit()
        raise
