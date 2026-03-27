"""
Layer 2 — Win DNA Miner
Trains XGBoost on org's historical deal features.
Computes SHAP values for causal attribution.
Generates human-readable Win DNA narrative via LLM.
"""
import io
import base64
import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.calibration import CalibratedClassifierCV
from typing import Dict, Any, List, Tuple
import openai
from .feature_extractor import FEATURE_COLUMNS
from .prompts import WIN_DNA_NARRATIVE_PROMPT

MIN_TRAINING_SAMPLES = 30

XGBOOST_PARAMS = {
    "n_estimators": 200,
    "max_depth": 4,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "eval_metric": "logloss",
    "random_state": 42,
    "n_jobs": -1,
}

FEATURE_DISPLAY_NAMES = {
    "days_first_call_to_proposal": "Speed of proposal delivery",
    "days_proposal_to_close": "Time from proposal to close",
    "days_total_cycle": "Total deal cycle length",
    "days_since_last_activity": "Days since last touch",
    "num_calls": "Number of calls held",
    "num_emails": "Number of emails sent",
    "num_docs_uploaded": "Documents uploaded",
    "num_stakeholders_engaged": "Stakeholders engaged",
    "economic_buyer_engaged": "Economic buyer engaged",
    "champion_identified": "Champion identified",
    "legal_review_triggered": "Legal review triggered",
    "multi_thread_score": "Multi-threading depth",
    "meddic_completeness_score": "MEDDIC qualification completeness",
    "meddic_metrics_filled": "MEDDIC metrics filled",
    "meddic_economic_buyer_filled": "MEDDIC economic buyer filled",
    "meddic_decision_criteria_filled": "MEDDIC decision criteria filled",
    "meddic_champion_filled": "MEDDIC champion filled",
    "win_prob_at_discovery": "Win probability at discovery",
    "win_prob_at_proposal": "Win probability at proposal",
    "win_prob_at_negotiation": "Win probability at negotiation",
    "win_prob_final": "Final win probability",
    "sentiment_trend_slope": "Buyer sentiment trajectory",
    "sentiment_volatility": "Sentiment volatility",
    "max_sentiment_drop": "Maximum sentiment drop",
    "competitor_mentioned": "Competitor mentioned",
    "budget_concern_raised": "Budget concern raised",
    "price_pushback_raised": "Price pushback raised",
    "discount_offered_pct": "Discount percentage offered",
    "contract_term_years": "Contract term length",
    "erp_margin_available_pct": "Available ERP margin",
    "erp_inventory_risk": "ERP inventory risk",
    "erp_lead_time_days": "ERP lead time",
    "rep_win_rate_trailing_90d": "Rep's recent win rate",
    "rep_avg_deal_size": "Rep's average deal size",
    "deal_size_vs_org_avg_ratio": "Deal size vs. company average",
}


def prepare_feature_matrix(rows: List[Dict]) -> Tuple[pd.DataFrame, np.ndarray]:
    """Convert DB rows to X (feature matrix) and y (labels)."""
    df = pd.DataFrame(rows)
    y = df["outcome"].values.astype(int)

    X_cols = [c for c in FEATURE_COLUMNS if c in df.columns]
    X = df[X_cols].fillna(0).astype(float)

    for col in X.columns:
        if X[col].isin([0, 1, True, False]).all():
            X[col] = X[col].astype(float)

    return X, y


