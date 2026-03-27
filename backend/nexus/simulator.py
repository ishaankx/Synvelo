"""
Layer 3 — Scenario Simulator
Bayesian belief-update simulation.
Runs a grid of interventions on a live deal and ranks by expected net revenue.
ERP margin floor enforced on all pricing scenarios.
"""
import time
import numpy as np
import pandas as pd
from typing import List, Dict, Any
from .model_trainer import compute_shap_for_single_deal

ACTION_SPACE = {
    "offer_discount": {
        "param": "discount_offered_pct",
        "values": [0, 5, 8, 10, 12, 15, 18, 20],
        "description": "Offer a {val}% discount",
    },
    "extend_contract_term": {
        "param": "contract_term_years",
        "values": [1, 2, 3],
        "description": "Offer {val}-year contract",
    },
    "engage_economic_buyer": {
        "param": "economic_buyer_engaged",
        "values": [True],
        "description": "Involve economic buyer immediately",
    },
    "send_proposal_fast": {
        "param": "days_first_call_to_proposal",
        "values": [1, 2, 3, 5, 7, 14],
        "description": "Send proposal in {val} day(s)",
    },
    "increase_meddic": {
        "param": "meddic_completeness_score",
        "values": [0.5, 0.67, 0.83, 1.0],
        "description": "Complete MEDDIC to {val:.0%}",
    },
    "add_stakeholders": {
        "param": "num_stakeholders_engaged",
        "values": [2, 3, 4, 5],
        "description": "Engage {val} stakeholders",
    },
    "send_roi_calculator": {
        "param": "meddic_metrics_filled",
        "values": [True],
        "description": "Send buyer-specific ROI calculator",
    },
}


