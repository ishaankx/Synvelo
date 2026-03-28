"""
NEXUS + Stage Pipeline Integration Migration
Adds stage-derived columns to nexus_deal_features and
deal_stage/stage_health columns to score_history.
Run from backend root:  python migration_nexus_stage_features.py
Safe: uses ALTER TABLE ADD COLUMN IF NOT EXISTS.
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

STEPS = [
    # ── score_history: add stage fields for NEXUS ML consumption ──────
    ("score_history + deal_stage", """
        ALTER TABLE score_history ADD COLUMN IF NOT EXISTS deal_stage TEXT
    """),
    ("score_history + stage_health", """
        ALTER TABLE score_history ADD COLUMN IF NOT EXISTS stage_health TEXT
            CHECK (stage_health IN ('on_track', 'at_risk', 'stalled'))
    """),

    # ── nexus_deal_features: add stage-derived columns ────────────────
    # Per-stage exact timing (from deal_stage_history)
    ("ndf + time_in_discovery_days", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS time_in_discovery_days INTEGER
    """),
    ("ndf + time_in_qualification_days", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS time_in_qualification_days INTEGER
    """),
    ("ndf + time_in_demo_days", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS time_in_demo_days INTEGER
    """),
    ("ndf + time_in_proposal_days", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS time_in_proposal_days INTEGER
    """),
    ("ndf + time_in_negotiation_days", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS time_in_negotiation_days INTEGER
    """),

    # Funnel velocity
    ("ndf + discovery_to_proposal_days", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS discovery_to_proposal_days INTEGER
    """),
    ("ndf + proposal_to_close_days", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS proposal_to_close_days INTEGER
    """),

    # Stage behavior signals
    ("ndf + stage_velocity_score", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS stage_velocity_score NUMERIC(8, 4)
    """),
    ("ndf + n_stage_regressions", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS n_stage_regressions INTEGER DEFAULT 0
    """),
    ("ndf + n_stage_skips", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS n_stage_skips INTEGER DEFAULT 0
    """),
    ("ndf + n_total_stage_transitions", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS n_total_stage_transitions INTEGER DEFAULT 0
    """),
    ("ndf + final_stage_before_terminal", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS final_stage_before_terminal TEXT
    """),
    ("ndf + stage_health_numeric", """
        ALTER TABLE nexus_deal_features
        ADD COLUMN IF NOT EXISTS stage_health_numeric NUMERIC(4, 2)
    """),
]


async def main():
    print("NEXUS stage-features migration -- connecting ...")
    conn = await asyncpg.connect(RAW_URL)
    try:
        for label, sql in STEPS:
            try:
                await conn.execute(sql)
                print(f"  + {label}")
            except asyncpg.exceptions.DuplicateColumnError:
                print(f"  . {label} (already exists)")
            except asyncpg.exceptions.DuplicateObjectError:
                print(f"  . {label} (already exists)")
            except Exception as e:
                print(f"  x {label}: {e}")
    finally:
        await conn.close()
    print("NEXUS stage-features migration complete")


if __name__ == "__main__":
    asyncio.run(main())
