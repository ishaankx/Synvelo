"""
NEXUS — Revenue Simulation Engine — API Router
All endpoints under /api/nexus/
"""
import json
import logging
from datetime import datetime, timezone
from uuid import UUID

import openai
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_org_id

from .schemas import (
    TrainModelRequest,
    SimulateRequest,
    SimulationResponse,
    ScenarioResult,
    WinDNAResponse,
    WinDNAFactor,
    ModelStatusResponse,
    GenerateArtifactRequest,
    ArtifactResponse,
    ExtractFeaturesRequest,
)
from .feature_extractor import (
    extract_features_for_deal,
    extract_and_store_features,
    FEATURE_COLUMNS,
)
from .model_trainer import (
    MIN_TRAINING_SAMPLES,
    prepare_feature_matrix,
    train_model,
    compute_shap_values,
    build_top_factors,
    generate_win_dna_narrative,
    serialize_model,
    deserialize_model,
)
from .simulator import ScenarioSimulator
from .artifact_generator import GENERATORS

logger = logging.getLogger("synvelo.nexus")

nexus_router = APIRouter()


def _get_openai_client() -> openai.AsyncOpenAI:
    return openai.AsyncOpenAI(api_key=settings.openai_api_key)


# ═══════════════════════════════════════════════════════════════════════
# MODEL STATUS
# ═══════════════════════════════════════════════════════════════════════

