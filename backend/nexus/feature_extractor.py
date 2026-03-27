"""
Layer 1 — Feature Extractor
Reads from existing Synvelo tables (deals, score_history, documents)
via SQLAlchemy async sessions and produces a flat feature vector for ML training.
"""
import numpy as np
from uuid import UUID
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

FEATURE_COLUMNS = [
    "days_first_call_to_proposal",
    "days_proposal_to_close",
    "days_total_cycle",
    "days_since_last_activity",
    "num_calls",
    "num_emails",
    "num_docs_uploaded",
    "num_stakeholders_engaged",
    "economic_buyer_engaged",
    "champion_identified",
    "legal_review_triggered",
    "multi_thread_score",
    "meddic_completeness_score",
    "meddic_metrics_filled",
    "meddic_economic_buyer_filled",
    "meddic_decision_criteria_filled",
    "meddic_champion_filled",
    "win_prob_at_discovery",
    "win_prob_at_proposal",
    "win_prob_at_negotiation",
    "win_prob_final",
    "sentiment_trend_slope",
    "sentiment_volatility",
    "max_sentiment_drop",
    "competitor_mentioned",
    "budget_concern_raised",
    "price_pushback_raised",
    "discount_offered_pct",
    "contract_term_years",
    "erp_margin_available_pct",
    "erp_inventory_risk",
    "erp_lead_time_days",
    "rep_win_rate_trailing_90d",
    "rep_avg_deal_size",
    "deal_size_vs_org_avg_ratio",
]


async def extract_features_for_deal(
    db: AsyncSession,
    deal_id: str,
    org_id: str,
) -> Optional[Dict[str, Any]]:
    """Extract all features for one deal from existing Synvelo tables."""
    features: Dict[str, Any] = {}

    # --- Read deal ---
    result = await db.execute(
        text("SELECT * FROM deals WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org AS uuid)"),
        {"id": deal_id, "org": org_id},
    )
    deal = result.mappings().fetchone()
    if not deal:
        return None

    # Time features
    created_at = deal["created_at"] or datetime.now(timezone.utc)
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    now = datetime.utcnow()
    features["days_total_cycle"] = max(0, (now - created_at).days)

    deal_value = float(deal.get("value") or 0)
    features["final_deal_value"] = deal_value

    # --- Score history ---
    sh = await db.execute(
        text("""
            SELECT win_probability, probability_low, probability_high,
                   sentiment_avg, scored_at
            FROM score_history
            WHERE deal_id = CAST(:did AS uuid)
            ORDER BY scored_at ASC
        """),
        {"did": deal_id},
    )
    history = [dict(r) for r in sh.mappings().fetchall()]

    win_probs = [float(r["win_probability"]) for r in history if r.get("win_probability") is not None]
    sentiments = [float(r["sentiment_avg"]) for r in history if r.get("sentiment_avg") is not None]

    if win_probs:
        features["win_prob_final"] = win_probs[-1]
    if len(win_probs) >= 2:
        features["win_prob_at_discovery"] = win_probs[0]
        mid = len(win_probs) // 2
        features["win_prob_at_proposal"] = win_probs[mid]
        features["win_prob_at_negotiation"] = win_probs[int(len(win_probs) * 0.75)]

    if len(sentiments) >= 2:
        x = np.arange(len(sentiments))
        slope = float(np.polyfit(x, sentiments, 1)[0])
        features["sentiment_trend_slope"] = slope
        features["sentiment_volatility"] = float(np.std(sentiments))
        diffs = np.diff(sentiments)
        neg_diffs = diffs[diffs < 0]
        features["max_sentiment_drop"] = float(abs(neg_diffs.min())) if len(neg_diffs) > 0 else 0.0

    # --- Document counts ---
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

    # --- MEDDIC fields ---
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

    # --- Signals ---
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

    # --- ERP defaults (no real ERP table, use sensible defaults) ---
    features["erp_margin_available_pct"] = 0.35
    features["erp_inventory_risk"] = False
    features["erp_lead_time_days"] = 7
    features["discount_offered_pct"] = 0.0
    features["contract_term_years"] = 1.0

    # --- Stakeholder count (approximate from MEDDIC) ---
    stakeholder_count = 0
    if isinstance(meddic, dict):
        for k in ["champion", "economic_buyer"]:
            if meddic.get(k):
                stakeholder_count += 1
    features["num_stakeholders_engaged"] = stakeholder_count
    features["multi_thread_score"] = round(min(1.0, stakeholder_count / 5.0), 3)

    # --- Days since last activity ---
    if history:
        last_scored = history[-1].get("scored_at")
        if last_scored:
            if isinstance(last_scored, str):
                last_scored = datetime.fromisoformat(last_scored)
            features["days_since_last_activity"] = max(0, (now - last_scored).days)
    if "days_since_last_activity" not in features:
        features["days_since_last_activity"] = features["days_total_cycle"]

    # --- Proposal timing approximation ---
    total = features["days_total_cycle"]
    if len(history) >= 3:
        mid_ts = history[len(history) // 2].get("scored_at")
        if mid_ts:
            if isinstance(mid_ts, str):
                mid_ts = datetime.fromisoformat(mid_ts)
            features["days_first_call_to_proposal"] = max(0, (mid_ts - created_at).days)
            features["days_proposal_to_close"] = max(0, total - features["days_first_call_to_proposal"])
    if "days_first_call_to_proposal" not in features:
        half = total // 2
        features["days_first_call_to_proposal"] = half
        features["days_proposal_to_close"] = total - half

    # --- Rep stats (approximate) ---
    features["rep_win_rate_trailing_90d"] = 0.5
    features["rep_avg_deal_size"] = deal_value
    features["deal_size_vs_org_avg_ratio"] = 1.0
    features["final_margin_pct"] = 0.35
    features["deal_stage_at_close"] = deal.get("stage") or "unknown"
    features["industry_vertical"] = "unknown"

    # Fill defaults for missing
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

    # Build insert columns from FEATURE_COLUMNS + meta columns
    meta_cols = ["final_deal_value", "final_margin_pct", "deal_stage_at_close", "industry_vertical"]
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
