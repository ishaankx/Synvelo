"""
journey_report_service.py — Deal Journey Report (Type 2)

Synthesises the full chronological history of a deal into a narrative report
using GPT-4o, then renders it as a professional PDF using ReportLab.
"""

import json
import uuid
from datetime import datetime
from pathlib import Path

from openai import AsyncOpenAI
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.config import settings
from app.services.journey_aggregator import aggregate_deal_journey

client = AsyncOpenAI(api_key=settings.openai_api_key)

REPORTS_DIR = Path(settings.UPLOAD_DIR) / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ── Colours (matching Type 1 palette) ────────────────────────────────────────
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
C_BLUE   = HexColor("#2563eb")


def _style(name, **kw):
    defaults = dict(fontName="Helvetica", fontSize=10, textColor=C_TEXT,
                    leading=15, spaceAfter=4)
    defaults.update(kw)
    return ParagraphStyle(name, **defaults)


STYLES = {
    "h1":      _style("jh1",  fontName="Helvetica-Bold", fontSize=20, textColor=C_DARK, spaceAfter=4, leading=26),
    "h2":      _style("jh2",  fontName="Helvetica-Bold", fontSize=13, textColor=C_INDIGO, spaceBefore=16, spaceAfter=6, leading=17),
    "h3":      _style("jh3",  fontName="Helvetica-Bold", fontSize=10, textColor=C_DARK, spaceBefore=8, spaceAfter=3),
    "body":    _style("jbody", fontSize=10, leading=16, spaceAfter=5),
    "small":   _style("jsmall", fontSize=9, textColor=C_MUTED, leading=13),
    "bullet":  _style("jbullet", fontSize=10, leading=16, leftIndent=14, spaceAfter=4),
    "label":   _style("jlabel", fontName="Helvetica-Bold", fontSize=8, textColor=C_MUTED, leading=11),
    "pos":     _style("jpos",  fontName="Helvetica-Bold", fontSize=10, textColor=C_GREEN),
    "neg":     _style("jneg",  fontName="Helvetica-Bold", fontSize=10, textColor=C_RED),
    "action":  _style("jaction", fontName="Helvetica-Bold", fontSize=11, textColor=C_INDIGO, leading=16),
    "timeline": _style("jtimeline", fontSize=9, leading=14, leftIndent=14, spaceAfter=3),
}


# ── GPT-4o Journey Prompt ────────────────────────────────────────────────────

JOURNEY_PROMPT = """
You are an expert B2B sales analyst synthesizing a Deal Journey Report.
You have access to the COMPLETE historical record of this deal — every stage
transition, field edit, document upload, AI feature usage, and win probability
change. Your job is to produce a comprehensive temporal narrative.

CRITICAL RULES:
- Do not fabricate data. Only reference what is explicitly provided.
- Be direct and frank — identify what went well and what went wrong.
- Every recommendation must reference a specific event from this deal's history.
- Use specific dates, names, values, and durations from the data.
- Do not use generic sales advice.

Respond with ONLY valid JSON. No preamble, no markdown backticks.

JSON schema:
{
  "executive_journey_summary": "2-3 paragraphs narrating the deal's full progression from creation to current state",
  "stage_breakdown": [
    {
      "stage": "string",
      "time_spent_days": "number or null",
      "criteria_total": "number",
      "criteria_completed": "number",
      "criteria_skipped": ["string"],
      "key_events": ["string"],
      "win_prob_at_entry": "number or null",
      "win_prob_at_exit": "number or null",
      "movement_direction": "forward|backward|skip",
      "analysis": "string — what happened in this stage and why it matters"
    }
  ],
  "critical_moments": [
    {
      "date": "string",
      "event": "string",
      "category": "stage_change|value_change|document|owner_change|ai_usage|regression|milestone",
      "significance": "high|medium|low",
      "analysis": "string"
    }
  ],
  "win_probability_analysis": "string — narrative explaining why win prob moved the way it did over the deal's lifetime",
  "document_evidence_trail": [
    {
      "filename": "string",
      "uploaded_at": "string",
      "stage_at_upload": "string or null",
      "signal": "string — what this document signals about deal progression"
    }
  ],
  "field_change_analysis": "string — which edits were made, whether they indicate deal health or concern",
  "ai_tool_utilization": "string — how effectively AI features were used and when",
  "what_went_well": ["string — specific, evidence-backed positive observation"],
  "what_went_wrong": ["string — specific, evidence-backed critical observation"],
  "recommendations_for_future": ["string — concrete actionable process improvement derived from this deal"],
  "next_best_actions": [
    {"action": "string", "priority": "high|medium|low", "rationale": "string"}
  ],
  "deal_health_scores": [
    {"date": "string", "score": "number 0-100", "components": "string — brief breakdown"}
  ]
}
"""


