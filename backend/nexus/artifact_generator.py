"""
Layer 4 — Execution Generator
Generates 4 artifacts from the winning simulation scenario.
LLM is ONLY used to format content whose substance is already
determined by Layers 1-3. No hallucination risk.
"""
import json
import time
from typing import Dict, Any, List
import openai
from .prompts import (
    PROPOSAL_SYSTEM_PROMPT,
    ROI_CALCULATOR_SYSTEM_PROMPT,
    BATTLE_CARD_SYSTEM_PROMPT,
    EMAIL_SYSTEM_PROMPT,
)


async def generate_proposal(
    simulation_result: Dict,
    deal_data: Dict,
    openai_client: openai.AsyncOpenAI,
) -> Dict[str, Any]:
    rec = simulation_result
    deal_value = float(deal_data.get("value") or 0)
    discount = rec["recommended_action_params"].get("discount_offered_pct", 0)
    term = rec["recommended_action_params"].get("contract_term_years", 1)
    meddic = deal_data.get("meddic") or {}

    context = f"""
DEAL: {deal_data.get('company', 'Prospect')} — {deal_data.get('name', 'Deal')}
DEAL VALUE: ${deal_value:,.0f}
RECOMMENDED DISCOUNT: {discount}%
CONTRACT TERM: {term} year(s)
WIN PROBABILITY: {rec['recommended_win_prob_new']*100:.0f}%
NET REVENUE IMPACT: ${rec['recommended_net_rev_delta']:,.0f}
BUYER PAIN POINTS: {meddic.get('identify_pain', 'Not captured')}
DECISION CRITERIA: {meddic.get('decision_criteria', 'Not captured')}
CHAMPION: {meddic.get('champion', 'Not identified')}
"""
    start = time.time()
    resp = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": PROPOSAL_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        max_tokens=1500,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    gen_ms = int((time.time() - start) * 1000)

    proposal_json = json.loads(resp.choices[0].message.content)
    proposal_json["pricing"] = {
        "base_value": deal_value,
        "discount_pct": discount,
        "final_value": deal_value * (1 - discount / 100),
        "contract_term_years": term,
    }
    proposal_json["_meta"] = {
        "llm_model": "gpt-4o",
        "tokens": resp.usage.total_tokens if resp.usage else 0,
        "generation_ms": gen_ms,
    }
    return proposal_json


async def generate_roi_calculator(
    simulation_result: Dict,
    deal_data: Dict,
    openai_client: openai.AsyncOpenAI,
) -> Dict[str, Any]:
    deal_value = float(deal_data.get("value") or 0)

    context = f"""
DEAL: {deal_data.get('company', 'Prospect')} — {deal_data.get('name', 'Deal')}
DEAL VALUE: ${deal_value:,.0f}
WIN PROBABILITY: {simulation_result['recommended_win_prob_new']*100:.0f}%
EXPECTED VALUE: ${simulation_result['recommended_ev_new']:,.0f}
NET REVENUE DELTA: ${simulation_result['recommended_net_rev_delta']:,.0f}
RECOMMENDED ACTION: {simulation_result['recommended_reasoning']}
"""
    start = time.time()
    resp = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": ROI_CALCULATOR_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        max_tokens=1000,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    gen_ms = int((time.time() - start) * 1000)
    result = json.loads(resp.choices[0].message.content)
    result["_meta"] = {
        "llm_model": "gpt-4o",
        "tokens": resp.usage.total_tokens if resp.usage else 0,
        "generation_ms": gen_ms,
    }
    return result


async def generate_battle_card(
    simulation_result: Dict,
    deal_data: Dict,
    openai_client: openai.AsyncOpenAI,
) -> Dict[str, Any]:
    signals = deal_data.get("signals") or []
    competitor_signals = [
        s for s in signals
        if isinstance(s, dict) and "competitor" in str(s.get("signal_type", "")).lower()
    ]
    competitor = competitor_signals[0].get("signal_value", "Unknown") if competitor_signals else "Unknown"

    context = f"""
DEAL: {deal_data.get('company', 'Prospect')} — {deal_data.get('name', 'Deal')}
COMPETITOR: {competitor}
WIN PROBABILITY: {simulation_result['recommended_win_prob_new']*100:.0f}%
RECOMMENDED ACTION: {simulation_result['recommended_reasoning']}
DEAL SIGNALS: {json.dumps(signals[:5], default=str)}
"""
    start = time.time()
    resp = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": BATTLE_CARD_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        max_tokens=1000,
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    gen_ms = int((time.time() - start) * 1000)
    result = json.loads(resp.choices[0].message.content)
    result["_meta"] = {
        "llm_model": "gpt-4o",
        "tokens": resp.usage.total_tokens if resp.usage else 0,
        "generation_ms": gen_ms,
    }
    return result


async def generate_email(
    simulation_result: Dict,
    deal_data: Dict,
    openai_client: openai.AsyncOpenAI,
) -> Dict[str, Any]:
    meddic = deal_data.get("meddic") or {}

    context = f"""
DEAL: {deal_data.get('company', 'Prospect')} — {deal_data.get('name', 'Deal')}
DEAL VALUE: ${float(deal_data.get('value') or 0):,.0f}
CHAMPION: {meddic.get('champion', 'Not identified')}
ECONOMIC BUYER: {meddic.get('economic_buyer', 'Not identified')}
RECOMMENDED ACTION: {simulation_result['recommended_reasoning']}
WIN PROBABILITY: {simulation_result['recommended_win_prob_new']*100:.0f}%
"""
    start = time.time()
    resp = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": EMAIL_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        max_tokens=800,
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    gen_ms = int((time.time() - start) * 1000)
    result = json.loads(resp.choices[0].message.content)
    result["_meta"] = {
        "llm_model": "gpt-4o",
        "tokens": resp.usage.total_tokens if resp.usage else 0,
        "generation_ms": gen_ms,
    }
    return result


GENERATORS = {
    "proposal_pdf": generate_proposal,
    "roi_calculator": generate_roi_calculator,
    "battle_card": generate_battle_card,
    "next_best_email": generate_email,
}