class ScenarioSimulator:
    def __init__(self, model_tuple, X_train: pd.DataFrame):
        self.calibrated_model, self.base_model = model_tuple
        self.X_train = X_train

    def predict_win_prob(self, features_dict: Dict) -> float:
        row = self._dict_to_df(features_dict)
        prob = self.calibrated_model.predict_proba(row)[0][1]
        return float(np.clip(prob, 0.01, 0.99))

    def _dict_to_df(self, features_dict: Dict) -> pd.DataFrame:
        row = {}
        for col in self.X_train.columns:
            val = features_dict.get(col, 0)
            if isinstance(val, bool):
                val = int(val)
            row[col] = float(val)
        return pd.DataFrame([row], columns=self.X_train.columns)

    def run_full_simulation(
        self,
        base_features: Dict,
        deal_value: float,
        erp_margin_floor_pct: float,
        n_scenarios: int = 500,
    ) -> Dict[str, Any]:
        start = time.time()

        baseline_prob = self.predict_win_prob(base_features)
        baseline_ev = deal_value * baseline_prob

        scenarios = []
        scenario_id = 0

        # Single-action scenarios
        for action_type, action_config in ACTION_SPACE.items():
            param = action_config["param"]
            for val in action_config["values"]:
                scenario_id += 1
                modified = {**base_features}
                if isinstance(val, bool):
                    modified[param] = int(val)
                else:
                    modified[param] = float(val)

                current_margin = float(base_features.get("erp_margin_available_pct", 0.35))
                if action_type == "offer_discount":
                    effective_margin = current_margin - (val / 100.0)
                    if effective_margin < erp_margin_floor_pct:
                        continue
                else:
                    effective_margin = current_margin

                win_prob = self.predict_win_prob(modified)
                actual_deal_value = (
                    deal_value * (1 - val / 100.0)
                    if action_type == "offer_discount"
                    else deal_value
                )
                actual_ev = actual_deal_value * win_prob
                actual_net_delta = actual_ev - baseline_ev

                scenarios.append({
                    "scenario_id": f"s{scenario_id:04d}",
                    "action_type": action_type,
                    "action_params": {param: val},
                    "win_prob": round(win_prob, 4),
                    "margin_pct": round(effective_margin, 4),
                    "expected_value": round(actual_ev, 2),
                    "net_revenue_delta": round(actual_net_delta, 2),
                    "plain_text": action_config["description"].format(val=val),
                    "erp_safe": True,
                })

                if len(scenarios) >= n_scenarios:
                    break

        # Two-action combos: discount + term
        for v1 in ACTION_SPACE["offer_discount"]["values"]:
            for v2 in ACTION_SPACE["extend_contract_term"]["values"]:
                scenario_id += 1
                modified = {**base_features}
                modified["discount_offered_pct"] = float(v1)
                modified["contract_term_years"] = float(v2)

                current_margin = float(base_features.get("erp_margin_available_pct", 0.35))
                effective_margin = current_margin - (v1 / 100.0)
                if effective_margin < erp_margin_floor_pct:
                    continue

                win_prob = self.predict_win_prob(modified)
                actual_deal_value = deal_value * (1 - v1 / 100.0)
                actual_ev = actual_deal_value * win_prob
                actual_net_delta = actual_ev - baseline_ev

                scenarios.append({
                    "scenario_id": f"s{scenario_id:04d}",
                    "action_type": "offer_discount+extend_contract_term",
                    "action_params": {
                        "discount_offered_pct": v1,
                        "contract_term_years": v2,
                    },
                    "win_prob": round(win_prob, 4),
                    "margin_pct": round(effective_margin, 4),
                    "expected_value": round(actual_ev, 2),
                    "net_revenue_delta": round(actual_net_delta, 2),
                    "plain_text": f"Offer {v1}% discount on {v2}-year contract",
                    "erp_safe": True,
                })

        # Rank by net_revenue_delta
        scenarios.sort(key=lambda x: x["net_revenue_delta"], reverse=True)
        for i, s in enumerate(scenarios):
            s["rank"] = i + 1

        best = scenarios[0] if scenarios else None
        reasoning = self._generate_reasoning(best, baseline_prob, deal_value) if best else "Insufficient data."

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "baseline_win_prob": round(baseline_prob, 4),
            "baseline_expected_value": round(baseline_ev, 2),
            "scenario_results": scenarios[:20],
            "recommended_action_type": best["action_type"] if best else "hold",
            "recommended_action_params": best["action_params"] if best else {},
            "recommended_win_prob_new": best["win_prob"] if best else baseline_prob,
            "recommended_ev_new": best["expected_value"] if best else baseline_ev,
            "recommended_net_rev_delta": best["net_revenue_delta"] if best else 0.0,
            "recommended_reasoning": reasoning,
            "erp_margin_floor_pct": erp_margin_floor_pct,
            "erp_validated": True,
            "erp_flags": [],
            "run_duration_ms": elapsed_ms,
        }

    def _generate_reasoning(self, best: Dict, baseline_prob: float, deal_value: float) -> str:
        prob_delta = (best["win_prob"] - baseline_prob) * 100
        rev_delta = best["net_revenue_delta"]
        action = best["plain_text"]
        direction = "improves" if prob_delta > 0 else "maintains"
        sign = "+" if rev_delta >= 0 else ""

        return (
            f"Recommended: {action}. "
            f"This {direction} win probability by {abs(prob_delta):.1f} percentage points "
            f"(from {baseline_prob*100:.0f}% → {best['win_prob']*100:.0f}%). "
            f"Expected net revenue impact: {sign}${abs(rev_delta):,.0f}. "
            f"ERP margin floor validated."
        )

    def get_deal_shap_explanation(self, base_features: Dict) -> List[Dict]:
        row_df = pd.DataFrame([{
            col: float(
                int(base_features.get(col, 0))
                if isinstance(base_features.get(col), bool)
                else base_features.get(col, 0)
            )
            for col in self.X_train.columns
        }])
        return compute_shap_for_single_deal(self.base_model, row_df, self.X_train)