def train_model(X: pd.DataFrame, y: np.ndarray) -> Tuple[Any, Dict]:
    """Train XGBoost with cross-validation. Returns (calibrated, base) models + metrics."""
    base_model = xgb.XGBClassifier(**XGBOOST_PARAMS)

    cv = StratifiedKFold(n_splits=min(5, max(2, len(y) // 5)), shuffle=True, random_state=42)
    auc_scores = cross_val_score(base_model, X, y, cv=cv, scoring="roc_auc")
    f1_scores = cross_val_score(base_model, X, y, cv=cv, scoring="f1")

    calibrated = CalibratedClassifierCV(base_model, method="sigmoid", cv=min(3, max(2, len(y) // 10)))
    calibrated.fit(X, y)

    base_model.fit(X, y)

    metrics = {
        "cv_auc_mean": float(auc_scores.mean()),
        "cv_auc_std": float(auc_scores.std()),
        "cv_f1_mean": float(f1_scores.mean()),
        "n_training_samples": len(y),
        "feature_names": list(X.columns),
        "hyperparams": XGBOOST_PARAMS,
    }

    return (calibrated, base_model), metrics


def compute_shap_values(base_model: xgb.XGBClassifier, X: pd.DataFrame) -> Dict:
    """Compute SHAP values using TreeExplainer."""
    explainer = shap.TreeExplainer(base_model)
    shap_values = explainer.shap_values(X)

    if isinstance(shap_values, list):
        shap_vals = shap_values[1]
    else:
        shap_vals = shap_values

    feature_names = list(X.columns)
    mean_abs_shap = {
        feat: float(np.abs(shap_vals[:, i]).mean())
        for i, feat in enumerate(feature_names)
    }
    mean_shap = {
        feat: float(shap_vals[:, i].mean())
        for i, feat in enumerate(feature_names)
    }
    shap_direction = {
        feat: "positive" if mean_shap[feat] > 0 else "negative"
        for feat in feature_names
    }

    fi = dict(zip(feature_names, base_model.feature_importances_.tolist()))

    return {
        "shap_mean_abs": mean_abs_shap,
        "shap_direction": shap_direction,
        "feature_importances": fi,
        "mean_shap": mean_shap,
    }


def compute_shap_for_single_deal(
    base_model: xgb.XGBClassifier,
    X_row: pd.DataFrame,
    X_train: pd.DataFrame,
) -> List[Dict]:
    """Per-deal SHAP explanation."""
    explainer = shap.TreeExplainer(base_model)
    shap_vals = explainer.shap_values(X_row)

    if isinstance(shap_vals, list):
        sv = shap_vals[1][0]
    else:
        sv = shap_vals[0]

    total_abs = max(np.abs(sv).sum(), 1e-8)
    features = list(X_train.columns)

    result = []
    for i, feat in enumerate(features):
        result.append({
            "feature": feat,
            "display_name": FEATURE_DISPLAY_NAMES.get(feat, feat),
            "shap_value": float(sv[i]),
            "direction": "positive" if sv[i] > 0 else "negative",
            "magnitude_pct": round(abs(sv[i]) / total_abs * 100, 1),
            "feature_value": float(X_row.iloc[0][feat]),
        })

    return sorted(result, key=lambda x: abs(x["shap_value"]), reverse=True)


def build_top_factors(shap_data: Dict, n: int = 10) -> Tuple[List[Dict], List[Dict]]:
    """Build top win factors and top loss factors from SHAP data."""
    mean_abs = shap_data["shap_mean_abs"]
    direction = shap_data["shap_direction"]

    sorted_feats = sorted(mean_abs.items(), key=lambda x: x[1], reverse=True)

    win_factors = []
    loss_factors = []

    for feat, mag in sorted_feats:
        d = direction[feat]
        display = FEATURE_DISPLAY_NAMES.get(feat, feat)
        entry = {
            "factor_name": feat,
            "display_name": display,
            "direction": d,
            "magnitude": round(mag, 5),
            "plain_text": (
                f"Higher {display.lower()} strongly predicts a win"
                if d == "positive"
                else f"Higher {display.lower()} is associated with deal loss"
            ),
        }
        if d == "positive":
            win_factors.append(entry)
        else:
            loss_factors.append(entry)

    return win_factors[:n], loss_factors[:n]


async def generate_win_dna_narrative(
    top_win_factors: List[Dict],
    top_loss_factors: List[Dict],
    n_samples: int,
    auc: float,
    openai_client: openai.AsyncOpenAI,
) -> str:
    """LLM-generated Win DNA narrative from SHAP data."""
    factors_text = "TOP WIN FACTORS:\n"
    for i, f in enumerate(top_win_factors[:5], 1):
        factors_text += f"{i}. {f['display_name']} (magnitude: {f['magnitude']:.4f})\n"

    factors_text += "\nTOP LOSS FACTORS:\n"
    for i, f in enumerate(top_loss_factors[:5], 1):
        factors_text += f"{i}. {f['display_name']} (magnitude: {f['magnitude']:.4f})\n"

    user_msg = f"""
Model trained on {n_samples} closed deals. Cross-validation AUC: {auc:.3f}.

{factors_text}

Write a concise Win DNA narrative (3-4 sentences max) that a sales manager can read in 20 seconds.
Focus on the most actionable patterns. Be specific, not generic.
"""

    resp = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": WIN_DNA_NARRATIVE_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=300,
        temperature=0.3,
    )
    return resp.choices[0].message.content.strip()


def serialize_model(model_tuple) -> str:
    """Serialize model tuple to base64."""
    buf = io.BytesIO()
    joblib.dump(model_tuple, buf)
    return base64.b64encode(buf.getvalue()).decode()


def deserialize_model(b64: str):
    """Deserialize model from base64."""
    data = base64.b64decode(b64)
    buf = io.BytesIO(data)
    return joblib.load(buf)
