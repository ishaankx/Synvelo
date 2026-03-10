import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("+asyncpg", "")

async def migrate():
    print("Connecting...")
    conn = await asyncpg.connect(RAW_URL)

    print("Creating organisations table...")
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS organisations (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        TEXT NOT NULL,
            slug        TEXT NOT NULL UNIQUE,
            plan        TEXT NOT NULL DEFAULT 'free',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # Insert a default org so existing data doesn't break
    await conn.execute("""
        INSERT INTO organisations (id, name, slug, plan)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Default Org', 'default', 'free')
        ON CONFLICT (slug) DO NOTHING
    """)

    print("Adding org_id to deals...")
    await conn.execute("""
        ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL
            DEFAULT '00000000-0000-0000-0000-000000000001'
            REFERENCES organisations(id)
    """)

    print("Adding org_id to documents...")
    await conn.execute("""
        ALTER TABLE documents
        ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL
            DEFAULT '00000000-0000-0000-0000-000000000001'
            REFERENCES organisations(id)
    """)

    print("Adding org_id to pulse_actions...")
    await conn.execute("""
        ALTER TABLE pulse_actions
        ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL
            DEFAULT '00000000-0000-0000-0000-000000000001'
            REFERENCES organisations(id)
    """)

    print("Adding org_id to deal_reports...")
    await conn.execute("""
        ALTER TABLE deal_reports
        ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL
            DEFAULT '00000000-0000-0000-0000-000000000001'
            REFERENCES organisations(id)
    """)

    print("Creating indexes on org_id...")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_deals_org_id ON deals(org_id)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(org_id)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_pulse_actions_org_id ON pulse_actions(org_id)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_deal_reports_org_id ON deal_reports(org_id)")

    await conn.close()
    print("\n✅ Multi-tenancy migration complete.")
    print("   Default org_id: 00000000-0000-0000-0000-000000000001")
    print("   All existing rows are assigned to 'Default Org'")

asyncio.run(migrate())