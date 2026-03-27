import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text as sa_text

from app.config import settings
from app.database import init_db, engine
from app.rate_limit import limiter, rate_limit_exceeded_handler
from app.routers import deals, ingest, pulse_sync, transcription, analytics, reports, organisations
from nexus.router import nexus_router

from slowapi import _rate_limit_exceeded_handler  # noqa: F401
from slowapi.errors import RateLimitExceeded

# ── Structured logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
)
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


# ── API v1 routers ────────────────────────────────────────────────────────────
app.include_router(deals.router,          prefix="/v1")
app.include_router(ingest.router,         prefix="/v1")
app.include_router(pulse_sync.router,     prefix="/v1")
app.include_router(transcription.router,  prefix="/v1")
app.include_router(analytics.router,      prefix="/v1")
app.include_router(reports.router,        prefix="/v1")
app.include_router(organisations.router,  prefix="/v1")

# ── NEXUS — Revenue Simulation Engine ────────────────────────────────────────
app.include_router(nexus_router, prefix="/api/nexus", tags=["nexus"])

# ── Backward-compatible unversioned routes (remove after frontend migration) ──
app.include_router(deals.router)
app.include_router(ingest.router)
app.include_router(pulse_sync.router)
app.include_router(transcription.router)
app.include_router(analytics.router)
app.include_router(reports.router)
app.include_router(organisations.router)
