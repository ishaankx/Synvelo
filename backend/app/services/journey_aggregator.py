"""
journey_aggregator.py — Collects every historical signal for a deal.

Aggregates: deal creation context, stage history with criteria analysis,
field edits, document uploads, AI feature usage, win probability timeline,
score history, activity log events, and prior report generations.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def aggregate_deal_journey(deal_id: str, db: AsyncSession, org_id: str) -> dict:
    """
    Collect all historical data for a deal and return a structured payload
    suitable for LLM synthesis.
    """

    # ── 1. Deal metadata ─────────────────────────────────────────────────────
    res = await db.execute(text("""
        SELECT id, name, company, stage, value, currency, owner,
               win_probability, probability_low, probability_high,
               time_to_close_days, score_summary, risk_flags, signals,
               meddic, brief, last_scored_at, created_at, stage_entered_at
        FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    deal = res.fetchone()
    if not deal:
        return {"error": "Deal not found"}

    deal_data = {
        "id": str(deal.id),
        "name": deal.name,
        "company": deal.company,
        "stage": deal.stage,
        "value": float(deal.value or 0),
        "currency": deal.currency or "USD",
        "owner": deal.owner,
        "win_probability": deal.win_probability,
        "time_to_close_days": deal.time_to_close_days,
        "created_at": str(deal.created_at),
        "stage_entered_at": str(deal.stage_entered_at) if deal.stage_entered_at else None,
        "last_scored_at": str(deal.last_scored_at) if deal.last_scored_at else None,
    }

    # ── 2. Stage history ─────────────────────────────────────────────────────
    res = await db.execute(text("""
        SELECT id, from_stage, to_stage, changed_at, changed_by, reason, triggered_by
        FROM deal_stage_history
        WHERE deal_id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY changed_at ASC
    """), {"id": deal_id, "org_id": org_id})
    stage_rows = res.fetchall()
    stage_history = []
    for i, r in enumerate(stage_rows):
        entry = {
            "from_stage": r.from_stage,
            "to_stage": r.to_stage,
            "changed_at": str(r.changed_at) if r.changed_at else None,
            "changed_by": r.changed_by,
            "reason": r.reason,
            "triggered_by": r.triggered_by,
        }
        # Calculate time in stage (diff to next transition)
        if i + 1 < len(stage_rows) and r.changed_at and stage_rows[i + 1].changed_at:
            delta = stage_rows[i + 1].changed_at - r.changed_at
            entry["days_in_stage"] = round(delta.total_seconds() / 86400, 1)
        else:
            entry["days_in_stage"] = None  # current or last stage
        stage_history.append(entry)

    # ── 3. Exit criteria per stage ───────────────────────────────────────────
    res = await db.execute(text("""
        SELECT stage, criterion_text, is_completed, is_custom, completed_at
        FROM deal_exit_criteria
        WHERE deal_id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY stage, created_at ASC
    """), {"id": deal_id, "org_id": org_id})
    criteria_rows = res.fetchall()
    criteria_by_stage: dict[str, list] = {}
    for r in criteria_rows:
        criteria_by_stage.setdefault(r.stage, []).append({
            "criterion": r.criterion_text,
            "completed": r.is_completed,
            "is_custom": r.is_custom,
            "completed_at": str(r.completed_at) if r.completed_at else None,
        })

    # ── 4. Field edit history ────────────────────────────────────────────────
    res = await db.execute(text("""
        SELECT field_name, old_value, new_value, changed_by, changed_at
        FROM deal_field_edits
        WHERE deal_id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY changed_at ASC
    """), {"id": deal_id, "org_id": org_id})
    field_edits = [{
        "field": r.field_name,
        "old_value": r.old_value,
        "new_value": r.new_value,
        "changed_by": r.changed_by,
        "changed_at": str(r.changed_at) if r.changed_at else None,
    } for r in res.fetchall()]

    # Also pull from activity_logs for historical edits before tracking was added
    res = await db.execute(text("""
        SELECT event_type, old_value, new_value, created_at, actor_name
        FROM activity_logs
        WHERE entity_id = :id AND entity_type = 'deal'
          AND org_id = CAST(:org_id AS uuid)
          AND event_type LIKE 'deal_%_changed'
        ORDER BY created_at ASC
    """), {"id": deal_id, "org_id": org_id})
    for r in res.fetchall():
        field_edits.append({
            "field": r.event_type.replace("deal_", "").replace("_changed", ""),
            "old_value": str(r.old_value) if r.old_value else None,
            "new_value": str(r.new_value) if r.new_value else None,
            "changed_by": r.actor_name,
            "changed_at": str(r.created_at) if r.created_at else None,
            "source": "activity_log",
        })

    # Deduplicate by changed_at
    seen = set()
    unique_edits = []
    for e in sorted(field_edits, key=lambda x: x.get("changed_at") or ""):
        key = (e["field"], e.get("changed_at", "")[:19])
        if key not in seen:
            seen.add(key)
            unique_edits.append(e)
    field_edits = unique_edits

    # ── 5. Document upload timeline ──────────────────────────────────────────
    res = await db.execute(text("""
        SELECT id, filename, source_type, sentiment_score, sentiment_label, created_at
        FROM documents
        WHERE deal_id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY created_at ASC
    """), {"id": deal_id, "org_id": org_id})
    documents = [{
        "filename": r.filename,
        "source_type": r.source_type,
        "sentiment_score": float(r.sentiment_score) if r.sentiment_score else None,
        "sentiment_label": r.sentiment_label,
        "uploaded_at": str(r.created_at),
    } for r in res.fetchall()]

    # ── 6. AI feature usage log ──────────────────────────────────────────────
    res = await db.execute(text("""
        SELECT feature_name, triggered_by, triggered_at, result_summary
        FROM deal_ai_usage_log
        WHERE deal_id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY triggered_at ASC
    """), {"id": deal_id, "org_id": org_id})
    ai_usage = [{
        "feature": r.feature_name,
        "triggered_by": r.triggered_by,
        "triggered_at": str(r.triggered_at) if r.triggered_at else None,
        "result_summary": r.result_summary,
    } for r in res.fetchall()]

    # Also pull from activity_logs for historical AI usage
    res = await db.execute(text("""
        SELECT event_type, created_at, new_value, metadata_extra
        FROM activity_logs
        WHERE entity_id = :id AND entity_type = 'deal'
          AND org_id = CAST(:org_id AS uuid)
          AND event_type IN ('deal_scored', 'brief_generated', 'followup_generated', 'deal_ask_ai')
        ORDER BY created_at ASC
    """), {"id": deal_id, "org_id": org_id})
    feature_map = {
        "deal_scored": "nexus_score",
        "brief_generated": "brief_gen",
        "followup_generated": "followup_email",
        "deal_ask_ai": "ask_ai",
    }
    for r in res.fetchall():
        ai_usage.append({
            "feature": feature_map.get(r.event_type, r.event_type),
            "triggered_at": str(r.created_at) if r.created_at else None,
            "result_summary": r.new_value if isinstance(r.new_value, dict) else None,
            "source": "activity_log",
        })

    # ── 7. Win probability timeline (score history) ──────────────────────────
    res = await db.execute(text("""
        SELECT scored_at, win_probability, probability_low, probability_high,
               sentiment_avg, trigger_type, trigger_document
        FROM score_history
        WHERE deal_id = CAST(:id AS uuid)
        ORDER BY scored_at ASC
    """), {"id": deal_id})
    win_prob_timeline = [{
        "scored_at": str(r.scored_at),
        "win_probability": r.win_probability,
        "probability_low": r.probability_low,
        "probability_high": r.probability_high,
        "sentiment_avg": float(r.sentiment_avg) if r.sentiment_avg else None,
        "trigger": r.trigger_type,
    } for r in res.fetchall()]

    # ── 8. Call transcriptions ───────────────────────────────────────────────
    res = await db.execute(text("""
        SELECT call_title, platform, duration_seconds, attendees,
               created_at, completed_at, status
        FROM call_transcriptions
        WHERE deal_id = CAST(:id AS uuid)
        ORDER BY created_at ASC
    """), {"id": deal_id})
    calls = [{
        "title": r.call_title,
        "platform": r.platform,
        "duration_seconds": r.duration_seconds,
        "attendees": r.attendees,
        "recorded_at": str(r.created_at),
        "status": r.status,
    } for r in res.fetchall()]

    # ── 9. Report generation log ─────────────────────────────────────────────
    res = await db.execute(text("""
        SELECT id, filename, page_count, created_at,
               COALESCE(report_type, 'intelligence') AS report_type
        FROM deal_reports
        WHERE deal_id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
        ORDER BY created_at ASC
    """), {"id": deal_id, "org_id": org_id})
    prior_reports = [{
        "report_id": str(r.id),
        "type": r.report_type,
        "filename": r.filename,
        "generated_at": str(r.created_at),
    } for r in res.fetchall()]

    # ── 10. Stage benchmark comparison ───────────────────────────────────────
    # Average days per stage for won vs lost deals in same org
    res = await db.execute(text("""
        WITH stage_durations AS (
            SELECT h.to_stage,
                   d.stage AS final_stage,
                   EXTRACT(EPOCH FROM (
                       LEAD(h.changed_at) OVER (PARTITION BY h.deal_id ORDER BY h.changed_at)
                       - h.changed_at
                   )) / 86400.0 AS days_in_stage
            FROM deal_stage_history h
            JOIN deals d ON d.id = h.deal_id
            WHERE h.org_id = CAST(:org_id AS uuid)
              AND h.deal_id != CAST(:id AS uuid)
        )
        SELECT to_stage, final_stage,
               AVG(days_in_stage) AS avg_days,
               COUNT(*) AS sample_size
        FROM stage_durations
        WHERE days_in_stage IS NOT NULL AND days_in_stage > 0
        GROUP BY to_stage, final_stage
        HAVING COUNT(*) >= 1
        ORDER BY to_stage
    """), {"org_id": org_id, "id": deal_id})
    benchmarks: dict[str, dict] = {}
    for r in res.fetchall():
        key = r.to_stage
        outcome = "won" if r.final_stage == "Closed Won" else "lost" if r.final_stage == "Closed Lost" else "active"
        benchmarks.setdefault(key, {})[outcome] = {
            "avg_days": round(float(r.avg_days), 1),
            "sample_size": r.sample_size,
        }

    return {
        "deal": deal_data,
        "stage_history": stage_history,
        "exit_criteria_by_stage": criteria_by_stage,
        "field_edits": field_edits,
        "documents": documents,
        "ai_usage": ai_usage,
        "win_probability_timeline": win_prob_timeline,
        "calls": calls,
        "prior_reports": prior_reports,
        "stage_benchmarks": benchmarks,
    }
