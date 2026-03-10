from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import deals, ingest, pulse_sync, transcription, analytics, reports

app = FastAPI(title="Synvelo API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


app.include_router(deals.router)
app.include_router(ingest.router)
app.include_router(pulse_sync.router)
app.include_router(transcription.router)
app.include_router(analytics.router)
app.include_router(reports.router)