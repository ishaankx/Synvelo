"""
migration_reports.py — Run ONCE to add the deal_reports table.

Usage:
    cd ~/projects/synvelo/backend
    source .venv/bin/activate
    python migration_reports.py
"""

import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("+asyncpg", "")

STEPS = [
    # ── deal_reports table ────────────────────────────────────────────────────
    ("Create deal_reports table", """
        CREATE TABLE IF NOT EXISTS deal_reports (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            deal_id      UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
            filename     TEXT NOT NULL,
            page_count   INTEGER DEFAULT 1,
            report_json  JSONB,
            created_at   TIMESTAMPTZ DEFAULT NOW()
        )
    """),

    ("Index: deal_reports by deal_id", """
        CREATE INDEX IF NOT EXISTS idx_deal_reports_deal_id
        ON deal_reports(deal_id)
    """),

    # ── documents.content column (needed by report_service to read full text) ─
    ("Add content column to documents if missing", """
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS content TEXT
    """),
]

async def run():
    conn = await asyncpg.connect(RAW_URL)
    print(f"Connected to: {RAW_URL.split('@')[-1]}\n")
    for label, sql in STEPS:
        try:
            await conn.execute(sql)
            print(f"  ✓  {label}")
        except Exception as e:
            print(f"  ✗  {label}: {e}")
    await conn.close()
    print("\nMigration complete.")

if __name__ == "__main__":
    asyncio.run(run())