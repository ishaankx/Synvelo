"""
Ask AI — ReAct Agent Orchestrator

Implements the Thought → Action → Observation loop for multi-step
deal intelligence queries. Streams SSE events to the frontend as it works.

SSE event types emitted (newline-delimited JSON):
  {"type": "thinking",   "content": "..."}          — agent's reasoning step
  {"type": "tool_call",  "tool": "...", "label": "..."} — tool being called
  {"type": "observation","content": "..."}           — tool result (compact)
  {"type": "answer",     "content": "...",
                         "sources": [...],
                         "suggestions": [...]}       — final answer
  {"type": "error",      "content": "..."}           — something went wrong

Design:
- JSON structured output (json_object mode) for every iteration
- Tools execute against the deal's DB via AskAITools
- Observations compressed to ≤3000 chars before injecting into context
- Max 6 iterations; falls back gracefully if limit hit
- Conversation context included (rolling summary + last 4 messages)
"""
import json
import logging
from typing import AsyncGenerator, Optional

import openai
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.ask_ai_tools import AskAITools

logger = logging.getLogger("synvelo.react_agent")

MAX_ITERATIONS = 6

# ── Tool registry ─────────────────────────────────────────────────────────────

TOOL_REGISTRY: dict[str, dict] = {
    "search_documents": {
        "description": "Semantically search uploaded documents, call transcripts, and notes",
        "params": {
            "query": "string — what to search for",
            "source_type": "optional string — 'pdf', 'audio', or 'text' to narrow by file type",
            "limit": "optional int (default 5)",
        },
    },
    "get_deal_state": {
        "description": "Get current deal stage, value, win probability, trend, and risk flags",
        "params": {},
    },
    "get_meddic_assessment": {
        "description": "Get MEDDIC qualification scores, gaps, and completeness percentage",
        "params": {},
    },
    "search_activities": {
        "description": "Search deal activity log: stage changes, scoring events, AI queries, uploads",
        "params": {
            "query": "optional string — keyword filter",
            "limit": "optional int (default 10)",
            "after": "optional ISO date string — only activities after this date",
        },
    },
    "get_exit_criteria_status": {
        "description": "Get stage exit criteria and what's completed vs. pending",
        "params": {},
    },
    "get_signals": {
        "description": "Get AI-extracted deal signals: buying intent, urgency, budget, competition",
        "params": {
            "sentiment": "optional 'positive' or 'negative' to filter",
        },
    },
    "search_knowledge_graph": {
        "description": "Search for entities and relationships: people, objections, requirements, decisions. Falls back to document search if graph is empty.",
        "params": {
            "query": "string — entity or topic to find",
            "node_types": "optional list — e.g. ['person','objection','competitor']",
            "limit": "optional int (default 10)",
        },
    },
    "get_stakeholder_map": {
        "description": "Get all people involved in this deal with their roles",
        "params": {},
    },
    "search_product_help": {
        "description": "Get help on how to USE Synvelo (navigation, features). Use ONLY for product how-to questions, not deal questions.",
        "params": {
            "query": "string — what feature or action you need help with",
        },
    },
}


def _format_tool_list() -> str:
    lines = []
    for name, info in TOOL_REGISTRY.items():
        params = ", ".join(f"{k}: {v}" for k, v in info["params"].items())
        paren = f"({params})" if params else "()"
        lines.append(f"- **{name}{paren}**: {info['description']}")
    return "\n".join(lines)


# Pre-formatted at module load (never changes)
_TOOL_LIST_STR = _format_tool_list()

REACT_SYSTEM_PROMPT = """You are ARIA, an AI Revenue Intelligence Agent for Synvelo — a B2B sales intelligence platform.
Your job: answer questions about a specific sales deal by reasoning step-by-step and calling tools to gather facts.

## Tools Available
{tool_list}

## Strict Response Format (ALWAYS return valid JSON — no other text)

To call a tool:
{{"type": "action", "thought": "<your reasoning>", "tool": "<tool_name>", "params": {{<params>}}}}

To give the final answer (when you have enough information):
{{"type": "final_answer", "answer": "<your answer>", "sources": ["<source1>", "<source2>"], "suggestions": ["<q1>", "<q2>", "<q3>"]}}

## Rules
1. "thought" MUST explain WHY you're calling this tool before each action
2. Call EXACTLY ONE tool per response — never two
3. For factual queries (stage, contacts, value): one tool call is enough
4. For coaching/strategy queries: gather deal state + MEDDIC + recent activities
5. Distinguish deal-specific facts (from tools) from general sales advice (your knowledge)
6. Sources: list actual filenames, dates, or event names — not generic labels
7. Suggestions: 2-3 specific follow-up questions based on what you found
8. If a tool returns empty/missing data, say so — never fabricate deal facts
9. Answer in second person ("your deal", "you haven't contacted...")
10. Keep answers concise but specific — reference actual data points

## Current Deal
{deal_summary}

## Prior Conversation Context
{conversation_context}"""


