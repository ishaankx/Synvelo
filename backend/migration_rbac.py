"""
Synvelo — RBAC Migration
ADR-004: 4-role model (owner / admin / member / viewer) + per-deal ACL.
Run from backend root:  python migration_rbac.py
Safe: only adds new tables, never drops existing data.
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

STEPS = [
    ("CREATE user_roles", """
        CREATE TABLE IF NOT EXISTS user_roles (
            id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            org_id      UUID NOT NULL,
            user_id     TEXT NOT NULL,
            role        TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (org_id, user_id)
        )
    """),
    ("index . user_roles org_user",
     "CREATE INDEX IF NOT EXISTS idx_user_roles_org_user ON user_roles(org_id, user_id)"),
    ("index . user_roles user",
     "CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id)"),

    ("CREATE deal_collaborators", """
        CREATE TABLE IF NOT EXISTS deal_collaborators (
            deal_id     UUID NOT NULL,
            user_id     TEXT NOT NULL,
            role        TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
            org_id      UUID NOT NULL,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (deal_id, user_id)
        )
    """),
    ("index . deal_collaborators user",
     "CREATE INDEX IF NOT EXISTS idx_deal_collab_user ON deal_collaborators(user_id)"),
    ("index . deal_collaborators org",
     "CREATE INDEX IF NOT EXISTS idx_deal_collab_org ON deal_collaborators(org_id)"),

    ("RLS . user_roles enable",
     "ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY"),
    ("RLS . user_roles policy", """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE tablename = 'user_roles' AND policyname = 'org_isolation_user_roles'
            ) THEN
                CREATE POLICY org_isolation_user_roles ON user_roles
                    USING (org_id = current_setting('app.current_org_id', TRUE)::uuid);
            END IF;
        END $$;
    """),

    ("RLS . deal_collaborators enable",
     "ALTER TABLE deal_collaborators ENABLE ROW LEVEL SECURITY"),
    ("RLS . deal_collaborators policy", """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE tablename = 'deal_collaborators' AND policyname = 'org_isolation_deal_collab'
            ) THEN
                CREATE POLICY org_isolation_deal_collab ON deal_collaborators
                    USING (org_id = current_setting('app.current_org_id', TRUE)::uuid);
            END IF;
        END $$;
    """),
]


async def migrate():
    if not RAW_URL:
        print("ERROR: DATABASE_URL not set")
        return
    conn = await asyncpg.connect(RAW_URL)
    try:
        for label, sql in STEPS:
            print(f"  -> {label}")
            await conn.execute(sql)
        print("RBAC migration complete.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
