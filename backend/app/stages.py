"""
Single source of truth for deal stage metadata.
Used by the API (validation/recommendations) and serialized to the frontend.
"""
from __future__ import annotations

from typing import TypedDict

STAGE_ORDER = [
    "Discovery", "Qualification", "Demo", "Proposal",
    "Negotiation", "Closed Won", "Closed Lost",
]


class StageConfig(TypedDict):
    key: str
    label: str
    order: int
    color: str
    description: str
    exit_criteria: list[str]
    typical_duration_days: int
    ai_win_prob_floor: int
    ai_win_prob_ceiling: int
    next_stage: str | None
    is_terminal: bool


STAGE_CONFIGS: dict[str, StageConfig] = {
    "Discovery": {
        "key": "Discovery",
        "label": "Discovery",
        "order": 0,
        "color": "#6366f1",
        "description": (
            "Initial contact. Goal: understand the buyer's problem, org, "
            "and whether there's a real opportunity."
        ),
        "exit_criteria": [
            "Buyer's core problem clearly identified",
            "Key stakeholder(s) named",
            "Budget range discussed or estimated",
            "Next meeting or demo agreed upon",
        ],
        "typical_duration_days": 7,
        "ai_win_prob_floor": 5,
        "ai_win_prob_ceiling": 30,
        "next_stage": "Qualification",
        "is_terminal": False,
    },
    "Qualification": {
        "key": "Qualification",
        "label": "Qualification",
        "order": 1,
        "color": "#3b82f6",
        "description": (
            "MEDDIC/BANT validation. Confirm the deal is real: budget exists, "
            "authority is mapped, need is urgent, timeline is real."
        ),
        "exit_criteria": [
            "Economic buyer identified and engaged",
            "Decision criteria documented",
            "Timeline confirmed (not vague)",
            "Budget approved or in process",
            "Champion relationship established",
        ],
        "typical_duration_days": 10,
        "ai_win_prob_floor": 20,
        "ai_win_prob_ceiling": 50,
        "next_stage": "Demo",
        "is_terminal": False,
    },
    "Demo": {
        "key": "Demo",
        "label": "Demo",
        "order": 2,
        "color": "#06b6d4",
        "description": (
            "Product demonstration. The buyer has seen the value proposition "
            "and you are showing them how the product solves their problem."
        ),
        "exit_criteria": [
            "Full demo delivered to decision-maker",
            "Key objections surfaced and addressed",
            "Technical fit confirmed or scoped",
            "Evaluation criteria agreed",
            "Next step: formal proposal requested",
        ],
        "typical_duration_days": 14,
        "ai_win_prob_floor": 30,
        "ai_win_prob_ceiling": 65,
        "next_stage": "Proposal",
        "is_terminal": False,
    },
    "Proposal": {
        "key": "Proposal",
        "label": "Proposal",
        "order": 3,
        "color": "#f59e0b",
        "description": (
            "Formal proposal submitted. Buyer has your pricing, scope, and "
            "terms in writing. Goal: get a response."
        ),
        "exit_criteria": [
            "Written proposal sent and confirmed received",
            "Proposal reviewed with buyer in live meeting",
            "Pricing objections surfaced",
            "Decision timeline agreed in writing",
            "Counter-offer received or verbal intent signaled",
        ],
        "typical_duration_days": 10,
        "ai_win_prob_floor": 50,
        "ai_win_prob_ceiling": 80,
        "next_stage": "Negotiation",
        "is_terminal": False,
    },
    "Negotiation": {
        "key": "Negotiation",
        "label": "Negotiation",
        "order": 4,
        "color": "#ec4899",
        "description": (
            "Active back-and-forth on terms, pricing, contract language, or "
            "scope. The buyer wants to buy but specifics need resolving."
        ),
        "exit_criteria": [
            "All commercial terms agreed",
            "Legal/procurement review complete",
            "Signature process initiated",
            "Implementation start date agreed",
        ],
        "typical_duration_days": 14,
        "ai_win_prob_floor": 65,
        "ai_win_prob_ceiling": 95,
        "next_stage": "Closed Won",
        "is_terminal": False,
    },
    "Closed Won": {
        "key": "Closed Won",
        "label": "Closed Won",
        "order": 5,
        "color": "#22c55e",
        "description": "Deal signed. Revenue booked. Transition to onboarding.",
        "exit_criteria": [],
        "typical_duration_days": 0,
        "ai_win_prob_floor": 100,
        "ai_win_prob_ceiling": 100,
        "next_stage": None,
        "is_terminal": True,
    },
    "Closed Lost": {
        "key": "Closed Lost",
        "label": "Closed Lost",
        "order": 6,
        "color": "#ef4444",
        "description": (
            "Deal lost. Document the loss reason for pipeline analytics. "
            "Understand if re-engagement is possible in a future quarter."
        ),
        "exit_criteria": [],
        "typical_duration_days": 0,
        "ai_win_prob_floor": 0,
        "ai_win_prob_ceiling": 0,
        "next_stage": None,
        "is_terminal": True,
    },
}


def get_next_stage(current_stage: str) -> str | None:
    cfg = STAGE_CONFIGS.get(current_stage)
    return cfg["next_stage"] if cfg else None


def can_transition(from_stage: str, to_stage: str) -> tuple[bool, str]:
    """Validate whether a stage transition is allowed."""
    if from_stage == to_stage:
        return False, "Deal is already in this stage."
    cfg = STAGE_CONFIGS.get(from_stage)
    if not cfg:
        return False, f"Unknown stage '{from_stage}'."
    if cfg["is_terminal"]:
        return False, (
            f"Cannot move a deal out of '{from_stage}'. "
            "Create a new deal if re-engaging."
        )
    if to_stage not in STAGE_CONFIGS:
        return False, f"Unknown target stage '{to_stage}'."
    return True, "ok"
