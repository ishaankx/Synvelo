from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ─── Deal schemas ─────────────────────────────────────────

class DealCreate(BaseModel):
    name: str
    company: str = ""
    stage: str = "Qualification"
    value: float = 0.0
    owner: str = ""

class EvidenceSpan(BaseModel):
    excerpt: str
    source_type: str
    filename: str
    impact: Optional[float] = None
    type: str = "evidence"  # evidence | feature

class DealScore(BaseModel):
    deal_id: str
    win_probability: float
    confidence_interval: List[float]
    time_to_close_days: int
    top_reasons: List[EvidenceSpan]
    risk_flags: List[str]
    recommended_actions: List[str]
    score_summary: str

class DealResponse(BaseModel):
    id: str
    name: str
    company: str
    stage: str
    value: float
    owner: str
    win_probability: Optional[float] = None
    probability_low: Optional[float] = None
    probability_high: Optional[float] = None
    time_to_close_days: Optional[int] = None
    risk_flags: List[str] = []
    score_summary: Optional[str] = None
    last_scored_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

# ─── Ingest schemas ───────────────────────────────────────

class IngestResponse(BaseModel):
    document_id: str
    deal_id: str
    filename: str
    status: str
    chunks_created: int = 0
    message: str = ""

# ─── Pulse Sync schemas ───────────────────────────────────

class PulseQuery(BaseModel):
    query: str
    deal_id: Optional[str] = None

class ShipmentOption(BaseModel):
    qty: int
    eta: str
    cost: float

class PulseProposal(BaseModel):
    summary: str
    split_options: List[ShipmentOption]
    total_cost: float
    margin_impact: float
    margin_impact_pct: float
    recommended: str
    win_probability_impact: float
    requires_approval: bool = True

class PulseActionResponse(BaseModel):
    action_id: str
    query: str
    proposal: Optional[PulseProposal] = None
    raw_answer: str
    status: str