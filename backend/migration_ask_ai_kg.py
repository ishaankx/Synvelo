"""
Migration: Ask AI Knowledge Graph Tables

Creates:
  - deal_kg_nodes         — per-deal graph nodes (people, objections, topics, etc.)
  - deal_kg_edges         — typed relationships between nodes
  - deal_ai_conversations — persistent conversation memory with rolling summary

Run:
    cd backend && python3 migration_ask_ai_kg.py
"""
import asyncio
import logging
from sqlalchemy import text
from app.database import engine

logger = logging.getLogger(__name__)


async def migrate() -> None:
    async with engine.begin() as conn:
        # ── Knowledge graph nodes ────────────────────────────────────────────
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS deal_kg_nodes (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                deal_id     UUID NOT NULL,
                node_type   VARCHAR(50) NOT NULL,
                label       TEXT NOT NULL,
                properties  JSONB DEFAULT '{}',
                embedding   vector(1536),
                source_type VARCHAR(30),
                source_id   TEXT,
                created_at  TIMESTAMPTZ DEFAULT now(),
                updated_at  TIMESTAMPTZ DEFAULT now(),
                CONSTRAINT valid_kg_node_type CHECK (node_type IN (
                    'person','company','topic','objection','requirement',
                    'decision','action_item','product_feature','competitor',
                    'event','document_section','milestone','risk','champion','blocker'
                ))
            )
        """))

        # ── Knowledge graph edges ────────────────────────────────────────────
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS deal_kg_edges (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                deal_id        UUID NOT NULL,
                source_node_id UUID NOT NULL,
                target_node_id UUID NOT NULL,
                relation_type  VARCHAR(50) NOT NULL,
                properties     JSONB DEFAULT '{}',
                source_type    VARCHAR(30),
                source_id      TEXT,
                created_at     TIMESTAMPTZ DEFAULT now()
            )
        """))

        # ── Conversation memory ──────────────────────────────────────────────
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS deal_ai_conversations (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                deal_id    UUID NOT NULL,
                user_id    TEXT NOT NULL DEFAULT 'default',
                title      TEXT,
                messages   JSONB DEFAULT '[]',
                summary    TEXT,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """))

        # ── Indexes ──────────────────────────────────────────────────────────
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_kg_nodes_deal "
            "ON deal_kg_nodes(deal_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_kg_nodes_type "
            "ON deal_kg_nodes(deal_id, node_type)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_kg_edges_deal "
            "ON deal_kg_edges(deal_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_kg_edges_source "
            "ON deal_kg_edges(source_node_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_kg_edges_target "
            "ON deal_kg_edges(target_node_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ai_conv_deal "
            "ON deal_ai_conversations(deal_id)"
        ))

        # Try to create ivfflat vector index — may fail on empty table, that's ok
        try:
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_kg_nodes_embedding
                ON deal_kg_nodes USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 50)
            """))
        except Exception:
            logger.warning("ivfflat index skipped (table empty or extension missing)")

        logger.info("Ask AI KG migration completed successfully")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s"
    )
    asyncio.run(migrate())