async def synthesise_journey(payload: dict, deal_name: str, company: str) -> dict:
    """Send the aggregated journey data to GPT-4o for narrative synthesis."""
    context = json.dumps(payload, default=str, indent=2)
    # Truncate to fit context window
    if len(context) > 80000:
        context = context[:80000] + "\n... [truncated]"

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": JOURNEY_PROMPT},
                {"role": "user", "content": (
                    f"DEAL: {deal_name}\nCOMPANY: {company or 'Unknown'}\n\n"
                    f"--- COMPLETE DEAL HISTORY ---\n\n{context}"
                )},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=6000,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        return {"error": str(e)}


# ── ReportLab PDF ────────────────────────────────────────────────────────────

def _hr(story, color=C_BORDER, thickness=0.5, space_before=4, space_after=12):
    story.append(Spacer(1, space_before))
    story.append(HRFlowable(width="100%", thickness=thickness, color=color,
                             spaceBefore=0, spaceAfter=space_after))


def _section(story, title):
    story.append(Paragraph(title, STYLES["h2"]))


def _bullets(story, items, style_key="bullet"):
    for item in (items or []):
        if item:
            story.append(Paragraph(f"&bull; &nbsp;{item}", STYLES[style_key]))


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
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS",(0, 0), (-1, -1), [C_LIGHT, white]),
        ("BOX",           (0, 0), (-1, -1), 0.4, C_BORDER),
        ("INNERGRID",     (0, 0), (-1, -1), 0.2, C_BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))


