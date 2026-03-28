"""
Synvelo — Deal Exit Criteria Migration
Run from backend root:  python migration_exit_criteria.py
Safe: only creates new table, never drops existing data.
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

STEPS = [
    # ── New table: deal_exit_criteria ────────────────────────────────
    ("CREATE deal_exit_criteria", """
        CREATE TABLE IF NOT EXISTS deal_exit_criteria (
            id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            deal_id         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
            stage           TEXT NOT NULL,
            criterion_text  TEXT NOT NULL,
            is_completed    BOOLEAN DEFAULT FALSE,
            is_custom       BOOLEAN DEFAULT FALSE,
            completed_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            org_id          UUID NOT NULL
        )
    """),

    # ── Indexes ─────────────────────────────────────────────────────
    ("IDX deal_exit_criteria.deal_id_stage", """
        CREATE INDEX IF NOT EXISTS idx_exit_criteria_deal_stage
        ON deal_exit_criteria (deal_id, stage)
    """),

    ("IDX deal_exit_criteria.org_id", """
        CREATE INDEX IF NOT EXISTS idx_exit_criteria_org_id
        ON deal_exit_criteria (org_id)
    """),

    # ── RLS ──────────────────────────────────────────────────────────
    ("RLS deal_exit_criteria", """
        ALTER TABLE deal_exit_criteria ENABLE ROW LEVEL SECURITY
    """),
]


async def main():
    conn = await asyncpg.connect(RAW_URL)
    try:
        for name, sql in STEPS:
            try:
                await conn.execute(sql)
                print(f"  [OK]  {name}")
            except Exception as e:
                if "already exists" in str(e).lower():
                    print(f"  [SKIP] {name} (already exists)")
                else:
                    print(f"  [ERR]  {name}: {e}")
    finally:
        await conn.close()
    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(main())
