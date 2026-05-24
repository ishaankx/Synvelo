import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text as sa_text

from app.config import settings
from app.database import init_db, engine
from app.rate_limit import limiter, rate_limit_exceeded_handler
from app.roles import require_role
from app.routers import deals, ingest, pulse_sync, transcription, analytics, reports, organisations, activity, deal_ask_ai
from nexus.router import nexus_router

from slowapi import _rate_limit_exceeded_handler  # noqa: F401
from slowapi.errors import RateLimitExceeded

# ── Structured logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
)
# Silence noisy third-party loggers — DEBUG floods the console otherwise.
for noisy in ("httpx", "httpcore", "httpcore.connection", "httpcore.http11",
              "openai", "openai._base_client", "urllib3", "asyncio"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

logger = logging.getLogger("synvelo")


# ── Lifespan (replaces deprecated @app.on_event) ─────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Synvelo API — env=%s", settings.environment)
    await init_db()
    yield
    logger.info("Shutting down Synvelo API")


app = FastAPI(
    title="Synvelo API",
    version="2.1.0",
    description="AI Revenue Execution Intelligence Platform",
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# ── Rate limiting ────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# ── CORS — environment-configurable ───────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check — verifies DB connectivity ───────────────────────────────────
@app.get("/health", tags=["system"])
async def health():
    try:
        async with engine.connect() as conn:
            await conn.execute(sa_text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    status = "ok" if db_ok else "degraded"
    return {"status": status, "version": "2.1.0", "database": db_ok}


# ── RBAC baseline — every protected router requires at least 'viewer'.
# Stricter roles (member/admin/owner) are enforced inside individual endpoints.
# `organisations.router` is intentionally excluded so signup can bootstrap a
# new workspace before any role is assigned.
viewer_dep = [Depends(require_role("viewer", "member", "admin", "owner"))]

# ── API v1 routers ────────────────────────────────────────────────────────────
app.include_router(deals.router,          prefix="/v1", dependencies=viewer_dep)
app.include_router(ingest.router,         prefix="/v1", dependencies=viewer_dep)
app.include_router(pulse_sync.router,     prefix="/v1", dependencies=viewer_dep)
app.include_router(transcription.router,  prefix="/v1", dependencies=viewer_dep)
app.include_router(analytics.router,      prefix="/v1", dependencies=viewer_dep)
app.include_router(reports.router,        prefix="/v1", dependencies=viewer_dep)
app.include_router(organisations.router,  prefix="/v1")  # public — onboarding
app.include_router(activity.router,       prefix="/v1", dependencies=viewer_dep)
app.include_router(deal_ask_ai.router,    prefix="/v1", dependencies=viewer_dep)

# ── NEXUS — Revenue Simulation Engine ────────────────────────────────────────
app.include_router(nexus_router, prefix="/api/nexus", tags=["nexus"], dependencies=viewer_dep)

# ── Backward-compatible unversioned routes (remove after frontend migration) ──
app.include_router(deals.router,          dependencies=viewer_dep)
app.include_router(ingest.router,         dependencies=viewer_dep)
app.include_router(pulse_sync.router,     dependencies=viewer_dep)
app.include_router(transcription.router,  dependencies=viewer_dep)
app.include_router(analytics.router,      dependencies=viewer_dep)
app.include_router(reports.router,        dependencies=viewer_dep)
app.include_router(organisations.router)  # public — onboarding
app.include_router(activity.router,       dependencies=viewer_dep)
app.include_router(deal_ask_ai.router,    dependencies=viewer_dep)
