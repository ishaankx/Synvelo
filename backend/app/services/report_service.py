"""
report_service.py — Deal Intelligence Report
Synthesises messy unstructured content (Whisper transcripts, copy-pasted
email blobs, OCR'd notes) into a clean analyst-grade PDF using GPT-4o + ReportLab.
"""

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from openai import AsyncOpenAI
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.config import settings

client = AsyncOpenAI(api_key=settings.openai_api_key)

REPORTS_DIR = Path(settings.UPLOAD_DIR) / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ── Colours ────────────────────────────────────────────────────────────────────
C_BG     = HexColor("#ffffff")
C_DARK   = HexColor("#0f172a")
C_INDIGO = HexColor("#6366f1")
C_TEXT   = HexColor("#1e293b")
C_MUTED  = HexColor("#64748b")
C_LIGHT  = HexColor("#f1f5f9")
C_GREEN  = HexColor("#16a34a")
C_RED    = HexColor("#dc2626")
C_AMBER  = HexColor("#d97706")
C_BORDER = HexColor("#e2e8f0")


def _style(name, **kw):
    defaults = dict(fontName="Helvetica", fontSize=10, textColor=C_TEXT,
                    leading=15, spaceAfter=4)
    defaults.update(kw)
    return ParagraphStyle(name, **defaults)


STYLES = {
    "h1":     _style("h1",  fontName="Helvetica-Bold", fontSize=20, textColor=C_DARK, spaceAfter=4, leading=26),
    "h2":     _style("h2",  fontName="Helvetica-Bold", fontSize=13, textColor=C_INDIGO, spaceBefore=16, spaceAfter=6, leading=17),
    "h3":     _style("h3",  fontName="Helvetica-Bold", fontSize=10, textColor=C_DARK, spaceBefore=8, spaceAfter=3),
    "body":   _style("body", fontSize=10, leading=16, spaceAfter=5),
    "small":  _style("small", fontSize=9, textColor=C_MUTED, leading=13),
    "bullet": _style("bullet", fontSize=10, leading=16, leftIndent=14, spaceAfter=4),
    "quote":  _style("quote", fontName="Helvetica-Oblique", fontSize=10,
                     textColor=HexColor("#475569"), leading=16, leftIndent=18, spaceAfter=6),
    "label":  _style("label", fontName="Helvetica-Bold", fontSize=8,
                     textColor=C_MUTED, leading=11),
    "risk_h": _style("risk_h", fontName="Helvetica-Bold", fontSize=10, textColor=C_RED),
    "risk_m": _style("risk_m", fontName="Helvetica-Bold", fontSize=10, textColor=C_AMBER),
    "risk_l": _style("risk_l", fontName="Helvetica-Bold", fontSize=10, textColor=C_GREEN),
    "action": _style("action", fontName="Helvetica-Bold", fontSize=11,
                     textColor=C_INDIGO, leading=16),
}


# ── GPT-4o synthesis ──────────────────────────────────────────────────────────

