"""
Ask AI Router — /deals/{deal_id}/ask-ai/*

Endpoints:
  POST   /{deal_id}/ask-ai/query              — SSE streaming ReAct agent query
  GET    /{deal_id}/ask-ai/conversations      — List past conversations
  GET    /{deal_id}/ask-ai/conversations/{id} — Get conversation with full message history
  DELETE /{deal_id}/ask-ai/conversations/{id} — Delete conversation
  POST   /{deal_id}/ask-ai/suggest            — Generate smart suggested questions
  GET    /{deal_id}/ask-ai/graph/stats        — Knowledge graph coverage stats

The query endpoint streams SSE events:
  data: {"type": "thinking",   "content": "..."}\n\n
  data: {"type": "tool_call",  "tool": "...", "label": "..."}\n\n
  data: {"type": "observation","content": "..."}\n\n
  data: {"type": "answer",     "content": "...", "sources": [...], "suggestions": [...],
                                "conversation_id": "..."}\n\n
  data: {"type": "done"}\n\n
"""
import asyncio
import json
import logging
import uuid
from typing import Optional

import openai
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db, AsyncSessionLocal
from app.dependencies import get_org_id
from app.rate_limit import limiter, AI_RATE, track_ai_usage
from app.services.react_agent import (
    ReActAgent,
    build_deal_summary,
    build_conversation_context,
)
from app.services.ask_ai_tools import AskAITools
from app.services.activity_service import log_activity
from app.services.tracking_service import track_ai_feature
from app.config import settings

logger = logging.getLogger("synvelo.ask_ai_router")

