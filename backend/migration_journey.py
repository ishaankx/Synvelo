"""
migration_journey.py — Adds tables for Deal Journey Report (Type 2).

New tables:
  - deal_field_edits   — tracks every field change on a deal
  - deal_ai_usage_log  — tracks every AI feature invocation per deal

Alters:
  - deal_reports       — adds report_type column to distinguish Type 1 vs Type 2

Usage:
    cd ~/projects/synvelo/backend
    source .venv/bin/activate
    python migration_journey.py
"""

import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("+asyncpg", "")

STEPS = [
    # ── deal_field_edits ─────────────────────────────────────────────────────
    ("Create deal_field_edits table", """
        CREATE TABLE IF NOT EXISTS deal_field_edits (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            deal_id     UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
            field_name  TEXT NOT NULL,
            old_value   TEXT,
            new_value   TEXT,
            changed_by  TEXT,
            changed_at  TIMESTAMPTZ DEFAULT NOW(),
            org_id      UUID NOT NULL
        )
    """),

    ("Index: deal_field_edits by deal_id + changed_at", """
        CREATE INDEX IF NOT EXISTS idx_deal_field_edits_deal
        ON deal_field_edits(deal_id, changed_at DESC)
    """),

    ("Index: deal_field_edits by org_id", """
        CREATE INDEX IF NOT EXISTS idx_deal_field_edits_org
        ON deal_field_edits(org_id)
    """),

    # ── deal_ai_usage_log ────────────────────────────────────────────────────
    ("Create deal_ai_usage_log table", """
        CREATE TABLE IF NOT EXISTS deal_ai_usage_log (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            deal_id         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
            feature_name    TEXT NOT NULL,
            triggered_by    TEXT,
            triggered_at    TIMESTAMPTZ DEFAULT NOW(),
            result_summary  JSONB,
            org_id          UUID NOT NULL
        )
    """),

    ("Index: deal_ai_usage_log by deal_id + triggered_at", """
        CREATE INDEX IF NOT EXISTS idx_deal_ai_usage_deal
        ON deal_ai_usage_log(deal_id, triggered_at DESC)
    """),

    ("Index: deal_ai_usage_log by org_id", """
        CREATE INDEX IF NOT EXISTS idx_deal_ai_usage_org
        ON deal_ai_usage_log(org_id)
    """),

    # ── deal_reports.report_type ─────────────────────────────────────────────
    ("Add report_type column to deal_reports", """
        ALTER TABLE deal_reports
        ADD COLUMN IF NOT EXISTS report_type TEXT DEFAULT 'intelligence'
    """),

    ("Add org_id to deal_reports if missing", """
        ALTER TABLE deal_reports
        ADD COLUMN IF NOT EXISTS org_id UUID
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
