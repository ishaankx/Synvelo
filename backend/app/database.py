from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped, relationship
from sqlalchemy import String, Float, Integer, Text, DateTime, ForeignKey, JSON, UUID, UniqueConstraint
from pgvector.sqlalchemy import Vector
from datetime import datetime
from typing import Optional, List
import uuid
from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_recycle=settings.db_pool_recycle,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Deal(Base):
    __tablename__ = "deals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(500))
    company: Mapped[Optional[str]] = mapped_column(String(500))
    stage: Mapped[Optional[str]] = mapped_column(String(100), default="Qualification")
    value: Mapped[Optional[float]] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    owner: Mapped[Optional[str]] = mapped_column(String(200))
    win_probability: Mapped[Optional[float]] = mapped_column(Float)
    probability_low: Mapped[Optional[float]] = mapped_column(Float)
    probability_high: Mapped[Optional[float]] = mapped_column(Float)
    time_to_close_days: Mapped[Optional[int]] = mapped_column(Integer)
    score_summary: Mapped[Optional[str]] = mapped_column(Text)
    risk_flags: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    signals: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    meddic: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    brief: Mapped[Optional[str]] = mapped_column(Text)
    brief_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_scored_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    stage_entered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    org_id = mapped_column(String, nullable=False, index=True)

    documents: Mapped[List["Document"]] = relationship("Document", back_populates="deal", lazy="select")
    score_history: Mapped[List["ScoreHistory"]] = relationship("ScoreHistory", back_populates="deal", lazy="select")
    transcriptions: Mapped[List["CallTranscription"]] = relationship("CallTranscription", back_populates="deal", lazy="select")
    stage_history: Mapped[List["DealStageHistory"]] = relationship("DealStageHistory", back_populates="deal", lazy="select")
    exit_criteria: Mapped[List["DealExitCriteria"]] = relationship("DealExitCriteria", back_populates="deal", lazy="select")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id: Mapped[str] = mapped_column(String, ForeignKey("deals.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(500))
    source_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="processing")
    content: Mapped[Optional[str]] = mapped_column(Text)
    sentiment_score: Mapped[Optional[float]] = mapped_column(Float)
    sentiment_label: Mapped[Optional[str]] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    org_id = mapped_column(String, nullable=False, index=True)

    deal: Mapped["Deal"] = relationship("Deal", back_populates="documents")


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id: Mapped[str] = mapped_column(String, ForeignKey("deals.id", ondelete="CASCADE"))
    document_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("documents.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(50))
    filename: Mapped[str] = mapped_column(String(500))
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[Optional[list]] = mapped_column(Vector(1536))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PulseAction(Base):
    __tablename__ = "pulse_actions"

    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deal_id = mapped_column(UUID(as_uuid=True), ForeignKey("deals.id", ondelete="SET NULL"), nullable=True)
    query: Mapped[str] = mapped_column(Text)
    proposal: Mapped[Optional[dict]] = mapped_column(JSON)
    raw_answer: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    decision: Mapped[Optional[str]] = mapped_column(String(20))
    decided_by: Mapped[Optional[str]] = mapped_column(String(200))
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    org_id = mapped_column(UUID(as_uuid=True), nullable=False, index=True)


class ScoreHistory(Base):
    __tablename__ = "score_history"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id: Mapped[str] = mapped_column(String, ForeignKey("deals.id", ondelete="CASCADE"))
    scored_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    win_probability: Mapped[Optional[float]] = mapped_column(Float)
    probability_low: Mapped[Optional[float]] = mapped_column(Float)
    probability_high: Mapped[Optional[float]] = mapped_column(Float)
    sentiment_avg: Mapped[Optional[float]] = mapped_column(Float)
    trigger_type: Mapped[str] = mapped_column(String(50), default="manual_score")
    trigger_document: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped["Deal"] = relationship("Deal", back_populates="score_history")


class CallTranscription(Base):
    __tablename__ = "call_transcriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id: Mapped[str] = mapped_column(String, ForeignKey("deals.id", ondelete="CASCADE"))
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    platform: Mapped[str] = mapped_column(String(50), default="upload")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    transcript_text: Mapped[Optional[str]] = mapped_column(Text)
    pdf_filename: Mapped[Optional[str]] = mapped_column(String(500))
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    attendees: Mapped[Optional[str]] = mapped_column(Text)
    call_title: Mapped[Optional[str]] = mapped_column(String(500))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    deal: Mapped["Deal"] = relationship("Deal", back_populates="transcriptions")


class Organisation(Base):
    __tablename__ = "organisations"

    id         = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = mapped_column(String, nullable=False)
    slug       = mapped_column(String, nullable=False, unique=True)
    plan       = mapped_column(String, nullable=False, default="free")
    created_at = mapped_column(DateTime, default=datetime.utcnow)


class DealReport(Base):
    __tablename__ = "deal_reports"

    id         = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id    = mapped_column(String, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False)
    org_id     = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    filename   = mapped_column(String(500))
    page_count = mapped_column(Integer, default=0)
    report_type = mapped_column(String(50), default="intelligence")
    report_json = mapped_column(JSON)
    created_at = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped["Deal"] = relationship("Deal", lazy="select")


class DealStageHistory(Base):
    __tablename__ = "deal_stage_history"

    id = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id = mapped_column(UUID(as_uuid=False), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False)
    from_stage: Mapped[Optional[str]] = mapped_column(String(100))
    to_stage: Mapped[str] = mapped_column(String(100), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    changed_by: Mapped[Optional[str]] = mapped_column(String(200))
    reason: Mapped[Optional[str]] = mapped_column(Text)
    triggered_by: Mapped[str] = mapped_column(String(50), default="manual")
    org_id = mapped_column(UUID(as_uuid=False), nullable=False, index=True)

    deal: Mapped["Deal"] = relationship("Deal", back_populates="stage_history")


class DealExitCriteria(Base):
    __tablename__ = "deal_exit_criteria"

    id = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id = mapped_column(UUID(as_uuid=False), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False)
    stage: Mapped[str] = mapped_column(String(100), nullable=False)
    criterion_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_completed: Mapped[bool] = mapped_column(default=False)
    is_custom: Mapped[bool] = mapped_column(default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    org_id = mapped_column(UUID(as_uuid=False), nullable=False, index=True)

    deal: Mapped["Deal"] = relationship("Deal", back_populates="exit_criteria")


class DealFieldEdit(Base):
    __tablename__ = "deal_field_edits"

    id = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id = mapped_column(UUID(as_uuid=False), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False)
    field_name: Mapped[str] = mapped_column(Text, nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(Text)
    new_value: Mapped[Optional[str]] = mapped_column(Text)
    changed_by: Mapped[Optional[str]] = mapped_column(String(200))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    org_id = mapped_column(UUID(as_uuid=False), nullable=False, index=True)


class DealAiUsageLog(Base):
    __tablename__ = "deal_ai_usage_log"

    id = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id = mapped_column(UUID(as_uuid=False), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False)
    feature_name: Mapped[str] = mapped_column(Text, nullable=False)
    triggered_by: Mapped[Optional[str]] = mapped_column(String(200))
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    result_summary: Mapped[Optional[dict]] = mapped_column(JSON)
    org_id = mapped_column(UUID(as_uuid=False), nullable=False, index=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String(200))
    actor_name: Mapped[Optional[str]] = mapped_column(String(200))
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(200))
    entity_name: Mapped[Optional[str]] = mapped_column(String(500))
    old_value: Mapped[Optional[dict]] = mapped_column(JSON)
    new_value: Mapped[Optional[dict]] = mapped_column(JSON)
    metadata_extra: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    org_id = mapped_column(UUID(as_uuid=False), nullable=False, index=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_user_roles_org_user"),)

    id = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class DealCollaborator(Base):
    __tablename__ = "deal_collaborators"

    deal_id = mapped_column(UUID(as_uuid=False), primary_key=True)
    user_id: Mapped[str] = mapped_column(Text, primary_key=True, index=True)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    org_id = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session