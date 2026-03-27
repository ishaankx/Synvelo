"""
NEXUS — Revenue Simulation Engine — Database Migration
Run from backend root:  python migration_nexus.py
Safe: only creates new tables, never alters existing ones.
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

RAW_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

STEPS = [
    # ── Table 1: nexus_deal_features ────────────────────────────────────
    ("CREATE nexus_deal_features", """
        CREATE TABLE IF NOT EXISTS nexus_deal_features (
            id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            deal_id                         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
            org_id                          UUID NOT NULL,
            outcome                         SMALLINT NOT NULL CHECK (outcome IN (0, 1)),
            final_deal_value                NUMERIC(14, 2),
            final_margin_pct                NUMERIC(6, 4),
            days_first_call_to_proposal     INTEGER,
            days_proposal_to_close          INTEGER,
            days_total_cycle                INTEGER,
            days_since_last_activity        INTEGER,
            num_calls                       INTEGER DEFAULT 0,
            num_emails                      INTEGER DEFAULT 0,
            num_docs_uploaded               INTEGER DEFAULT 0,
            num_stakeholders_engaged        INTEGER DEFAULT 0,
            economic_buyer_engaged          BOOLEAN DEFAULT FALSE,
            champion_identified             BOOLEAN DEFAULT FALSE,
            legal_review_triggered          BOOLEAN DEFAULT FALSE,
            multi_thread_score              NUMERIC(4, 2),
            meddic_completeness_score       NUMERIC(4, 2) DEFAULT 0.0,
            meddic_metrics_filled           BOOLEAN DEFAULT FALSE,
            meddic_economic_buyer_filled    BOOLEAN DEFAULT FALSE,
            meddic_decision_criteria_filled BOOLEAN DEFAULT FALSE,
            meddic_champion_filled          BOOLEAN DEFAULT FALSE,
            win_prob_at_discovery           NUMERIC(5, 4),
            win_prob_at_proposal            NUMERIC(5, 4),
            win_prob_at_negotiation         NUMERIC(5, 4),
            win_prob_final                  NUMERIC(5, 4),
            sentiment_trend_slope           NUMERIC(8, 6),
            sentiment_volatility            NUMERIC(6, 4),
            max_sentiment_drop              NUMERIC(5, 4),
            competitor_mentioned            BOOLEAN DEFAULT FALSE,
            competitor_name                 TEXT,
            budget_concern_raised           BOOLEAN DEFAULT FALSE,
            price_pushback_raised           BOOLEAN DEFAULT FALSE,
            discount_offered_pct            NUMERIC(5, 2) DEFAULT 0.0,
            contract_term_years             NUMERIC(4, 2) DEFAULT 1.0,
            erp_margin_available_pct        NUMERIC(6, 4),
            erp_inventory_risk              BOOLEAN DEFAULT FALSE,
            erp_lead_time_days              INTEGER,
            rep_id                          UUID,
            rep_win_rate_trailing_90d       NUMERIC(5, 4),
            rep_avg_deal_size               NUMERIC(14, 2),
            deal_size_vs_org_avg_ratio      NUMERIC(8, 4),
            deal_stage_at_close             TEXT,
            industry_vertical               TEXT,
            created_at                      TIMESTAMPTZ DEFAULT NOW(),
            extracted_at                    TIMESTAMPTZ DEFAULT NOW()
        )
    """),
    ("idx nexus_features_org",     "CREATE INDEX IF NOT EXISTS idx_nexus_features_org ON nexus_deal_features(org_id)"),
    ("idx nexus_features_outcome", "CREATE INDEX IF NOT EXISTS idx_nexus_features_outcome ON nexus_deal_features(org_id, outcome)"),
    ("idx nexus_features_created", "CREATE INDEX IF NOT EXISTS idx_nexus_features_created ON nexus_deal_features(created_at DESC)"),
    ("unique nexus_features_deal", "CREATE UNIQUE INDEX IF NOT EXISTS idx_nexus_features_deal_unique ON nexus_deal_features(deal_id)"),

    # ── Table 2: nexus_models ───────────────────────────────────────────
    ("CREATE nexus_models", """
        CREATE TABLE IF NOT EXISTS nexus_models (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id              UUID NOT NULL,
            version             INTEGER NOT NULL DEFAULT 1,
            status              TEXT NOT NULL DEFAULT 'training' CHECK (status IN ('training', 'ready', 'failed', 'archived')),
            algorithm           TEXT NOT NULL DEFAULT 'xgboost',
            n_training_samples  INTEGER,
            feature_names       JSONB,
            hyperparams         JSONB,
            cv_auc_mean         NUMERIC(6, 4),
            cv_auc_std          NUMERIC(6, 4),
            cv_f1_mean          NUMERIC(6, 4),
            calibration_score   NUMERIC(6, 4),
            feature_importances JSONB,
            shap_mean_abs       JSONB,
            shap_direction      JSONB,
            model_blob          TEXT,
            win_dna_narrative   TEXT,
            win_dna_top_factors JSONB,
            trained_at          TIMESTAMPTZ DEFAULT NOW(),
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (org_id, version)
        )
    """),
    ("idx nexus_models_org", "CREATE INDEX IF NOT EXISTS idx_nexus_models_org ON nexus_models(org_id, status)"),

    # ── Table 3: nexus_simulations ──────────────────────────────────────
    ("CREATE nexus_simulations", """
        CREATE TABLE IF NOT EXISTS nexus_simulations (
            id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            deal_id                     UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
            org_id                      UUID NOT NULL,
            model_id                    UUID REFERENCES nexus_models(id),
            input_feature_snapshot      JSONB NOT NULL,
            n_scenarios                 INTEGER DEFAULT 500,
            simulation_type             TEXT DEFAULT 'full' CHECK (simulation_type IN ('full', 'pricing', 'timing', 'stakeholder')),
            baseline_win_prob           NUMERIC(5, 4),
            baseline_expected_value     NUMERIC(14, 2),
            scenario_results            JSONB,
            recommended_action_type     TEXT,
            recommended_action_params   JSONB,
            recommended_win_prob_new    NUMERIC(5, 4),
            recommended_ev_new          NUMERIC(14, 2),
            recommended_net_rev_delta   NUMERIC(14, 2),
            recommended_reasoning       TEXT,
            erp_margin_floor_pct        NUMERIC(6, 4),
            erp_validated               BOOLEAN DEFAULT FALSE,
            erp_flags                   JSONB,
            status                      TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
            run_duration_ms             INTEGER,
            created_at                  TIMESTAMPTZ DEFAULT NOW(),
            completed_at                TIMESTAMPTZ
        )
    """),
    ("idx nexus_sims_deal", "CREATE INDEX IF NOT EXISTS idx_nexus_sims_deal ON nexus_simulations(deal_id, created_at DESC)"),
    ("idx nexus_sims_org",  "CREATE INDEX IF NOT EXISTS idx_nexus_sims_org ON nexus_simulations(org_id, created_at DESC)"),

    # ── Table 4: nexus_artifacts ────────────────────────────────────────
    ("CREATE nexus_artifacts", """
        CREATE TABLE IF NOT EXISTS nexus_artifacts (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            simulation_id   UUID NOT NULL REFERENCES nexus_simulations(id) ON DELETE CASCADE,
            deal_id         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
            org_id          UUID NOT NULL,
            artifact_type   TEXT NOT NULL CHECK (artifact_type IN (
                'proposal_pdf', 'roi_calculator', 'battle_card', 'next_best_email'
            )),
            status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
            content_json    JSONB,
            storage_path    TEXT,
            public_url      TEXT,
            llm_model_used  TEXT,
            prompt_tokens   INTEGER,
            generation_ms   INTEGER,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    """),
    ("idx nexus_artifacts_deal", "CREATE INDEX IF NOT EXISTS idx_nexus_artifacts_deal ON nexus_artifacts(deal_id, artifact_type)"),
    ("idx nexus_artifacts_sim",  "CREATE INDEX IF NOT EXISTS idx_nexus_artifacts_sim ON nexus_artifacts(simulation_id)"),

    # ── Table 5: nexus_training_jobs ────────────────────────────────────
    ("CREATE nexus_training_jobs", """
        CREATE TABLE IF NOT EXISTS nexus_training_jobs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id          UUID NOT NULL,
            status          TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed')),
            triggered_by    TEXT DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'auto', 'scheduled')),
            n_samples       INTEGER,
            error_msg       TEXT,
            logs            JSONB DEFAULT '[]',
            model_id        UUID REFERENCES nexus_models(id),
            queued_at       TIMESTAMPTZ DEFAULT NOW(),
            started_at      TIMESTAMPTZ,
            completed_at    TIMESTAMPTZ
        )
    """),

    # ── RLS ─────────────────────────────────────────────────────────────
    ("RLS nexus_deal_features", "ALTER TABLE nexus_deal_features ENABLE ROW LEVEL SECURITY"),
    ("RLS nexus_models",        "ALTER TABLE nexus_models ENABLE ROW LEVEL SECURITY"),
    ("RLS nexus_simulations",   "ALTER TABLE nexus_simulations ENABLE ROW LEVEL SECURITY"),
    ("RLS nexus_artifacts",     "ALTER TABLE nexus_artifacts ENABLE ROW LEVEL SECURITY"),
    ("RLS nexus_training_jobs", "ALTER TABLE nexus_training_jobs ENABLE ROW LEVEL SECURITY"),
]


async def main():
    print("🔧 NEXUS migration — connecting …")
    conn = await asyncpg.connect(RAW_URL)
    try:
        for label, sql in STEPS:
            try:
                await conn.execute(sql)
                print(f"  ✓ {label}")
            except asyncpg.exceptions.DuplicateTableError:
                print(f"  · {label} (already exists)")
            except asyncpg.exceptions.DuplicateObjectError:
                print(f"  · {label} (already exists)")
            except Exception as e:
                print(f"  ✗ {label}: {e}")
    finally:
        await conn.close()
    print("✅ NEXUS migration complete")


if __name__ == "__main__":
    asyncio.run(main())