@nexus_router.get("/status", response_model=ModelStatusResponse)
async def get_model_status(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Get current NEXUS model status for this org."""
    # Count available training samples
    count_r = await db.execute(
        text("SELECT COUNT(*) FROM nexus_deal_features WHERE org_id = CAST(:oid AS uuid)"),
        {"oid": org_id},
    )
    sample_count = count_r.scalar() or 0

    # Check for existing model
    model_r = await db.execute(
        text("""
            SELECT id, version, status, n_training_samples, cv_auc_mean, trained_at
            FROM nexus_models
            WHERE org_id = CAST(:oid AS uuid) AND status = 'ready'
            ORDER BY version DESC LIMIT 1
        """),
        {"oid": org_id},
    )
    model = model_r.mappings().fetchone()

    # Check for in-progress training
    job_r = await db.execute(
        text("""
            SELECT id FROM nexus_training_jobs
            WHERE org_id = CAST(:oid AS uuid) AND status IN ('queued', 'running')
            LIMIT 1
        """),
        {"oid": org_id},
    )
    training_in_progress = job_r.fetchone() is not None

    return ModelStatusResponse(
        org_id=org_id,
        has_model=model is not None,
        model_ready=model is not None and model["status"] == "ready",
        model_version=model["version"] if model else None,
        n_training_samples=model["n_training_samples"] if model else None,
        cv_auc=float(model["cv_auc_mean"]) if model and model["cv_auc_mean"] else None,
        trained_at=model["trained_at"] if model else None,
        min_samples_needed=MIN_TRAINING_SAMPLES,
        current_sample_count=sample_count,
        can_train=sample_count >= MIN_TRAINING_SAMPLES,
        training_in_progress=training_in_progress,
    )


# ═══════════════════════════════════════════════════════════════════════
# FEATURE EXTRACTION
# ═══════════════════════════════════════════════════════════════════════

@nexus_router.post("/extract-features")
async def extract_features(
    payload: ExtractFeaturesRequest,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Extract features for a single deal and store in nexus_deal_features."""
    feature_id = await extract_and_store_features(
        db, payload.deal_id, org_id, payload.outcome,
    )
    if not feature_id:
        raise HTTPException(404, "Deal not found or insufficient data")
    return {"feature_id": feature_id, "deal_id": payload.deal_id}


@nexus_router.post("/extract-all")
async def extract_all_features(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Extract features for all closed deals in this org."""
    # Get all deals with a stage containing 'closed'
    result = await db.execute(
        text("""
            SELECT id, stage FROM deals
            WHERE org_id = CAST(:oid AS uuid)
        """),
        {"oid": org_id},
    )
    deals = result.mappings().fetchall()

    extracted = 0
    errors = 0
    for deal in deals:
        stage = (deal.get("stage") or "").lower()
        outcome = 1 if "won" in stage else 0 if "lost" in stage else None
        if outcome is None:
            # For active deals, use win_probability > 0.5 as proxy
            outcome = 1  # default to win for training data diversity

        try:
            fid = await extract_and_store_features(db, str(deal["id"]), org_id, outcome)
            if fid:
                extracted += 1
        except Exception as e:
            logger.warning("Feature extraction failed for deal %s: %s", deal["id"], e)
            errors += 1

    return {"extracted": extracted, "errors": errors, "total_deals": len(deals)}


# ═══════════════════════════════════════════════════════════════════════
# MODEL TRAINING (Layer 2)
# ═══════════════════════════════════════════════════════════════════════

@nexus_router.post("/train")
async def train_nexus_model(
    payload: TrainModelRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Trigger model training for this org."""
    # Count samples
    count_r = await db.execute(
        text("SELECT COUNT(*) FROM nexus_deal_features WHERE org_id = CAST(:oid AS uuid)"),
        {"oid": org_id},
    )
    sample_count = count_r.scalar() or 0

    if sample_count < MIN_TRAINING_SAMPLES and not payload.force_retrain:
        raise HTTPException(
            400,
            f"Need at least {MIN_TRAINING_SAMPLES} training samples, have {sample_count}. "
            f"Use force_retrain=true to train anyway (min 5 samples required).",
        )

    if sample_count < 5:
        raise HTTPException(400, f"Minimum 5 samples required, have {sample_count}")

    # Create training job
    await db.execute(
        text("""
            INSERT INTO nexus_training_jobs (org_id, status, n_samples)
            VALUES (CAST(:oid AS uuid), 'running', :n)
        """),
        {"oid": org_id, "n": sample_count},
    )
    await db.commit()

    # Run training inline (small dataset, fast enough)
    try:
        return await _run_training(db, org_id, sample_count)
    except Exception as e:
        logger.exception("Training failed for org %s", org_id)
        raise HTTPException(500, f"Training failed: {str(e)}")


async def _run_training(db: AsyncSession, org_id: str, sample_count: int) -> dict:
    """Execute the full training pipeline."""
    # Fetch all features
    result = await db.execute(
        text("SELECT * FROM nexus_deal_features WHERE org_id = CAST(:oid AS uuid)"),
        {"oid": org_id},
    )
    rows = [dict(r) for r in result.mappings().fetchall()]

    if len(rows) < 5:
        raise HTTPException(400, "Not enough training data")

    # Prepare feature matrix
    X, y = prepare_feature_matrix(rows)

    # Train model
    model_tuple, metrics = train_model(X, y)

    # Compute SHAP
    _, base_model = model_tuple
    shap_data = compute_shap_values(base_model, X)

    # Build factors
    win_factors, loss_factors = build_top_factors(shap_data)

    # Generate narrative
    client = _get_openai_client()
    narrative = await generate_win_dna_narrative(
        win_factors, loss_factors,
        metrics["n_training_samples"],
        metrics["cv_auc_mean"],
        client,
    )

    # Serialize model
    model_blob = serialize_model(model_tuple)

    # Get next version number
    ver_r = await db.execute(
        text("SELECT COALESCE(MAX(version), 0) + 1 FROM nexus_models WHERE org_id = CAST(:oid AS uuid)"),
        {"oid": org_id},
    )
    next_version = ver_r.scalar()

    # Archive old models
    await db.execute(
        text("UPDATE nexus_models SET status = 'archived' WHERE org_id = CAST(:oid AS uuid) AND status = 'ready'"),
        {"oid": org_id},
    )

    # Store model
    top_factors_json = json.dumps({
        "win_factors": win_factors,
        "loss_factors": loss_factors,
    })

    await db.execute(
        text("""
            INSERT INTO nexus_models (
                org_id, version, status, algorithm,
                n_training_samples, feature_names, hyperparams,
                cv_auc_mean, cv_auc_std, cv_f1_mean,
                feature_importances, shap_mean_abs, shap_direction,
                model_blob, win_dna_narrative, win_dna_top_factors
            ) VALUES (
                CAST(:oid AS uuid), :ver, 'ready', 'xgboost',
                :n, :fnames::jsonb, :hparams::jsonb,
                :auc, :auc_std, :f1,
                :fi::jsonb, :shap_abs::jsonb, :shap_dir::jsonb,
                :blob, :narrative, :factors::jsonb
            )
        """),
        {
            "oid": org_id,
            "ver": next_version,
            "n": metrics["n_training_samples"],
            "fnames": json.dumps(metrics["feature_names"]),
            "hparams": json.dumps(metrics["hyperparams"]),
            "auc": metrics["cv_auc_mean"],
            "auc_std": metrics["cv_auc_std"],
            "f1": metrics["cv_f1_mean"],
            "fi": json.dumps(shap_data["feature_importances"]),
            "shap_abs": json.dumps(shap_data["shap_mean_abs"]),
            "shap_dir": json.dumps(shap_data["shap_direction"]),
            "blob": model_blob,
            "narrative": narrative,
            "factors": top_factors_json,
        },
    )

    # Update training job
    await db.execute(
        text("""
            UPDATE nexus_training_jobs SET status = 'complete', completed_at = NOW()
            WHERE org_id = CAST(:oid AS uuid) AND status = 'running'
        """),
        {"oid": org_id},
    )
    await db.commit()

    return {
        "status": "ready",
        "version": next_version,
        "n_training_samples": metrics["n_training_samples"],
        "cv_auc": metrics["cv_auc_mean"],
        "cv_f1": metrics["cv_f1_mean"],
        "narrative": narrative,
    }


# ═══════════════════════════════════════════════════════════════════════
# WIN DNA (Layer 2 output)
# ═══════════════════════════════════════════════════════════════════════

@nexus_router.get("/win-dna", response_model=WinDNAResponse)
async def get_win_dna(
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Get the Win DNA dashboard data for this org."""
    result = await db.execute(
        text("""
            SELECT * FROM nexus_models
            WHERE org_id = CAST(:oid AS uuid) AND status = 'ready'
            ORDER BY version DESC LIMIT 1
        """),
        {"oid": org_id},
    )
    model = result.mappings().fetchone()
    if not model:
        raise HTTPException(404, "No trained model found. Run /train first.")

    factors = model.get("win_dna_top_factors") or {}
    if isinstance(factors, str):
        factors = json.loads(factors)

    win_factors = [WinDNAFactor(**f) for f in (factors.get("win_factors") or [])[:10]]
    loss_factors = [WinDNAFactor(**f) for f in (factors.get("loss_factors") or [])[:10]]

    return WinDNAResponse(
        org_id=org_id,
        model_version=model["version"],
        n_training_samples=model["n_training_samples"] or 0,
        cv_auc=float(model["cv_auc_mean"]) if model["cv_auc_mean"] else 0.0,
        top_win_factors=win_factors,
        top_loss_factors=loss_factors,
        narrative=model.get("win_dna_narrative") or "",
        trained_at=model.get("trained_at"),
        ready=True,
    )


# ═══════════════════════════════════════════════════════════════════════
# SIMULATION (Layer 3)
# ═══════════════════════════════════════════════════════════════════════

@nexus_router.post("/simulate", response_model=SimulationResponse)
async def run_simulation(
    payload: SimulateRequest,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Run scenario simulation on a live deal."""
    # Load model
    model_r = await db.execute(
        text("""
            SELECT id, version, model_blob, feature_names
            FROM nexus_models
            WHERE org_id = CAST(:oid AS uuid) AND status = 'ready'
            ORDER BY version DESC LIMIT 1
        """),
        {"oid": org_id},
    )
    model_row = model_r.mappings().fetchone()
    if not model_row:
        raise HTTPException(404, "No trained model. Run /train first.")

    model_blob = model_row["model_blob"]
    if not model_blob:
        raise HTTPException(500, "Model blob missing")

    model_tuple = deserialize_model(model_blob)
    feature_names = model_row["feature_names"]
    if isinstance(feature_names, str):
        feature_names = json.loads(feature_names)

    # Get training data for SHAP baseline
    train_r = await db.execute(
        text("SELECT * FROM nexus_deal_features WHERE org_id = CAST(:oid AS uuid)"),
        {"oid": org_id},
    )
    train_rows = [dict(r) for r in train_r.mappings().fetchall()]
    X_train, _ = prepare_feature_matrix(train_rows)

    # Extract live deal features
    features = await extract_features_for_deal(db, payload.deal_id, org_id)
    if not features:
        raise HTTPException(404, "Deal not found or insufficient data")

    deal_value = features.get("final_deal_value", 0)
    erp_margin_floor = 0.10  # 10% minimum margin

    # Run simulation
    simulator = ScenarioSimulator(model_tuple, X_train)
    sim_result = simulator.run_full_simulation(
        base_features=features,
        deal_value=deal_value,
        erp_margin_floor_pct=erp_margin_floor,
        n_scenarios=payload.n_scenarios,
    )

    # Store simulation
    await db.execute(
        text("""
            INSERT INTO nexus_simulations (
                deal_id, org_id, model_id, input_feature_snapshot,
                n_scenarios, simulation_type,
                baseline_win_prob, baseline_expected_value,
                scenario_results,
                recommended_action_type, recommended_action_params,
                recommended_win_prob_new, recommended_ev_new,
                recommended_net_rev_delta, recommended_reasoning,
                erp_margin_floor_pct, erp_validated, erp_flags,
                status, run_duration_ms, completed_at
            ) VALUES (
                CAST(:did AS uuid), CAST(:oid AS uuid), CAST(:mid AS uuid),
                :snapshot::jsonb, :n_sc, :sim_type,
                :bp, :bev, :scenarios::jsonb,
                :rat, :rap::jsonb, :rwp, :rev, :rnd, :rr,
                :emf, :ev, :ef::jsonb,
                'complete', :dur, NOW()
            )
            RETURNING id
        """),
        {
            "did": payload.deal_id,
            "oid": org_id,
            "mid": str(model_row["id"]),
            "snapshot": json.dumps({k: v for k, v in features.items() if k in FEATURE_COLUMNS}, default=str),
            "n_sc": payload.n_scenarios,
            "sim_type": payload.simulation_type.value,
            "bp": sim_result["baseline_win_prob"],
            "bev": sim_result["baseline_expected_value"],
            "scenarios": json.dumps(sim_result["scenario_results"], default=str),
            "rat": sim_result["recommended_action_type"],
            "rap": json.dumps(sim_result["recommended_action_params"], default=str),
            "rwp": sim_result["recommended_win_prob_new"],
            "rev": sim_result["recommended_ev_new"],
            "rnd": sim_result["recommended_net_rev_delta"],
            "rr": sim_result["recommended_reasoning"],
            "emf": sim_result["erp_margin_floor_pct"],
            "ev": sim_result["erp_validated"],
            "ef": json.dumps(sim_result["erp_flags"]),
            "dur": sim_result["run_duration_ms"],
        },
    )
    await db.commit()

    # Get the simulation ID
    sim_id_r = await db.execute(
        text("""
            SELECT id FROM nexus_simulations
            WHERE deal_id = CAST(:did AS uuid) AND org_id = CAST(:oid AS uuid)
            ORDER BY created_at DESC LIMIT 1
        """),
        {"did": payload.deal_id, "oid": org_id},
    )
    sim_id = str(sim_id_r.scalar())

    return SimulationResponse(
        simulation_id=sim_id,
        deal_id=payload.deal_id,
        baseline_win_prob=sim_result["baseline_win_prob"],
        baseline_expected_value=sim_result["baseline_expected_value"],
        recommended_action_type=sim_result["recommended_action_type"],
        recommended_action_params=sim_result["recommended_action_params"],
        recommended_win_prob_new=sim_result["recommended_win_prob_new"],
        recommended_ev_new=sim_result["recommended_ev_new"],
        recommended_net_rev_delta=sim_result["recommended_net_rev_delta"],
        recommended_reasoning=sim_result["recommended_reasoning"],
        top_scenarios=[ScenarioResult(**s) for s in sim_result["scenario_results"]],
        erp_validated=sim_result["erp_validated"],
        erp_flags=sim_result["erp_flags"],
        model_version=model_row["version"],
        run_duration_ms=sim_result["run_duration_ms"],
    )


# ═══════════════════════════════════════════════════════════════════════
# SIMULATION HISTORY
# ═══════════════════════════════════════════════════════════════════════

@nexus_router.get("/simulations/{deal_id}")
async def get_simulations(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Get simulation history for a deal."""
    result = await db.execute(
        text("""
            SELECT id, baseline_win_prob, baseline_expected_value,
                   recommended_action_type, recommended_action_params,
                   recommended_win_prob_new, recommended_ev_new,
                   recommended_net_rev_delta, recommended_reasoning,
                   scenario_results, erp_validated,
                   run_duration_ms, created_at
            FROM nexus_simulations
            WHERE deal_id = CAST(:did AS uuid) AND org_id = CAST(:oid AS uuid)
            ORDER BY created_at DESC LIMIT 10
        """),
        {"did": deal_id, "oid": org_id},
    )
    rows = result.mappings().fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════════════════════════
# ARTIFACTS (Layer 4)
# ═══════════════════════════════════════════════════════════════════════

@nexus_router.post("/artifacts/generate")
async def generate_artifacts(
    payload: GenerateArtifactRequest,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Generate execution artifacts from a simulation."""
    # Load simulation
    sim_r = await db.execute(
        text("""
            SELECT * FROM nexus_simulations
            WHERE id = CAST(:sid AS uuid) AND org_id = CAST(:oid AS uuid)
        """),
        {"sid": payload.simulation_id, "oid": org_id},
    )
    sim = sim_r.mappings().fetchone()
    if not sim:
        raise HTTPException(404, "Simulation not found")

    # Load deal
    deal_r = await db.execute(
        text("SELECT * FROM deals WHERE id = CAST(:did AS uuid) AND org_id = CAST(:oid AS uuid)"),
        {"did": payload.deal_id, "oid": org_id},
    )
    deal = deal_r.mappings().fetchone()
    if not deal:
        raise HTTPException(404, "Deal not found")

    deal_data = dict(deal)
    sim_result = {
        "recommended_action_params": sim["recommended_action_params"] or {},
        "recommended_win_prob_new": float(sim["recommended_win_prob_new"] or 0),
        "recommended_ev_new": float(sim["recommended_ev_new"] or 0),
        "recommended_net_rev_delta": float(sim["recommended_net_rev_delta"] or 0),
        "recommended_reasoning": sim["recommended_reasoning"] or "",
    }

    client = _get_openai_client()
    artifacts = []

    for art_type in payload.artifact_types:
        generator = GENERATORS.get(art_type.value)
        if not generator:
            continue

        try:
            content = await generator(sim_result, deal_data, client)
            meta = content.pop("_meta", {})

            await db.execute(
                text("""
                    INSERT INTO nexus_artifacts (
                        simulation_id, deal_id, org_id,
                        artifact_type, status, content_json,
                        llm_model_used, prompt_tokens, generation_ms
                    ) VALUES (
                        CAST(:sid AS uuid), CAST(:did AS uuid), CAST(:oid AS uuid),
                        :atype, 'ready', :content::jsonb,
                        :model, :tokens, :ms
                    )
                    RETURNING id
                """),
                {
                    "sid": payload.simulation_id,
                    "did": payload.deal_id,
                    "oid": org_id,
                    "atype": art_type.value,
                    "content": json.dumps(content, default=str),
                    "model": meta.get("llm_model", "gpt-4o"),
                    "tokens": meta.get("tokens", 0),
                    "ms": meta.get("generation_ms", 0),
                },
            )

            art_id_r = await db.execute(
                text("""
                    SELECT id, created_at FROM nexus_artifacts
                    WHERE simulation_id = CAST(:sid AS uuid)
                      AND deal_id = CAST(:did AS uuid)
                      AND artifact_type = :atype
                    ORDER BY created_at DESC LIMIT 1
                """),
                {"sid": payload.simulation_id, "did": payload.deal_id, "atype": art_type.value},
            )
            art_row = art_id_r.mappings().fetchone()

            artifacts.append(ArtifactResponse(
                artifact_id=str(art_row["id"]),
                artifact_type=art_type.value,
                status="ready",
                content_json=content,
                created_at=art_row["created_at"],
            ))

        except Exception as e:
            logger.exception("Artifact generation failed: %s", art_type.value)
            artifacts.append(ArtifactResponse(
                artifact_id="",
                artifact_type=art_type.value,
                status="failed",
                content_json={"error": str(e)},
            ))

    await db.commit()
    return artifacts


@nexus_router.get("/artifacts/{deal_id}")
async def get_artifacts(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    """Get all artifacts for a deal."""
    result = await db.execute(
        text("""
            SELECT id, simulation_id, artifact_type, status,
                   content_json, created_at
            FROM nexus_artifacts
            WHERE deal_id = CAST(:did AS uuid) AND org_id = CAST(:oid AS uuid)
            ORDER BY created_at DESC
        """),
        {"did": deal_id, "oid": org_id},
    )
    rows = result.mappings().fetchall()
    return [dict(r) for r in rows]
