"""
Layer 1 — Feature Extractor

KEY DESIGN: Stage-derived features (time per stage, velocity, regressions)
are extracted from deal_stage_history with EXACT timestamps — not approximated
from score_history. This is why the stage pipeline and NEXUS are co-dependent.
"""
import numpy as np
from uuid import UUID
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.stages import (
    STAGE_CONFIGS, STAGE_ORDER, PROGRESSION_STAGES,
    compute_stage_velocity, encode_stage_health,
)

# ════════════════════════════════════════════════════════════════════════
# COMPLETE FEATURE COLUMN LIST (ML training matrix)
# Any addition here must also exist as a column in nexus_deal_features.
# ════════════════════════════════════════════════════════════════════════
FEATURE_COLUMNS = [
    # Stage-derived (from deal_stage_history — the gold data)
    "time_in_discovery_days",
    "time_in_qualification_days",
    "time_in_demo_days",
    "time_in_proposal_days",
    "time_in_negotiation_days",
    "discovery_to_proposal_days",
    "proposal_to_close_days",
    "days_total_cycle",
    "stage_velocity_score",
    "n_stage_regressions",
    "n_stage_skips",
    "n_total_stage_transitions",
    "stage_health_numeric",
    # Legacy timing (kept for backward compat with existing rows)
    "days_first_call_to_proposal",
    "days_proposal_to_close",
    "days_since_last_activity",
    # Activity
    "num_calls",
    "num_emails",
    "num_docs_uploaded",
    # Stakeholder
    "num_stakeholders_engaged",
    "economic_buyer_engaged",
    "champion_identified",
    "legal_review_triggered",
    "multi_thread_score",
    # MEDDIC
    "meddic_completeness_score",
    "meddic_metrics_filled",
    "meddic_economic_buyer_filled",
    "meddic_decision_criteria_filled",
    "meddic_champion_filled",
    # Scoring trajectory
    "win_prob_at_discovery",
    "win_prob_at_proposal",
    "win_prob_at_negotiation",
    "win_prob_final",
    "sentiment_trend_slope",
    "sentiment_volatility",
    "max_sentiment_drop",
    # Competitor / pricing
    "competitor_mentioned",
    "budget_concern_raised",
    "price_pushback_raised",
    "discount_offered_pct",
    "contract_term_years",
    # ERP
    "erp_margin_available_pct",
    "erp_inventory_risk",
    "erp_lead_time_days",
    # Rep / deal size
    "rep_win_rate_trailing_90d",
    "deal_size_vs_org_avg_ratio",
]


