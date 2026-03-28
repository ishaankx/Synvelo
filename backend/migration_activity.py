"""
Synvelo — Activity Logs Migration
Run from backend root:  python migration_activity.py
Safe: only adds new table, never drops existing data.
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

STEPS = [
    # ── New table: activity_logs ─────────────────────────────────────
    ("CREATE activity_logs", """
        CREATE TABLE IF NOT EXISTS activity_logs (
            id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            event_type     VARCHAR(100) NOT NULL,
            actor_id       VARCHAR(200),
            actor_name     VARCHAR(200),
            entity_type    VARCHAR(50)  NOT NULL,
            entity_id      VARCHAR(200),
            entity_name    VARCHAR(500),
            old_value      JSONB,
            new_value      JSONB,
            metadata_extra JSONB,
            created_at     TIMESTAMPTZ  DEFAULT NOW(),
            org_id         UUID         NOT NULL
        )
    """),

    # ── Indexes ──────────────────────────────────────────────────────
    ("index . activity_logs org_id",
     "CREATE INDEX IF NOT EXISTS idx_activity_logs_org_id ON activity_logs(org_id)"),

    ("index . activity_logs event_type",
     "CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type ON activity_logs(event_type)"),

    ("index . activity_logs entity_type",
     "CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON activity_logs(entity_type)"),

    ("index . activity_logs created_at",
     "CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC)"),

    ("index . activity_logs entity_id",
     "CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_id ON activity_logs(entity_id)"),

    # ── RLS ───────────────────────────────────────────────────────────
    ("RLS . activity_logs enable",
     "ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY"),

    ("RLS . activity_logs policy", """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE tablename = 'activity_logs' AND policyname = 'org_isolation_activity'
            ) THEN
                CREATE POLICY org_isolation_activity ON activity_logs
                    USING (org_id = current_setting('app.current_org_id', TRUE)::uuid);
            END IF;
        END $$
    """),
]


async def main():
    print(f"Connecting to: {RAW_URL[:40]}…")
    conn = await asyncpg.connect(RAW_URL)

    for label, sql in STEPS:
        try:
            await conn.execute(sql)
            print(f"  ✔ {label}")
        except Exception as e:
            print(f"  ⚠ {label}: {e}")

    await conn.close()
    print("Done — activity_logs migration complete.")


if __name__ == "__main__":
    asyncio.run(main())