SYNTHESIS_PROMPT = """
You are a senior B2B sales analyst. You will receive raw, unstructured content
from a sales deal. This content may include:
- Whisper transcriptions (filler words, incomplete sentences, no punctuation,
  speaker bleed like "uh", "um", "like", "you know")
- Copy-pasted email threads (>>>> Forwarded message, RE: RE: FW:, HTML artifacts)
- Slack/Teams message dumps
- Handwritten or OCR'd notes with typos and formatting noise

Your job: extract ONLY the business signal. Ignore all noise, filler, formatting
artifacts, and pleasantries. Produce a clean, professional analyst report in JSON.

CRITICAL:
- Never invent facts. If something is not in the text, set the field to null.
- If the text is too sparse to fill a field, leave it null — do not guess.
- Raw quotes must be verbatim from the source (but clean up obvious OCR errors).
- Respond with ONLY valid JSON. No preamble, no markdown backticks.

JSON schema (fill every field you can, null for anything truly absent):
{
  "deal_title": "string",
  "company": "string or null",
  "generated_date": "YYYY-MM-DD",
  "executive_summary": "2-4 sentences. What is this deal about, where does it stand, what is the key risk or opportunity?",
  "deal_snapshot": {
    "stage": "string or null",
    "estimated_value": "string or null",
    "timeline": "string or null",
    "days_to_close_estimate": "integer or null",
    "win_probability_assessment": "string or null"
  },
  "key_contacts": [
    {"name": "string", "role": "string", "authority": "decision maker|champion|influencer|unknown",
     "notes": "1 sentence about this person's position or sentiment, or null"}
  ],
  "pain_points": [
    {"pain": "string — clean, jargon-free description", "severity": "high|medium|low",
     "evidence": "verbatim quote or phrase from source text that confirms this pain"}
  ],
  "decision_criteria": ["string", "..."],
  "competitive_landscape": "string or null — competitors mentioned, pricing pressures, objections",
  "interaction_timeline": [
    {"date": "string or null", "event": "string — what happened in plain English", "source": "call|email|notes"}
  ],
  "risks": [
    {"risk": "string", "severity": "high|medium|low", "mitigation": "string or null"}
  ],
  "positive_signals": ["string", "..."],
  "meddic_summary": {
    "metrics": "string or null",
    "economic_buyer": "string or null",
    "decision_criteria": "string or null",
    "decision_process": "string or null",
    "identify_pain": "string or null",
    "champion": "string or null"
  },
  "recommended_actions": [
    {"action": "string", "priority": "high|medium|low", "owner": "string or null"}
  ],
  "next_best_action": "string — single most important next step",
  "key_quotes": [
    {"quote": "verbatim text", "speaker": "string or null", "significance": "string"}
  ]
}
"""


async def synthesise_with_gpt(raw_text: str, deal_name: str) -> dict:
    """Send raw unstructured text to GPT-4o for synthesis into structured JSON."""
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYNTHESIS_PROMPT},
                {"role": "user",   "content": f"DEAL NAME: {deal_name}\n\n---\n\n{raw_text[:60000]}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=4000,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        return {"error": str(e)}


# ── ReportLab PDF generation ──────────────────────────────────────────────────

def _hr(story, color=C_BORDER, thickness=0.5, space_before=4, space_after=12):
    story.append(Spacer(1, space_before))
    story.append(HRFlowable(width="100%", thickness=thickness, color=color,
                             spaceBefore=0, spaceAfter=space_after))


def _kv_table(story, rows, widths=(1.6*inch, 4.8*inch)):
    data = []
    for k, v in rows:
        if not v:
            continue
        data.append([
            Paragraph(k, STYLES["label"]),
            Paragraph(str(v), STYLES["body"]),
        ])
    if not data:
        return
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [C_LIGHT, white]),
        ("BOX",          (0, 0), (-1, -1), 0.4, C_BORDER),
        ("INNERGRID",    (0, 0), (-1, -1), 0.2, C_BORDER),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))


def _section(story, title):
    story.append(Paragraph(title, STYLES["h2"]))


def _bullets(story, items, style="bullet"):
    for item in (items or []):
        if item:
            story.append(Paragraph(f"• &nbsp;{item}", STYLES[style]))


def _severity_style(sev: str) -> str:
    return {"high": "risk_h", "medium": "risk_m", "low": "risk_l"}.get(
        (sev or "").lower(), "body"
    )