class ReActAgent:
    """
    Runs the Thought → Action → Observation loop and streams SSE events.
    Instantiated per request (stateless between requests).
    """

    def __init__(
        self,
        tools: AskAITools,
        deal_summary: str,
        conversation_context: str,
    ):
        self.tools = tools
        self.deal_summary = deal_summary
        self.conversation_context = conversation_context
        self.client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    async def run(self, query: str) -> AsyncGenerator[dict, None]:
        """
        Execute the ReAct loop for a user query.
        Yields SSE event dicts; caller serializes to text/event-stream.
        """
        system_prompt = REACT_SYSTEM_PROMPT.format(
            tool_list=_TOOL_LIST_STR,
            deal_summary=self.deal_summary,
            conversation_context=self.conversation_context,
        )

        # Conversation messages for the loop
        messages: list[dict] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ]
        # Scratchpad grows with (assistant action + user observation) pairs
        scratchpad: list[dict] = []

        for iteration in range(MAX_ITERATIONS):
            # ── Call LLM ────────────────────────────────────────────────────
            try:
                full_msgs = messages + scratchpad
                response = await self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=full_msgs,
                    response_format={"type": "json_object"},
                    temperature=0.15,
                    max_tokens=900,
                )
                raw = response.choices[0].message.content or "{}"
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("LLM returned non-JSON; forcing final answer")
                yield {
                    "type": "answer",
                    "content": "I had trouble processing that. Please try rephrasing your question.",
                    "sources": [],
                    "suggestions": [],
                }
                return
            except Exception as e:
                logger.error("LLM call failed: %s", e)
                yield {"type": "error", "content": "AI service temporarily unavailable."}
                return

            response_type = parsed.get("type", "")

            # ── Final answer ─────────────────────────────────────────────────
            if response_type == "final_answer":
                yield {
                    "type": "answer",
                    "content": parsed.get("answer", ""),
                    "sources": parsed.get("sources", []),
                    "suggestions": parsed.get("suggestions", []),
                }
                return

            # ── Tool action ──────────────────────────────────────────────────
            elif response_type == "action":
                thought = parsed.get("thought", "").strip()
                tool_name = parsed.get("tool", "").strip()
                params = parsed.get("params", {})

                # Emit thinking if non-trivial
                if thought:
                    yield {"type": "thinking", "content": thought}

                # Validate tool name
                if tool_name not in TOOL_REGISTRY:
                    obs_str = json.dumps({"error": f"Unknown tool '{tool_name}'"})
                    scratchpad.append({"role": "assistant", "content": raw})
                    scratchpad.append({
                        "role": "user",
                        "content": f"OBSERVATION: {obs_str}",
                    })
                    continue

                # Build user-facing label for the tool call
                tool_label = _tool_label(tool_name, params)
                yield {"type": "tool_call", "tool": tool_name, "label": tool_label}

                # Execute tool
                tool_fn = getattr(self.tools, tool_name, None)
                try:
                    observation = await tool_fn(**params)
                except TypeError as e:
                    # Bad params from LLM
                    observation = {"error": f"Invalid parameters: {e}"}
                except Exception as e:
                    logger.warning("Tool %s failed: %s", tool_name, e)
                    observation = {"error": str(e)}

                # Compress + emit observation (not shown to user, fed back to LLM)
                obs_str = _compress_observation(observation)
                yield {"type": "observation", "content": obs_str}

                # Append to scratchpad for next LLM iteration
                scratchpad.append({"role": "assistant", "content": raw})
                scratchpad.append({
                    "role": "user",
                    "content": f"OBSERVATION: {obs_str}",
                })

            else:
                # Unexpected format — extract whatever answer is present
                answer = (
                    parsed.get("answer")
                    or parsed.get("content")
                    or "I couldn't formulate a complete answer."
                )
                yield {
                    "type": "answer",
                    "content": str(answer),
                    "sources": [],
                    "suggestions": [],
                }
                return

        # ── Hit max iterations ────────────────────────────────────────────────
        yield {
            "type": "answer",
            "content": (
                "I've gathered available deal information but reached my analysis limit. "
                "Here's what I found based on the data retrieved. Try asking a more specific question."
            ),
            "sources": [],
            "suggestions": ["Can you be more specific about what you're looking for?"],
        }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tool_label(tool_name: str, params: dict) -> str:
    """Human-readable label for a tool call, shown in the thinking trace."""
    labels = {
        "search_documents": lambda p: f"Searching documents for \"{p.get('query', '')}\"",
        "get_deal_state": lambda _: "Checking deal state and win probability",
        "get_meddic_assessment": lambda _: "Reviewing MEDDIC qualification scores",
        "search_activities": lambda p: (
            f"Searching activities for \"{p.get('query', '')}\"" if p.get("query")
            else "Loading recent deal activities"
        ),
        "get_exit_criteria_status": lambda _: "Checking stage exit criteria",
        "get_signals": lambda _: "Reading deal signals",
        "search_knowledge_graph": lambda p: f"Searching knowledge graph for \"{p.get('query', '')}\"",
        "get_stakeholder_map": lambda _: "Loading stakeholder map",
        "search_product_help": lambda p: f"Looking up help for \"{p.get('query', '')}\"",
    }
    fn = labels.get(tool_name)
    return fn(params) if fn else f"Calling {tool_name}"


