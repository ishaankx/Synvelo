import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def get_pipeline_summary(db: AsyncSession) -> dict:
    # ── KPI totals ────────────────────────────────────────────────────
    totals = await db.execute(text("""
        SELECT
            COUNT(*)                                                AS total_deals,
            COALESCE(SUM(value), 0)                                AS total_value,
            COALESCE(SUM(value * COALESCE(win_probability,0)), 0)  AS weighted_value,
            COALESCE(AVG(win_probability)*100, 0)                  AS avg_win_prob,
            COALESCE(AVG(time_to_close_days), 0)                   AS avg_days,
            COUNT(CASE WHEN win_probability < 0.4 THEN 1 END)      AS at_risk_count,
            COUNT(CASE WHEN win_probability IS NULL THEN 1 END)    AS unscored_count
        FROM deals
    """))
    t = totals.fetchone()

    # ── By stage ──────────────────────────────────────────────────────
    by_stage = await db.execute(text("""
        SELECT stage,
               COUNT(*)                               AS deal_count,
               COALESCE(SUM(value), 0)               AS stage_value,
               COALESCE(AVG(win_probability)*100, 0) AS avg_prob
        FROM deals
        GROUP BY stage ORDER BY deal_count DESC
    """))
    stages = [
        {
            "stage":    r.stage or "Unknown",
            "count":    r.deal_count,
            "value":    float(r.stage_value),
            "avg_prob": round(float(r.avg_prob), 1),
        }
        for r in by_stage.fetchall()
    ]

    # ── Win prob distribution ─────────────────────────────────────────
    buckets = await db.execute(text("""
        SELECT
            CASE
                WHEN win_probability IS NULL  THEN 'Unscored'
                WHEN win_probability < 0.25   THEN '0–25%'
                WHEN win_probability < 0.50   THEN '25–50%'
                WHEN win_probability < 0.75   THEN '50–75%'
                ELSE '75–100%'
            END AS bucket,
            COUNT(*) AS cnt
        FROM deals GROUP BY bucket ORDER BY bucket
    """))
    distribution = [{"bucket": r.bucket, "count": r.cnt} for r in buckets.fetchall()]

    # ── At-risk deals ─────────────────────────────────────────────────
    at_risk_rows = await db.execute(text("""
        SELECT id, name, company, stage, value, win_probability, risk_flags
        FROM deals
        WHERE win_probability < 0.4 OR win_probability IS NULL
        ORDER BY value DESC NULLS LAST LIMIT 8
    """))
    at_risk_deals = []
    for r in at_risk_rows.fetchall():
        flags = r.risk_flags or []
        if isinstance(flags, str):
            try:
                flags = json.loads(flags)
            except Exception:
                flags = []
        at_risk_deals.append({
            "id":              str(r.id),
            "name":            r.name,
            "company":         r.company or "",
            "stage":           r.stage or "",
            "value":           float(r.value or 0),
            "win_probability": r.win_probability,
            "top_risk":        flags[0] if flags else "Not yet scored",
        })

    # ── Recent activity ───────────────────────────────────────────────
    recent = await db.execute(text("""
        SELECT sh.scored_at, d.name AS deal_name,
               sh.win_probability, sh.trigger_type, sh.trigger_document
        FROM score_history sh
        JOIN deals d ON sh.deal_id = d.id
        ORDER BY sh.scored_at DESC LIMIT 8
    """))
    activity = [{
        "date":             str(r.scored_at),
        "deal_name":        r.deal_name,
        "win_probability":  r.win_probability,
        "trigger_type":     r.trigger_type,
        "trigger_document": r.trigger_document,
    } for r in recent.fetchall()]

    return {
        "total_deals":             t.total_deals,
        "total_pipeline_value":    float(t.total_value),
        "weighted_pipeline_value": float(t.weighted_value),
        "avg_win_probability":     round(float(t.avg_win_prob), 1),
        "avg_days_to_close":       round(float(t.avg_days), 0),
        "at_risk_count":           t.at_risk_count,
        "unscored_count":          t.unscored_count,
        "by_stage":                stages,
        "win_probability_distribution": distribution,
        "at_risk_deals":           at_risk_deals,
        "recent_activity":         activity,
    }