def build_pdf(report: dict, output_path: str, deal_name: str) -> int:
    """Render the synthesised JSON into a PDF. Returns page count."""
    doc = SimpleDocTemplate(
        output_path, pagesize=letter,
        rightMargin=0.75*inch, leftMargin=0.75*inch,
        topMargin=0.75*inch, bottomMargin=0.75*inch,
    )
    story = []

    # ── Cover strip ───────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=4, color=C_INDIGO,
                             spaceBefore=0, spaceAfter=18))
    story.append(Paragraph("DEAL INTELLIGENCE REPORT", _style(
        "eyebrow", fontName="Helvetica-Bold", fontSize=9,
        textColor=C_INDIGO, leading=12, spaceAfter=6,
    )))
    title = report.get("deal_title") or deal_name
    story.append(Paragraph(title, STYLES["h1"]))
    company = report.get("company") or ""
    if company:
        story.append(Paragraph(company, _style("comp", fontSize=12, textColor=C_MUTED,
                                                spaceAfter=4)))
    gen_date = report.get("generated_date") or datetime.now().strftime("%B %d, %Y")
    story.append(Paragraph(f"Generated {gen_date} &nbsp;·&nbsp; Confidential — Internal Use Only",
                            STYLES["small"]))
    _hr(story, color=C_INDIGO, thickness=1, space_before=14, space_after=18)

    # ── Executive Summary ─────────────────────────────────────────────────────
    _section(story, "Executive Summary")
    if report.get("executive_summary"):
        story.append(Paragraph(report["executive_summary"], STYLES["body"]))
    _hr(story)

    # ── Deal Snapshot ─────────────────────────────────────────────────────────
    _section(story, "Deal Snapshot")
    snap = report.get("deal_snapshot") or {}
    _kv_table(story, [
        ("Stage",          snap.get("stage")),
        ("Estimated Value",snap.get("estimated_value")),
        ("Timeline",       snap.get("timeline")),
        ("Est. Days to Close", snap.get("days_to_close_estimate")),
        ("Win Assessment", snap.get("win_probability_assessment")),
    ])
    _hr(story)

    # ── Key Contacts ──────────────────────────────────────────────────────────
    contacts = report.get("key_contacts") or []
    if contacts:
        _section(story, "Key Contacts")
        contact_data = [
            [
                Paragraph("NAME", STYLES["label"]),
                Paragraph("ROLE", STYLES["label"]),
                Paragraph("AUTHORITY", STYLES["label"]),
                Paragraph("NOTES", STYLES["label"]),
            ]
        ]
        for c in contacts:
            auth_map = {
                "decision maker": HexColor("#6366f1"),
                "champion":       HexColor("#16a34a"),
                "influencer":     HexColor("#d97706"),
            }
            auth_color = auth_map.get((c.get("authority") or "").lower(), C_MUTED)
            contact_data.append([
                Paragraph(c.get("name") or "—", STYLES["body"]),
                Paragraph(c.get("role") or "—", STYLES["body"]),
                Paragraph(c.get("authority") or "—",
                          _style("auth", fontSize=9, textColor=auth_color, fontName="Helvetica-Bold")),
                Paragraph(c.get("notes") or "—", STYLES["small"]),
            ])
        ct = Table(contact_data, colWidths=[1.3*inch, 1.5*inch, 1.2*inch, 2.4*inch])
        ct.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0), HexColor("#0f172a")),
            ("TEXTCOLOR",    (0, 0), (-1, 0), white),
            ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",     (0, 0), (-1, 0), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_LIGHT, white]),
            ("BOX",          (0, 0), (-1, -1), 0.4, C_BORDER),
            ("INNERGRID",    (0, 0), (-1, -1), 0.2, C_BORDER),
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",   (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
            ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ]))
        story.append(ct)
        story.append(Spacer(1, 10))
        _hr(story)

    # ── Pain Points ───────────────────────────────────────────────────────────
    pains = report.get("pain_points") or []
    if pains:
        _section(story, "Pain Points")
        for p in pains:
            sev_style = _severity_style(p.get("severity", "medium"))
            story.append(Paragraph(
                f"[{(p.get('severity') or 'MEDIUM').upper()}]  {p.get('pain', '')}",
                STYLES[sev_style]
            ))
            if p.get("evidence"):
                story.append(Paragraph(f'"{p["evidence"]}"', STYLES["quote"]))
            story.append(Spacer(1, 4))
        _hr(story)

    # ── Competitive Landscape ─────────────────────────────────────────────────
    if report.get("competitive_landscape"):
        _section(story, "Competitive Landscape")
        story.append(Paragraph(report["competitive_landscape"], STYLES["body"]))
        _hr(story)

    # ── Risks ─────────────────────────────────────────────────────────────────
    risks = report.get("risks") or []
    if risks:
        _section(story, "Risks")
        for r in risks:
            sev_style = _severity_style(r.get("severity", "medium"))
            story.append(Paragraph(
                f"[{(r.get('severity') or 'MEDIUM').upper()}]  {r.get('risk', '')}",
                STYLES[sev_style]
            ))
            if r.get("mitigation"):
                story.append(Paragraph(
                    f"Mitigation: {r['mitigation']}",
                    _style("mit", fontSize=9, textColor=C_MUTED, leftIndent=14, spaceAfter=3)
                ))
            story.append(Spacer(1, 4))
        _hr(story)

    # ── Positive Signals ──────────────────────────────────────────────────────
    pos = report.get("positive_signals") or []
    if pos:
        _section(story, "Positive Signals")
        _bullets(story, pos)
        _hr(story)

    # ── MEDDIC Summary ────────────────────────────────────────────────────────
    meddic = report.get("meddic_summary") or {}
    if any(meddic.values()):
        _section(story, "MEDDIC Qualification Summary")
        _kv_table(story, [
            ("Metrics",           meddic.get("metrics")),
            ("Economic Buyer",    meddic.get("economic_buyer")),
            ("Decision Criteria", meddic.get("decision_criteria")),
            ("Decision Process",  meddic.get("decision_process")),
            ("Identify Pain",     meddic.get("identify_pain")),
            ("Champion",          meddic.get("champion")),
        ])
        _hr(story)

    # ── Interaction Timeline ──────────────────────────────────────────────────
    timeline = report.get("interaction_timeline") or []
    if timeline:
        _section(story, "Interaction Timeline")
        for item in timeline:
            date_str = item.get("date") or ""
            event    = item.get("event") or ""
            source   = item.get("source") or ""
            prefix = f"<b>{date_str}</b>  " if date_str else ""
            suffix = f"  <i>({source})</i>" if source else ""
            story.append(Paragraph(f"• &nbsp;{prefix}{event}{suffix}", STYLES["bullet"]))
        _hr(story)

    # ── Key Quotes ────────────────────────────────────────────────────────────
    quotes = report.get("key_quotes") or []
    if quotes:
        _section(story, "Key Quotes")
        for q in quotes:
            if q.get("quote"):
                speaker = f"— {q['speaker']}" if q.get("speaker") else ""
                story.append(Paragraph(
                    f'"{q["quote"]}"',
                    STYLES["quote"]
                ))
                if speaker or q.get("significance"):
                    story.append(Paragraph(
                        f"{speaker}  {q.get('significance', '')}".strip(),
                        _style("qmeta", fontSize=9, textColor=C_MUTED, leftIndent=18, spaceAfter=8)
                    ))
        _hr(story)

    # ── Recommended Actions ───────────────────────────────────────────────────
    actions = report.get("recommended_actions") or []
    if actions:
        _section(story, "Recommended Actions")
        for a in actions:
            pri = (a.get("priority") or "medium").upper()
            owner = f" — {a['owner']}" if a.get("owner") else ""
            story.append(Paragraph(
                f"[{pri}]  {a.get('action', '')}{owner}",
                STYLES[_severity_style(a.get("priority", "medium"))]
            ))
            story.append(Spacer(1, 4))
        _hr(story)

    # ── Next Best Action (highlighted box) ────────────────────────────────────
    nba = report.get("next_best_action")
    if nba:
        _section(story, "Next Best Action")
        nba_data = [[Paragraph(f"→  {nba}", STYLES["action"])]]
        nba_t = Table(nba_data, colWidths=[6.5*inch])
        nba_t.setStyle(TableStyle([
            ("BACKGROUND",  (0, 0), (-1, -1), HexColor("#eef2ff")),
            ("BOX",         (0, 0), (-1, -1), 1.0, C_INDIGO),
            ("TOPPADDING",  (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING",(0,0), (-1, -1), 12),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ]))
        story.append(nba_t)

    # ── Footer line ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=1, color=C_INDIGO,
                             spaceBefore=0, spaceAfter=8))
    story.append(Paragraph(
        f"Generated by Synvelo &nbsp;·&nbsp; {gen_date} &nbsp;·&nbsp; Confidential",
        _style("footer", fontSize=8, textColor=C_MUTED, leading=12)
    ))

    doc.build(story)

    # Count pages by re-opening doc (quick estimate from file size alternative)
    try:
        import fitz
        d = fitz.open(output_path)
        pages = len(d)
        d.close()
        return pages
    except Exception:
        return 1


# ── Main entry point ──────────────────────────────────────────────────────────

async def generate_report(deal_id: str, db: AsyncSession) -> dict:
    """
    Full pipeline:
    1. Fetch deal metadata
    2. Pull all document content for this deal
    3. GPT-4o synthesis
    4. ReportLab PDF render
    5. Save metadata to deal_reports table
    6. Return {report_id, filename, path, page_count}
    """
    # 1. Deal metadata
    deal_res = await db.execute(
        text("SELECT id, name, company, stage, value, win_probability FROM deals WHERE id = CAST(:id AS uuid)"),
        {"id": deal_id}
    )
    deal = deal_res.fetchone()
    if not deal:
        return {"error": "Deal not found"}

    # 2. Pull document content (full text from documents table + chunks)
    docs_res = await db.execute(
        text("""
            SELECT filename, source_type, content, sentiment_label
            FROM documents
            WHERE deal_id = CAST(:id AS uuid) AND status = 'done' AND content IS NOT NULL
            ORDER BY created_at ASC
        """),
        {"id": deal_id}
    )
    docs = docs_res.fetchall()

    if not docs:
        # Fall back to chunks if no full content
        chunks_res = await db.execute(
            text("""
                SELECT filename, source_type, text
                FROM chunks
                WHERE deal_id = CAST(:id AS uuid)
                ORDER BY filename, chunk_index ASC
                LIMIT 200
            """),
            {"id": deal_id}
        )
        chunk_rows = chunks_res.fetchall()
        if not chunk_rows:
            return {"error": "No document content found. Upload and ingest documents first."}
        raw_parts = []
        current_file = None
        for c in chunk_rows:
            if c.filename != current_file:
                raw_parts.append(f"\n\n--- SOURCE: {c.filename} ({c.source_type}) ---\n")
                current_file = c.filename
            raw_parts.append(c.text)
        raw_text = "\n".join(raw_parts)
    else:
        raw_parts = []
        for d in docs:
            raw_parts.append(f"\n\n--- SOURCE: {d.filename} ({d.source_type}) ---\n")
            raw_parts.append(d.content or "")
        raw_text = "\n".join(raw_parts)

    # Add deal metadata as context
    meta_prefix = (
        f"DEAL: {deal.name}\n"
        f"COMPANY: {deal.company or 'Unknown'}\n"
        f"STAGE: {deal.stage or 'Unknown'}\n"
        f"VALUE: ${float(deal.value or 0):,.0f}\n"
        f"WIN PROBABILITY: {round((deal.win_probability or 0) * 100)}%\n\n"
        f"DOCUMENTS BELOW:\n"
    )
    raw_text = meta_prefix + raw_text

    # 3. GPT-4o synthesis
    report_json = await synthesise_with_gpt(raw_text, deal.name)
    if "error" in report_json:
        return {"error": f"GPT-4o synthesis failed: {report_json['error']}"}

    # Fill guaranteed fields
    report_json.setdefault("deal_title", deal.name)
    report_json.setdefault("company", deal.company)
    report_json.setdefault("generated_date", datetime.now().strftime("%B %d, %Y"))

    # 4. Render PDF
    report_id = str(uuid.uuid4())
    filename   = f"report_{deal_id[:8]}_{report_id[:8]}.pdf"
    output_path = str(REPORTS_DIR / filename)
    page_count  = build_pdf(report_json, output_path, deal.name)

    # 5. Store metadata
    await db.execute(text("""
        INSERT INTO deal_reports
            (id, deal_id, filename, page_count, report_json, created_at)
        VALUES (CAST(:id AS uuid), CAST(:did AS uuid), :fname, :pages, CAST(:rjson AS jsonb), NOW())
    """), {
        "id":    report_id,
        "did":   deal_id,
        "fname": filename,
        "pages": page_count,
        "rjson": json.dumps(report_json),
    })
    await db.commit()

    return {
        "report_id":  report_id,
        "filename":   filename,
        "path":       output_path,
        "page_count": page_count,
        "deal_name":  deal.name,
        "company":    deal.company,
    }