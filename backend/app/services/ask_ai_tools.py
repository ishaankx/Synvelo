"""
Ask AI ReAct Toolkit

Tools available to the ReAct agent during query resolution.
All tools query the deal's data sources (chunks, activities, MEDDIC, etc.)
and return structured dicts that the agent reasons over.

Design principles:
- Every tool is scoped to a single deal_id (set at construction)
- Tools gracefully return empty results rather than raising exceptions
- Results are compact (truncated where necessary) to fit in context
"""
import json
import logging
from typing import Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger("synvelo.ask_ai_tools")

# Synvelo product help — static guide for "how do I use this app" queries
_PRODUCT_HELP_GUIDES = {
    "upload": "Upload documents in the Documents tab — drag-and-drop or click to browse. Supports PDF, audio (mp3/m4a/wav), and text files. Files are automatically chunked, embedded, and indexed for AI search.",
    "meddic": "MEDDIC scores are in the MEDDIC tab of every deal. Six dimensions: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion — each with a 0–1 confidence score and AI-generated notes.",
    "stage": "Advance a deal via the Pipeline tab. Click the next stage button or use the stage advancement panel. Exit criteria must be reviewed before transitioning. Stage history is preserved.",
    "score": "Click 'Score Deal' at the top of any deal page. The AI reads all uploaded documents and generates a win probability (with confidence interval), risk flags, and deal signals.",
    "journey": "Journey Reports are in the Journey tab. Click 'Generate Journey Report' for an LLM-synthesized chronological narrative with timeline charts, risk assessment, and next steps.",
    "transcription": "In the Calls tab, upload an audio file or paste a meeting URL. The AI transcribes the call, analyzes sentiment per speaker, and adds it to the deal's searchable knowledge base.",
    "signals": "The Signals tab shows buying signals (intent, urgency, budget, timeline, competition) extracted from all deal documents and calls.",
    "nexus": "NEXUS Revenue Simulation is in the sidebar. It trains an XGBoost model on your historical deals and simulates outcomes for active deals. Requires ≥20 closed deals to train.",
    "activity": "The Activity Log (sidebar) shows a real-time feed of all actions across all deals — scoring events, stage changes, document uploads, AI queries, and more.",
    "analytics": "Analytics dashboard (sidebar) shows pipeline summary: total value by stage, deal count, average win probability, and velocity metrics.",
}


