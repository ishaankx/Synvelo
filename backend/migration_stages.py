"""
Synvelo — Deal Stage Pipeline Migration
Run from backend root:  python migration_stages.py
Safe: only adds new columns/tables, never drops existing data.
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

STEPS = [
    # ── Deals table: stage_entered_at column ───────────────────────────
    ("deals . stage_entered_at", """
        ALTER TABLE deals ADD COLUMN IF NOT EXISTS stage_entered_at
        TIMESTAMPTZ DEFAULT NOW()
    """),

    # ── New table: deal_stage_history ───────────────────────────────────
    ("CREATE deal_stage_history", """
        CREATE TABLE IF NOT EXISTS deal_stage_history (
            id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            deal_id      UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
            from_stage   TEXT,
            to_stage     TEXT NOT NULL,
            changed_at   TIMESTAMPTZ DEFAULT NOW(),
            changed_by   TEXT,
            reason       TEXT,
            triggered_by TEXT DEFAULT 'manual',
            org_id       UUID NOT NULL
        )
    """),

    # ── Indexes ────────────────────────────────────────────────────────
    ("index . deal_stage_history deal_id",
     "CREATE INDEX IF NOT EXISTS idx_dsh_deal_id ON deal_stage_history(deal_id)"),
    ("index . deal_stage_history changed_at",
     "CREATE INDEX IF NOT EXISTS idx_dsh_changed_at ON deal_stage_history(changed_at)"),
    ("index . deal_stage_history org_id",
     "CREATE INDEX IF NOT EXISTS idx_dsh_org_id ON deal_stage_history(org_id)"),

    # ── Stage CHECK constraint ─────────────────────────────────────────
    ("deals . stage_check constraint", """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'deals_stage_check'
            ) THEN
                ALTER TABLE deals ADD CONSTRAINT deals_stage_check
                CHECK (stage IN (
                    'Discovery', 'Qualification', 'Demo', 'Proposal',
                    'Negotiation', 'Closed Won', 'Closed Lost'
                ));
            END IF;
        END $$
    """),

    # ── RLS on deal_stage_history ──────────────────────────────────────
    ("RLS . deal_stage_history enable", """
        ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY
    """),
    ("RLS . deal_stage_history policy", """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE tablename = 'deal_stage_history' AND policyname = 'org_isolation_dsh'
            ) THEN
                CREATE POLICY org_isolation_dsh ON deal_stage_history
                USING (org_id = current_setting('app.current_org_id', TRUE)::uuid);
            END IF;
        END $$
    """),
]


async def migrate():
    print("Connecting to database...")
    conn = await asyncpg.connect(RAW_URL)
    print("Running Synvelo Deal Stage Pipeline migration...\n")

    ok = 0
    for label, sql in STEPS:
        try:
            await conn.execute(sql.strip())
            print(f"  +  {label}")
            ok += 1
        except Exception as e:
            print(f"  x  {label}  ->  {e}")

    await conn.close()
    total = len(STEPS)
    if ok == total:
        print(f"\nMigration complete! ({ok}/{total} steps)")
    else:
        print(f"\nMigration finished with errors. ({ok}/{total} steps)")
    print("Restart uvicorn to pick up new models.\n")


if __name__ == "__main__":
    asyncio.run(migrate())