def _compress_observation(obs: dict) -> str:
    """
    Serialize observation and truncate to ≤3000 chars.
    Preserves structure but trims long content fields.
    """
    # Trim long text content to keep context lean
    if isinstance(obs, dict):
        chunks = obs.get("chunks")
        if isinstance(chunks, list):
            for chunk in chunks:
                if isinstance(chunk, dict) and len(chunk.get("content", "")) > 500:
                    chunk["content"] = chunk["content"][:500] + "…"

        nodes = obs.get("nodes")
        if isinstance(nodes, list) and len(nodes) > 5:
            obs["nodes"] = nodes[:5]
            obs["nodes_truncated"] = True

        activities = obs.get("activities")
        if isinstance(activities, list):
            for act in activities:
                if isinstance(act.get("details"), dict):
                    # Keep only the most informative fields
                    details = act["details"]
                    for key in list(details.keys()):
                        if isinstance(details[key], str) and len(details[key]) > 200:
                            details[key] = details[key][:200] + "…"

    serialized = json.dumps(obs, default=str)
    if len(serialized) <= 3000:
        return serialized

    # Hard truncate as last resort
    return serialized[:2950] + '…"}'


# ── Deal summary builder ──────────────────────────────────────────────────────

async def build_deal_summary(deal_id: str, db: AsyncSession) -> str:
    """One-paragraph deal snapshot injected into every system prompt."""
    from sqlalchemy import text

    try:
        result = await db.execute(text("""
            SELECT name, company, stage, value, currency, owner,
                   win_probability,
                   EXTRACT(EPOCH FROM (
                       now() - COALESCE(stage_entered_at, created_at)
                   ))/86400 AS days_in_stage,
                   score_summary
            FROM deals WHERE id = CAST(:id AS uuid)
        """), {"id": deal_id})
        row = result.fetchone()

        if not row:
            return "Deal not found."

        prob_str = f"{round(float(row.win_probability) * 100)}%" if row.win_probability else "Not scored"
        days = int(float(row.days_in_stage or 0))
        val = f"{row.currency or 'USD'} {float(row.value or 0):,.0f}"
        summary = (
            f"**{row.name}** | {row.company} | Stage: {row.stage} ({days}d) | "
            f"Value: {val} | Win Prob: {prob_str} | Owner: {row.owner}"
        )
        if row.score_summary:
            summary += f"\nAI Assessment: {row.score_summary[:200]}"
        return summary
    except Exception:
        return "Deal summary unavailable."


async def build_conversation_context(conv_id: Optional[str], db: AsyncSession) -> str:
    """
    Rolling context from conversation history.
    Uses stored summary + last 4 messages to stay within token budget.
    """
    if not conv_id:
        return "No prior conversation."

    from sqlalchemy import text

    try:
        result = await db.execute(text("""
            SELECT messages, summary FROM deal_ai_conversations
            WHERE id = CAST(:id AS uuid)
        """), {"id": conv_id})
        row = result.fetchone()

        if not row:
            return "No prior conversation."

        msgs = row.messages or []
        if isinstance(msgs, str):
            try:
                msgs = json.loads(msgs)
            except Exception:
                msgs = []

        if not msgs:
            return "No prior conversation."

        parts = []
        if row.summary:
            parts.append(f"Summary of earlier conversation: {row.summary}")

        recent = msgs[-4:] if len(msgs) > 4 else msgs
        for msg in recent:
            role = "User" if msg.get("role") == "user" else "AI"
            content = str(msg.get("content", ""))[:300]
            parts.append(f"{role}: {content}")

        return "\n".join(parts)
    except Exception:
        return "No prior conversation."
