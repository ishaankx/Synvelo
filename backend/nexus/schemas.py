"""NEXUS — Pydantic v2 request/response schemas."""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from enum import Enum


class SimulationType(str, Enum):
    FULL = "full"
    PRICING = "pricing"
    TIMING = "timing"
    STAKEHOLDER = "stakeholder"


class ArtifactType(str, Enum):
    PROPOSAL_PDF = "proposal_pdf"
    ROI_CALCULATOR = "roi_calculator"
    BATTLE_CARD = "battle_card"
    NEXT_BEST_EMAIL = "next_best_email"


class TrainModelRequest(BaseModel):
    force_retrain: bool = False


class SimulateRequest(BaseModel):
    deal_id: str
    simulation_type: SimulationType = SimulationType.FULL
    n_scenarios: int = Field(default=500, ge=100, le=2000)


class ScenarioResult(BaseModel):
    scenario_id: str
    action_type: str
    action_params: Dict[str, Any]
    win_prob: float
    margin_pct: float
    expected_value: float
    net_revenue_delta: float
    rank: int
    plain_text: str


class SimulationResponse(BaseModel):
    simulation_id: str
    deal_id: str
    baseline_win_prob: float
    baseline_expected_value: float
    recommended_action_type: str
    recommended_action_params: Dict[str, Any]
    recommended_win_prob_new: float
    recommended_ev_new: float
    recommended_net_rev_delta: float
    recommended_reasoning: str
    top_scenarios: List[ScenarioResult]
    erp_validated: bool
    erp_flags: List[str]
    model_version: int
    run_duration_ms: int


class WinDNAFactor(BaseModel):
    factor_name: str
    display_name: str
    direction: str
    magnitude: float
    plain_text: str


class WinDNAResponse(BaseModel):
    org_id: str
    model_version: int
    n_training_samples: int
    cv_auc: float
    top_win_factors: List[WinDNAFactor]
    top_loss_factors: List[WinDNAFactor]
    narrative: str
    trained_at: Optional[datetime] = None
    ready: bool


class ModelStatusResponse(BaseModel):
    org_id: str
    has_model: bool
    model_ready: bool
    model_version: Optional[int] = None
    n_training_samples: Optional[int] = None
    cv_auc: Optional[float] = None
    trained_at: Optional[datetime] = None
    min_samples_needed: int = 30
    current_sample_count: int
    can_train: bool
    training_in_progress: bool


class GenerateArtifactRequest(BaseModel):
    simulation_id: str
    deal_id: str
    artifact_types: List[ArtifactType]


class ArtifactResponse(BaseModel):
    artifact_id: str
    artifact_type: str
    status: str
    content_json: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None


class ExtractFeaturesRequest(BaseModel):
    deal_id: str
    outcome: int = Field(ge=0, le=1)