def build_journey_pdf(report: dict, output_path: str, deal_name: str, company: str) -> int:
    """Render the journey report JSON into a professional PDF."""
    doc = SimpleDocTemplate(
        output_path, pagesize=letter,
        rightMargin=0.75*inch, leftMargin=0.75*inch,
        topMargin=0.75*inch, bottomMargin=0.75*inch,
    )
    story = []
    gen_date = datetime.now().strftime("%B %d, %Y")

    # ── Cover ────────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=4, color=C_INDIGO,
                             spaceBefore=0, spaceAfter=18))
    story.append(Paragraph("DEAL JOURNEY REPORT", _style(
        "jeyebrow", fontName="Helvetica-Bold", fontSize=9,
        textColor=C_INDIGO, leading=12, spaceAfter=6,
    )))
    story.append(Paragraph(f"{deal_name} — Deal Journey", STYLES["h1"]))
    if company:
        story.append(Paragraph(company, _style("jcomp", fontSize=12,
                                                textColor=C_MUTED, spaceAfter=4)))
    story.append(Paragraph(
        f"Generated {gen_date} &nbsp;&middot;&nbsp; Confidential — Internal Use Only",
        STYLES["small"]))
    _hr(story, color=C_INDIGO, thickness=1, space_before=14, space_after=18)

    # ── Executive Journey Summary ────────────────────────────────────────────
    _section(story, "Executive Journey Summary")
    summary = report.get("executive_journey_summary", "")
    if summary:
        for para in summary.split("\n\n"):
            if para.strip():
                story.append(Paragraph(para.strip(), STYLES["body"]))
    _hr(story)

    # ── Stage-by-Stage Breakdown ─────────────────────────────────────────────
    stages = report.get("stage_breakdown") or []
    if stages:
        _section(story, "Stage-by-Stage Breakdown")
        for s in stages:
            direction_label = {
                "forward": "&#9654;", "backward": "&#9664; REGRESSION",
                "skip": "&#9654;&#9654; SKIP"
            }.get(s.get("movement_direction", "forward"), "&#9654;")

            days_str = f"{s.get('time_spent_days', '?')} days" if s.get("time_spent_days") else "current"
            story.append(Paragraph(
                f"<b>{s.get('stage', '?')}</b> &nbsp;({days_str}) &nbsp;{direction_label}",
                STYLES["h3"]
            ))
            criteria_total = s.get("criteria_total", 0) or 0
            criteria_done = s.get("criteria_completed", 0) or 0
            if criteria_total > 0:
                pct = round(criteria_done / criteria_total * 100)
                story.append(Paragraph(
                    f"Exit criteria: {criteria_done}/{criteria_total} completed ({pct}%)",
                    STYLES["small"]
                ))

            skipped = s.get("criteria_skipped") or []
            if skipped:
                story.append(Paragraph(
                    f"<font color='#dc2626'>Skipped criteria: {', '.join(skipped)}</font>",
                    STYLES["small"]
                ))

            wp_entry = s.get("win_prob_at_entry")
            wp_exit = s.get("win_prob_at_exit")
            if wp_entry is not None or wp_exit is not None:
                entry_str = f"{round(wp_entry * 100)}%" if wp_entry is not None else "—"
                exit_str = f"{round(wp_exit * 100)}%" if wp_exit is not None else "—"
                story.append(Paragraph(
                    f"Win probability: {entry_str} → {exit_str}",
                    STYLES["small"]
                ))

            if s.get("analysis"):
                story.append(Paragraph(s["analysis"], STYLES["body"]))

            events = s.get("key_events") or []
            for ev in events:
                story.append(Paragraph(f"&bull; &nbsp;{ev}", STYLES["timeline"]))
            story.append(Spacer(1, 8))
        _hr(story)

    # ── Critical Moments Timeline ────────────────────────────────────────────
    moments = report.get("critical_moments") or []
    if moments:
        _section(story, "Critical Moments Timeline")
        for m in moments:
            sig = (m.get("significance") or "medium").upper()
            sig_color = {"HIGH": "#dc2626", "MEDIUM": "#d97706", "LOW": "#16a34a"}.get(sig, "#64748b")
            story.append(Paragraph(
                f"<font color='{sig_color}'><b>[{sig}]</b></font> &nbsp;"
                f"<b>{m.get('date', '')}</b> — {m.get('event', '')}",
                STYLES["body"]
            ))
            if m.get("analysis"):
                story.append(Paragraph(m["analysis"], STYLES["small"]))
            story.append(Spacer(1, 4))
        _hr(story)

    # ── Win Probability Analysis ─────────────────────────────────────────────
    if report.get("win_probability_analysis"):
        _section(story, "Win Probability Curve Analysis")
        story.append(Paragraph(report["win_probability_analysis"], STYLES["body"]))
        _hr(story)

    # ── Document & Evidence Trail ────────────────────────────────────────────
    doc_trail = report.get("document_evidence_trail") or []
    if doc_trail:
        _section(story, "Document &amp; Evidence Trail")
        for d in doc_trail:
            story.append(Paragraph(
                f"<b>{d.get('filename', '?')}</b> &nbsp;uploaded {d.get('uploaded_at', '?')}"
                f" &nbsp;(stage: {d.get('stage_at_upload', '?')})",
                STYLES["body"]
            ))
            if d.get("signal"):
                story.append(Paragraph(d["signal"], STYLES["small"]))
            story.append(Spacer(1, 3))
        _hr(story)

    # ── Field Change Analysis ────────────────────────────────────────────────
    if report.get("field_change_analysis"):
        _section(story, "Field Change Analysis")
        story.append(Paragraph(report["field_change_analysis"], STYLES["body"]))
        _hr(story)

    # ── AI Tool Utilization ──────────────────────────────────────────────────
    if report.get("ai_tool_utilization"):
        _section(story, "AI Tool Utilization Assessment")
        story.append(Paragraph(report["ai_tool_utilization"], STYLES["body"]))
        _hr(story)

    # ── What Went Well ───────────────────────────────────────────────────────
    well = report.get("what_went_well") or []
    if well:
        _section(story, "What Went Well")
        for item in well:
            story.append(Paragraph(f"&bull; &nbsp;{item}", STYLES["pos"]))
            story.append(Spacer(1, 3))
        _hr(story)

    # ── What Went Wrong ──────────────────────────────────────────────────────
    wrong = report.get("what_went_wrong") or []
    if wrong:
        _section(story, "What Went Wrong or Was Missed")
        for item in wrong:
            story.append(Paragraph(f"&bull; &nbsp;{item}", STYLES["neg"]))
            story.append(Spacer(1, 3))
        _hr(story)

    # ── Recommendations ──────────────────────────────────────────────────────
    recs = report.get("recommendations_for_future") or []
    if recs:
        _section(story, "Recommendations for Future Deals")
        for i, rec in enumerate(recs, 1):
            story.append(Paragraph(f"<b>{i}.</b> &nbsp;{rec}", STYLES["body"]))
        _hr(story)

    # ── Next Best Actions ────────────────────────────────────────────────────
    actions = report.get("next_best_actions") or []
    if actions:
        _section(story, "Next Best Actions")
        for a in actions:
            pri = (a.get("priority") or "medium").upper()
            pri_color = {"HIGH": "#dc2626", "MEDIUM": "#d97706", "LOW": "#16a34a"}.get(pri, "#64748b")
            story.append(Paragraph(
                f"<font color='{pri_color}'><b>[{pri}]</b></font> &nbsp;{a.get('action', '')}",
                STYLES["action"]
            ))
            if a.get("rationale"):
                story.append(Paragraph(a["rationale"], STYLES["small"]))
            story.append(Spacer(1, 4))

    # ── Footer ───────────────────────────────────────────────────────────────
    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=1, color=C_INDIGO,
                             spaceBefore=0, spaceAfter=8))
    story.append(Paragraph(
        f"Generated by Synvelo &nbsp;&middot;&nbsp; {gen_date} &nbsp;&middot;&nbsp; Confidential",
        _style("jfooter", fontSize=8, textColor=C_MUTED, leading=12)
    ))

    doc.build(story)

    try:
        import fitz
        d = fitz.open(output_path)
        pages = len(d)
        d.close()
        return pages
    except Exception:
        return 1