router = APIRouter(prefix="/deals", tags=["ask-ai"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AskAIQueryRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None


class SuggestRequest(BaseModel):
    pass  # no body needed


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _verify_deal(deal_id: str, org_id: str, db: AsyncSession) -> str:
    """Verify deal belongs to org; return deal name."""
    result = await db.execute(text("""
        SELECT name FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
    """), {"id": deal_id, "org_id": org_id})
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Deal not found")
    return row.name


async def _get_or_create_conversation(
    deal_id: str,
    conversation_id: Optional[str],
    db: AsyncSession,
) -> str:
    """Load existing conversation or create a new one. Returns conversation UUID."""
    if conversation_id:
        result = await db.execute(text("""
            SELECT id FROM deal_ai_conversations
            WHERE id = CAST(:id AS uuid) AND deal_id = CAST(:deal_id AS uuid)
        """), {"id": conversation_id, "deal_id": deal_id})
        row = result.fetchone()
        if row:
            return str(row.id)

    # Create new
    new_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO deal_ai_conversations (id, deal_id, user_id, messages)
        VALUES (CAST(:id AS uuid), CAST(:deal_id AS uuid), 'default', '[]'::jsonb)
    """), {"id": new_id, "deal_id": deal_id})
    await db.commit()
    return new_id


async def _append_messages(
    conv_id: str,
    user_message: str,
    ai_answer: str,
    sources: list,
    suggestions: list,
    steps: list,
) -> None:
    """Save user+assistant message pair to conversation. Uses own session."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(text("""
                SELECT messages, title FROM deal_ai_conversations
                WHERE id = CAST(:id AS uuid)
            """), {"id": conv_id})
            row = result.fetchone()
            if not row:
                return

            msgs = row.messages or []
            if isinstance(msgs, str):
                try:
                    msgs = json.loads(msgs)
                except Exception:
                    msgs = []

            msgs.append({
                "role": "user",
                "content": user_message,
                "timestamp": _now_iso(),
            })
            msgs.append({
                "role": "assistant",
                "content": ai_answer,
                "sources": sources,
                "suggestions": suggestions,
                "steps": steps,
                "timestamp": _now_iso(),
            })

            # Auto-title from first user message
            title = row.title
            if not title and user_message:
                title = user_message[:60] + ("…" if len(user_message) > 60 else "")

            # Rolling summary after 8+ messages
            summary = None
            if len(msgs) >= 8:
                summary = await _generate_summary(msgs[:-4])  # summarize all but last 4

            params: dict = {
                "id": conv_id,
                "messages": json.dumps(msgs),
                "title": title,
            }

            if summary:
                await db.execute(text("""
                    UPDATE deal_ai_conversations
                    SET messages = CAST(:messages AS jsonb),
                        title    = :title,
                        summary  = :summary,
                        updated_at = now()
                    WHERE id = CAST(:id AS uuid)
                """), {**params, "summary": summary})
            else:
                await db.execute(text("""
                    UPDATE deal_ai_conversations
                    SET messages   = CAST(:messages AS jsonb),
                        title      = :title,
                        updated_at = now()
                    WHERE id = CAST(:id AS uuid)
                """), params)

            await db.commit()
    except Exception:
        logger.exception("Failed to save conversation messages")


async def _generate_summary(messages: list) -> Optional[str]:
    """Compress older conversation messages into a summary paragraph."""
    try:
        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        history = "\n".join(
            f"{'User' if m['role'] == 'user' else 'AI'}: {str(m.get('content', ''))[:200]}"
            for m in messages[-12:]
        )
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize this sales deal conversation in 2-3 sentences. "
                        "Focus on what was asked and what key facts were established."
                    ),
                },
                {"role": "user", "content": history},
            ],
            max_tokens=150,
            temperature=0.1,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return None


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ── SSE Generator ─────────────────────────────────────────────────────────────

async def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _query_stream(
    deal_id: str,
    org_id: str,
    message: str,
    conversation_id: Optional[str],
    db: AsyncSession,
):
    """
    Async generator that runs the ReAct loop and yields SSE event strings.
    Saves conversation history after the answer is yielded.
    """
    # Resolve conversation
    try:
        conv_id = await _get_or_create_conversation(deal_id, conversation_id, db)
    except Exception:
        conv_id = str(uuid.uuid4())

    # Build agent context
    deal_summary = await build_deal_summary(deal_id, db)
    conv_context = await build_conversation_context(conv_id, db)

    # Instantiate tools + agent
    tools = AskAITools(deal_id=deal_id, db=db)
    agent = ReActAgent(
        tools=tools,
        deal_summary=deal_summary,
        conversation_context=conv_context,
    )

    # Collect data for persistence
    collected_steps: list = []
    final_answer = ""
    final_sources: list = []
    final_suggestions: list = []

    # Stream ReAct events
    async for event in agent.run(message):
        yield await _sse_event(event)

        if event["type"] in ("thinking", "tool_call"):
            collected_steps.append({
                "type": event["type"],
                "content": event.get("content") or event.get("label", ""),
                "tool": event.get("tool"),
            })
        elif event["type"] == "answer":
            final_answer = event.get("content", "")
            final_sources = event.get("sources", [])
            final_suggestions = event.get("suggestions", [])
            # Inject conversation_id into the answer event so frontend stores it
            yield await _sse_event({
                "type": "conversation_id",
                "conversation_id": conv_id,
            })

    yield await _sse_event({"type": "done"})

    # Persist after streaming is complete
    asyncio.create_task(
        _append_messages(
            conv_id=conv_id,
            user_message=message,
            ai_answer=final_answer,
            sources=final_sources,
            suggestions=final_suggestions,
            steps=collected_steps,
        )
    )

    # Log activity (fire and forget)
    asyncio.create_task(
        log_activity(
            org_id=org_id,
            event_type="deal_ask_ai",
            entity_type="deal",
            entity_id=deal_id,
            new_value={
                "query": message[:200],
                "intent": "react_agent",
                "steps": len(collected_steps),
            },
        )
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{deal_id}/ask-ai/query")
@limiter.limit(AI_RATE)
async def ask_ai_query(
    request: Request,
    deal_id: str,
    body: AskAIQueryRequest,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """
    Stream a ReAct-agent response for a deal intelligence question.
    Returns Server-Sent Events (text/event-stream).
    """
    await _verify_deal(deal_id, org_id, db)
    await track_ai_usage(org_id, "ask_ai_v2")

    return StreamingResponse(
        _query_stream(
            deal_id=deal_id,
            org_id=org_id,
            message=body.message,
            conversation_id=body.conversation_id,
            db=db,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/{deal_id}/ask-ai/conversations")
async def list_conversations(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """List all past Ask AI conversations for a deal."""
    await _verify_deal(deal_id, org_id, db)

    result = await db.execute(text("""
        SELECT id, title, created_at, updated_at,
               jsonb_array_length(messages) AS message_count
        FROM deal_ai_conversations
        WHERE deal_id = CAST(:deal_id AS uuid)
        ORDER BY updated_at DESC
        LIMIT 20
    """), {"deal_id": deal_id})
    rows = result.fetchall()

    return {
        "conversations": [
            {
                "id": str(row.id),
                "title": row.title or "Untitled conversation",
                "message_count": row.message_count or 0,
                "created_at": str(row.created_at),
                "updated_at": str(row.updated_at),
            }
            for row in rows
        ]
    }


@router.get("/{deal_id}/ask-ai/conversations/{conv_id}")
async def get_conversation(
    deal_id: str,
    conv_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Get a specific conversation with full message history."""
    await _verify_deal(deal_id, org_id, db)

    result = await db.execute(text("""
        SELECT id, title, messages, summary, created_at, updated_at
        FROM deal_ai_conversations
        WHERE id = CAST(:id AS uuid) AND deal_id = CAST(:deal_id AS uuid)
    """), {"id": conv_id, "deal_id": deal_id})
    row = result.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msgs = row.messages or []
    if isinstance(msgs, str):
        try:
            msgs = json.loads(msgs)
        except Exception:
            msgs = []

    return {
        "id": str(row.id),
        "title": row.title or "Untitled conversation",
        "messages": msgs,
        "summary": row.summary,
        "created_at": str(row.created_at),
        "updated_at": str(row.updated_at),
    }


@router.delete("/{deal_id}/ask-ai/conversations/{conv_id}")
async def delete_conversation(
    deal_id: str,
    conv_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Delete a conversation and all its messages."""
    await _verify_deal(deal_id, org_id, db)

    await db.execute(text("""
        DELETE FROM deal_ai_conversations
        WHERE id = CAST(:id AS uuid) AND deal_id = CAST(:deal_id AS uuid)
    """), {"id": conv_id, "deal_id": deal_id})
    await db.commit()
    return {"deleted": True}


@router.post("/{deal_id}/ask-ai/suggest")
@limiter.limit("30/minute")
async def suggest_questions(
    request: Request,
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """
    Generate 3 smart suggested questions based on the current deal state.
    Replaces the hardcoded suggestions in the empty chat state.
    """
    await _verify_deal(deal_id, org_id, db)

    # Gather deal snapshot
    result = await db.execute(text("""
        SELECT stage, win_probability, meddic, risk_flags, score_summary,
               EXTRACT(EPOCH FROM (now() - COALESCE(stage_entered_at, created_at)))/86400 AS days_in_stage
        FROM deals WHERE id = CAST(:id AS uuid)
    """), {"id": deal_id})
    row = result.fetchone()

    if not row:
        return {"suggestions": _default_suggestions()}

    stage = row.stage or "Discovery"
    days = int(float(row.days_in_stage or 0))
    prob = round(float(row.win_probability or 0) * 100) if row.win_probability else None

    # Build context for suggestion generation
    context_parts = [f"Stage: {stage} ({days} days)"]
    if prob is not None:
        context_parts.append(f"Win probability: {prob}%")

    meddic = row.meddic
    if meddic:
        if isinstance(meddic, str):
            try:
                meddic = json.loads(meddic)
            except Exception:
                meddic = {}
        if isinstance(meddic, dict):
            low_dims = [
                k.replace("_", " ") for k, v in meddic.items()
                if isinstance(v, dict) and float(v.get("score", 1)) < 0.4
            ]
            if low_dims:
                context_parts.append(f"Weak MEDDIC areas: {', '.join(low_dims[:3])}")

    risk_flags = row.risk_flags
    if risk_flags:
        if isinstance(risk_flags, str):
            try:
                risk_flags = json.loads(risk_flags)
            except Exception:
                risk_flags = []
        if isinstance(risk_flags, list) and risk_flags:
            context_parts.append(f"Active risks: {', '.join(str(r) for r in risk_flags[:2])}")

    context = ". ".join(context_parts)

    try:
        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generate exactly 3 short, specific questions a sales rep would ask "
                        "their AI assistant about this deal. Make them concrete and actionable. "
                        "Return JSON: {\"suggestions\": [\"q1\", \"q2\", \"q3\"]}"
                    ),
                },
                {"role": "user", "content": context},
            ],
            response_format={"type": "json_object"},
            max_tokens=200,
            temperature=0.7,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        suggestions = data.get("suggestions", [])
        if len(suggestions) >= 3:
            return {"suggestions": suggestions[:3]}
    except Exception:
        pass

    return {"suggestions": _default_suggestions(stage)}


@router.get("/{deal_id}/ask-ai/graph/stats")
async def graph_stats(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Return knowledge graph coverage statistics for a deal."""
    await _verify_deal(deal_id, org_id, db)

    # Node counts by type
    node_result = await db.execute(text("""
        SELECT node_type, COUNT(*) AS cnt
        FROM deal_kg_nodes
        WHERE deal_id = CAST(:deal_id AS uuid)
        GROUP BY node_type
    """), {"deal_id": deal_id})
    nodes_by_type = {row.node_type: row.cnt for row in node_result.fetchall()}
    total_nodes = sum(nodes_by_type.values())

    # Edge count
    edge_result = await db.execute(text("""
        SELECT COUNT(*) AS cnt FROM deal_kg_edges
        WHERE deal_id = CAST(:deal_id AS uuid)
    """), {"deal_id": deal_id})
    edge_row = edge_result.fetchone()
    total_edges = edge_row.cnt if edge_row else 0

    # Chunk count (existing RAG chunks)
    chunk_result = await db.execute(text("""
        SELECT COUNT(*) AS cnt FROM chunks
        WHERE deal_id = CAST(:deal_id AS uuid)
    """), {"deal_id": deal_id})
    chunk_row = chunk_result.fetchone()
    total_chunks = chunk_row.cnt if chunk_row else 0

    # Last KG node created
    last_result = await db.execute(text("""
        SELECT MAX(created_at) AS last_at FROM deal_kg_nodes
        WHERE deal_id = CAST(:deal_id AS uuid)
    """), {"deal_id": deal_id})
    last_row = last_result.fetchone()
    last_indexed = str(last_row.last_at) if last_row and last_row.last_at else None

    # Coverage score: based on chunk count + node count
    coverage = min(1.0, (total_chunks * 0.1 + total_nodes * 0.5) / 10.0)

    return {
        "total_nodes": total_nodes,
        "nodes_by_type": nodes_by_type,
        "total_edges": total_edges,
        "total_chunks": total_chunks,
        "last_indexed_at": last_indexed,
        "coverage_score": round(coverage, 2),
    }


# ── Default suggestions (fallback) ────────────────────────────────────────────

def _default_suggestions(stage: str = "Discovery") -> list[str]:
    stage_suggestions = {
        "Discovery":     ["Who is the decision maker?", "What are the main pain points?", "What is the timeline?"],
        "Qualification": ["What are our MEDDIC gaps?", "Who is the economic buyer?", "What's the decision process?"],
        "Demo":          ["What objections came up?", "What was the sentiment after the demo?", "What are the next steps?"],
        "Proposal":      ["Has the proposal been reviewed?", "What are the outstanding questions?", "Who needs to approve?"],
        "Negotiation":   ["What are the sticking points?", "What should I do to close this deal?", "Are there any risks?"],
        "Closed Won":    ["What made this deal successful?", "What were the key win factors?", "Any lessons for future deals?"],
        "Closed Lost":   ["Why did we lose this deal?", "What objections weren't resolved?", "What could we have done differently?"],
    }
    return stage_suggestions.get(stage, [
        "Who is the decision maker?",
        "What objections were raised?",
        "What is the timeline?",
    ])
