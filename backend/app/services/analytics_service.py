import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def get_pipeline_summary(db: AsyncSession, org_id: str) -> dict:
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
        WHERE org_id = CAST(:org_id AS uuid)
    """), {"org_id": org_id})
    t = totals.fetchone()

    # ── By stage ──────────────────────────────────────────────────────
    by_stage = await db.execute(text("""
        SELECT stage,
               COUNT(*)                               AS deal_count,
               COALESCE(SUM(value), 0)               AS stage_value,
               COALESCE(AVG(win_probability)*100, 0) AS avg_prob
        FROM deals
        WHERE org_id = CAST(:org_id AS uuid)
        GROUP BY stage ORDER BY deal_count DESC
    """), {"org_id": org_id})
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
                WHEN win_probability < 0.25   THEN '0-25%'
                WHEN win_probability < 0.50   THEN '25-50%'
                WHEN win_probability < 0.75   THEN '50-75%'
                ELSE '75-100%'
            END AS bucket,
            COUNT(*) AS cnt
        FROM deals
        WHERE org_id = CAST(:org_id AS uuid)
        GROUP BY bucket ORDER BY bucket
    """), {"org_id": org_id})
    distribution = [{"bucket": r.bucket, "count": r.cnt} for r in buckets.fetchall()]

    # ── At-risk deals ─────────────────────────────────────────────────
    at_risk_rows = await db.execute(text("""
        SELECT id, name, company, stage, value, win_probability, risk_flags
        FROM deals
        WHERE org_id = CAST(:org_id AS uuid)
          AND (win_probability < 0.4 OR win_probability IS NULL)
        ORDER BY value DESC NULLS LAST LIMIT 8
    """), {"org_id": org_id})
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
        WHERE d.org_id = CAST(:org_id AS uuid)
        ORDER BY sh.scored_at DESC LIMIT 8
    """), {"org_id": org_id})
    activity = [{
        "date":             str(r.scored_at),
        "deal_name":        r.deal_name,
        "win_probability":  r.win_probability,
        "trigger_type":     r.trigger_type,
        "trigger_document": r.trigger_document,
    } for r in recent.fetchall()]

    # ── Signal overview (per-deal signal counts) ───────────────────────
    sig_rows = await db.execute(text("""
        SELECT id, name, company, stage, value, win_probability, signals
        FROM deals
        WHERE org_id = CAST(:org_id AS uuid) AND signals IS NOT NULL
        ORDER BY value DESC NULLS LAST
        LIMIT 20
    """), {"org_id": org_id})
    signal_overview = []
    for r in sig_rows.fetchall():
        sigs = r.signals or []
        if isinstance(sigs, str):
            try:
                sigs = json.loads(sigs)
            except Exception:
                sigs = []
        if not sigs:
            continue
        red    = sum(1 for s in sigs if isinstance(s, dict) and s.get("color") == "red")
        yellow = sum(1 for s in sigs if isinstance(s, dict) and s.get("color") == "yellow")
        green  = sum(1 for s in sigs if isinstance(s, dict) and s.get("color") == "green")
        signal_overview.append({
            "id":              str(r.id),
            "name":            r.name,
            "company":         r.company or "",
            "stage":           r.stage or "",
            "value":           float(r.value or 0),
            "win_probability": r.win_probability,
            "red":             red,
            "yellow":          yellow,
            "green":           green,
            "total":           red + yellow + green,
        })
    # Sort by red signals first, then yellow
    signal_overview.sort(key=lambda x: (-x["red"], -x["yellow"]))

    # ── By owner ────────────────────────────────────────────────────────
    owner_rows = await db.execute(text("""
        SELECT
            COALESCE(NULLIF(owner, ''), 'Unassigned') AS owner_name,
            COUNT(*)                                   AS deal_count,
            COALESCE(SUM(value), 0)                   AS total_value,
            COALESCE(AVG(win_probability) * 100, 0)   AS avg_prob,
            COUNT(CASE WHEN stage = 'Closed Won'  THEN 1 END) AS won,
            COUNT(CASE WHEN stage = 'Closed Lost' THEN 1 END) AS lost
        FROM deals
        WHERE org_id = CAST(:org_id AS uuid)
        GROUP BY owner_name
        ORDER BY total_value DESC
    """), {"org_id": org_id})
    by_owner = []
    for r in owner_rows.fetchall():
        closed = r.won + r.lost
        by_owner.append({
            "owner":      r.owner_name,
            "deal_count": r.deal_count,
            "value":      float(r.total_value),
            "avg_prob":   round(float(r.avg_prob), 1),
            "won":        r.won,
            "lost":       r.lost,
            "win_rate":   round(r.won / closed * 100, 1) if closed > 0 else None,
        })

    # ── Stage funnel (ordered by pipeline progression) ──────────────────
    STAGE_ORDER = [
        "Discovery", "Qualification", "Demo", "Proposal",
        "Negotiation", "Closed Won", "Closed Lost",
    ]
    stage_map = {s["stage"]: s for s in stages}
    stage_funnel = []
    prev_count = None
    for stage_name in STAGE_ORDER:
        entry = stage_map.get(stage_name)
        count = entry["count"] if entry else 0
        conversion = round(count / prev_count * 100, 1) if prev_count and prev_count > 0 else None
        stage_funnel.append({
            "stage":           stage_name,
            "count":           count,
            "value":           float(entry["value"]) if entry else 0.0,
            "conversion_rate": conversion,
        })
        if stage_name not in ("Closed Won", "Closed Lost"):
            prev_count = count if count > 0 else prev_count

    return {
        "total_deals":                  t.total_deals,
        "total_pipeline_value":         float(t.total_value),
        "weighted_pipeline_value":      float(t.weighted_value),
        "avg_win_probability":          round(float(t.avg_win_prob), 1),
        "avg_days_to_close":            round(float(t.avg_days), 0),
        "at_risk_count":                t.at_risk_count,
        "unscored_count":               t.unscored_count,
        "by_stage":                     stages,
        "stage_funnel":                 stage_funnel,
        "win_probability_distribution": distribution,
        "at_risk_deals":                at_risk_deals,
        "recent_activity":              activity,
        "signal_overview":              signal_overview,
        "by_owner":                     by_owner,
    }