from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped, relationship
from sqlalchemy import String, Float, Integer, Text, DateTime, ForeignKey, JSON
from pgvector.sqlalchemy import Vector
from datetime import datetime
from typing import Optional, List
import uuid
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
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
    owner: Mapped[Optional[str]] = mapped_column(String(200))
    win_probability: Mapped[Optional[float]] = mapped_column(Float)
    probability_low: Mapped[Optional[float]] = mapped_column(Float)
    probability_high: Mapped[Optional[float]] = mapped_column(Float)
    time_to_close_days: Mapped[Optional[int]] = mapped_column(Integer)
    score_summary: Mapped[Optional[str]] = mapped_column(Text)
    risk_flags: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    # V2 additions
    signals: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    meddic: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    brief: Mapped[Optional[str]] = mapped_column(Text)
    brief_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_scored_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    documents: Mapped[List["Document"]] = relationship("Document", back_populates="deal", lazy="select")
    score_history: Mapped[List["ScoreHistory"]] = relationship("ScoreHistory", back_populates="deal", lazy="select")
    transcriptions: Mapped[List["CallTranscription"]] = relationship("CallTranscription", back_populates="deal", lazy="select")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id: Mapped[str] = mapped_column(String, ForeignKey("deals.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(500))
    source_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="processing")
    content: Mapped[Optional[str]] = mapped_column(Text)
    # V2 additions
    sentiment_score: Mapped[Optional[float]] = mapped_column(Float)
    sentiment_label: Mapped[Optional[str]] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

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

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("deals.id", ondelete="SET NULL"), nullable=True)
    query: Mapped[str] = mapped_column(Text)
    proposal: Mapped[Optional[dict]] = mapped_column(JSON)
    raw_answer: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    decision: Mapped[Optional[str]] = mapped_column(String(20))
    decided_by: Mapped[Optional[str]] = mapped_column(String(200))
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── V2 New Models ──────────────────────────────────────────────────────────


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


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