# ── Main entry point ─────────────────────────────────────────────────────────

async def generate_journey_report(deal_id: str, db: AsyncSession, org_id: str) -> dict:
    """
    Full pipeline:
    1. Aggregate all deal journey data
    2. GPT-4o narrative synthesis
    3. ReportLab PDF render
    4. Save to deal_reports with report_type='journey'
    """
    # 1. Aggregate
    payload = await aggregate_deal_journey(deal_id, db, org_id)
    if "error" in payload:
        return payload

    deal_name = payload["deal"]["name"]
    company = payload["deal"]["company"] or ""

    # 2. Synthesise
    report_json = await synthesise_journey(payload, deal_name, company)
    if "error" in report_json:
        return {"error": f"GPT-4o synthesis failed: {report_json['error']}"}

    # Store the raw aggregated data alongside the synthesis for frontend rendering
    report_json["_aggregated_data"] = {
        "win_probability_timeline": payload.get("win_probability_timeline", []),
        "stage_history": payload.get("stage_history", []),
        "stage_benchmarks": payload.get("stage_benchmarks", {}),
        "exit_criteria_by_stage": payload.get("exit_criteria_by_stage", {}),
    }

    # 3. Render PDF
    report_id = str(uuid.uuid4())
    filename = f"journey_{deal_id[:8]}_{report_id[:8]}.pdf"
    output_path = str(REPORTS_DIR / filename)
    page_count = build_journey_pdf(report_json, output_path, deal_name, company)

    # 4. Store metadata
    await db.execute(text("""
        INSERT INTO deal_reports
            (id, deal_id, org_id, filename, page_count, report_type, report_json, created_at)
        VALUES (CAST(:id AS uuid), CAST(:did AS uuid), CAST(:org_id AS uuid),
                :fname, :pages, 'journey', CAST(:rjson AS jsonb), NOW())
    """), {
        "id":     report_id,
        "did":    deal_id,
        "org_id": org_id,
        "fname":  filename,
        "pages":  page_count,
        "rjson":  json.dumps(report_json, default=str),
    })
    await db.commit()

    return {
        "report_id":  report_id,
        "filename":   filename,
        "path":       output_path,
        "page_count": page_count,
        "deal_name":  deal_name,
        "company":    company,
        "report_type": "journey",
    }