class AskAITools:
    """
    Per-deal tool suite for the ReAct agent.
    Instantiated fresh for each query (carries deal_id + db session).
    """

    def __init__(self, deal_id: str, db: AsyncSession):
        self.deal_id = deal_id
        self.db = db

    # ── 1. Document / transcript search ──────────────────────────────────────

    async def search_documents(
        self,
        query: str,
        source_type: Optional[str] = None,
        limit: int = 5,
    ) -> dict:
        """
        Semantically search uploaded documents, call transcripts, and notes.

        Args:
            query: What to search for (natural language)
            source_type: Optional filter — 'pdf', 'audio', 'text'
            limit: Max number of chunks to return (default 5)
        """
        from app.services.embeddings import embed_single

        if not query.strip():
            return {"chunks": [], "total_found": 0}

        try:
            embedding = await embed_single(query)
            emb_str = "[" + ",".join(str(x) for x in embedding) + "]"

            if source_type:
                sql = text("""
                    SELECT text, source_type, filename, chunk_index,
                           1 - (embedding <=> CAST(:emb AS vector)) AS similarity
                    FROM chunks
                    WHERE deal_id = CAST(:deal_id AS uuid)
                      AND source_type = :source_type
                    ORDER BY embedding <=> CAST(:emb AS vector)
                    LIMIT :limit
                """)
                params = {"emb": emb_str, "deal_id": self.deal_id,
                          "source_type": source_type, "limit": limit}
            else:
                sql = text("""
                    SELECT text, source_type, filename, chunk_index,
                           1 - (embedding <=> CAST(:emb AS vector)) AS similarity
                    FROM chunks
                    WHERE deal_id = CAST(:deal_id AS uuid)
                    ORDER BY embedding <=> CAST(:emb AS vector)
                    LIMIT :limit
                """)
                params = {"emb": emb_str, "deal_id": self.deal_id, "limit": limit}

            result = await self.db.execute(sql, params)
            rows = result.fetchall()

            return {
                "chunks": [
                    {
                        "content": row.text[:600],
                        "source_type": row.source_type,
                        "filename": row.filename,
                        "similarity": round(float(row.similarity), 3),
                    }
                    for row in rows
                ],
                "total_found": len(rows),
            }
        except Exception as e:
            logger.warning("search_documents failed: %s", e)
            return {"chunks": [], "total_found": 0, "error": str(e)}

    # ── 2. Deal state snapshot ────────────────────────────────────────────────

    async def get_deal_state(self) -> dict:
        """
        Get comprehensive current state of the deal: stage, value, velocity,
        win probability trend, risk flags, and key metadata.
        """
        try:
            result = await self.db.execute(text("""
                SELECT
                    d.name, d.company, d.stage, d.value, d.currency, d.owner,
                    d.win_probability, d.probability_low, d.probability_high,
                    d.score_summary, d.risk_flags, d.signals,
                    d.time_to_close_days, d.last_scored_at, d.created_at,
                    d.stage_entered_at,
                    EXTRACT(EPOCH FROM (
                        now() - COALESCE(d.stage_entered_at, d.created_at)
                    ))/86400 AS days_in_stage,
                    (
                        SELECT sh.win_probability
                        FROM score_history sh
                        WHERE sh.deal_id = d.id
                        ORDER BY sh.scored_at DESC
                        OFFSET 1 LIMIT 1
                    ) AS prev_win_probability
                FROM deals d
                WHERE d.id = CAST(:deal_id AS uuid)
            """), {"deal_id": self.deal_id})
            row = result.fetchone()

            if not row:
                return {"error": "Deal not found"}

            # Compute win probability trend
            trend = "not_scored"
            if row.win_probability is not None:
                if row.prev_win_probability is not None:
                    delta = float(row.win_probability) - float(row.prev_win_probability)
                    trend = "improving" if delta > 0.03 else "declining" if delta < -0.03 else "stable"
                else:
                    trend = "first_score"

            risk_flags = row.risk_flags
            if isinstance(risk_flags, str):
                try:
                    risk_flags = json.loads(risk_flags)
                except Exception:
                    risk_flags = []

            return {
                "name": row.name,
                "company": row.company,
                "stage": row.stage,
                "days_in_stage": round(float(row.days_in_stage or 0), 1),
                "value": float(row.value or 0),
                "currency": row.currency or "USD",
                "owner": row.owner,
                "win_probability": round(float(row.win_probability or 0) * 100, 1) if row.win_probability else None,
                "win_probability_trend": trend,
                "probability_range": (
                    f"{round(float(row.probability_low or 0) * 100)}%–"
                    f"{round(float(row.probability_high or 0) * 100)}%"
                    if row.probability_low else None
                ),
                "score_summary": (row.score_summary or "")[:400],
                "risk_flags": risk_flags[:5] if isinstance(risk_flags, list) else [],
                "time_to_close_days": row.time_to_close_days,
                "last_scored_at": str(row.last_scored_at) if row.last_scored_at else None,
            }
        except Exception as e:
            logger.warning("get_deal_state failed: %s", e)
            return {"error": str(e)}

    # ── 3. MEDDIC assessment ──────────────────────────────────────────────────

    async def get_meddic_assessment(self) -> dict:
        """
        Get MEDDIC qualification scores and gaps. Returns dimension scores,
        notes, and an overall completeness percentage.
        """
        try:
            result = await self.db.execute(text("""
                SELECT meddic FROM deals WHERE id = CAST(:deal_id AS uuid)
            """), {"deal_id": self.deal_id})
            row = result.fetchone()

            if not row or not row.meddic:
                return {
                    "meddic": {},
                    "completeness_pct": 0,
                    "gaps": ["No MEDDIC data available — deal has not been scored yet"],
                }

            meddic = row.meddic
            if isinstance(meddic, str):
                try:
                    meddic = json.loads(meddic)
                except Exception:
                    return {"meddic": {}, "completeness_pct": 0, "gaps": []}

            # Build gap list from dimensions with low scores
            dimensions = ["metrics", "economic_buyer", "decision_criteria",
                          "decision_process", "identify_pain", "champion"]
            gaps = []
            scores = []

            for dim in dimensions:
                val = meddic.get(dim, {})
                if isinstance(val, dict):
                    score = float(val.get("score", 0))
                    scores.append(score)
                    if score < 0.4:
                        label = dim.replace("_", " ").title()
                        note = val.get("notes", "")
                        gaps.append(f"{label} ({round(score * 100)}%): {note[:100]}" if note else f"{label}: incomplete")

            completeness = round(sum(scores) / len(scores) * 100) if scores else 0

            return {
                "meddic": meddic,
                "completeness_pct": completeness,
                "gaps": gaps,
            }
        except Exception as e:
            logger.warning("get_meddic_assessment failed: %s", e)
            return {"error": str(e)}

    # ── 4. Activity search ────────────────────────────────────────────────────

    async def search_activities(
        self,
        query: Optional[str] = None,
        limit: int = 10,
        after: Optional[str] = None,
    ) -> dict:
        """
        Search recent deal activities (stage changes, scoring events, AI queries,
        document uploads, etc.).

        Args:
            query: Optional keyword filter
            limit: Max activities to return (default 10)
            after: Optional ISO date string — only return activities after this date
        """
        try:
            conditions = ["entity_type = 'deal'", "entity_id = CAST(:deal_id AS uuid)"]
            params: dict = {"deal_id": self.deal_id, "limit": limit}

            if query:
                conditions.append(
                    "(event_type ILIKE :q OR new_value::text ILIKE :q "
                    "OR metadata_extra::text ILIKE :q)"
                )
                params["q"] = f"%{query}%"

            if after:
                conditions.append("created_at >= :after")
                params["after"] = after

            where = " AND ".join(conditions)
            sql = text(f"""
                SELECT event_type, actor_name, new_value, old_value,
                       metadata_extra, created_at
                FROM activity_logs
                WHERE {where}
                ORDER BY created_at DESC
                LIMIT :limit
            """)

            result = await self.db.execute(sql, params)
            rows = result.fetchall()

            activities = []
            for row in rows:
                new_val = row.new_value
                if isinstance(new_val, str):
                    try:
                        new_val = json.loads(new_val)
                    except Exception:
                        pass

                meta = row.metadata_extra
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except Exception:
                        pass

                activities.append({
                    "event": row.event_type,
                    "actor": row.actor_name,
                    "details": new_val,
                    "metadata": meta,
                    "timestamp": str(row.created_at),
                })

            return {"activities": activities, "total_found": len(activities)}
        except Exception as e:
            logger.warning("search_activities failed: %s", e)
            return {"activities": [], "total_found": 0, "error": str(e)}

    # ── 5. Exit criteria status ───────────────────────────────────────────────

    async def get_exit_criteria_status(self) -> dict:
        """
        Get current stage exit criteria and completion status.
        Shows what's done and what's still needed to advance the deal.
        """
        try:
            result = await self.db.execute(text("""
                SELECT stage, criterion_text, is_completed, is_custom, completed_at
                FROM deal_exit_criteria
                WHERE deal_id = CAST(:deal_id AS uuid)
                ORDER BY stage, is_completed
            """), {"deal_id": self.deal_id})
            rows = result.fetchall()

            if not rows:
                return {"criteria": [], "message": "No exit criteria found"}

            by_stage: dict = {}
            for row in rows:
                if row.stage not in by_stage:
                    by_stage[row.stage] = {"completed": [], "pending": []}
                item = {
                    "text": row.criterion_text,
                    "custom": row.is_custom,
                    "completed_at": str(row.completed_at) if row.completed_at else None,
                }
                if row.is_completed:
                    by_stage[row.stage]["completed"].append(item)
                else:
                    by_stage[row.stage]["pending"].append(item)

            summary = []
            for stage, data in by_stage.items():
                total = len(data["completed"]) + len(data["pending"])
                summary.append({
                    "stage": stage,
                    "completed": len(data["completed"]),
                    "total": total,
                    "pending_items": [c["text"] for c in data["pending"][:5]],
                })

            return {"by_stage": summary}
        except Exception as e:
            logger.warning("get_exit_criteria_status failed: %s", e)
            return {"criteria": [], "error": str(e)}

    # ── 6. Deal signals ───────────────────────────────────────────────────────

    async def get_signals(self, sentiment: Optional[str] = None) -> dict:
        """
        Get deal signals: buying intent, urgency, budget, timeline, competition.
        These are extracted from all deal documents by the AI scoring engine.

        Args:
            sentiment: Optional 'positive' or 'negative' filter
        """
        try:
            result = await self.db.execute(text("""
                SELECT signals FROM deals WHERE id = CAST(:deal_id AS uuid)
            """), {"deal_id": self.deal_id})
            row = result.fetchone()

            if not row or not row.signals:
                return {"signals": [], "message": "No signals found — score the deal first"}

            signals = row.signals
            if isinstance(signals, str):
                try:
                    signals = json.loads(signals)
                except Exception:
                    return {"signals": []}

            if not isinstance(signals, list):
                return {"signals": []}

            if sentiment:
                signals = [s for s in signals if s.get("sentiment") == sentiment]

            return {"signals": signals[:10], "total": len(signals)}
        except Exception as e:
            logger.warning("get_signals failed: %s", e)
            return {"signals": [], "error": str(e)}

    # ── 7. Knowledge graph search ─────────────────────────────────────────────

    async def search_knowledge_graph(
        self,
        query: str,
        node_types: Optional[list] = None,
        limit: int = 10,
    ) -> dict:
        """
        Search the deal's knowledge graph for entities and relationships.
        Returns nodes (people, objections, requirements, decisions, etc.)
        and their connected edges.

        Falls back to document search if the graph is empty.

        Args:
            query: What entity or topic to search for
            node_types: Optional list of types to filter:
                        'person','objection','requirement','decision',
                        'action_item','competitor','champion','risk'
            limit: Max nodes to return
        """
        from app.services.embeddings import embed_single

        try:
            # Check if KG has any nodes for this deal
            count_result = await self.db.execute(text("""
                SELECT COUNT(*) AS cnt FROM deal_kg_nodes
                WHERE deal_id = CAST(:deal_id AS uuid)
            """), {"deal_id": self.deal_id})
            count_row = count_result.fetchone()
            node_count = count_row.cnt if count_row else 0

            if node_count == 0:
                # Fall back to semantic document search
                doc_result = await self.search_documents(query, limit=min(limit, 5))
                return {
                    "nodes": [],
                    "edges": [],
                    "fallback": True,
                    "fallback_chunks": doc_result.get("chunks", []),
                    "message": "Knowledge graph is empty — showing document search results instead",
                }

            # Semantic node search
            embedding = await embed_single(query)
            emb_str = "[" + ",".join(str(x) for x in embedding) + "]"

            if node_types:
                sql = text("""
                    SELECT id, node_type, label, properties,
                           1 - (embedding <=> CAST(:emb AS vector)) AS similarity
                    FROM deal_kg_nodes
                    WHERE deal_id = CAST(:deal_id AS uuid)
                      AND node_type = ANY(CAST(:types AS text[]))
                    ORDER BY embedding <=> CAST(:emb AS vector)
                    LIMIT :limit
                """)
                params = {
                    "emb": emb_str, "deal_id": self.deal_id,
                    "types": node_types, "limit": limit,
                }
            else:
                sql = text("""
                    SELECT id, node_type, label, properties,
                           1 - (embedding <=> CAST(:emb AS vector)) AS similarity
                    FROM deal_kg_nodes
                    WHERE deal_id = CAST(:deal_id AS uuid)
                    ORDER BY embedding <=> CAST(:emb AS vector)
                    LIMIT :limit
                """)
                params = {"emb": emb_str, "deal_id": self.deal_id, "limit": limit}

            node_result = await self.db.execute(sql, params)
            nodes = node_result.fetchall()

            node_ids = [str(n.id) for n in nodes]

            # Traverse edges (1 hop) from matched nodes
            edges: list = []
            if node_ids:
                edge_result = await self.db.execute(text("""
                    SELECT e.relation_type, e.properties,
                           sn.label AS source_label, sn.node_type AS source_type,
                           tn.label AS target_label, tn.node_type AS target_type
                    FROM deal_kg_edges e
                    JOIN deal_kg_nodes sn ON e.source_node_id = sn.id
                    JOIN deal_kg_nodes tn ON e.target_node_id = tn.id
                    WHERE e.deal_id = CAST(:deal_id AS uuid)
                      AND (
                        e.source_node_id = ANY(CAST(:ids AS uuid[]))
                        OR e.target_node_id = ANY(CAST(:ids AS uuid[]))
                      )
                    LIMIT 20
                """), {"deal_id": self.deal_id, "ids": node_ids})
                edges = [
                    {
                        "from": f"{r.source_label} ({r.source_type})",
                        "relation": r.relation_type,
                        "to": f"{r.target_label} ({r.target_type})",
                    }
                    for r in edge_result.fetchall()
                ]

            return {
                "nodes": [
                    {
                        "type": n.node_type,
                        "label": n.label,
                        "properties": n.properties if isinstance(n.properties, dict) else {},
                        "similarity": round(float(n.similarity), 3),
                    }
                    for n in nodes
                ],
                "edges": edges,
                "total_nodes": node_count,
            }
        except Exception as e:
            logger.warning("search_knowledge_graph failed: %s", e)
            return {"nodes": [], "edges": [], "error": str(e)}

    # ── 8. Stakeholder map ────────────────────────────────────────────────────

    async def get_stakeholder_map(self) -> dict:
        """
        Get all people involved in this deal with their roles and last interaction.
        Draws from the knowledge graph (person nodes) and activity log actors.
        """
        try:
            # KG person nodes
            kg_result = await self.db.execute(text("""
                SELECT label, properties
                FROM deal_kg_nodes
                WHERE deal_id = CAST(:deal_id AS uuid)
                  AND node_type IN ('person', 'champion')
                ORDER BY created_at DESC
                LIMIT 20
            """), {"deal_id": self.deal_id})
            kg_rows = kg_result.fetchall()

            # Activity actors (recent participants)
            act_result = await self.db.execute(text("""
                SELECT DISTINCT actor_name
                FROM activity_logs
                WHERE entity_type = 'deal'
                  AND entity_id = CAST(:deal_id AS uuid)
                  AND actor_name IS NOT NULL
                LIMIT 10
            """), {"deal_id": self.deal_id})
            act_actors = [r.actor_name for r in act_result.fetchall()]

            stakeholders = []
            seen = set()

            for row in kg_rows:
                props = row.properties if isinstance(row.properties, dict) else {}
                name = row.label
                if name not in seen:
                    seen.add(name)
                    stakeholders.append({
                        "name": name,
                        "role": props.get("role", "Unknown"),
                        "title": props.get("title", ""),
                        "sentiment": props.get("sentiment", "neutral"),
                        "source": "knowledge_graph",
                    })

            for actor in act_actors:
                if actor not in seen:
                    seen.add(actor)
                    stakeholders.append({
                        "name": actor,
                        "role": "Internal",
                        "title": "",
                        "source": "activity_log",
                    })

            if not stakeholders:
                return {
                    "stakeholders": [],
                    "message": "No stakeholders found. Upload documents or transcripts to extract contacts.",
                }

            return {"stakeholders": stakeholders}
        except Exception as e:
            logger.warning("get_stakeholder_map failed: %s", e)
            return {"stakeholders": [], "error": str(e)}

    # ── 9. Product help ───────────────────────────────────────────────────────

    async def search_product_help(self, query: str) -> dict:
        """
        Get help on how to use Synvelo (UI navigation, features, how-to).
        Use this ONLY for product usage questions, not deal-specific questions.

        Args:
            query: Feature or action the user needs help with
        """
        q = query.lower()
        matches = []

        for keyword, content in _PRODUCT_HELP_GUIDES.items():
            if keyword in q or any(w in q for w in keyword.split("_")):
                matches.append(content)

        if not matches:
            for keyword, content in _PRODUCT_HELP_GUIDES.items():
                words = keyword.replace("_", " ").split()
                if any(w in q for w in words):
                    matches.append(content)

        if not matches:
            matches = [
                "Synvelo features: document upload (Documents tab), AI deal scoring "
                "(Score Deal button), MEDDIC framework (MEDDIC tab), stage pipeline "
                "(Pipeline tab), call transcription (Calls tab), journey reports "
                "(Journey tab), and NEXUS revenue simulation (sidebar)."
            ]

        return {"content": matches[0], "type": "product_help", "query": query}
