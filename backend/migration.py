"""
Synvelo V2 — One-Time Database Migration
Run from backend root:  python migration.py
Safe: only adds new columns/tables, never drops existing data.
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

STEPS = [
    # ── Deals table: new V2 columns ──────────────────────────────────
    ("deals · signals",          "ALTER TABLE deals ADD COLUMN IF NOT EXISTS signals JSONB DEFAULT '[]'"),
    ("deals · meddic",           "ALTER TABLE deals ADD COLUMN IF NOT EXISTS meddic JSONB DEFAULT '{}'"),
    ("deals · brief",            "ALTER TABLE deals ADD COLUMN IF NOT EXISTS brief TEXT"),
    ("deals · brief_generated_at","ALTER TABLE deals ADD COLUMN IF NOT EXISTS brief_generated_at TIMESTAMP"),
    ("deals · last_scored_at",   "ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP"),

    # ── Documents table: sentiment ───────────────────────────────────
    ("documents · sentiment_score", "ALTER TABLE documents ADD COLUMN IF NOT EXISTS sentiment_score FLOAT"),
    ("documents · sentiment_label", "ALTER TABLE documents ADD COLUMN IF NOT EXISTS sentiment_label VARCHAR(20)"),

    # ── New table: score_history ──────────────────────────────────────
    ("CREATE score_history", """
        CREATE TABLE IF NOT EXISTS score_history (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            deal_id          UUID REFERENCES deals(id) ON DELETE CASCADE,
            scored_at        TIMESTAMP DEFAULT NOW(),
            win_probability  FLOAT,
            probability_low  FLOAT,
            probability_high FLOAT,
            sentiment_avg    FLOAT,
            trigger_type     VARCHAR(50) DEFAULT 'manual_score',
            trigger_document VARCHAR(500),
            created_at       TIMESTAMP DEFAULT NOW()
        )
    """),

    # ── New table: call_transcriptions ────────────────────────────────
    ("CREATE call_transcriptions", """
        CREATE TABLE IF NOT EXISTS call_transcriptions (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            deal_id          UUID REFERENCES deals(id) ON DELETE CASCADE,
            source_url       TEXT,
            platform         VARCHAR(50) DEFAULT 'upload',
            status           VARCHAR(20) DEFAULT 'pending',
            transcript_text  TEXT,
            pdf_filename     VARCHAR(500),
            duration_seconds INTEGER,
            attendees        TEXT,
            call_title       VARCHAR(500),
            error_message    TEXT,
            created_at       TIMESTAMP DEFAULT NOW(),
            completed_at     TIMESTAMP
        )
    """),

    # ── Indexes ───────────────────────────────────────────────────────
    ("index · score_history deal",   "CREATE INDEX IF NOT EXISTS idx_sh_deal ON score_history(deal_id)"),
    ("index · score_history time",   "CREATE INDEX IF NOT EXISTS idx_sh_time ON score_history(scored_at DESC)"),
    ("index · transcriptions deal",  "CREATE INDEX IF NOT EXISTS idx_ct_deal ON call_transcriptions(deal_id)"),
]


async def migrate():
    print(f"Connecting to database...")
    conn = await asyncpg.connect(RAW_URL)
    print("Running Synvelo V2 migration...\n")

    ok = 0
    for label, sql in STEPS:
        try:
            await conn.execute(sql.strip())
            print(f"  ✅  {label}")
            ok += 1
        except Exception as e:
            print(f"  ❌  {label}  →  {e}")

    await conn.close()
    print(f"\n{'✅ Migration complete!' if ok == len(STEPS) else '⚠️  Migration finished with errors.'}")
    print("Restart uvicorn to pick up new models.\n")


if __name__ == "__main__":
    asyncio.run(migrate())