async def extract_features_for_deal(
    db: AsyncSession,
    deal_id: str,
    org_id: str,
) -> Optional[Dict[str, Any]]:
    """Extract all features for one deal from existing Synvelo tables."""
    features: Dict[str, Any] = {}

    # ─── Deal base data ────��──────────────────────────────────────────
    result = await db.execute(
        text("SELECT * FROM deals WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org AS uuid)"),
        {"id": deal_id, "org": org_id},
    )
    deal = result.mappings().fetchone()
    if not deal:
        return None

    created_at = deal["created_at"] or datetime.now(timezone.utc)
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    now = datetime.now(timezone.utc)

    deal_value = float(deal.get("value") or 0)
    features["final_deal_value"] = deal_value
    features["final_margin_pct"] = 0.35
    features["deal_stage_at_close"] = deal.get("stage") or "unknown"
    features["industry_vertical"] = "unknown"
    features["rep_id"] = deal.get("owner")

    # ─── STAGE HISTORY (the gold data) ────────��───────────────────────
    sh_result = await db.execute(
        text("""
            SELECT from_stage, to_stage, changed_at
            FROM deal_stage_history
            WHERE deal_id = CAST(:did AS uuid) AND org_id = CAST(:org AS uuid)
            ORDER BY changed_at ASC
        """),
        {"did": deal_id, "org": org_id},
    )
    history = [dict(r) for r in sh_result.mappings().fetchall()]

    # Build per-stage duration map using exact timestamps
    stage_durations: Dict[str, int] = {}
    n_regressions = 0
    n_skips = 0
    final_non_terminal = None

    for i, entry in enumerate(history):
        from_s = entry["from_stage"]
        to_s = entry["to_stage"]
        changed_at = entry["changed_at"]
        if isinstance(changed_at, str):
            changed_at = datetime.fromisoformat(changed_at)

        if from_s and from_s in STAGE_CONFIGS:
            # When did we enter from_s?
            if i == 0:
                entry_time = created_at
            else:
                et = history[i - 1]["changed_at"]
                entry_time = datetime.fromisoformat(et) if isinstance(et, str) else et

            days_in = max(0, (changed_at - entry_time).days)
            stage_durations[from_s] = stage_durations.get(from_s, 0) + days_in

            # Detect regressions and skips
            if from_s in PROGRESSION_STAGES and to_s in PROGRESSION_STAGES:
                from_order = STAGE_ORDER.index(from_s)
                to_order = STAGE_ORDER.index(to_s)
                if to_order < from_order:
                    n_regressions += 1
                elif to_order > from_order + 1:
                    n_skips += 1

        if to_s not in ("Closed Won", "Closed Lost"):
            final_non_terminal = to_s

    features["n_stage_regressions"] = n_regressions
    features["n_stage_skips"] = n_skips
    features["n_total_stage_transitions"] = len(history)
    features["final_stage_before_terminal"] = final_non_terminal
    features["stage_velocity_score"] = compute_stage_velocity(stage_durations)

    # Per-stage time features
    for stage in PROGRESSION_STAGES:
        col = f"time_in_{stage.lower()}_days"
        features[col] = stage_durations.get(stage)

    # Discovery -> Proposal exact days and Proposal -> Close exact days
    disc_exit = None
    prop_entry = None
    close_entry = None

    for entry in history:
        if entry["from_stage"] == "Discovery" and disc_exit is None:
            disc_exit = entry["changed_at"]
        if entry["to_stage"] == "Proposal" and prop_entry is None:
            prop_entry = entry["changed_at"]
        if entry["to_stage"] in ("Closed Won", "Closed Lost") and close_entry is None:
            close_entry = entry["changed_at"]

    if disc_exit and prop_entry:
        d = disc_exit if not isinstance(disc_exit, str) else datetime.fromisoformat(disc_exit)
        p = prop_entry if not isinstance(prop_entry, str) else datetime.fromisoformat(prop_entry)
        features["discovery_to_proposal_days"] = max(0, (p - d).days)
        features["days_first_call_to_proposal"] = features["discovery_to_proposal_days"]
    else:
        # Fallback to approximation from total cycle
        total = max(0, (now - created_at).days)
        features["days_first_call_to_proposal"] = total // 2
        features["discovery_to_proposal_days"] = features["days_first_call_to_proposal"]

    if prop_entry and close_entry:
        p = prop_entry if not isinstance(prop_entry, str) else datetime.fromisoformat(prop_entry)
        c = close_entry if not isinstance(close_entry, str) else datetime.fromisoformat(close_entry)
        features["proposal_to_close_days"] = max(0, (c - p).days)
        features["days_proposal_to_close"] = features["proposal_to_close_days"]
    else:
        total = max(0, (now - created_at).days)
        d2p = features.get("days_first_call_to_proposal", total // 2)
        features["days_proposal_to_close"] = max(0, total - d2p)
        features["proposal_to_close_days"] = features["days_proposal_to_close"]

    # Total cycle
    if close_entry:
        c = close_entry if not isinstance(close_entry, str) else datetime.fromisoformat(close_entry)
        features["days_total_cycle"] = max(0, (c - created_at).days)
    else:
        features["days_total_cycle"] = max(0, (now - created_at).days)

    # ─── Score history (win prob trajectory + stage health) ───────────
    score_result = await db.execute(
        text("""
            SELECT win_probability, probability_low, probability_high,
                   sentiment_avg, scored_at, deal_stage, stage_health
            FROM score_history
            WHERE deal_id = CAST(:did AS uuid)
            ORDER BY scored_at ASC
        """),
        {"did": deal_id},
    )
    scores = [dict(r) for r in score_result.mappings().fetchall()]

    win_probs = [float(r["win_probability"]) for r in scores if r.get("win_probability") is not None]
    sentiments = [float(r["sentiment_avg"]) for r in scores if r.get("sentiment_avg") is not None]

    if win_probs:
        features["win_prob_final"] = win_probs[-1]
    if len(win_probs) >= 2:
        features["win_prob_at_discovery"] = win_probs[0]
        mid = len(win_probs) // 2
        features["win_prob_at_proposal"] = win_probs[mid]
        features["win_prob_at_negotiation"] = win_probs[int(len(win_probs) * 0.75)]

    if len(sentiments) >= 2:
        x = np.arange(len(sentiments))
        features["sentiment_trend_slope"] = float(np.polyfit(x, sentiments, 1)[0])
        features["sentiment_volatility"] = float(np.std(sentiments))
        diffs = np.diff(sentiments)
        neg_diffs = diffs[diffs < 0]
        features["max_sentiment_drop"] = float(abs(neg_diffs.min())) if len(neg_diffs) > 0 else 0.0

    # Stage health from most recent score
    last_stage_health = next(
        (r["stage_health"] for r in reversed(scores) if r.get("stage_health")), None
    )
    features["stage_health_numeric"] = encode_stage_health(last_stage_health)

    # Days since last activity
    if scores:
        last_scored = scores[-1].get("scored_at")
        if last_scored:
            if isinstance(last_scored, str):
                last_scored = datetime.fromisoformat(last_scored)
            close_ts = close_entry or now
            if isinstance(close_ts, str):
                close_ts = datetime.fromisoformat(close_ts)
            features["days_since_last_activity"] = max(0, (close_ts - last_scored).days)
    if "days_since_last_activity" not in features:
        features["days_since_last_activity"] = features.get("days_total_cycle", 0)

    # ─── Document counts ──────────────────────────────────────────────
    doc_result = await db.execute(
        text("SELECT source_type, filename FROM documents WHERE deal_id = CAST(:did AS uuid)"),
        {"did": deal_id},
    )
    docs = doc_result.mappings().fetchall()
    features["num_docs_uploaded"] = len(docs)
    features["num_calls"] = sum(
        1 for d in docs if "transcript" in (d.get("source_type") or "").lower()
        or "call" in (d.get("filename") or "").lower()
    )
    features["num_emails"] = sum(
        1 for d in docs if "email" in (d.get("source_type") or "").lower()
    )

    # ─── MEDDIC fields ────────────────────────────────────────────────
    meddic = deal.get("meddic") or {}
    if isinstance(meddic, dict):
        filled = [bool(meddic.get(k)) for k in [
            "metrics", "economic_buyer", "decision_criteria",
            "decision_process", "identify_pain", "champion"
        ]]
        features["meddic_completeness_score"] = round(sum(filled) / 6.0, 3)
        features["meddic_metrics_filled"] = bool(meddic.get("metrics"))
        features["meddic_economic_buyer_filled"] = bool(meddic.get("economic_buyer"))
        features["meddic_decision_criteria_filled"] = bool(meddic.get("decision_criteria"))
        features["meddic_champion_filled"] = bool(meddic.get("champion"))
        features["champion_identified"] = bool(meddic.get("champion"))
        features["economic_buyer_engaged"] = bool(meddic.get("economic_buyer"))

    # ─── Signals ──────────────────────────────────────────────────────
    signals = deal.get("signals") or []
    if isinstance(signals, list):
        signal_texts = " ".join(
            str(s.get("signal_type", "") if isinstance(s, dict) else s).lower()
            for s in signals
        )
        features["competitor_mentioned"] = "competitor" in signal_texts
        features["budget_concern_raised"] = "budget" in signal_texts
        features["price_pushback_raised"] = "price" in signal_texts or "pricing" in signal_texts
        features["legal_review_triggered"] = "legal" in signal_texts

    # ─── ERP defaults (no real ERP table yet) ─────────────────────────
    features["erp_margin_available_pct"] = 0.35
    features["erp_inventory_risk"] = False
    features["erp_lead_time_days"] = 7
    features["discount_offered_pct"] = 0.0
    features["contract_term_years"] = 1.0

    # ��── Stakeholder count ─────────────────────────────────────────���──
    stakeholder_count = 0
    if isinstance(meddic, dict):
        for k in ["champion", "economic_buyer"]:
            if meddic.get(k):
                stakeholder_count += 1
    features["num_stakeholders_engaged"] = stakeholder_count
    features["multi_thread_score"] = round(min(1.0, stakeholder_count / 5.0), 3)

    # ─── Rep stats ────────────────────────────────────────────────────
    rep_id = features.get("rep_id")
    if rep_id:
        rep_result = await db.execute(
            text("SELECT outcome FROM nexus_deal_features WHERE rep_id = CAST(:rid AS uuid) AND org_id = CAST(:org AS uuid)"),
            {"rid": str(rep_id), "org": org_id},
        )
        rep_deals = rep_result.fetchall()
        if rep_deals:
            wins = sum(1 for d in rep_deals if d[0] == 1)
            features["rep_win_rate_trailing_90d"] = round(wins / len(rep_deals), 4)
        else:
            features["rep_win_rate_trailing_90d"] = 0.5
    else:
        features["rep_win_rate_trailing_90d"] = 0.5

    # Deal size ratio
    org_result = await db.execute(
        text("SELECT final_deal_value FROM nexus_deal_features WHERE org_id = CAST(:org AS uuid)"),
        {"org": org_id},
    )
    org_values = [float(r[0]) for r in org_result.fetchall() if r[0]]
    org_avg = float(np.mean(org_values)) if org_values else deal_value
    features["deal_size_vs_org_avg_ratio"] = round(deal_value / org_avg, 4) if org_avg > 0 else 1.0

    # Fill defaults for any missing features
    for col in FEATURE_COLUMNS:
        if col not in features:
            if col.endswith("_filled") or col in [
                "competitor_mentioned", "budget_concern_raised",
                "price_pushback_raised", "legal_review_triggered",
                "erp_inventory_risk", "economic_buyer_engaged", "champion_identified",
            ]:
                features[col] = False
            else:
                features[col] = 0.0

    return features


async def extract_and_store_features(
    db: AsyncSession,
    deal_id: str,
    org_id: str,
    outcome: int,
) -> Optional[str]:
    """Extract features for a closed deal and upsert into nexus_deal_features."""
    features = await extract_features_for_deal(db, deal_id, org_id)
    if not features:
        return None

    # Build insert columns: FEATURE_COLUMNS + meta columns + new stage columns
    meta_cols = [
        "final_deal_value", "final_margin_pct", "deal_stage_at_close",
        "industry_vertical", "final_stage_before_terminal",
    ]
    all_cols = FEATURE_COLUMNS + meta_cols

    col_values = {}
    for col in all_cols:
        val = features.get(col, 0)
        if isinstance(val, bool):
            val = val
        col_values[col] = val

    col_names = ", ".join(["deal_id", "org_id", "outcome"] + list(col_values.keys()))
    col_params = ", ".join([":deal_id", ":org_id", ":outcome"] + [f":{k}" for k in col_values.keys()])

    params = {
        "deal_id": deal_id,
        "org_id": org_id,
        "outcome": outcome,
        **col_values,
    }

    await db.execute(
        text(f"""
            INSERT INTO nexus_deal_features ({col_names})
            VALUES ({col_params})
            ON CONFLICT (deal_id) DO UPDATE SET
                outcome = EXCLUDED.outcome,
                {', '.join(f'{k} = EXCLUDED.{k}' for k in col_values.keys())},
                extracted_at = NOW()
        """),
        params,
    )
    await db.commit()

    result = await db.execute(
        text("SELECT id FROM nexus_deal_features WHERE deal_id = CAST(:did AS uuid)"),
        {"did": deal_id},
    )
    row = result.fetchone()
    return str(row[0]) if row else None
