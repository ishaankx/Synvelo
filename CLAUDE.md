# CLAUDE.md — Synvelo Codebase Intelligence

> Last generated: 2026-03-29 (initial), updated 2026-04-30 (settings hub redesign + live FX + collapsible sidebar)
> This file is the single source of truth for understanding the Synvelo codebase.
> Read this BEFORE writing any code.

---

## 1. PRODUCT OVERVIEW

### 1.1 What is Synvelo?

Synvelo is an AI Revenue Execution Intelligence Platform for B2B sales teams. It takes unstructured deal artifacts (call recordings, PDFs, emails, notes) and transforms them into structured, scored, and actionable deal intelligence. The system tracks deals through a defined pipeline, applies ML-based win probability scoring, and provides an AI assistant (ARIA) to answer natural-language questions about any deal.

Key differentiator: the NEXUS Revenue Simulation Engine trains an XGBoost model on the organization's own historical closed deals and runs Bayesian scenario simulations ("what happens to win probability if I offer a 10% discount?") with an ERP margin floor constraint.

### 1.2 Product Architecture Summary

```
Frontend (Next.js 16)  ──HTTP──>  FastAPI 2.1.0 Backend
                                        |
                                  PostgreSQL + pgvector
                                  Redis (rate limiting + AI usage metering)
                                  OpenAI API (GPT-4o, GPT-4o-mini, Whisper, text-embedding-3-small)
                                  Supabase (auth — JWT issuer only)
```

The backend is a FastAPI monolith. There is no message queue; background work runs via FastAPI's `BackgroundTasks` (transcription) or `asyncio.create_task` (NEXUS feature extraction, activity logging). The frontend is a pure React SPA with no server components active; all data fetching is done in client components via `axios` and `fetch`.

### 1.3 Feature Map

| Feature | Frontend Page/Component | Backend Router | Key Service |
|---|---|---|---|
| Deal Pipeline (CRUD + Kanban) | `/deals` page | `/v1/deals/` | — |
| Deal Detail (full view) | `/deals/[id]` page | `/v1/deals/{id}` | — |
| AI Scoring (win prob + MEDDIC + signals) | Deal detail → Score button | `POST /v1/deals/{id}/score` | `scoring.py` |
| Document Upload + RAG | `UploadZone`, `EvidencePanel` | `POST /v1/ingest/upload` | `embeddings.py` |
| Deal Brief (executive summary) | `DealBriefModal` | `POST /v1/deals/{id}/brief` | `brief_service.py` |
| Follow-up Email Generator | `FollowupModal` | `POST /v1/deals/{id}/followup` | `brief_service.py` |
| Ask AI (ReAct SSE agent) | `AskAITab` | `POST /v1/deals/{id}/ask-ai/query` | `react_agent.py`, `ask_ai_tools.py` |
| Sentiment Timeline | `SentimentTimeline` | `GET /v1/deals/{id}/sentiment-timeline` | `embeddings.py` |
| Score History Timeline | `DealHealthTimeline` | `GET /v1/deals/{id}/score-history` | `scoring.py` |
| MEDDIC Panel | `MEDDICPanel` | embedded in deal GET response | `scoring.py` |
| Signal Cards | `SignalCards` | embedded in deal GET response | `scoring.py` |
| Stage Pipeline | `StagePipelineBar`, `StageAdvancePanel` | `PATCH /v1/deals/{id}/stage` | `stages.py` |
| Stage History | `StageHistoryTimeline` | `GET /v1/deals/{id}/stage/history` | — |
| Exit Criteria Checklist | `ExitCriteriaChecklist` | `GET/PATCH/POST /v1/deals/{id}/exit-criteria` | — |
| Journey Report (PDF) | `JourneyReportPanel` | `POST /v1/reports/journey/{id}/generate` | `journey_report_service.py` |
| Intelligence Report (PDF) | `/reports` page | `POST /v1/reports/generate/{id}` | `report_service.py` |
| Call Transcription | `CallCaptureZone`, `/transcribe` page | `POST /v1/transcribe/upload` | `transcription_service.py` |
| Pulse Sync (ERP mock) | `PulseSyncChat`, `/pulse` page | `POST /v1/pulse/query` | `erp_mock.py` |
| Analytics Dashboard | `/analytics` page | `GET /v1/analytics/summary` | `analytics_service.py` |
| Activity Log | `/activity` page | `GET /v1/activity/` | `activity_service.py` |
| NEXUS — Feature Extraction | `/nexus` page | `POST /api/nexus/extract-all` | `feature_extractor.py` |
| NEXUS — Model Training | `/nexus` page | `POST /api/nexus/train` | `model_trainer.py` |
| NEXUS — Win DNA | `/nexus/win-dna` page | `GET /api/nexus/win-dna` | `model_trainer.py` |
| NEXUS — Scenario Simulation | `/nexus/simulate` page | `POST /api/nexus/simulate` | `simulator.py` |
| NEXUS — Execution Artifacts | `/nexus/artifacts` page | `POST /api/nexus/artifacts/generate` | `artifact_generator.py` |
| Organisation Management | — | `POST /v1/organisations/` | — |
| Settings Hub (8 sub-pages) | `/settings/*` (left-rail shell) | mostly client-side + `/health`, `/analytics/usage`, `/organisations/{id}` | `userPrefs.ts`, `currencyContext.tsx` |

---

## 2. TECH STACK

### 2.1 Frontend

| Item | Version / Detail |
|---|---|
| Framework | Next.js 16.1.6 |
| React | 19.2.3 |
| Language | TypeScript 5 (strict mode) |
| CSS | Tailwind CSS 4 |
| UI primitives | Radix UI 1.4.3, shadcn/ui 4.0.0 |
| Icons | Lucide React 0.577.0 |
| HTTP client | Axios 1.13.6 |
| Charts | Recharts 3.8.0 |
| Auth | @supabase/supabase-js 2.99.0 |
| File upload | react-dropzone 15.0.0 |
| Utility | clsx, class-variance-authority, tailwind-merge |

### 2.2 Backend

| Item | Version / Detail |
|---|---|
| Framework | FastAPI 2.x (async) |
| Server | Uvicorn |
| ORM | SQLAlchemy 2.x (async, mapped_column style) |
| DB driver | asyncpg via sqlalchemy+asyncpg |
| Validation | Pydantic v2 (pydantic-settings for config) |
| Rate limiting | slowapi (Redis or in-memory fallback) |
| LLM | openai Python SDK |
| ML | xgboost, scikit-learn, shap, numpy, pandas, scipy |
| PDF generation | ReportLab (reports + transcription PDFs) |
| PDF extraction | PyMuPDF (fitz) |
| Audio transcription | OpenAI Whisper (via openai SDK) |
| Vector DB | pgvector (PostgreSQL extension) |
| Auth validation | PyJWT |
| Async HTTP | httpx (for JWKS fetching) |
| File I/O | aiofiles |
| Serialization | joblib (model persistence), base64 |

### 2.3 Database

- **Engine**: PostgreSQL with pgvector extension
- **Connection**: `postgresql+asyncpg://synvelo:synvelo_pass@localhost:5432/synvelo_db` (dev)
- **Connection pool**: size=10, max_overflow=20, pool_recycle=1800s, pool_pre_ping=True
- **Schema management**: custom migration scripts (`backend/migration*.py`) — not Alembic
- **Tables**: 22 tables (see Section 4)

### 2.4 AI/ML Stack

| Component | Model/Tool | Used for |
|---|---|---|
| Deal scoring | GPT-4o | Win probability, MEDDIC, signals, risk flags |
| Deal brief/followup | GPT-4o | Executive brief, follow-up email generation |
| Ask AI (ARIA) | GPT-4o-mini | ReAct agent loop (up to 6 iterations) |
| Conversation summary | GPT-4o-mini | Rolling summary of 8+ message conversations |
| Suggested questions | GPT-4o-mini | 3 context-aware suggested questions |
| Win DNA narrative | GPT-4o | Human-readable SHAP interpretation |
| Transcription | Whisper-1 (whisper-1 API) | Audio file → raw text |
| Transcript formatting | GPT-4o | Whisper output → speaker-labeled clean transcript |
| Sentiment analysis | GPT-4o-mini | Per-document sentiment score (−1 to +1) |
| Report generation (Type 1) | GPT-4o | Intelligence report JSON → PDF |
| Report generation (Type 2) | GPT-4o | Journey report narrative |
| Embedding | text-embedding-3-small | 1536-dimensional document chunks |
| RAG retrieval | pgvector cosine similarity (`<=>`) | Chunk retrieval |
| NEXUS ML model | XGBoost + SHAP + Isotonic calibration | Win probability from 40 engineered features |

### 2.5 External Services & APIs

| Service | Purpose |
|---|---|
| OpenAI | All LLM calls + Whisper transcription + embeddings |
| Supabase | Auth (JWT issuance, JWKS endpoint) — NOT used as DB |
| Redis | Rate limit state + AI usage metering (optional in dev) |
| PostgreSQL | Primary database |

### 2.6 Development Tools & Commands

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001

# Run migrations (order matters):
python migration.py                     # base schema
python migration_reports.py             # deal_reports table
python migration_multitenancy.py        # organisations + org_id columns
python migration_stages.py              # stage pipeline + deal_stage_history
python migration_exit_criteria.py       # deal_exit_criteria
python migration_activity.py            # activity_logs
python migration_nexus.py               # NEXUS tables
python migration_nexus_stage_features.py # Stage columns in nexus + score_history
python migration_ask_ai_kg.py           # KG tables + deal_ai_conversations
python migration_journey.py             # journey report type

# Frontend
cd frontend
npm install
npm run dev        # starts on port 3000
npm run build
npm run lint
```

API docs available at `http://localhost:8001/docs` (dev only; hidden in production).

---

## 3. REPOSITORY STRUCTURE

### 3.1 Directory Map

```
/home/wolve/projects/synvelo/
├── CLAUDE.md                          # This file
├── .github/
│   └── workflows/
│       ├── ci.yml                     # CI pipeline
│       └── cd.yml                     # CD pipeline
├── backend/
│   ├── main.py                        # FastAPI app factory, router registration
│   ├── .env                           # Environment variables (NOT committed in prod)
│   ├── migration.py                   # Base migration (deals, docs, score_history, transcriptions)
│   ├── migration_reports.py           # deal_reports table
│   ├── migration_multitenancy.py      # organisations table + org_id columns
│   ├── migration_stages.py            # deal_stage_history table + stage_entered_at
│   ├── migration_exit_criteria.py     # deal_exit_criteria table
│   ├── migration_activity.py          # activity_logs table
│   ├── migration_nexus.py             # All 5 NEXUS tables
│   ├── migration_nexus_stage_features.py  # Stage columns in nexus_deal_features + score_history
│   ├── migration_ask_ai_kg.py         # deal_kg_nodes, deal_kg_edges, deal_ai_conversations
│   ├── migration_journey.py           # Journey report type migration
│   ├── app/
│   │   ├── config.py                  # Settings (pydantic-settings, reads .env)
│   │   ├── database.py                # SQLAlchemy engine + ALL ORM models + init_db()
│   │   ├── dependencies.py            # get_org_id(), get_current_user() (JWT auth)
│   │   ├── rate_limit.py              # slowapi limiter + AI usage metering (Redis)
│   │   ├── stages.py                  # Stage configs, order, validation, STAGE_CONFIGS dict
│   │   ├── models/
│   │   │   └── schemas.py             # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── deals.py               # All deal endpoints (CRUD + AI actions + stage)
│   │   │   ├── ingest.py              # File upload + document listing
│   │   │   ├── deal_ask_ai.py         # SSE ReAct agent + conversation management
│   │   │   ├── analytics.py           # Pipeline summary + AI usage stats
│   │   │   ├── reports.py             # Intelligence + Journey report endpoints
│   │   │   ├── transcription.py       # Audio/URL transcription endpoints
│   │   │   ├── pulse_sync.py          # ERP mock query/approval
│   │   │   ├── organisations.py       # Org create/get
│   │   │   └── activity.py            # Activity log feed
│   │   └── services/
│   │       ├── scoring.py             # GPT-4o deal scoring — win prob + MEDDIC + signals
│   │       ├── embeddings.py          # Chunk, embed (text-embedding-3-small), ingest pipeline
│   │       ├── rag.py                 # Vector similarity retrieval + RAG generation
│   │       ├── react_agent.py         # ReAct agent loop + deal summary builder
│   │       ├── ask_ai_tools.py        # 9 ReAct tools (DB queries for agent)
│   │       ├── brief_service.py       # Executive brief + follow-up email generation
│   │       ├── analytics_service.py   # Pipeline KPIs, funnel, signals, owners
│   │       ├── activity_service.py    # log_activity() — fire-and-forget INSERT
│   │       ├── tracking_service.py    # track_field_edit(), track_ai_feature()
│   │       ├── transcription_service.py  # Whisper → format → PDF → ingest pipeline
│   │       ├── report_service.py      # Intelligence Report PDF generation
│   │       ├── journey_report_service.py  # Journey Report PDF generation
│   │       ├── journey_aggregator.py  # Aggregates all deal history for journey reports
│   │       └── erp_mock.py            # Mock SAP/ERP inventory + shipping data
│   └── nexus/
│       ├── __init__.py
│       ├── router.py                  # All /api/nexus/* endpoints
│       ├── schemas.py                 # Pydantic models for NEXUS
│       ├── feature_extractor.py       # 40-feature extraction from DB (Layer 1)
│       ├── model_trainer.py           # XGBoost + SHAP + calibration (Layer 2)
│       ├── simulator.py               # Bayesian scenario simulation (Layer 3)
│       ├── artifact_generator.py      # GPT-4o artifact generation (Layer 4)
│       └── prompts.py                 # WIN_DNA_NARRATIVE_PROMPT
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout — wraps everything in ClientProviders + AuthGuard + Sidebar
│   │   ├── page.tsx                   # Root redirect (→ /deals)
│   │   ├── globals.css                # Tailwind base + syn-* utility classes
│   │   ├── login/page.tsx             # Login page (Supabase magic link / email+password)
│   │   ├── deals/
│   │   │   ├── page.tsx               # Deal list: search, filter, sort, create, delete
│   │   │   └── [id]/page.tsx          # Deal detail: all tabs
│   │   ├── analytics/page.tsx         # Analytics dashboard (3 tabs)
│   │   ├── nexus/
│   │   │   ├── page.tsx               # NEXUS hub — status + extract + train
│   │   │   ├── win-dna/page.tsx       # Win DNA viewer
│   │   │   ├── simulate/page.tsx      # Scenario simulator
│   │   │   └── artifacts/page.tsx     # Execution artifacts
│   │   ├── pulse/page.tsx             # Pulse Sync ERP chat
│   │   ├── reports/page.tsx           # All reports list + download
│   │   ├── transcribe/page.tsx        # Transcription upload page
│   │   ├── activity/page.tsx          # Activity log feed
│   │   └── settings/                  # Settings hub with left-rail shell
│   │       ├── layout.tsx             # Settings shell — left rail nav + content panel
│   │       ├── page.tsx               # Redirects to /settings/profile
│   │       ├── profile/page.tsx       # Display name (editable), email, IDs, sign-in history
│   │       ├── security/page.tsx      # Session age, password reset, sign-out
│   │       ├── workspace/page.tsx     # Org details, plan badge, support contact
│   │       ├── usage/page.tsx         # Monthly AI usage + rate-limit reference
│   │       ├── currency/page.tsx      # Consolidation currency + live ECB FX rates
│   │       ├── notifications/page.tsx # Browser permission + alert toggles
│   │       ├── appearance/page.tsx    # Theme (light only), density, UI toggles
│   │       └── integrations/page.tsx  # External service connection status
│   ├── components/
│   │   ├── AuthGuard.tsx              # Session guard with 4s timeout fallback
│   │   ├── ClientProviders.tsx        # 'use client' wrapper hosting CurrencyProvider
│   │   ├── Sidebar.tsx                # Left navigation sidebar (with Settings link)
│   │   ├── AskAITab.tsx               # SSE streaming chat UI for ARIA
│   │   ├── SignalCards.tsx            # Red/yellow/green signal display
│   │   ├── MEDDICPanel.tsx            # 6-dimension MEDDIC qualification view
│   │   ├── DealHealthTimeline.tsx     # Win probability over time chart
│   │   ├── SentimentTimeline.tsx      # Document sentiment over time
│   │   ├── DealBriefModal.tsx         # Executive brief modal
│   │   ├── FollowupModal.tsx          # Follow-up email modal
│   │   ├── CallCaptureZone.tsx        # Audio upload + URL transcription UI
│   │   ├── UploadZone.tsx             # Document drag-and-drop upload
│   │   ├── EvidencePanel.tsx          # RAG evidence display
│   │   ├── PulseSyncChat.tsx          # ERP chat interface
│   │   ├── ScoreGauge.tsx             # SVG arc probability gauge (dark theme)
│   │   ├── StageAdvancePanel.tsx      # Stage transition buttons + confirmation
│   │   ├── StageHistoryTimeline.tsx   # Vertical timeline of stage changes
│   │   ├── StagePipelineBar.tsx       # Horizontal pipeline progress bar
│   │   ├── ExitCriteriaChecklist.tsx  # Stage exit criteria checkboxes
│   │   ├── JourneyReportPanel.tsx     # Journey report generation + list
│   │   ├── DealCard.tsx               # Deal summary card (used in list)
│   │   ├── SettingsHeader.tsx         # h1 + subtitle block for /settings/* pages
│   │   └── SettingsSection.tsx        # Reusable titled card section primitive
│   ├── lib/
│   │   ├── api.ts                     # All API wrappers (axios instance + typed calls)
│   │   ├── supabase.ts                # Supabase client (auth only)
│   │   ├── stage-utils.ts             # Stage types, colors, order, transitions
│   │   ├── currency.ts                # Multi-currency formatting (8 currencies)
│   │   ├── exchangeRates.ts           # fetchLiveRates() (Frankfurter API) + 24h cache + convertCurrency
│   │   ├── currencyContext.tsx        # CurrencyProvider with consolidationCurrency + live rates + convert()
│   │   ├── userPrefs.ts               # useUserPrefs() — localStorage prefs (notifications, density, etc.)
│   │   └── utils.ts                   # cn() class merger utility
│   ├── next.config.ts                 # Minimal config (no rewrites)
│   └── tsconfig.json                  # @/* → ./* path alias
```

### 3.2 File Naming Conventions

- **Backend**: snake_case for all Python files and functions
- **Frontend**: PascalCase for components (`AskAITab.tsx`), camelCase for lib files (`api.ts`)
- **API routes**: kebab-case path segments (`/ask-ai/query`, `/win-dna`)
- **DB columns**: snake_case
- **CSS classes**: `syn-*` prefix for custom utility classes (e.g., `syn-card`, `syn-bg`, `syn-text-primary`)

### 3.3 Import Path Aliases

`tsconfig.json` defines a single alias:
- `@/*` maps to `./` (the `frontend/` directory root)

Example: `import { supabase } from '@/lib/supabase'` resolves to `frontend/lib/supabase.ts`.

---

## 4. DATABASE SCHEMA (COMPLETE)

### 4.1 Entity Relationship Overview

```
organisations (1) ──< deals (1) ──< documents (1) ──< chunks (vector)
                            |──< score_history
                            |──< call_transcriptions
                            |──< deal_reports
                            |──< deal_stage_history
                            |──< deal_exit_criteria
                            |──< deal_field_edits
                            |──< deal_ai_usage_log
                            |──< deal_ai_conversations
                            |──< deal_kg_nodes ──< deal_kg_edges
                            |──< nexus_deal_features
                            |──< nexus_simulations ──< nexus_artifacts
organisations (1) ──< pulse_actions
                     activity_logs (org-scoped, no FK to deals)
                     nexus_models (org-scoped)
                     nexus_training_jobs (org-scoped)
```

### 4.2 Table Definitions

#### `organisations`
Created by: `migration_multitenancy.py`
```
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
name        TEXT NOT NULL
slug        TEXT NOT NULL UNIQUE
plan        TEXT NOT NULL DEFAULT 'free'
created_at  TIMESTAMPTZ DEFAULT now()
```
Default row: `00000000-0000-0000-0000-000000000001` / "Default Org" / "default" / "free"

---

#### `deals`
Created by: `database.py` (ORM), columns added by multiple migrations
```
id                  UUID (String in ORM) PRIMARY KEY DEFAULT gen_random_uuid()
name                VARCHAR(500) NOT NULL
company             VARCHAR(500)
stage               VARCHAR(100) DEFAULT 'Qualification'
                    CHECK (stage IN ('Discovery','Qualification','Demo','Proposal',
                                     'Negotiation','Closed Won','Closed Lost'))
value               FLOAT DEFAULT 0
currency            VARCHAR(3) DEFAULT 'USD'
owner               VARCHAR(200)
win_probability     FLOAT
probability_low     FLOAT                   -- lower bound of 80% CI
probability_high    FLOAT                   -- upper bound of 80% CI
time_to_close_days  INTEGER
score_summary       TEXT                    -- 2-3 sentence CRO-level assessment
risk_flags          JSONB DEFAULT '[]'      -- list of string risk statements
signals             JSONB DEFAULT '[]'      -- list of signal objects
meddic              JSONB DEFAULT '{}'      -- MEDDIC dimensions object
brief               TEXT                    -- JSON serialized BriefData
brief_generated_at  TIMESTAMP
last_scored_at      TIMESTAMP
stage_entered_at    TIMESTAMPTZ DEFAULT NOW()  -- when current stage was entered
created_at          TIMESTAMP DEFAULT NOW()
org_id              UUID NOT NULL INDEX REFERENCES organisations(id)
```
Relationships (lazy="select"): documents, score_history, transcriptions, stage_history, exit_criteria

---

#### `documents`
```
id              UUID PRIMARY KEY
deal_id         UUID FK → deals(id) ON DELETE CASCADE
filename        VARCHAR(500)
source_type     VARCHAR(50)          -- 'pdf', 'audio', 'text'
status          VARCHAR(20) DEFAULT 'processing'  -- 'processing' | 'done' | 'error'
content         TEXT                 -- extracted text (up to 50,000 chars)
sentiment_score FLOAT                -- -1.0 to 1.0
sentiment_label VARCHAR(20)          -- 'positive' | 'neutral' | 'negative'
created_at      TIMESTAMP DEFAULT NOW()
org_id          UUID NOT NULL INDEX
```

---

#### `chunks`
The vector search table. Each document is split into overlapping chunks.
```
id           UUID PRIMARY KEY
deal_id      UUID FK → deals(id) ON DELETE CASCADE
document_id  UUID FK → documents(id) ON DELETE CASCADE
text         TEXT             -- 400-word chunk with 80-word overlap
source_type  VARCHAR(50)
filename     VARCHAR(500)
chunk_index  INTEGER DEFAULT 0
embedding    vector(1536)     -- text-embedding-3-small output
created_at   TIMESTAMP DEFAULT NOW()
```

---

#### `score_history`
Time-series of win probability scores per deal.
```
id               UUID PRIMARY KEY
deal_id          UUID FK → deals(id) ON DELETE CASCADE
scored_at        TIMESTAMP DEFAULT NOW()
win_probability  FLOAT
probability_low  FLOAT
probability_high FLOAT
sentiment_avg    FLOAT               -- average document sentiment at time of scoring
trigger_type     VARCHAR(50) DEFAULT 'manual_score'  -- 'manual_score' | 'document_ingested'
trigger_document VARCHAR(500)        -- filename that triggered the score (if document_ingested)
deal_stage       TEXT                -- stage at time of scoring (added by migration_nexus_stage_features)
stage_health     TEXT                -- CHECK ('on_track','at_risk','stalled')
created_at       TIMESTAMP DEFAULT NOW()
```
Indexes: idx_sh_deal (deal_id), idx_sh_time (scored_at DESC)

---

#### `call_transcriptions`
```
id               UUID PRIMARY KEY
deal_id          UUID FK → deals(id) ON DELETE CASCADE
source_url       TEXT                -- for URL-based transcription
platform         VARCHAR(50) DEFAULT 'upload'  -- 'upload' | 'zoom' | etc.
status           VARCHAR(20) DEFAULT 'pending'  -- 'pending' | 'processing' | 'done' | 'error'
transcript_text  TEXT
pdf_filename     VARCHAR(500)        -- generated PDF name
duration_seconds INTEGER
attendees        TEXT
call_title       VARCHAR(500)
error_message    TEXT
created_at       TIMESTAMP DEFAULT NOW()
completed_at     TIMESTAMP
```
Index: idx_ct_deal (deal_id)

---

#### `deal_reports`
Generated PDF reports (both intelligence and journey types).
```
id           UUID PRIMARY KEY
deal_id      UUID FK → deals(id) ON DELETE CASCADE
org_id       UUID NOT NULL INDEX
filename     VARCHAR(500)
page_count   INTEGER DEFAULT 0
report_type  VARCHAR(50) DEFAULT 'intelligence'  -- 'intelligence' | 'journey'
report_json  JSONB                -- structured report data (stored for journey reports)
created_at   TIMESTAMP DEFAULT NOW()
```
Index: idx_deal_reports_deal_id, idx_deal_reports_org_id

---

#### `deal_stage_history`
```
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
deal_id      UUID FK → deals(id) ON DELETE CASCADE
from_stage   TEXT                -- NULL for initial stage
to_stage     TEXT NOT NULL
changed_at   TIMESTAMPTZ DEFAULT NOW()
changed_by   TEXT
reason       TEXT
triggered_by TEXT DEFAULT 'manual'  -- 'manual' | 'ai_recommendation' | 'system'
org_id       UUID NOT NULL
```
Indexes: idx_dsh_deal_id, idx_dsh_changed_at, idx_dsh_org_id
RLS: enabled with policy org_isolation_dsh

---

#### `deal_exit_criteria`
```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
deal_id         UUID FK → deals(id) ON DELETE CASCADE
stage           TEXT NOT NULL
criterion_text  TEXT NOT NULL
is_completed    BOOLEAN DEFAULT FALSE
is_custom       BOOLEAN DEFAULT FALSE     -- user-added vs. AI default
completed_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT NOW()
org_id          UUID NOT NULL
```
Indexes: idx_exit_criteria_deal_stage (deal_id, stage), idx_exit_criteria_org_id
RLS: enabled

---

#### `deal_field_edits`
Audit trail for field changes.
```
id          UUID PRIMARY KEY
deal_id     UUID FK → deals(id) ON DELETE CASCADE
field_name  TEXT NOT NULL
old_value   TEXT
new_value   TEXT
changed_by  VARCHAR(200)
changed_at  TIMESTAMPTZ DEFAULT NOW()
org_id      UUID NOT NULL INDEX
```

---

#### `deal_ai_usage_log`
Tracks which AI features were used per deal.
```
id             UUID PRIMARY KEY
deal_id        UUID FK → deals(id) ON DELETE CASCADE
feature_name   TEXT NOT NULL   -- 'score', 'brief', 'followup', 'ask_ai', 'ask_ai_v2', 'report_intelligence', etc.
triggered_by   VARCHAR(200)
triggered_at   TIMESTAMPTZ DEFAULT NOW()
result_summary JSONB
org_id         UUID NOT NULL INDEX
```

---

#### `activity_logs`
Org-wide event log. No FK to deals — stores entity_id as string.
```
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
event_type     VARCHAR(100) NOT NULL INDEX  -- see Event Types below
actor_id       VARCHAR(200)
actor_name     VARCHAR(200)
entity_type    VARCHAR(50) NOT NULL INDEX   -- 'deal' | 'document' | 'report' | 'transcription' | 'pulse' | 'nexus'
entity_id      VARCHAR(200) INDEX
entity_name    VARCHAR(500)
old_value      JSONB
new_value      JSONB
metadata_extra JSONB
created_at     TIMESTAMPTZ DEFAULT NOW() INDEX
org_id         UUID NOT NULL INDEX
```
RLS: enabled with policy org_isolation_activity

**Known event_type values**: `deal_created`, `deal_deleted`, `deal_scored`, `deal_stage_changed`, `deal_value_changed`, `deal_company_changed`, `deal_owner_changed`, `deal_time_to_close_days_changed`, `deal_ask_ai`, `brief_generated`, `followup_generated`, `document_uploaded`, `transcription_uploaded`, `transcription_from_url`, `report_generated`, `report_deleted`, `journey_report_generated`, `pulse_query`, `pulse_approved`, `nexus_model_trained`, `nexus_simulation_run`, `nexus_artifacts_generated`

---

#### `pulse_actions`
```
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
deal_id     UUID FK → deals(id) ON DELETE SET NULL (nullable)
query       TEXT NOT NULL
proposal    JSONB
raw_answer  TEXT
status      VARCHAR(20) DEFAULT 'pending'  -- 'pending' | 'approved' | 'rejected'
decision    VARCHAR(20)
decided_by  VARCHAR(200)
decided_at  TIMESTAMP
created_at  TIMESTAMP DEFAULT NOW()
org_id      UUID NOT NULL INDEX
```

---

#### `deal_ai_conversations`
Persistent Ask AI conversation memory.
```
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
deal_id    UUID NOT NULL
user_id    TEXT NOT NULL DEFAULT 'default'
title      TEXT           -- auto-set from first user message (first 60 chars)
messages   JSONB DEFAULT '[]'   -- array of {role, content, sources, suggestions, steps, timestamp}
summary    TEXT           -- rolling summary generated after 8+ messages
created_at TIMESTAMPTZ DEFAULT now()
updated_at TIMESTAMPTZ DEFAULT now()
```
Index: idx_ai_conv_deal (deal_id)

---

#### `deal_kg_nodes`
Knowledge graph nodes extracted from deal documents.
```
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
deal_id     UUID NOT NULL INDEX
node_type   VARCHAR(50) NOT NULL
            CHECK (node_type IN ('person','company','topic','objection','requirement',
                                 'decision','action_item','product_feature','competitor',
                                 'event','document_section','milestone','risk','champion','blocker'))
label       TEXT NOT NULL
properties  JSONB DEFAULT '{}'
embedding   vector(1536)
source_type VARCHAR(30)
source_id   TEXT
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```
Indexes: idx_kg_nodes_deal, idx_kg_nodes_type (deal_id, node_type), idx_kg_nodes_embedding (ivfflat, lists=50)

---

#### `deal_kg_edges`
```
id             UUID PRIMARY KEY
deal_id        UUID NOT NULL INDEX
source_node_id UUID NOT NULL
target_node_id UUID NOT NULL
relation_type  VARCHAR(50) NOT NULL
properties     JSONB DEFAULT '{}'
source_type    VARCHAR(30)
source_id      TEXT
created_at     TIMESTAMPTZ DEFAULT now()
```
Indexes: idx_kg_edges_deal, idx_kg_edges_source, idx_kg_edges_target

---

#### `nexus_deal_features`
ML feature matrix — one row per closed deal.
```
id                              UUID PRIMARY KEY
deal_id                         UUID UNIQUE FK → deals(id) ON DELETE CASCADE
org_id                          UUID NOT NULL INDEX
outcome                         SMALLINT NOT NULL CHECK (outcome IN (0, 1))
-- Stage-derived features (from deal_stage_history):
time_in_discovery_days          INTEGER
time_in_qualification_days      INTEGER
time_in_demo_days               INTEGER
time_in_proposal_days           INTEGER
time_in_negotiation_days        INTEGER
discovery_to_proposal_days      INTEGER
proposal_to_close_days          INTEGER
days_total_cycle                INTEGER
stage_velocity_score            NUMERIC(8,4)
n_stage_regressions             INTEGER DEFAULT 0
n_stage_skips                   INTEGER DEFAULT 0
n_total_stage_transitions       INTEGER DEFAULT 0
final_stage_before_terminal     TEXT
stage_health_numeric            NUMERIC(4,2)
-- Legacy timing:
days_first_call_to_proposal     INTEGER
days_proposal_to_close          INTEGER
days_since_last_activity        INTEGER
-- Activity:
num_calls                       INTEGER DEFAULT 0
num_emails                      INTEGER DEFAULT 0
num_docs_uploaded               INTEGER DEFAULT 0
-- Stakeholder:
num_stakeholders_engaged        INTEGER DEFAULT 0
economic_buyer_engaged          BOOLEAN DEFAULT FALSE
champion_identified             BOOLEAN DEFAULT FALSE
legal_review_triggered          BOOLEAN DEFAULT FALSE
multi_thread_score              NUMERIC(4,2)
-- MEDDIC:
meddic_completeness_score       NUMERIC(4,2) DEFAULT 0.0
meddic_metrics_filled           BOOLEAN DEFAULT FALSE
meddic_economic_buyer_filled    BOOLEAN DEFAULT FALSE
meddic_decision_criteria_filled BOOLEAN DEFAULT FALSE
meddic_champion_filled          BOOLEAN DEFAULT FALSE
-- Scoring trajectory:
win_prob_at_discovery           NUMERIC(5,4)
win_prob_at_proposal            NUMERIC(5,4)
win_prob_at_negotiation         NUMERIC(5,4)
win_prob_final                  NUMERIC(5,4)
sentiment_trend_slope           NUMERIC(8,6)
sentiment_volatility            NUMERIC(6,4)
max_sentiment_drop              NUMERIC(5,4)
-- Competitor/pricing:
competitor_mentioned            BOOLEAN DEFAULT FALSE
competitor_name                 TEXT
budget_concern_raised           BOOLEAN DEFAULT FALSE
price_pushback_raised           BOOLEAN DEFAULT FALSE
discount_offered_pct            NUMERIC(5,2) DEFAULT 0.0
contract_term_years             NUMERIC(4,2) DEFAULT 1.0
-- ERP:
erp_margin_available_pct        NUMERIC(6,4)
erp_inventory_risk              BOOLEAN DEFAULT FALSE
erp_lead_time_days              INTEGER
-- Rep/deal size:
rep_id                          UUID
rep_win_rate_trailing_90d       NUMERIC(5,4)
rep_avg_deal_size               NUMERIC(14,2)
deal_size_vs_org_avg_ratio      NUMERIC(8,4)
-- Meta:
deal_stage_at_close             TEXT
industry_vertical               TEXT
final_deal_value                NUMERIC(14,2)
final_margin_pct                NUMERIC(6,4)
created_at                      TIMESTAMPTZ DEFAULT NOW()
extracted_at                    TIMESTAMPTZ DEFAULT NOW()
```
Indexes: idx_nexus_features_org, idx_nexus_features_outcome (org_id, outcome), idx_nexus_features_created, idx_nexus_features_deal_unique (UNIQUE on deal_id)

---

#### `nexus_models`
Trained XGBoost model artifacts.
```
id                  UUID PRIMARY KEY
org_id              UUID NOT NULL INDEX
version             INTEGER NOT NULL DEFAULT 1
status              TEXT CHECK (status IN ('training','ready','failed','archived')) DEFAULT 'training'
algorithm           TEXT NOT NULL DEFAULT 'xgboost'
n_training_samples  INTEGER
feature_names       JSONB
hyperparams         JSONB
cv_auc_mean         NUMERIC(6,4)
cv_auc_std          NUMERIC(6,4)
cv_f1_mean          NUMERIC(6,4)
calibration_score   NUMERIC(6,4)
feature_importances JSONB
shap_mean_abs       JSONB       -- per-feature mean |SHAP|
shap_direction      JSONB       -- 'positive' | 'negative' per feature
model_blob          TEXT        -- base64-encoded joblib-serialized (calibrated, base) tuple
win_dna_narrative   TEXT        -- GPT-4o generated 3-4 sentence narrative
win_dna_top_factors JSONB       -- {win_factors: [...], loss_factors: [...]}
trained_at          TIMESTAMPTZ DEFAULT NOW()
created_at          TIMESTAMPTZ DEFAULT NOW()
UNIQUE (org_id, version)
```

---

#### `nexus_simulations`
Stored simulation runs.
```
id                          UUID PRIMARY KEY
deal_id                     UUID FK → deals(id) ON DELETE CASCADE
org_id                      UUID NOT NULL INDEX
model_id                    UUID FK → nexus_models(id)
input_feature_snapshot      JSONB NOT NULL
n_scenarios                 INTEGER DEFAULT 500
simulation_type             TEXT CHECK (simulation_type IN ('full','pricing','timing','stakeholder'))
baseline_win_prob           NUMERIC(5,4)
baseline_expected_value     NUMERIC(14,2)
scenario_results            JSONB       -- top 20 scenarios
recommended_action_type     TEXT
recommended_action_params   JSONB
recommended_win_prob_new    NUMERIC(5,4)
recommended_ev_new          NUMERIC(14,2)
recommended_net_rev_delta   NUMERIC(14,2)
recommended_reasoning       TEXT
erp_margin_floor_pct        NUMERIC(6,4)
erp_validated               BOOLEAN DEFAULT FALSE
erp_flags                   JSONB
status                      TEXT CHECK (status IN ('pending','running','complete','failed'))
run_duration_ms             INTEGER
created_at                  TIMESTAMPTZ DEFAULT NOW()
completed_at                TIMESTAMPTZ
```

---

#### `nexus_artifacts`
LLM-generated execution artifacts from simulations.
```
id              UUID PRIMARY KEY
simulation_id   UUID FK → nexus_simulations(id) ON DELETE CASCADE
deal_id         UUID FK → deals(id) ON DELETE CASCADE
org_id          UUID NOT NULL
artifact_type   TEXT CHECK (artifact_type IN ('proposal_pdf','roi_calculator','battle_card','next_best_email'))
status          TEXT CHECK (status IN ('pending','generating','ready','failed'))
content_json    JSONB
storage_path    TEXT
public_url      TEXT
llm_model_used  TEXT
prompt_tokens   INTEGER
generation_ms   INTEGER
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

---

#### `nexus_training_jobs`
```
id           UUID PRIMARY KEY
org_id       UUID NOT NULL
status       TEXT CHECK (status IN ('queued','running','complete','failed')) DEFAULT 'queued'
triggered_by TEXT CHECK (triggered_by IN ('manual','auto','scheduled')) DEFAULT 'manual'
n_samples    INTEGER
error_msg    TEXT
logs         JSONB DEFAULT '[]'
model_id     UUID FK → nexus_models(id)
queued_at    TIMESTAMPTZ DEFAULT NOW()
started_at   TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

---

### 4.3 Enum Types (PostgreSQL CHECK constraints)

| Table | Column | Values |
|---|---|---|
| `deals` | `stage` | Discovery, Qualification, Demo, Proposal, Negotiation, Closed Won, Closed Lost |
| `score_history` | `stage_health` | on_track, at_risk, stalled |
| `deal_kg_nodes` | `node_type` | person, company, topic, objection, requirement, decision, action_item, product_feature, competitor, event, document_section, milestone, risk, champion, blocker |
| `nexus_models` | `status` | training, ready, failed, archived |
| `nexus_simulations` | `simulation_type` | full, pricing, timing, stakeholder |
| `nexus_simulations` | `status` | pending, running, complete, failed |
| `nexus_artifacts` | `artifact_type` | proposal_pdf, roi_calculator, battle_card, next_best_email |
| `nexus_artifacts` | `status` | pending, generating, ready, failed |
| `nexus_training_jobs` | `status` | queued, running, complete, failed |
| `nexus_deal_features` | `outcome` | 0 (lost), 1 (won) |

### 4.4 Database Functions & Triggers

- `gen_random_uuid()`: used as DEFAULT for all UUID primary keys
- RLS policies use `current_setting('app.current_org_id', TRUE)::uuid` — note: the application enforces org isolation at query level (WHERE org_id = ...) rather than relying on RLS being active at the PostgreSQL session level. RLS is enabled but the session setting is not set by the app; the `WHERE org_id = CAST(:org_id AS uuid)` clause in every query is the effective isolation mechanism.

### 4.5 Vector/Embedding Columns

| Table | Column | Dimension | Index |
|---|---|---|---|
| `chunks` | `embedding` | 1536 | None (sequential scan for cosine `<=>`) |
| `deal_kg_nodes` | `embedding` | 1536 | ivfflat cosine (lists=50) |

Vector search uses the `<=>` cosine distance operator: `ORDER BY embedding <=> CAST(:embedding AS vector) LIMIT :k`

---

## 5. API REFERENCE (COMPLETE)

### 5.1 API Architecture

- **Base URL**: `http://localhost:8001` (dev) / configured via `NEXT_PUBLIC_API_URL`
- **Versioning**: All routes registered at both `/v1/...` AND `/...` (unversioned, for backward compat). NEXUS routes are at `/api/nexus/` (no versioning).
- **Auth**: Bearer JWT from Supabase. All protected endpoints use `Depends(get_org_id)`.
- **Content-Type**: `application/json` for all requests/responses except multipart uploads
- **Rate limits**: General endpoints 100/min; AI endpoints 10/min (per org or IP)
- **Error format**: `{"detail": "message"}` with HTTP status codes

### 5.2 Endpoint Reference

#### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | DB connectivity check. Returns `{status, version, database}` |

---

#### Deals

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/deals/` | org_id | Create deal. Body: `DealCreate`. Returns created deal dict. Also inserts initial stage_history row. |
| GET | `/v1/deals/` | org_id | List deals. Params: `limit` (1-200, default 50), `offset`. Returns array with computed `red_signals`, `yellow_signals`, `days_in_current_stage`. |
| GET | `/v1/deals/stage-configs` | org_id | Return all stage configs in pipeline order. |
| GET | `/v1/deals/pipeline/overview` | org_id | All deals grouped by stage for Kanban view. |
| GET | `/v1/deals/{deal_id}` | org_id | Full deal detail including meddic, brief, signals, risk_flags. |
| DELETE | `/v1/deals/{deal_id}` | org_id | Delete deal + cascade. Logs activity. |
| PATCH | `/v1/deals/{deal_id}` | org_id | Update value/currency/company/owner/time_to_close_days. Logs field change events. Rate-limited. |
| POST | `/v1/deals/{deal_id}/score` | org_id | AI scoring. Rate: 10/min. Calls GPT-4o, returns win_probability + MEDDIC + signals + risk_flags. |
| POST | `/v1/deals/{deal_id}/ask` | org_id | Legacy single-turn RAG answer. Rate: 10/min. Use /ask-ai/query for streaming. |
| POST | `/v1/deals/{deal_id}/brief` | org_id | Generate executive brief. Rate: 10/min. |
| POST | `/v1/deals/{deal_id}/followup` | org_id | Generate follow-up email. Rate: 10/min. |
| GET | `/v1/deals/{deal_id}/score-history` | org_id | Time-series of score events. |
| GET | `/v1/deals/{deal_id}/sentiment-timeline` | org_id | Document sentiment over time. |
| PATCH | `/v1/deals/{deal_id}/stage` | org_id | Transition stage. Body: `StageTransitionRequest`. Validates with `can_transition()`. On terminal transition, auto-triggers NEXUS feature extraction. |
| GET | `/v1/deals/{deal_id}/stage/history` | org_id | Full stage transition history. |
| GET | `/v1/deals/{deal_id}/exit-criteria` | org_id | Get exit criteria for current stage. Auto-seeds from STAGE_CONFIGS on first access. |
| PATCH | `/v1/deals/{deal_id}/exit-criteria/{criterion_id}` | org_id | Toggle completion state. |
| POST | `/v1/deals/{deal_id}/exit-criteria` | org_id | Add custom criterion. Body: `{criterion_text, stage?}`. |
| DELETE | `/v1/deals/{deal_id}/exit-criteria/{criterion_id}` | org_id | Delete criterion. |

---

#### Ingest

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/ingest/upload` | org_id | Upload document. Multipart: `deal_id` (form), `file`. Validates extension (allowlist) and size (50MB max). Runs: text extraction → sentiment → chunking → embedding. Returns `{document_id, filename, source_type, chunks_created, status}`. |
| GET | `/v1/ingest/documents/{deal_id}` | org_id | List documents for a deal. |

---

#### Ask AI (ReAct)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/deals/{deal_id}/ask-ai/query` | org_id | **SSE streaming**. Body: `{message, conversation_id?}`. Returns `text/event-stream`. Rate: 10/min. |
| GET | `/v1/deals/{deal_id}/ask-ai/conversations` | org_id | List past conversations (last 20). |
| GET | `/v1/deals/{deal_id}/ask-ai/conversations/{conv_id}` | org_id | Get conversation with full message history. |
| DELETE | `/v1/deals/{deal_id}/ask-ai/conversations/{conv_id}` | org_id | Delete conversation. |
| POST | `/v1/deals/{deal_id}/ask-ai/suggest` | org_id | Generate 3 context-aware suggested questions. Rate: 30/min. |
| GET | `/v1/deals/{deal_id}/ask-ai/graph/stats` | org_id | Knowledge graph coverage stats (nodes, edges, chunks). |

---

#### Transcription

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/transcribe/upload` | org_id | Upload audio file. Multipart: `deal_id`, `call_title`, `attendees`, `platform`, `file`. Runs Whisper transcription in background. Returns `{transcription_id, status: "pending"}`. |
| POST | `/v1/transcribe/url` | org_id | Transcribe from URL. Body: `URLRequest`. Background task. |
| GET | `/v1/transcribe/status/{tid}` | org_id | Poll transcription status. |
| GET | `/v1/transcribe/list/{deal_id}` | org_id | List transcriptions for a deal. |

---

#### Reports

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/reports/generate/{deal_id}` | org_id | Generate Intelligence Report PDF. Rate: 10/min. |
| GET | `/v1/reports/list/{deal_id}` | org_id | List intelligence reports for a deal. |
| GET | `/v1/reports/all` | org_id | All reports for org (latest 100). |
| GET | `/v1/reports/download/{report_id}` | org_id | Download PDF as attachment. Path traversal protected. |
| DELETE | `/v1/reports/{report_id}` | org_id | Delete report record + PDF file. |
| POST | `/v1/reports/journey/{deal_id}/generate` | org_id | Generate Journey Report PDF. Rate: 10/min. |
| GET | `/v1/reports/journey/{deal_id}/list` | org_id | List journey reports for a deal. |
| GET | `/v1/reports/journey/{report_id}/view` | org_id | Get journey report JSON + metadata. |

---

#### Pulse Sync

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/pulse/query` | org_id | ERP query. Body: `PulseQuery {query, deal_id?}`. Returns proposal with shipment options. |
| POST | `/v1/pulse/approve/{action_id}` | org_id | Approve/reject an action. Body: `{decision, user}`. |
| GET | `/v1/pulse/history` | org_id | Query history. Optional param: `deal_id`. |

---

#### Analytics

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/analytics/summary` | org_id | Full pipeline KPIs: totals, by_stage, funnel, distribution, at_risk, signals, owners, recent activity. |
| GET | `/v1/analytics/usage` | org_id | AI usage stats from Redis. Param: `month` (YYYY-MM). |

---

#### Activity

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/activity/` | org_id | Paginated activity feed. Params: event_type, entity_type, entity_id, actor_id, search, date_from, date_to, limit (1-200), offset. Returns `{total, limit, offset, items}`. |
| GET | `/v1/activity/event-types` | org_id | Distinct event types for filter dropdown. |

---

#### Organisations

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/organisations/` | None | Create organisation. Body: `OrganisationCreate {name, slug, plan?}`. Enforces slug uniqueness. |
| GET | `/v1/organisations/{org_id}` | None | Get organisation by ID. |

---

#### NEXUS

All NEXUS routes are at `/api/nexus/` (no `/v1/` prefix).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/nexus/status` | org_id | Model status: sample count, training state, cv_auc. |
| POST | `/api/nexus/extract-features` | org_id | Extract features for one deal. Body: `{deal_id, outcome}`. |
| POST | `/api/nexus/extract-all` | org_id | Extract features for all deals in org. |
| POST | `/api/nexus/train` | org_id | Train model. Body: `{force_retrain?}`. Min 30 samples (or 5 with force). Runs synchronously. |
| GET | `/api/nexus/win-dna` | org_id | Win DNA dashboard: top win/loss SHAP factors + narrative. |
| POST | `/api/nexus/simulate` | org_id | Run scenario simulation. Body: `SimulateRequest {deal_id, simulation_type?, n_scenarios?}`. |
| GET | `/api/nexus/simulations/{deal_id}` | org_id | Simulation history for a deal. |
| POST | `/api/nexus/artifacts/generate` | org_id | Generate execution artifacts. Body: `GenerateArtifactRequest`. |
| GET | `/api/nexus/artifacts/{deal_id}` | org_id | All artifacts for a deal. |

---

### 5.3 SSE Endpoints

Only one SSE endpoint exists: `POST /v1/deals/{deal_id}/ask-ai/query`

**Response headers**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
Connection: keep-alive
```

**Event stream format** (each event is `data: <JSON>\n\n`):

```
data: {"type": "thinking",    "content": "reasoning text"}
data: {"type": "tool_call",   "tool": "search_documents", "label": "Searching documents for..."}
data: {"type": "observation", "content": "truncated tool result JSON"}
data: {"type": "answer",      "content": "final answer text", "sources": [...], "suggestions": [...]}
data: {"type": "conversation_id", "conversation_id": "uuid"}
data: {"type": "done"}
```

The frontend reads this stream by constructing a `fetch()` request (not axios) and reading the `ReadableStream`.

---

## 6. FEATURE DEEP DIVES

### 6.1 Deals / Pipeline

**What it does**: Core CRUD for sales deals. The `/deals` page shows a filterable, sortable list. Each deal has a stage, value, owner, win probability, and metadata computed by AI.

**Data model**: `deals` table. Stage is a constrained TEXT column. All JSON fields (meddic, signals, risk_flags) are JSONB.

**Key backend routes**: All in `app/routers/deals.py`
- `create_deal`: INSERT + initial stage_history row
- `list_deals`: computes `red_signals`, `yellow_signals`, `days_in_current_stage` server-side
- `get_deal`: returns `meddic`, `brief` (parsed from JSON string), `signals`
- `update_deal`: PATCH with dynamic SET clause; tracks each changed field separately

**Frontend**: `/deals/page.tsx` manages local state for: deal list, filter stage, sort option, search text, create modal visibility, delete confirmation modal.
**Components used**: `DealCard`, `ScoreGauge`, `OwnerAvatar`, `DealIcon`
**Currencies**: 8 supported (USD, EUR, GBP, INR, JPY, CHF, CAD, AUD). `fmtMoney()` produces abbreviated forms (e.g., "$15.3M"). `fmtFullMoney()` produces full locale-aware forms.

---

### 6.2 Signals

**What it does**: AI-extracted deal signals categorized by type and severity, with color-coded urgency (red=critical, yellow=warning, green=positive).

**Signal types**: `competitor_mentioned`, `budget_concern`, `timeline_risk`, `multi_stakeholder`, `champion_identified`, `urgency_signal`, `technical_fit`, `negotiation_opening`

**Data model**: `deals.signals` JSONB column. Each signal object:
```json
{
  "type": "competitor_mentioned",
  "severity": "high",
  "label": "Competitor: Salesforce",
  "excerpt": "exact quote from document",
  "filename": "call_transcript.pdf",
  "color": "red"
}
```

**Backend**: Extracted by GPT-4o during scoring in `scoring.py`. Stored back to `deals.signals`.

**Frontend**: `SignalCards.tsx` renders signals as colored cards grouped by severity. `analyticsApi.summary()` aggregates red/yellow/green counts per deal for the Analytics signals tab.

---

### 6.3 Ask AI (ReAct Agent — ARIA)

**What it does**: A streaming AI assistant that answers natural-language questions about a deal using a ReAct (Reason + Act) loop. It calls tools to gather evidence, reasons about the answer, and streams its thinking process to the UI.

**Data model**: `deal_ai_conversations` (persistent memory). `deal_kg_nodes` + `deal_kg_edges` (knowledge graph, populated separately — the `search_knowledge_graph` tool queries these). `chunks` (document search).

**Backend flow**:
1. `POST /v1/deals/{deal_id}/ask-ai/query` receives `{message, conversation_id?}`
2. `_get_or_create_conversation()` — loads or creates conversation
3. `build_deal_summary()` — one-paragraph snapshot from `deals` table
4. `build_conversation_context()` — rolling summary + last 4 messages
5. `ReActAgent.run(query)` — async generator yielding SSE events:
   - Calls GPT-4o-mini with JSON structured output
   - On `"type": "action"`: executes tool via `AskAITools`, appends observation to scratchpad
   - On `"type": "final_answer"`: yields `answer` event
   - Max 6 iterations; graceful degradation if limit hit
6. After streaming: `asyncio.create_task(_append_messages(...))` persists conversation
7. Rolling summary generated when conversation has 8+ messages (gpt-4o-mini)

**ReAct Agent tools** (defined in `ask_ai_tools.py`):
1. `search_documents(query, source_type?, limit=5)` — vector similarity in `chunks`
2. `get_deal_state()` — deal stage, value, win prob, signals summary
3. `get_meddic_assessment()` — MEDDIC scores and gaps
4. `search_activities(query?, limit=10, after?)` — activity log search
5. `get_exit_criteria_status()` — stage exit criteria + completion state
6. `get_signals(sentiment?)` — deal signals from `deals.signals`
7. `search_knowledge_graph(query, node_types?, limit=10)` — KG node search (falls back to document search if empty)
8. `get_stakeholder_map()` — people from MEDDIC + KG person nodes
9. `search_product_help(query)` — static product help guide (for "how do I use Synvelo" questions)

**Frontend**: `AskAITab.tsx`. Reads SSE stream via native `fetch` + `ReadableStream`. Parses events line-by-line. Shows typing indicator during `thinking` events, tool call labels during tool use, and renders the final answer with source citations and suggested follow-up questions. Supports conversation history with a list of past conversations.

---

### 6.4 MEDDIC

**What it does**: Tracks the 6 MEDDIC qualification dimensions for each deal, each with a confidence score (0-1) and an exact verbatim excerpt from source documents.

**Data model**: `deals.meddic` JSONB column:
```json
{
  "metrics":           {"value": "...", "confidence": 0.8, "excerpt": "quote"},
  "economic_buyer":    {"value": "...", "confidence": 0.9, "excerpt": "quote"},
  "decision_criteria": {"value": "...", "confidence": 0.6, "excerpt": "quote"},
  "decision_process":  {"value": "...", "confidence": 0.4, "excerpt": "quote"},
  "identify_pain":     {"value": "...", "confidence": 0.7, "excerpt": "quote"},
  "champion":          {"value": "...", "confidence": 0.5, "excerpt": "quote"}
}
```

**Backend**: Populated by GPT-4o during scoring. Stored back to `deals.meddic`.

**Frontend**: `MEDDICPanel.tsx` renders a 2-column grid with confidence bars. Low-confidence dimensions are highlighted.

---

### 6.5 Stage Pipeline

**What it does**: A 7-stage sales pipeline with strict transition validation. Every stage change is recorded with timestamp. Exit criteria are auto-seeded per stage from `STAGE_CONFIGS`.

**Stages** (in order): Discovery → Qualification → Demo → Proposal → Negotiation → Closed Won / Closed Lost

**Stage rules** (from `app/stages.py`):
- `can_transition(from, to)`: returns `(allowed: bool, reason: str)`. Any stage can transition to any non-terminal stage (including backward regressions). Terminal stages cannot be exited ("Cannot move a deal out of 'Closed Won'. Create a new deal if re-engaging.").
- On terminal transition: `asyncio.create_task(_fire_nexus_extraction(...))` auto-extracts ML features.
- `stage_entered_at` is updated on every transition (used to compute `days_in_current_stage`).

**NEXUS integration**: Terminal transitions automatically trigger `extract_and_store_features()` in a background task.

**Frontend**: `StagePipelineBar.tsx` shows a clickable horizontal bar. `StageAdvancePanel.tsx` shows a stage advance button with confirmation. `StageHistoryTimeline.tsx` shows a vertical timeline. `ExitCriteriaChecklist.tsx` shows checkboxes auto-seeded from `STAGE_CONFIGS.exit_criteria`.

---

### 6.6 Sentiment Timeline

**What it does**: Tracks buyer sentiment per document/call over time to show deal health trajectory.

**Data model**: `documents.sentiment_score` (float, -1 to 1) + `documents.sentiment_label` ('positive'|'neutral'|'negative'). Score is extracted by GPT-4o-mini during document ingestion.

**Backend**: `GET /v1/deals/{deal_id}/sentiment-timeline` returns documents with `sentiment_score IS NOT NULL` ordered by `created_at ASC`.

**Frontend**: `SentimentTimeline.tsx` renders a line chart using Recharts.

---

### 6.7 Documents & Transcription

**What it does**: Accepts PDF, text, audio files. Extracts text (PyMuPDF for PDF, Whisper for audio), runs sentiment, chunks, embeds, stores in pgvector. Makes all content searchable by the AI.

**Ingestion pipeline** (`services/embeddings.py`):
1. Text extraction: Whisper-1 for audio, `fitz` (PyMuPDF) for PDF, plain read for text
2. Sentiment analysis: GPT-4o-mini → `(score: float, label: str)` → stored on `documents`
3. Chunking: 400-word chunks with 80-word overlap
4. Embedding: `text-embedding-3-small` in batches of 20 → 1536-dim vectors
5. Storage: INSERT into `chunks` with vector cast
6. If deal already has `win_probability`: also appends to `score_history` with `trigger_type='document_ingested'`

**Transcription pipeline** (`services/transcription_service.py`):
1. Whisper-1 API call → raw transcript
2. GPT-4o formats with speaker labels, paragraphs, "Key Points" section
3. ReportLab renders PDF
4. PDF stored to disk under `uploads/`
5. `ingest_file()` called to chunk/embed the transcript
6. `call_transcriptions` status updated to 'done'

**Allowed file extensions**: `pdf`, `txt`, `csv`, `doc`, `docx`, `xls`, `xlsx`, `json`, `mp3`, `mp4`, `wav`, `m4a`, `ogg`, `webm`

**File storage**: Local filesystem under `./uploads/` (configured via `UPLOAD_DIR`). Reports go in `./uploads/reports/`. Filename sanitization: `{doc_id[:8]}_{safe_filename}` using regex to strip unsafe chars.

---

### 6.8 Reports (Intelligence + Journey)

**Type 1 — Intelligence Report** (`report_service.py`):
- Gathers all deal chunks via RAG
- GPT-4o generates structured JSON with sections: executive_summary, deal_overview, stakeholder_analysis, risk_assessment, competitive_analysis, recommended_actions, next_steps
- ReportLab renders multi-page PDF with Synvelo branding (indigo color scheme)
- Stored in `deal_reports` with `report_type='intelligence'`

**Type 2 — Journey Report** (`journey_report_service.py` + `journey_aggregator.py`):
- `aggregate_deal_journey()` collects: deal metadata, stage history with timing, field edits, document uploads, AI feature usage log, win probability timeline, score history, activity log events, prior reports
- GPT-4o synthesizes a chronological narrative
- ReportLab renders with timeline tables and risk sections
- Stored in `deal_reports` with `report_type='journey'`

**PDF download protection**: Path traversal check using `.is_relative_to(REPORTS_DIR.resolve())`

---

### 6.9 Pulse Sync

**What it does**: ERP integration mock. A user types natural language queries about orders/shipping. The system queries a mock ERP (hardcoded inventory for 3 SKUs), uses GPT-4o to generate a structured proposal, and the user can approve or reject the action.

**Mock ERP data** (`services/erp_mock.py`): 3 SKUs (Industrial Pump, Valve Assembly, Control Unit), 3 shipping methods (standard 7d $8/unit, express 3d $18/unit, overnight 1d $35/unit).

**Data model**: `pulse_actions` table. `proposal` JSONB contains `PulseProposal` structure with `split_options` (array of shipment options).

**Frontend**: `PulseSyncChat.tsx` renders a chat-like interface. Proposals appear as structured cards with approve/reject buttons.

---

### 6.10 Analytics

**What it does**: Pipeline intelligence dashboard with 3 tabs.

**Tab: Pipeline** — KPI cards (total pipeline value, weighted pipeline value, avg win prob, total deals, avg days to close), stage funnel bar chart (Recharts), win probability distribution bars, at-risk deals table, recent scoring activity.

**Tab: Signals** — All deals sorted by red signal count, showing signal bar visualization.

**Tab: Owners** — Per-rep breakdown: deal count, pipeline value, avg probability, W/L record, win rate badge.

**Backend**: Single `GET /v1/analytics/summary` endpoint. `analytics_service.py` runs 7 queries in sequence and returns a large combined JSON object.

---

### 6.11 NEXUS — Revenue Simulation Engine

NEXUS is a 4-layer ML pipeline:

**Layer 1: Feature Extraction** (`nexus/feature_extractor.py`)
- 40 features extracted from: `deals`, `deal_stage_history` (gold data for timing), `score_history`, `documents`, MEDDIC JSON, signals JSON
- Stage-derived features use EXACT timestamps from `deal_stage_history` (not approximated)
- `stage_velocity_score`: composite velocity (actual_days / typical_days) per traversed stage
- Stored in `nexus_deal_features` with UPSERT on `deal_id`
- Auto-triggered on terminal stage transitions

**Layer 2: Model Training** (`nexus/model_trainer.py`)
- XGBoost classifier (n_estimators=300, max_depth=4, learning_rate=0.04, subsample=0.8)
- StratifiedKFold cross-validation (k = min(5, max(2, n/5)))
- CalibratedClassifierCV (sigmoid, cv = min(3, max(2, n/10)))
- SHAP TreeExplainer for feature attribution
- Model serialized via joblib → base64 stored in `nexus_models.model_blob`
- Win DNA narrative generated by GPT-4o from top SHAP factors
- Min training samples: 30 (can force with 5)

**Layer 3: Scenario Simulation** (`nexus/simulator.py`)
- `ACTION_SPACE`: 7 action types (offer_discount, extend_contract_term, engage_economic_buyer, send_proposal_fast, increase_meddic, add_stakeholders, send_roi_calculator)
- Single-action scenarios + 2-action combos (discount + term)
- Each scenario: modify one feature, predict with calibrated model, compute expected value = deal_value × win_prob
- ERP margin floor enforced: discount scenarios skipped if margin < 10%
- Ranked by `net_revenue_delta` (best scenario first)
- Top 20 scenarios stored in `nexus_simulations`

**Layer 4: Artifacts** (`nexus/artifact_generator.py`)
- 4 artifact types: proposal_pdf, roi_calculator, battle_card, next_best_email
- Each generated by GPT-4o using simulation results + deal data
- Stored as JSONB in `nexus_artifacts`

---

### 6.12 Activity Log

**What it does**: Centralized immutable event log for every significant action across the entire org. Powers the `/activity` page feed.

**Design**: `log_activity()` in `activity_service.py` uses its own dedicated DB session so the caller's transaction is never affected and a logging failure cannot break the primary operation.

**Frontend**: `/activity/page.tsx` with filters for event_type, entity_type, search text, and date range. Paginated (50 items per page, up to 200).

---

## 7. COMPONENT LIBRARY

### 7.1 Design System

The design system uses Tailwind CSS 4 with custom utility classes defined in `app/globals.css`. The primary colors derive from Tailwind's indigo palette.

**Custom CSS classes** (syn-* prefix):
```css
syn-bg           → background color (off-white #F8F9FA equivalent)
syn-card         → card surface (white bg, border, shadow-sm, rounded-xl)
syn-border       → border color
syn-surface-2    → secondary surface (gray-50)
syn-text-primary → primary text (gray-900)
syn-text-secondary → secondary text (gray-700)
syn-text-tertiary  → tertiary text (gray-500/slate-400)
syn-text-muted   → muted text (gray-400)
syn-scroll       → custom scrollbar (light theme)
syn-scroll-dark  → custom scrollbar (dark theme, sidebar)
brand-*          → brand color aliases → indigo
```

**Sidebar background**: `#1e1b4b` (indigo-950)

**Stage colors** (from `lib/stage-utils.ts`):
| Stage | bg | text | border | dot |
|---|---|---|---|---|
| Discovery | bg-indigo-50 | text-indigo-700 | border-indigo-200 | bg-indigo-500 |
| Qualification | bg-blue-50 | text-blue-700 | border-blue-200 | bg-blue-500 |
| Demo | bg-cyan-50 | text-cyan-700 | border-cyan-200 | bg-cyan-500 |
| Proposal | bg-amber-50 | text-amber-700 | border-amber-200 | bg-amber-500 |
| Negotiation | bg-pink-50 | text-pink-700 | border-pink-200 | bg-pink-500 |
| Closed Won | bg-green-50 | text-green-700 | border-green-200 | bg-green-500 |
| Closed Lost | bg-red-50 | text-red-700 | border-red-200 | bg-red-400 |

**Typography**: Inter font (Google Fonts, loaded via `next/font/google`). Font size conventions: 10px (labels/badges), 11px (small metadata), 12px (secondary info), 13px (primary list text), 15-18px (headings).

### 7.2 All Shared Components

**`AuthGuard`** (`components/AuthGuard.tsx`)
- Props: `{children}`
- State: `checking: boolean`, `authed: boolean`
- Behavior: checks Supabase session on mount; redirects to `/login` if no session; redirects to `/deals` if logged in and on `/login`. Session age checked (24h limit). Listens to `onAuthStateChange`.

**`Sidebar`** (`components/Sidebar.tsx`)
- No props
- Renders: Logo, nav groups (Intelligence, Simulation, Operations, Monitoring), sign-out button
- Active state: `path.startsWith(href)` — so `/deals/123` highlights `/deals`
- Hidden on `/login` path

**`AskAITab`** (`components/AskAITab.tsx`)
- Props: `{dealId: string}`
- Connects to SSE stream via native fetch. Displays thinking indicators, tool call labels, and final answer with source citations. Manages conversation history list.

**`SignalCards`** (`components/SignalCards.tsx`)
- Exports: `Signal` type, default component
- Props: `{signals: Signal[]}`
- Renders color-coded cards grouped by red/yellow/green with type icon

**`MEDDICPanel`** (`components/MEDDICPanel.tsx`)
- Exports: `MEDDIC` interface, default component
- Props: `{meddic: MEDDIC | null}`
- Renders 6 MEDDIC dimensions with confidence bars and excerpts

**`DealHealthTimeline`** (`components/DealHealthTimeline.tsx`)
- Exports: `HistoryPoint` type, default component
- Props: `{history: HistoryPoint[]}`
- Recharts line chart of win_probability over time

**`SentimentTimeline`** (`components/SentimentTimeline.tsx`)
- Props: `{dealId: string}` — fetches its own data
- Recharts line chart of sentiment_score over time per document

**`DealBriefModal`** (`components/DealBriefModal.tsx`)
- Exports: `BriefData` type, default component
- Props: `{dealId, briefData, onClose}`

**`FollowupModal`** (`components/FollowupModal.tsx`)
- Exports: `FollowupData` type, default component
- Props: `{dealId, onClose}`

**`CallCaptureZone`** (`components/CallCaptureZone.tsx`)
- Props: `{dealId: string}`
- Handles both file upload and URL-based transcription

**`UploadZone`** (`components/UploadZone.tsx`)
- Props: `{dealId: string, onUploadComplete?: () => void}`
- react-dropzone based drag-and-drop

**`EvidencePanel`** (`components/EvidencePanel.tsx`)
- Props: `{evidence: EvidenceItem[]}`
- Shows RAG evidence chunks with source metadata

**`StageAdvancePanel`** (`components/StageAdvancePanel.tsx`)
- Props: `{dealId, currentStage, onStageChanged}`
- Shows "Advance to [NextStage]" button + close-lost option

**`StagePipelineBar`** (`components/StagePipelineBar.tsx`)
- Props: `{currentStage, onStageClick?}`
- Horizontal pipeline bar with clickable stages

**`StageHistoryTimeline`** (`components/StageHistoryTimeline.tsx`)
- Props: `{history: StageHistoryEntry[]}`
- Vertical timeline of stage transitions

**`ExitCriteriaChecklist`** (`components/ExitCriteriaChecklist.tsx`)
- Props: `{dealId, stage}`
- Fetches and renders exit criteria with toggle checkboxes + add custom

**`JourneyReportPanel`** (`components/JourneyReportPanel.tsx`)
- Props: `{dealId: string}`
- Generate button + list of past journey reports

**`ScoreGauge`** (inline in `/deals/[id]/page.tsx`)
- Props: `{prob, low, high}`
- SVG semicircle gauge with rotating needle, color-coded by probability

**`PulseSyncChat`** (`components/PulseSyncChat.tsx`)
- Props: `{dealId?: string}`
- Chat interface with proposal cards and approve/reject

### 7.3 Layout Components

The global layout is `app/layout.tsx`:
```tsx
<html>
  <body>
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />                       {/* 240px fixed width */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  </body>
</html>
```

Each page manages its own `h-16` header bar + scrollable content area.

### 7.4 Styling Conventions

- Component containers use `syn-card` for card surfaces
- Page layouts use `flex flex-col h-full syn-bg` with `h-16 border-b` header + `flex-1 overflow-y-auto syn-scroll p-6` body
- Button variants: `bg-indigo-600 text-white hover:bg-indigo-700` (primary), `bg-gray-100 text-gray-700 hover:bg-gray-200` (secondary)
- Status badges use small colored rounded-full spans: `bg-emerald-50 text-emerald-600 border border-emerald-200`
- Text sizes never use Tailwind's `text-sm/text-base`; always use explicit `text-[12px]`, `text-[13px]`, etc.

---

## 8. AUTHENTICATION & AUTHORIZATION

### 8.1 Auth Flow (Complete)

1. **Frontend login**: User signs in via Supabase (`supabase.auth.signInWithPassword()` or magic link)
2. **JWT issued**: Supabase issues a JWT with `user_metadata.org_id` or `app_metadata.org_id` embedded
3. **Request**: Frontend axios interceptor attaches `Authorization: Bearer <jwt>` to every API request
4. **Backend validation** (`dependencies.py / get_org_id()`):
   - Extract JWT from `HTTPAuthorizationCredentials`
   - Decode header to get `kid`
   - Try JWKS verification (EC or RSA, from Supabase JWKS endpoint, with cache + refresh)
   - Fallback: HS256 with `SUPABASE_JWT_SECRET`
   - Extract `org_id` from `user_metadata` or `app_metadata`
   - If neither: 403 "User has no organisation. Complete onboarding first."
5. **Fallback** (dev/testing): `X-Org-ID` header accepted if no Bearer token; defaults to `00000000-0000-0000-0000-000000000001`
6. **401 auto-signout**: The axios response interceptor signs out and redirects to `/login` on 401

### 8.2 Protected Routes

All frontend routes except `/login` require a valid Supabase session (enforced by `AuthGuard`).
All backend routes except `GET /health`, `POST /v1/organisations/`, `GET /v1/organisations/{id}` require a valid `org_id` (enforced by `Depends(get_org_id)`).

### 8.3 Token Management

- **JWT verification**: JWKS from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (module-level cache, refreshed on failed verification)
- **Algorithms supported**: ES256/384/512 (EC keys), RS256/384/512 (RSA keys), HS256 (legacy secret)
- **`audience` check disabled**: `options={"verify_aud": False}` — Supabase tokens don't have a standard audience claim
- **Session expiry**: `AuthGuard` enforces a 24-hour max session age based on `user.last_sign_in_at`
- **Token refresh**: Supabase client configured with `autoRefreshToken: true`

### 8.4 Multi-tenancy (org_id Scoping Pattern)

Every query that reads or writes data includes `WHERE org_id = CAST(:org_id AS uuid)`. This is the primary isolation mechanism.

**Pattern** (applies to every endpoint):
```python
@router.get("/{deal_id}")
async def get_deal(
    deal_id: str,
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),  # ← always present
):
    res = await db.execute(text("""
        SELECT ... FROM deals
        WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)  -- ← always enforced
    """), {"id": deal_id, "org_id": org_id})
```

RLS is enabled on most tables but the session variable `app.current_org_id` is NOT set by the application code; RLS policies are a defense-in-depth layer but the `WHERE org_id = ...` clause is the operative security control.

---

## 9. STATE MANAGEMENT

### 9.1 Server State

There is no React Query or SWR. All data fetching uses plain `axios` (via `lib/api.ts`) called in `useEffect` hooks. State lives in component-level `useState`.

**Pattern**:
```tsx
const [data, setData] = useState<T | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState(false)

useEffect(() => {
  someApi.get()
    .then(r => setData(r.data))
    .catch(() => setError(true))
    .finally(() => setLoading(false))
}, [dependency])
```

**Cache**: None. Data is re-fetched on component mount or explicit user action. No optimistic updates.

### 9.2 Client State

All UI state is `useState` in individual page/component files. There is no React Context or global state manager (no Redux, Zustand, etc.).

Common pattern for the deal detail page (`/deals/[id]/page.tsx`):
```tsx
const [deal, setDeal] = useState<Deal | null>(null)
const [docs, setDocs] = useState<Doc[]>([])
const [activeTab, setActiveTab] = useState<TabKey>('overview')
const [scoring, setScoring] = useState(false)
const [briefOpen, setBriefOpen] = useState(false)
```

### 9.3 URL State

The deal ID comes from Next.js route params: `const { id } = useParams()`. No search params are used for filter state (filter state is local `useState`).

### 9.4 Form State

Forms use uncontrolled `useState` (one state variable per input field, no form library). The create-deal modal in `/deals/page.tsx` manages: `newName`, `newCompany`, `newStage`, `newValue`, `newCurrency`, `newOwner`, `newTimeToClose`.

---

## 10. ERROR HANDLING

### 10.1 Backend

All errors are raised as `HTTPException(status_code=..., detail="message")`.

**Common status codes**:
- 400: Validation errors, bad input, no documents for scoring
- 401: Expired/invalid JWT
- 403: Valid JWT but no org_id in payload
- 404: Resource not found (always checks org_id scope first)
- 413: File exceeds 50MB limit
- 429: Rate limit exceeded (returns `{detail, retry_after}`)
- 500: LLM or unexpected errors

Service functions return `{"error": "message"}` dicts (not exceptions) which routes convert to `HTTPException`.

Logging: structured JSON format `{"time":...,"level":...,"logger":...,"msg":...}`. Logger names: `synvelo`, `synvelo.auth`, `synvelo.ratelimit`, `synvelo.ask_ai_router`, `synvelo.react_agent`, `synvelo.activity`, `synvelo.tracking`, `synvelo.nexus`, `nexus`.

### 10.2 Frontend

Error states use `useState<boolean>` and render simple fallback messages:
```tsx
if (error || !data) return (
  <div className="flex-1 flex items-center justify-center h-screen syn-bg">
    <p className="syn-text-muted text-[12px]">Failed to load analytics.</p>
  </div>
)
```

There are no toast notifications in the current codebase. No error boundary components. API errors are caught in `.catch()` and set `setError(true)` or display inline messages.

---

## 11. AI/ML IMPLEMENTATION DETAILS

### 11.1 LLM Integration (Every Call)

| Endpoint/Service | Model | Temperature | Max Tokens | Input | Output |
|---|---|---|---|---|---|
| `scoring.py` → score_deal | gpt-4o | 0.1 | 4000 | Document chunks (top 15 by similarity) | JSON: win_prob, MEDDIC, signals, risk_flags |
| `brief_service.py` → generate_brief | gpt-4o | 0.2 | 2000 (inferred) | Deal metadata + top 10 chunks | JSON: deal_status, contacts, risks, next steps |
| `brief_service.py` → generate_followup | gpt-4o-mini | — | — | Deal state + recent docs | JSON: follow-up email structure |
| `react_agent.py` → ReAct loop | gpt-4o-mini | 0.15 | 900 | System + messages + scratchpad | JSON: {type: action|final_answer, ...} |
| `deal_ask_ai.py` → _generate_summary | gpt-4o-mini | 0.1 | 150 | Last 12 messages (200 char truncated) | Plain text summary |
| `deal_ask_ai.py` → suggest_questions | gpt-4o-mini | 0.7 | 200 | Deal context (stage, prob, MEDDIC gaps, risks) | JSON: {suggestions: [...]} |
| `embeddings.py` → analyze_sentiment | gpt-4o-mini | 0.1 | 60 | First 3000 chars of document | JSON: {score, label} |
| `transcription_service.py` → _format_transcript | gpt-4o | 0.2 | 6000 | Raw Whisper text (first 12000 chars) | Plain text with speaker labels |
| `report_service.py` | gpt-4o | — | — | Deal chunks + metadata | JSON report structure |
| `journey_report_service.py` | gpt-4o | — | — | Aggregated deal journey data | JSON journey narrative |
| `model_trainer.py` → generate_win_dna_narrative | gpt-4o | 0.3 | 300 | Top SHAP factors + AUC | Plain text narrative (3-4 sentences) |
| `artifact_generator.py` | gpt-4o | — | — | Simulation results + deal data | JSON artifact (proposal, ROI calc, etc.) |
| `nexus/router.py` → _run_training | gpt-4o | 0.3 | 300 | SHAP win/loss factors | Win DNA narrative |

All GPT calls use `response_format={"type": "json_object"}` where JSON is required.

### 11.2 Embedding Pipeline

- **Model**: `text-embedding-3-small` (1536 dimensions)
- **Chunking**: 400 words per chunk, 80-word overlap
- **Batch size**: 20 texts per API call
- **Input truncation**: `t[:8000]` (first 8000 chars per chunk before embedding)
- **Storage format**: Vector literal string `"[0.1,0.2,...]"` cast to `vector` type in PostgreSQL
- **Called by**: `embeddings.embed_texts()`, `embeddings.embed_single()`, `ask_ai_tools.search_documents()`, `rag.retrieve_chunks()`

### 11.3 Vector Search

All vector searches use cosine distance with the `<=>` operator:

```sql
SELECT text, source_type, filename, chunk_index,
       1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
FROM chunks
WHERE deal_id = CAST(:deal_id AS uuid)
ORDER BY embedding <=> CAST(:embedding AS vector)
LIMIT :k
```

Note: `1 - distance` is used as the similarity score (cosine similarity). The `chunks` table has no vector index (sequential scan). The `deal_kg_nodes` table has an ivfflat index with `lists=50`.

### 11.4 ReAct Agent (Full Architecture)

```
User query
    │
    ▼
Build context:
  deal_summary (DB: deals table, 1 query)
  conversation_context (DB: deal_ai_conversations, rolling summary + last 4 msgs)
    │
    ▼
ReActAgent.run(query):
    System prompt = REACT_SYSTEM_PROMPT (deal summary + conv context + tool list)
    messages = [system, user_query]
    scratchpad = []

    for iteration in range(6):
        LLM call: gpt-4o-mini, json_object mode, T=0.15, max_tokens=900
        parse JSON response

        if type == "final_answer":
            yield answer event
            return

        if type == "action":
            yield thinking event (thought)
            yield tool_call event (tool name, label)
            result = await tool_fn(**params)
            obs_str = _compress_observation(result)  # truncate to ≤3000 chars
            yield observation event
            scratchpad += [assistant msg, observation msg]

    # fallback if 6 iterations exhausted
    yield degraded answer event
    │
    ▼
asyncio.create_task(_append_messages(...))  # persist conversation
asyncio.create_task(log_activity(...))      # fire-and-forget
```

### 11.5 NEXUS ML Pipeline

**XGBoost hyperparameters**:
```python
{
    "n_estimators": 300,
    "max_depth": 4,
    "learning_rate": 0.04,
    "subsample": 0.8,
    "colsample_bytree": 0.75,
    "min_child_weight": 3,
    "reg_alpha": 0.15,
    "reg_lambda": 1.2,
    "eval_metric": "logloss",
    "random_state": 42,
    "n_jobs": -1,
}
```

**Model pipeline**:
1. `XGBClassifier` trained on all data
2. `CalibratedClassifierCV(method="sigmoid")` wraps the base model for probability calibration
3. Prediction: `calibrated_model.predict_proba(X)[0][1]` clipped to [0.01, 0.99]
4. SHAP: `shap.TreeExplainer(base_model)` on the uncalibrated model
5. Serialization: `joblib.dump((calibrated, base), buf)` → `base64.b64encode(buf.getvalue())`

**Feature engineering** (40 features, all sourced from existing DB tables):
- Stage timing features extracted with exact timestamps from `deal_stage_history`
- `stage_velocity_score = mean(actual_days / typical_days)` per traversed stage
- Sentiment features: `np.polyfit` slope, `np.std` volatility, max negative diff
- Boolean features stored as 0/1 float in the feature matrix
- Missing features default to 0.0 (boolean columns) or False

**Scenario simulation action space**:
- `offer_discount`: values [0, 5, 8, 10, 12, 15, 18, 20]% — ERP margin floor enforced
- `extend_contract_term`: values [1, 2, 3] years
- `engage_economic_buyer`: True
- `send_proposal_fast`: 1/2/3/5/7/14 days
- `increase_meddic`: completeness to [0.5, 0.67, 0.83, 1.0]
- `add_stakeholders`: [2, 3, 4, 5] engaged
- `send_roi_calculator`: True (sets meddic_metrics_filled=True)
- 2-action combos: discount × term (all combinations)

---

## 12. REAL-TIME FEATURES

### 12.1 SSE Streaming (Ask AI)

**Connection**: Frontend uses native `fetch()` (not axios) to POST `/deals/{deal_id}/ask-ai/query`. This is necessary because axios does not expose `ReadableStream`.

**Reading the stream** (frontend pattern in `AskAITab.tsx`):
```typescript
const response = await askAiApi.query(dealId, message, conversationId)
const reader = response.body?.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const chunk = decoder.decode(value)
  // parse "data: {...}\n\n" lines
  const lines = chunk.split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6))
      // handle event.type
    }
  }
}
```

**Backend**: `StreamingResponse(generator, media_type="text/event-stream")` with `X-Accel-Buffering: no` to bypass Nginx buffering.

### 12.2 Event System (Activity Logging)

The activity log is append-only. Events are written via `log_activity()` which:
1. Opens its own `AsyncSessionLocal()` session (independent of the caller's transaction)
2. Inserts one row into `activity_logs`
3. Commits
4. Silently swallows exceptions (logging failures must never break business operations)

This pattern is used throughout: `await log_activity(...)` or `asyncio.create_task(log_activity(...))` (fire-and-forget for non-critical paths).

---

## 13. DATA FLOW PATTERNS

### 13.1 Create Operation Pattern

```
Frontend: POST /v1/deals/
  Body: {name, company, stage, value, currency, owner, time_to_close_days}
    │
    ▼
Backend: create_deal()
  1. Generate UUID (Python)
  2. INSERT into deals
  3. INSERT initial row into deal_stage_history
  4. db.commit()
  5. await log_activity(org_id, "deal_created", ...)
  6. return deal dict
```

### 13.2 Update Operation Pattern

```
Frontend: PATCH /v1/deals/{id}
  Body: {value?, company?, owner?, time_to_close_days?}
    │
    ▼
Backend: update_deal()
  1. Fetch current values from DB (for diff)
  2. Build dynamic SET clause (only non-None fields)
  3. UPDATE deals WHERE id AND org_id
  4. db.commit()
  5. For each changed field:
     - await log_activity(org_id, f"deal_{field}_changed", old_value, new_value)
     - asyncio.create_task(track_field_edit(...))
  6. Re-fetch and return updated deal
```

### 13.3 List/Filter/Search Pattern

Example from `GET /v1/activity/`:
```python
where_clauses = ["org_id = CAST(:org_id AS uuid)"]
params = {"org_id": org_id, "limit": limit, "offset": offset}

if event_type:
    where_clauses.append("event_type = :event_type")
    params["event_type"] = event_type
# ... etc

where_sql = " AND ".join(where_clauses)

count = await db.execute(text(f"SELECT COUNT(*) FROM activity_logs WHERE {where_sql}"), params)
rows  = await db.execute(text(f"SELECT ... FROM activity_logs WHERE {where_sql} ORDER BY created_at DESC LIMIT :limit OFFSET :offset"), params)
```

This dynamic WHERE clause pattern is used in all filterable endpoints. All user input goes through SQLAlchemy parameterized queries (no string interpolation of user values).

### 13.4 File Upload Pattern

```
Frontend: multipart POST to /v1/ingest/upload
  FormData: {deal_id, file}
    │
    ▼
Backend: upload_document()
  1. Validate file extension (allowlist)
  2. Verify deal ownership: SELECT id FROM deals WHERE id=... AND org_id=...
  3. Read file bytes, check size (max 50MB)
  4. Generate doc_id = uuid4()
  5. Sanitize filename: strip path components, replace unsafe chars
  6. Save to disk: UPLOAD_DIR/{doc_id[:8]}_{safe_name}
  7. INSERT into documents (status='processing')
  8. db.commit()
  9. await ingest_file(file_path, filename, source_type, deal_id, doc_id, db)
     [text extract → sentiment → chunk → embed → UPDATE status='done']
  10. await log_activity(...)
  11. return {document_id, filename, source_type, chunks_created, status}
```

---

## 14. DEPLOYMENT & INFRASTRUCTURE

### 14.1 Environment Variables

**Backend (`.env`)**:

| Variable | Description | Required |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key for all LLM/embedding/whisper calls | Yes |
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:port/dbname` | Yes |
| `REDIS_URL` | `redis://host:port` — for rate limiting + AI usage metering | No (falls back to in-memory) |
| `SECRET_KEY` | App secret key (must change in production) | Yes (prod) |
| `UPLOAD_DIR` | Directory for uploaded files and reports | No (default: `./uploads`) |
| `MAX_FILE_SIZE_MB` | Max upload size | No (default: 50) |
| `SUPABASE_URL` | Supabase project URL (`https://xxx.supabase.co`) | Yes (prod) |
| `SUPABASE_JWT_SECRET` | JWT HS256 secret (fallback if JWKS fails) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | No (not currently used in routes) |
| `CORS_ORIGINS` | Comma-separated allowed origins | No (default: `http://localhost:3000,http://localhost:3001`) |
| `ENVIRONMENT` | `development` / `staging` / `production` | No (default: `development`) |
| `DB_POOL_SIZE` | SQLAlchemy pool size | No (default: 10) |
| `DB_MAX_OVERFLOW` | SQLAlchemy max overflow | No (default: 20) |
| `DB_POOL_RECYCLE` | SQLAlchemy pool recycle seconds | No (default: 1800) |

**Frontend (`.env.local`)**:

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL | No (default: `http://localhost:8001`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Yes |

### 14.2 Build & Dev Commands

```bash
# Development (two terminals)
cd backend && uvicorn main:app --reload --port 8001
cd frontend && npm run dev   # port 3000

# Production (frontend)
cd frontend && npm run build && npm run start

# Lint (frontend)
cd frontend && npm run lint

# API docs (dev only)
open http://localhost:8001/docs
```

### 14.3 Development Setup

1. Install PostgreSQL with pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
2. Create database: `CREATE DATABASE synvelo_db;`
3. Set up backend `.env` (copy from template, fill OpenAI key + Supabase)
4. Run migrations in order (see Section 2.6)
5. Backend auto-creates tables on startup via `init_db()` (creates all ORM-mapped tables)
6. Create a Supabase project, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
7. Create a user in Supabase Auth; set `user_metadata.org_id` to the UUID of the default org

---

## 15. CODE CONVENTIONS & PATTERNS

### 15.1 Naming Conventions

- **Python**: snake_case functions/variables, PascalCase classes, UPPERCASE_UNDERSCORE constants
- **TypeScript**: PascalCase components/interfaces, camelCase variables/functions, UPPERCASE for constants
- **DB columns**: snake_case
- **API paths**: kebab-case segments (`/ask-ai/`, `/win-dna/`, `/score-history/`)
- **Event types in activity_logs**: `entity_action` format (e.g., `deal_created`, `document_uploaded`)

### 15.2 Backend Patterns

**Route handler pattern**:
```python
@router.post("/{deal_id}/action")
@limiter.limit(AI_RATE)           # rate limit decorator (for AI endpoints)
async def action_handler(
    request: Request,             # required by slowapi for rate limiting
    deal_id: str,
    body: RequestSchema,          # Pydantic model
    db: AsyncSession = Depends(get_db),
    org_id: str = Depends(get_org_id),
):
    # 1. Verify ownership
    res = await db.execute(text("SELECT id FROM deals WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)"), ...)
    if not res.fetchone():
        raise HTTPException(status_code=404, detail="Deal not found")

    # 2. Track AI usage (AI endpoints only)
    await track_ai_usage(org_id, "feature_name")

    # 3. Call service
    result = await service_function(deal_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    # 4. Log activity
    await log_activity(org_id, "event_type", "entity_type", deal_id, ...)

    # 5. Track AI feature (fire-and-forget)
    asyncio.create_task(track_ai_feature(deal_id, "feature_name", org_id))

    return result
```

**Service function pattern**:
```python
async def my_service(deal_id: str, db: AsyncSession) -> dict:
    # No org_id check here — done by router
    result = await db.execute(text("..."), {"id": deal_id})
    row = result.fetchone()
    if not row:
        return {"error": "Resource not found"}
    # ... business logic ...
    await db.commit()
    return {"key": "value"}
```

**DB query pattern** (raw SQL, always parameterized):
```python
await db.execute(text("""
    SELECT col1, col2 FROM table
    WHERE id = CAST(:id AS uuid) AND org_id = CAST(:org_id AS uuid)
"""), {"id": some_id, "org_id": org_id})
```
UUID parameters are always cast: `CAST(:param AS uuid)`.

### 15.3 Frontend Patterns

**Component pattern**:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { someApi } from '@/lib/api'

interface Props { ... }

export default function MyComponent({ prop }: Props) {
  const [data, setData] = useState<DataType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    someApi.getData()
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [prop])

  if (loading) return <div className="...<Loader2 /></div>
  if (error || !data) return <div>...error message...</div>

  return <div>...render data...</div>
}
```

**API call pattern** (via `lib/api.ts`):
```typescript
// In lib/api.ts — add new endpoint to appropriate group
export const dealsApi = {
  newAction: (dealId: string, body: { field: string }) =>
    api.post(`/deals/${dealId}/action`, body),
}

// In component
const result = await dealsApi.newAction(dealId, { field: 'value' })
// result.data contains the response
```

**Hook pattern**: There are no custom hooks. All state logic is inline in components.

### 15.4 Anti-Patterns to Avoid

1. **Do NOT use the Alembic migration runner** — this project uses custom async Python migration scripts. Create a new `migration_*.py` file for schema changes.

2. **Do NOT interpolate user input into SQL strings** — always use SQLAlchemy parameterized queries with named params.

3. **Do NOT access org data without `org_id` scoping** — every query touching deals/documents/etc. MUST include `AND org_id = CAST(:org_id AS uuid)`.

4. **Do NOT use `api.get(url)` for SSE endpoints** — use native `fetch()` because axios does not expose `ReadableStream`.

5. **Do NOT raise exceptions from `log_activity()` callers** — the activity service silently handles its own failures; never wrap in try/catch at the call site.

6. **Do NOT add new features to NEXUS without adding the column to both `FEATURE_COLUMNS` list AND `nexus_deal_features` table** — the feature extractor and model trainer both depend on this list.

7. **Do NOT skip the UUID cast** — the DB schema uses both `String` (ORM) and `UUID` type columns; always use `CAST(:param AS uuid)` in raw SQL.

8. **Do NOT register new routers with unversioned paths only** — always add to both `/v1/...` and the unversioned fallback in `main.py`.

---

## 16. KNOWN ISSUES & TECHNICAL DEBT

### 16.1 Known Gaps

1. **JWKS fetch is synchronous** (`httpx.get` in `dependencies.py`) — blocks an async worker thread on cold start or cache refresh. Should be `httpx.AsyncClient`.

2. **`pulse_actions` uses mixed ID types** — `deal_id` is `UUID(as_uuid=True)` but `deals.id` is `String`. Joins require explicit casting. The ORM model for `PulseAction` has `deal_id = mapped_column(UUID(as_uuid=True), ForeignKey("deals.id", ondelete="SET NULL"))` which may fail if `deals.id` is stored as a string UUID.

3. **No vector index on `chunks`** — sequential scan for every vector search. Acceptable for small datasets; will need ivfflat index as data grows.

4. **Knowledge graph is defined but not auto-populated** — `deal_kg_nodes` and `deal_kg_edges` tables exist and the `search_knowledge_graph` tool queries them, but there is no extraction pipeline that fills them. The tool falls back to document search when empty.

5. **ERP integration is mocked** — `erp_mock.py` has hardcoded inventory data. The `erp_margin_available_pct` feature in NEXUS is always defaulted to 0.35 (35% margin). A real ERP integration does not exist.

6. **No automated tests** — no test suite exists in the codebase.

7. **`migration_journey.py` not examined** — the journey report migration file was not fully read; it may add a `report_type` column to `deal_reports` that is documented in other migrations.

8. **Report PDF files not cleaned up on server restart** — PDFs accumulate in `./uploads/reports/`. No scheduled cleanup.

9. **`changed_by` in stage history never set to real user** — the endpoint does not extract the user identity from the JWT and pass it to the stage history record. Always NULL or 'system' for automated transitions.

### 16.2 Technical Debt

1. **Backward-compatible unversioned routes** — `main.py` registers every router twice (with `/v1/` prefix and without). Should remove unversioned routes after frontend migration.

2. **No React Query / SWR** — all data is fetched on mount with no caching, deduplication, or background refresh. Adding TanStack Query would improve UX significantly.

3. **All DB queries are raw SQL** — the ORM models in `database.py` are used for schema initialization (`create_all`) only. All data access uses `text()` queries. This works but bypasses ORM safety features.

4. **`DEFAULT_ORG_ID` fallback** in both `dependencies.py` and `lib/api.ts` — this is a security-sensitive default that should be removed before production use.

5. **`secret_key` in config** — has a weak default (`change-me-in-production`) with a startup check only in production mode. Dev environments use the weak default.

6. **NEXUS training is synchronous** — runs inline in the request handler. For large datasets (hundreds of deals) this will timeout. Should be offloaded to a background task or worker.

---

## 17. GLOSSARY

| Term | Definition |
|---|---|
| **ARIA** | The AI ReAct agent in the Ask AI feature. Stands for AI Revenue Intelligence Agent. |
| **MEDDIC** | Sales qualification framework: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion. |
| **ReAct** | Reasoning + Acting agent pattern. The LLM reasons about what tool to call, calls it, observes the result, and repeats. |
| **NEXUS** | Revenue Simulation Engine. 4-layer ML pipeline: feature extraction → model training → scenario simulation → artifact generation. |
| **Win DNA** | SHAP-powered attribution of which deal characteristics predict wins vs. losses. |
| **Scenario Simulation** | Bayesian "what-if" testing: modify one deal feature, predict the new win probability, compute expected revenue delta. |
| **ERP** | Enterprise Resource Planning system (SAP, Oracle, etc.). Currently mocked in `erp_mock.py`. |
| **Pulse Sync** | ERP-integrated deal action system. Sales rep asks a natural language question; system queries ERP and proposes an action. |
| **org_id** | UUID identifying the tenant (organization). All data is scoped by `org_id`. |
| **SSE** | Server-Sent Events. Used for the Ask AI streaming endpoint. One-way server-to-client stream. |
| **Chunk** | A 400-word segment of a document, with 80-word overlap, with a 1536-dim embedding vector stored in pgvector. |
| **Intelligence Report** | Type 1 PDF report: GPT-4o analysis of all deal documents → structured JSON → ReportLab PDF. |
| **Journey Report** | Type 2 PDF report: chronological narrative of the entire deal history, including stage changes, field edits, AI scores. |
| **Stage Health** | AI assessment of whether a deal is on_track, at_risk, or stalled at its current stage. Produced during scoring. |
| **Stage Velocity** | Composite score measuring how fast a deal moves relative to typical stage durations. < 1.0 = faster (good), > 1.0 = slower (bad). |
| **Exit Criteria** | Checklist of conditions that should be satisfied before advancing a deal to the next stage. Auto-seeded from `STAGE_CONFIGS`. |
| **Terminal Stage** | A stage from which no further transitions are allowed: Closed Won or Closed Lost. |

---

## 18. QUICK REFERENCE

### 18.1 "I want to add a new..." Cheat Sheet

**New API endpoint**:
1. Add the endpoint function to the appropriate router in `backend/app/routers/`
2. If it needs new Pydantic models, add them to `backend/app/models/schemas.py`
3. Add the corresponding API call to `frontend/lib/api.ts` in the appropriate group
4. Register any new router in `backend/main.py` (both `/v1/` and unversioned)

**New database table**:
1. Create a new `migration_X.py` in `backend/` using the existing migration pattern (asyncpg, CREATE TABLE IF NOT EXISTS)
2. Add the corresponding ORM model class to `backend/app/database.py` (for `create_all` to pick it up)
3. Run `python migration_X.py` from the backend directory

**New deal field**:
1. Add column to `deals` table in a new migration (`ALTER TABLE deals ADD COLUMN IF NOT EXISTS ...`)
2. Update the ORM `Deal` model in `database.py`
3. Update `DealCreate` in `schemas.py` (if it should be settable on creation)
4. Update `DealUpdate` in `routers/deals.py` (if it should be patchable)
5. Update the SELECT in `get_deal()` and `list_deals()` in `deals.py`
6. Update the frontend `Deal` interface in `/deals/[id]/page.tsx` and `/deals/page.tsx`

**New NEXUS feature**:
1. Add the column name to `FEATURE_COLUMNS` in `nexus/feature_extractor.py`
2. Add the extraction logic to `extract_features_for_deal()` in `feature_extractor.py`
3. Add the column to `nexus_deal_features` via a new migration
4. Add a human-readable display name to `FEATURE_DISPLAY_NAMES` in `model_trainer.py`

**New AI artifact type**:
1. Add the type to `ArtifactType` enum in `nexus/schemas.py`
2. Add the CHECK constraint update in a migration on `nexus_artifacts.artifact_type`
3. Add the generator function to `nexus/artifact_generator.py` and register in `GENERATORS` dict

**New activity event type**:
1. Call `await log_activity(org_id=..., event_type="new_event_type", entity_type=..., ...)` at the appropriate point
2. No schema change required — `event_type` is a free-form VARCHAR

**New page**:
1. Create `frontend/app/new-page/page.tsx` with `'use client'` directive
2. Add the route to `NAV_GROUPS` in `frontend/components/Sidebar.tsx`
3. Add API calls to `frontend/lib/api.ts`

### 18.2 Key File Index (20 Most Important Files)

| Priority | File | Why Important |
|---|---|---|
| 1 | `/backend/app/database.py` | All ORM models — defines every table structure |
| 2 | `/backend/app/dependencies.py` | Auth/JWT validation — get_org_id() used everywhere |
| 3 | `/backend/app/routers/deals.py` | Core business logic — most endpoints |
| 4 | `/backend/app/services/scoring.py` | GPT-4o scoring prompt and full response schema |
| 5 | `/backend/app/services/react_agent.py` | ARIA ReAct loop + REACT_SYSTEM_PROMPT |
| 6 | `/backend/app/services/ask_ai_tools.py` | All 9 agent tools — what data the AI can access |
| 7 | `/backend/app/services/embeddings.py` | Full ingestion pipeline: text → sentiment → chunks → vectors |
| 8 | `/backend/app/stages.py` | STAGE_CONFIGS — stage metadata, exit criteria, win prob ranges |
| 9 | `/backend/nexus/feature_extractor.py` | 40 ML features — FEATURE_COLUMNS definition |
| 10 | `/backend/nexus/simulator.py` | ACTION_SPACE + scenario simulation algorithm |
| 11 | `/backend/main.py` | Router registration + app configuration |
| 12 | `/backend/app/config.py` | All environment variables + Settings class |
| 13 | `/frontend/lib/api.ts` | Every API endpoint callable from the frontend |
| 14 | `/frontend/app/deals/[id]/page.tsx` | Main deal detail view — all tabs |
| 15 | `/frontend/components/AskAITab.tsx` | SSE stream consumption + chat UI |
| 16 | `/frontend/lib/stage-utils.ts` | Stage type definitions + color system |
| 17 | `/frontend/components/AuthGuard.tsx` | Session management + route protection |
| 18 | `/frontend/lib/supabase.ts` | Supabase client configuration |
| 19 | `/backend/app/routers/deal_ask_ai.py` | SSE endpoint + conversation management |
| 20 | `/backend/nexus/model_trainer.py` | XGBoost training + SHAP computation |

---

## 19. SERVICE IMPLEMENTATION DETAILS

### 19.1 `scoring.py` — Full Scoring Pipeline

**File**: `/backend/app/services/scoring.py`

**System prompt structure** (`SYSTEM_PROMPT`):
- Injected `{stage_context}` block contains current stage name, description, and win probability range floor/ceiling from `STAGE_CONFIGS`
- Required JSON output schema documented inline (no schema library — plain string template)
- Explicit rule: "Your win_probability MUST be calibrated to the current stage range. A Discovery deal at 95% is a hallucination."

**`_build_stage_context(stage)`**:
- Fetches `STAGE_CONFIGS[stage]` and returns formatted string:
  ```
  CURRENT DEAL STAGE: {stage}
  Stage description: {config['description']}
  Expected win probability range: {floor}% - {ceiling}%
  Typical days in this stage: {typical_duration_days} days
  ```

**`score_deal(deal_id, db)` → `dict`**:
1. SELECT stage FROM deals WHERE id = deal_id
2. `retrieve_chunks()` with hardcoded query: `"deal status buyer concerns objections budget timeline decision process champion stakeholders"`, `top_k=15`
3. Returns `{"error": "No documents found..."}` if chunks empty
4. Builds context string: `[Source: {filename} | Type: {source_type}]\n{text}` per chunk, joined by `\n\n---\n\n`
5. GPT-4o call: `temperature=0.1, max_tokens=4000, response_format={"type": "json_object"}`
6. Queries `AVG(sentiment_score)` from documents for this deal
7. UPDATE deals: win_probability, probability_low, probability_high, time_to_close_days, score_summary, risk_flags, signals, meddic, last_scored_at
8. INSERT score_history with deal_stage + stage_health columns (for NEXUS ML feature extraction)
9. db.commit()
10. Returns raw GPT response dict

**GPT output fields** (all stored or returned):
- `win_probability`: float 0.0-1.0
- `probability_low`: lower bound of 80% confidence interval
- `probability_high`: upper bound of 80% CI
- `time_to_close_days`: integer
- `score_summary`: 2-3 sentence CRO-level assessment
- `top_reasons`: list of `{excerpt, source_type, filename, impact, type}` — impact range -0.3 to +0.3
- `risk_flags`: list of specific risk strings
- `recommended_actions`: list of actionable next steps
- `signals`: list of `{type, severity, label, excerpt, filename, color}`
- `meddic`: dict of 6 dimensions, each `{value, confidence, excerpt}`
- `stage_health`: `"on_track" | "at_risk" | "stalled"`
- `stage_health_reason`: one sentence

**Signal types**: `competitor_mentioned`, `budget_concern`, `timeline_risk`, `multi_stakeholder`, `champion_identified`, `urgency_signal`, `technical_fit`, `negotiation_opening`

**Signal colors**: `red` (critical/blocking), `yellow` (warning/watch), `green` (positive indicator)

---

### 19.2 `embeddings.py` — Ingestion Pipeline

**File**: `/backend/app/services/embeddings.py`

**Constants**:
- `CHUNK_SIZE = 400` words per chunk
- `CHUNK_OVERLAP = 80` words overlap between consecutive chunks

**`chunk_text(content: str) → list[str]`**:
- Splits on whitespace, iterates with `i += CHUNK_SIZE - CHUNK_OVERLAP`
- Returns list of space-joined word subsequences

**`embed_texts(texts: list[str]) → list[list[float]]`**:
- Batches in groups of 20
- Each text truncated to `[:8000]` chars before sending
- Model: `text-embedding-3-small`
- Returns list of 1536-dim float lists

**`embed_single(text: str) → list[float]`**:
- Wrapper: calls `embed_texts([text])[0]`
- Used by `rag.py` and `ask_ai_tools.py` for query embedding

**`analyze_sentiment(content: str) → tuple[float, str]`**:
- Input: `content[:3000]` (first 3000 chars)
- GPT-4o-mini: `temperature=0.1, max_tokens=60`
- System prompt: "Analyze buyer sentiment in this B2B sales document. Return ONLY valid JSON: `{"score": <float -1.0 to 1.0>, "label": "positive|neutral|negative"}`"
- Returns `(0.0, "neutral")` on any exception

**`extract_text_from_pdf(file_path: str) → str`**:
- Uses `fitz.open(file_path)` (PyMuPDF)
- Concatenates `page.get_text()` for all pages

**`transcribe_audio(file_path: str) → str`**:
- Opens file in binary mode
- Calls `client.audio.transcriptions.create(model="whisper-1", file=f, response_format="text")`
- Returns raw transcript string

**`ingest_file(file_path, filename, source_type, deal_id, document_id, db) → int`**:
1. Text extraction: audio/video → Whisper, pdf → fitz, other → open with UTF-8 errors=ignore
2. Return 0 if no text
3. `analyze_sentiment(raw_text)` → score, label
4. UPDATE documents: content (capped at 50,000 chars), sentiment_score, sentiment_label, status='processing'
5. `chunk_text(raw_text)` + `embed_texts(chunks)`
6. For each chunk: INSERT into chunks with `CAST(:embedding AS vector)`
7. UPDATE documents SET status='done'
8. If deal already has win_probability: INSERT score_history row with `trigger_type='document_ingested'`, `trigger_document=filename`
9. db.commit()
10. Returns count of chunks created

---

### 19.3 `rag.py` — Retrieval-Augmented Generation

**File**: `/backend/app/services/rag.py`

**`retrieve_chunks(query, db, deal_id=None, top_k=8) → list[dict]`**:
- Embeds query with `embed_single(query)`
- SQL: `ORDER BY embedding <=> CAST(:embedding AS vector) LIMIT :limit`
- With `deal_id`: scoped to that deal; without: searches all chunks (org-unscoped — legacy)
- Returns list of `{id, text, source_type, filename, chunk_index, similarity}`

**`rag_answer(query, db, deal_id=None, system_context="") → dict`**:
- Retrieves `top_k=6` chunks
- Returns `{"answer": "...", "evidence": [...], "chunks_used": 0}` if no chunks
- Builds context: `[Source N: {filename} | {source_type}]\n{text}` per chunk
- GPT-4o-mini: `temperature=0.2`, no max_tokens set
- System prompt: "You are Synvelo, an AI revenue intelligence assistant. Answer questions about sales deals using ONLY the provided context. Always cite which source you're drawing from. Be specific and actionable."
- Returns `{answer: str, evidence: top_4_chunks, chunks_used: int}`
- **Note**: This is the legacy single-turn endpoint. The ReAct agent (`ask_ai_tools.search_documents`) uses `embed_single` + direct SQL for its document search.

---

### 19.4 `brief_service.py` — Brief and Follow-up

**File**: `/backend/app/services/brief_service.py`

**`generate_brief(deal_id, db) → dict`**:
- Fetches deal: name, company, stage, value, owner, win_probability, probability_low/high, time_to_close_days, score_summary, risk_flags, signals, meddic
- `retrieve_chunks("status contacts decisions timeline next steps last interaction", db, deal_id, top_k=10)`
- Constructs `deal_info` string with all deal metadata
- GPT-4o: `temperature=0.2, max_tokens=2000, response_format=json_object`
- Output schema: `{deal_status, key_contacts[], last_interaction_summary, win_probability_assessment, top_3_risks[], next_best_action, deal_velocity, executive_summary}`
- `key_contacts`: list of `{name, role, authority: decision_maker|champion|influencer|unknown}`
- `top_3_risks`: list of `{risk, severity: high|medium|low, mitigation}`
- Stores as JSON string in `deals.brief` + sets `brief_generated_at`
- Returns the parsed dict

**`generate_followup(deal_id, db) → dict`**:
- Fetches deal: name, company, stage, value, win_probability, score_summary
- `retrieve_chunks("most recent interaction follow up action items next steps commitments", db, deal_id, top_k=8)`
- Also fetches 2 most recent pending `pulse_actions` for the deal
- GPT-4o: `temperature=0.3, max_tokens=1500, response_format=json_object`
- Output schema: `{subject, body, key_points_referenced[], tone: consultative|urgent|relationship-building}`
- Does NOT persist to DB — returns transient result
- Incorporates ERP proposals if pending: "Pending ERP/Inventory Proposals: {query}: {raw_answer}"

---

### 19.5 `activity_service.py` — Fire-and-Forget Activity Logging

**File**: `/backend/app/services/activity_service.py`

**`log_activity(org_id, event_type, entity_type, entity_id?, entity_name?, actor_id?, actor_name?, old_value?, new_value?, metadata?, **kwargs) → None`**:
- Opens its own `async with AsyncSessionLocal() as session` — never shares caller's session
- Calls `_insert(...)`, commits, returns None
- On exception: logs via `logger.exception()` but **does not re-raise** — callers are never affected
- `old_value` and `new_value` are serialized with `json.dumps()` then cast `CAST(:val AS jsonb)` in SQL
- `metadata` stored in `metadata_extra` column (named differently to avoid SQLAlchemy reserved-word conflicts)
- The `**kwargs` catch-all absorbs any extra fields passed by callers — prevents TypeError

**Usage patterns throughout the codebase**:
- `await log_activity(...)` — direct call, awaited (fires in caller's async context)
- `asyncio.create_task(log_activity(...))` — fire-and-forget (non-critical paths, e.g., after streaming completes)

---

### 19.6 `tracking_service.py` — AI Feature Tracking

**File**: `/backend/app/services/tracking_service.py`

**`track_field_edit(deal_id, field_name, old_value, new_value, org_id) → None`**:
- Inserts into `deal_field_edits` with own session
- Used by `update_deal()` for each changed field

**`track_ai_feature(deal_id, feature_name, org_id, result_summary?) → None`**:
- Inserts into `deal_ai_usage_log`
- Called via `asyncio.create_task(...)` after every AI endpoint action
- `feature_name` values: `"score"`, `"brief_gen"`, `"followup_email"`, `"ask_ai"`, `"ask_ai_v2"`, `"nexus_score"`, `"report_intelligence"`, `"journey_report"`

---

### 19.7 `analytics_service.py` — Pipeline KPIs

**File**: `/backend/app/services/analytics_service.py`

**`get_pipeline_summary(db, org_id) → dict`** — runs 7 SQL queries sequentially:

1. **KPI totals**: total_deals, total_value, weighted_value (value × win_prob), avg_win_prob, avg_days, at_risk_count (prob < 0.4), unscored_count
2. **By stage**: COUNT + SUM(value) + AVG(win_probability) per stage
3. **Win probability distribution**: 5 buckets (Unscored, 0-25%, 25-50%, 50-75%, 75-100%)
4. **At-risk deals**: deals where win_probability < 0.4 OR IS NULL, limit 8, ORDER BY value DESC
5. **Recent activity**: last 8 score_history entries joined to deals, with trigger info
6. **Signal overview**: top 20 deals with signals, computes red/yellow/green counts, sorted by (-red, -yellow)
7. **By owner**: GROUP BY owner, computes deal_count, total_value, avg_prob, won count, lost count, win_rate

**Stage funnel**: builds from `STAGE_ORDER` with conversion rate (count_n / count_{n-1} × 100). Closed Won/Closed Lost are excluded from rolling count.

**Return structure**:
```json
{
  "total_deals": int,
  "total_pipeline_value": float,
  "weighted_pipeline_value": float,
  "avg_win_probability": float,
  "avg_days_to_close": float,
  "at_risk_count": int,
  "unscored_count": int,
  "by_stage": [...],
  "stage_funnel": [...],
  "win_probability_distribution": [...],
  "at_risk_deals": [...],
  "recent_activity": [...],
  "signal_overview": [...],
  "by_owner": [...]
}
```

---

### 19.8 `erp_mock.py` — Mock ERP Inventory Data

**File**: `/backend/app/services/erp_mock.py`

**Mock data — 3 SKUs**:
```python
INVENTORY = {
    "Industrial Pump P-2000": {"stock": 45, "unit_cost": 12000, "lead_time": 5},
    "Valve Assembly V-500":   {"stock": 120, "unit_cost": 4500,  "lead_time": 3},
    "Control Unit CU-100":    {"stock": 20, "unit_cost": 8000,  "lead_time": 7},
}
```

**Mock data — 3 shipping methods**:
```python
SHIPPING = {
    "standard":  {"days": 7,  "cost_per_unit": 8},
    "express":   {"days": 3,  "cost_per_unit": 18},
    "overnight": {"days": 1,  "cost_per_unit": 35},
}
```

The Pulse Sync router (`pulse_sync.py`) uses GPT-4o to interpret natural-language queries against this static data and generates a `PulseProposal` with `split_options` array.

---

### 19.9 `react_agent.py` — ARIA ReAct Loop (Full Detail)

**File**: `/backend/app/services/react_agent.py`

**`REACT_SYSTEM_PROMPT` template** (injected at runtime):
```
You are ARIA, an AI Revenue Intelligence Agent for Synvelo...
## Tools Available
{tool_list}
## Strict Response Format (ALWAYS return valid JSON — no other text)
To call a tool: {"type": "action", "thought": "...", "tool": "...", "params": {...}}
To give the final answer: {"type": "final_answer", "answer": "...", "sources": [...], "suggestions": [...]}
## Rules
1-10 (see file)
## Current Deal
{deal_summary}
## Prior Conversation Context
{conversation_context}
```

**`ReActAgent.run(query)` → `AsyncGenerator[dict, None]`**:
- Creates `messages = [system_prompt, user_query]`
- Creates empty `scratchpad = []`
- Loop `for iteration in range(MAX_ITERATIONS=6)`:
  - LLM call: `gpt-4o-mini, json_object mode, T=0.15, max_tokens=900`
  - `full_msgs = messages + scratchpad` (system+user query stays fixed; scratchpad grows)
  - Parse JSON response
  - On `json.JSONDecodeError`: yield degraded answer, return
  - On LLM exception: yield error event, return
  - If `type == "final_answer"`: yield answer event, return
  - If `type == "action"`:
    - yield `{type: "thinking", content: thought}` (if thought non-empty)
    - Validate tool name against `TOOL_REGISTRY`
    - yield `{type: "tool_call", tool: tool_name, label: _tool_label(tool_name, params)}`
    - `tool_fn = getattr(self.tools, tool_name)` → `await tool_fn(**params)`
    - On `TypeError`: `observation = {"error": "Invalid parameters: ..."}`
    - `obs_str = _compress_observation(observation)` → ≤3000 chars
    - yield `{type: "observation", content: obs_str}`
    - `scratchpad.append({role: "assistant", content: raw_json})`
    - `scratchpad.append({role: "user", content: f"OBSERVATION: {obs_str}"})`
  - Else (unexpected format): extract best answer field, yield answer, return
- After loop exhausted: yield degraded answer

**`_compress_observation(obs: dict) → str`**:
- Chunks: truncates each chunk's `content` field to 500 chars + "…"
- Nodes: truncates `nodes` list to first 5, sets `nodes_truncated=True`
- Activities: truncates string fields in `details` dict to 200 chars
- Hard truncation at 2950 chars with `'…"}'` suffix

**`_tool_label(tool_name, params) → str`**:
Labels for all 9 tools:
- `search_documents`: `Searching documents for "{query}"`
- `get_deal_state`: `Checking deal state and win probability`
- `get_meddic_assessment`: `Reviewing MEDDIC qualification scores`
- `search_activities`: `Searching activities for "{query}"` or `Loading recent deal activities`
- `get_exit_criteria_status`: `Checking stage exit criteria`
- `get_signals`: `Reading deal signals`
- `search_knowledge_graph`: `Searching knowledge graph for "{query}"`
- `get_stakeholder_map`: `Loading stakeholder map`
- `search_product_help`: `Looking up help for "{query}"`

**`build_deal_summary(deal_id, db) → str`**:
- Single SQL: SELECT name, company, stage, value, currency, owner, win_probability, days_in_stage (EPOCH), score_summary FROM deals
- Returns: `"**{name}** | {company} | Stage: {stage} ({days}d) | Value: {currency} {value:,.0f} | Win Prob: {prob}% | Owner: {owner}"`
- Appends `score_summary[:200]` if present
- Returns `"Deal not found."` or `"Deal summary unavailable."` on error

**`build_conversation_context(conv_id, db) → str`**:
- Returns `"No prior conversation."` if no conv_id
- Fetches `messages, summary` from `deal_ai_conversations`
- Returns `"No prior conversation."` if not found or empty messages
- Builds: optional summary paragraph + last 4 messages (truncated to 300 chars each)
- Format: `"Summary of earlier conversation: {summary}\nUser: ...\nAI: ..."`

---

### 19.10 `ask_ai_tools.py` — All 9 ReAct Tools (Full Detail)

**File**: `/backend/app/services/ask_ai_tools.py`

**Tool 1: `search_documents(query, source_type=None, limit=5)`**:
- Calls `embed_single(query)` → 1536-dim vector
- SQL: cosine distance on chunks table, optionally filtered by source_type
- Returns `{chunks: [{content: text[:600], source_type, filename, similarity}], total_found}`
- Returns empty result on exception (never raises)

**Tool 2: `get_deal_state()`**:
- Complex SQL with subquery: gets `prev_win_probability` from `score_history OFFSET 1 LIMIT 1`
- Computes `win_probability_trend`: "improving" if delta > 0.03, "declining" if delta < -0.03, else "stable"
- Returns win probability as percentage (×100) rounded to 1 decimal
- Returns `probability_range` as formatted string e.g. "30%–65%"
- Returns `risk_flags[:5]` (first 5 only)

**Tool 3: `get_meddic_assessment()`**:
- Fetches `meddic` JSONB from deals table
- Iterates 6 dimensions: `["metrics", "economic_buyer", "decision_criteria", "decision_process", "identify_pain", "champion"]`
- For each: reads `score` field (note: tool uses `score`, not `confidence` — inconsistency with the scoring service which writes `confidence`)
- Builds `gaps` list: dimensions with score < 0.4
- Returns `{meddic, completeness_pct, gaps[]}`

**Tool 4: `search_activities(query=None, limit=10, after=None)`**:
- Searches `activity_logs` where entity_type='deal' AND entity_id = deal_id
- Optional ILIKE search on: event_type, new_value::text, metadata_extra::text
- Optional date filter: `created_at >= :after`
- Returns `{activities: [{event, actor, details, metadata, timestamp}], total_found}`

**Tool 5: `get_exit_criteria_status()`**:
- Fetches from `deal_exit_criteria` for all stages of this deal
- Groups by stage: `{completed: [], pending: []}`
- Returns `{by_stage: [{stage, completed_count, total_count, pending_items: text[:5]}]}`

**Tool 6: `get_signals(sentiment=None)`**:
- Fetches `signals` JSONB from deals
- Filters by `signal["sentiment"]` if provided (note: signals have `color` not `sentiment` — legacy field)
- Returns `{signals: first_10, total}`

**Tool 7: `search_knowledge_graph(query, node_types=None, limit=10)`**:
- Checks `COUNT(*)` from `deal_kg_nodes` for this deal
- If count == 0: falls back to `search_documents(query, limit=min(limit, 5))`
  - Returns `{nodes: [], edges: [], fallback: True, fallback_chunks: [...], message: "..."}`
- Else: embeds query, semantic search on `deal_kg_nodes` with optional `node_type = ANY(CAST(:types AS text[]))`
- 1-hop edge traversal: fetches edges where source_node_id OR target_node_id in matched node ids (LIMIT 20)
- Returns `{nodes: [{type, label, properties, similarity}], edges: [{from, relation, to}], total_nodes}`

**Tool 8: `get_stakeholder_map()`**:
- Fetches person+champion nodes from `deal_kg_nodes` (last 20 by created_at)
- Fetches distinct `actor_name` values from `activity_logs` for this deal (last 10)
- Deduplicates by name, marks KG-sourced stakeholders with role/title/sentiment from `properties`
- Returns `{stakeholders: [{name, role, title, sentiment?, source: knowledge_graph|activity_log}]}`

**Tool 9: `search_product_help(query)`**:
- Keyword matching on `_PRODUCT_HELP_GUIDES` dict (8 static entries: upload, meddic, stage, score, journey, transcription, signals, nexus, activity, analytics)
- Returns first match or generic fallback
- Returns `{content: str, type: "product_help", query: str}`

---

### 19.11 NEXUS Feature Extractor (Full Detail)

**File**: `/backend/nexus/feature_extractor.py`

**`FEATURE_COLUMNS`** — 43 columns (the 40 ML features + 3 extras below the count):
Listed in groups: stage-derived (13), legacy timing (3), activity (3), stakeholder (5), MEDDIC (5), scoring trajectory (7), competitor/pricing (5), ERP (3), rep/deal size (2).

**`extract_features_for_deal(db, deal_id, org_id) → Optional[dict]`**:
1. SELECT * FROM deals (all columns via mappings)
2. Stage history: SELECT from_stage, to_stage, changed_at FROM deal_stage_history ORDER BY changed_at ASC
   - Builds `stage_durations` dict: actual days per stage
   - Counts regressions (to_stage in already-visited stages), skips (STAGE_ORDER gap > 1)
   - Computes `stage_velocity_score` via `compute_stage_velocity(stage_durations)`
3. Score history: SELECT win_probability, scored_at, deal_stage FROM score_history ORDER BY scored_at
   - Extracts win_prob at Discovery, Proposal, Negotiation stages
   - `sentiment_trend_slope`: `np.polyfit` on time-indexed sentiment scores
   - `sentiment_volatility`: `np.std` of sentiment scores
   - `max_sentiment_drop`: max of consecutive negative diffs
4. Documents: COUNT by source_type ('audio' → num_calls, 'text' → num_emails, all → num_docs_uploaded)
5. MEDDIC JSON parsing: checks each of 6 dimensions for non-null value → booleans
6. Signals JSON: checks for competitor/budget/price mentions via signal type matching
7. Activity log: scans for legal review mentions in event_type or metadata
8. Org avg deal size: computes `deal_size_vs_org_avg_ratio`
9. ERP defaults: `erp_margin_available_pct=0.35`, `erp_inventory_risk=False`, `erp_lead_time_days=14`
   - (Hard-coded defaults — no real ERP integration for these features)

**`extract_and_store_features(db, deal_id, org_id, outcome) → Optional[str]`**:
- Calls `extract_features_for_deal()`, adds `outcome` field
- UPSERT: `INSERT ... ON CONFLICT (deal_id) DO UPDATE SET ...`
- Returns UUID of the inserted/updated row

---

### 19.12 NEXUS Model Trainer (Full Detail)

**File**: `/backend/nexus/model_trainer.py`

**`XGBOOST_PARAMS`**:
```python
{
    "n_estimators": 300,
    "max_depth": 4,
    "learning_rate": 0.04,
    "subsample": 0.8,
    "colsample_bytree": 0.75,
    "min_child_weight": 3,
    "reg_alpha": 0.15,
    "reg_lambda": 1.2,
    "eval_metric": "logloss",
    "random_state": 42,
    "n_jobs": -1,
}
```

**`MIN_TRAINING_SAMPLES = 30`** (can be overridden with `force_retrain=True` → 5 samples minimum)

**`FEATURE_DISPLAY_NAMES`** — 43-entry dict mapping FEATURE_COLUMNS names to human-readable labels for Win DNA display.

**`prepare_feature_matrix(rows: list[dict]) → (DataFrame, ndarray)`**:
- Converts list of DB dicts to pandas DataFrame
- `y = df["outcome"].values.astype(int)`
- `X = df[X_cols].fillna(0).astype(float)`
- X_cols = intersection of FEATURE_COLUMNS and available df columns

**`train_model(X, y) → tuple[calibrated, base, metrics_dict]`**:
1. `StratifiedKFold(n_splits=min(5, max(2, len(y)//5)), shuffle=True, random_state=42)`
2. `cross_val_score(base_model, X, y, cv=cv, scoring="roc_auc")` → `auc_scores`
3. `cross_val_score(base_model, X, y, cv=cv, scoring="f1")` → `f1_scores`
4. `CalibratedClassifierCV(base_model, method="sigmoid", cv=min(3, max(2, len(y)//10)))`
5. `calibrated.fit(X, y)` — fits calibration wrapper on full training set
6. Returns `(calibrated, base_model)` tuple + metrics dict with cv_auc_mean, cv_auc_std, cv_f1_mean

**`compute_shap_values(base_model, X) → (mean_abs_dict, direction_dict)`**:
- `shap.TreeExplainer(base_model)` (uncalibrated model for SHAP — calibration wrapper is not SHAP-compatible)
- `shap_values = explainer.shap_values(X)`
- `mean_abs[feature] = float(np.abs(shap_values[:, i]).mean())`
- `direction[feature] = "positive" if shap_values[:, i].mean() > 0 else "negative"`

**`serialize_model(calibrated, base) → str`**:
- `joblib.dump((calibrated, base), buf)` into `io.BytesIO`
- Returns `base64.b64encode(buf.getvalue()).decode()`

**`deserialize_model(model_blob: str) → tuple[calibrated, base]`**:
- `base64.b64decode(model_blob)` → `joblib.load(io.BytesIO(...))`

**`build_top_factors(shap_mean_abs, shap_direction, feature_importances, n=8) → dict`**:
- Sorts by shap_mean_abs descending
- Splits into `win_factors` (positive direction) and `loss_factors` (negative direction)
- Each factor: `{feature, display_name, importance, direction, shap_score}`

**`generate_win_dna_narrative(win_factors, loss_factors, cv_auc) → str`**:
- Uses `WIN_DNA_NARRATIVE_PROMPT` from `nexus/prompts.py`
- GPT-4o: `temperature=0.3, max_tokens=300`
- Returns 3-4 sentence human-readable narrative

---

### 19.13 NEXUS Simulator (Full Detail)

**File**: `/backend/nexus/simulator.py`

**`ACTION_SPACE`** — 7 action types:
```
offer_discount:         param=discount_offered_pct,       values=[0,5,8,10,12,15,18,20]%
extend_contract_term:   param=contract_term_years,        values=[1,2,3]
engage_economic_buyer:  param=economic_buyer_engaged,     values=[True]
send_proposal_fast:     param=discovery_to_proposal_days, values=[1,2,3,5,7,14],
                        also_set=days_first_call_to_proposal (legacy compat)
increase_meddic:        param=meddic_completeness_score,  values=[0.5, 0.67, 0.83, 1.0]
add_stakeholders:       param=num_stakeholders_engaged,   values=[2,3,4,5]
send_roi_calculator:    param=meddic_metrics_filled,      values=[True]
```

**`ScenarioSimulator.predict_win_prob(features_dict) → float`**:
- `calibrated_model.predict_proba(row)[0][1]` clipped to [0.01, 0.99]
- `_dict_to_df()`: converts dict to DataFrame aligned to X_train.columns, booleans → int, all → float

**`run_full_simulation(base_features, deal_value, erp_margin_floor_pct, n_scenarios=500) → dict`**:
1. Baseline: `predict_win_prob(base_features)`, `baseline_ev = deal_value * baseline_win_prob`
2. **Single-action scenarios**: for each action × each value:
   - ERP check: if action is `offer_discount` and `(1 - discount/100) * deal_value * erp_margin_floor_pct < 0.10 * deal_value`: skip scenario (10% ERP margin floor)
   - Clone features, apply action param change
   - Predict new win_prob
   - `net_revenue_delta = deal_value * (1 - discount/100) * new_prob - baseline_ev`
   - Store scenario result
3. **2-action combos**: all (discount_value × term_value) combinations with same ERP check
4. Sort all scenarios by `net_revenue_delta` descending
5. Top scenario = `recommended`
6. Returns dict with: `baseline_win_prob`, `baseline_expected_value`, `scenario_results` (top 20), recommended fields, `erp_margin_floor_pct`, `run_duration_ms`

---

### 19.14 NEXUS Artifact Generator (Full Detail)

**File**: `/backend/nexus/artifact_generator.py`

**`GENERATORS` dict** maps artifact types to async generator functions:
```python
GENERATORS = {
    "proposal_pdf":    generate_proposal,
    "roi_calculator":  generate_roi_calculator,
    "battle_card":     generate_battle_card,
    "next_best_email": generate_next_best_email,
}
```

All 4 generators use GPT-4o with prompts from `nexus/prompts.py`:
- `PROPOSAL_SYSTEM_PROMPT`: generates proposal JSON with pricing, sections, exec summary
  - Injects: company, deal_value, discount %, term, win_prob, net_revenue_delta, MEDDIC pain + criteria + champion
- `ROI_CALCULATOR_SYSTEM_PROMPT`: generates ROI analysis with `{roi_headline, business_case_bullets[], investment, 3-year_value}`
- `BATTLE_CARD_SYSTEM_PROMPT`: generates competitive battle card
- `EMAIL_SYSTEM_PROMPT`: generates next-best outreach email

All generators add `_meta: {llm_model, tokens, generation_ms}` to output.

**NEXUS Router** (`nexus/router.py`) — `POST /api/nexus/artifacts/generate`:
- Accepts `GenerateArtifactRequest {simulation_id, deal_id, artifact_types: list[str]}`
- Loads simulation from `nexus_simulations`, fetches deal data
- For each requested artifact type: calls `GENERATORS[type](sim_result, deal_data, client)`
- Stores result in `nexus_artifacts` as JSONB in `content_json`
- Logs `nexus_artifacts_generated` activity

---

## 20. ROUTER IMPLEMENTATION DETAILS

### 20.1 `deals.py` Router (Complete)

**File**: `/backend/app/routers/deals.py`

**Route order matters** — static routes must come before `/{deal_id}`:
- `GET /stage-configs` — registered before `GET /{deal_id}` to prevent shadowing
- `GET /pipeline/overview` — same

**`create_deal`** (POST `/`):
- Generates UUID in Python: `did = str(uuid.uuid4())`
- INSERT deals with explicit column list (including `stage_entered_at = NOW()`)
- INSERT deal_stage_history with `from_stage=NULL, triggered_by='system'`
- `await log_activity("deal_created", new_value={company, stage, value, owner})`
- Returns flat dict (not ORM model)

**`list_deals`** (GET `/`):
- `limit` param: `ge=1, le=200, default=50`; `offset` param: `ge=0, default=0`
- Computes `days_in_current_stage` via `EXTRACT(DAY FROM NOW() - COALESCE(stage_entered_at, created_at))::INTEGER`
- Computes `red_signals` and `yellow_signals` by parsing `signals` JSONB and counting by `color` field
- `_parse(val)` helper: handles list, dict, JSON string, or None → always returns list or dict

**`get_deal`** (GET `/{deal_id}`):
- Parses `brief` field: `json.loads(r.brief)` if not None, else `None`
- Returns `meddic` as parsed dict via `_parse(r.meddic) if r.meddic else {}`
- Computes `days_in_current_stage` same as list

**`update_deal`** (PATCH `/{deal_id}`):
- `DealUpdate` model: all fields Optional (value, currency, company, owner, time_to_close_days)
- `body.model_dump(exclude_none=True)` → only non-None fields are updated
- Dynamic SET clause: `", ".join(f"{k} = :{k}" for k in updates)`
- Captures old values by fetching deal first, compares field-by-field
- Logs one activity event per changed field: `event_type=f"deal_{field_key}_changed"`
- `asyncio.create_task(track_field_edit(...))` per changed field
- Re-fetches deal and returns updated dict

**`score`** (POST `/{deal_id}/score`):
- Rate limited: `@limiter.limit(AI_RATE)` — requires `request: Request` as first param
- `await track_ai_usage(org_id, "score")`
- Returns `score_deal()` result directly (includes all GPT output fields)
- `asyncio.create_task(track_ai_feature(..., feature_name="nexus_score"))` — labeled differently from log

**`transition_deal_stage`** (PATCH `/{deal_id}/stage`):
- `StageTransitionRequest {to_stage, reason?, triggered_by="manual"}`
- `can_transition(current_stage, to_stage)` → `(bool, str)` — raises 400 if not allowed
- Generates `history_id = str(uuid.uuid4())` in Python
- UPDATE deals: SET stage, stage_entered_at = NOW()
- INSERT deal_stage_history with all fields
- Fetches deal name POST-commit (from new session state) for activity log
- If `to_stage in TERMINAL_STAGES`: `asyncio.create_task(_fire_nexus_extraction(deal_id, org_id, outcome))`
  - `outcome = 1` if "Closed Won", `0` if "Closed Lost"
- Returns: `{success, deal_id, previous_stage, new_stage, history_entry, next_stage, stage_config, message}`

**`get_exit_criteria`** (GET `/{deal_id}/exit-criteria`):
- Auto-seeds from `STAGE_CONFIGS[stage]["exit_criteria"]` on first access (if no rows exist for deal+stage)
- ORDER: `is_custom ASC, created_at ASC` (defaults first, then custom)

**`toggle_exit_criterion`** (PATCH `/{deal_id}/exit-criteria/{criterion_id}`):
- `new_state = not row.is_completed`
- `SET completed_at = CASE WHEN :completed THEN NOW() ELSE NULL END`

**`add_custom_criterion`** (POST `/{deal_id}/exit-criteria`):
- `is_custom = TRUE` for user-added criteria
- `stage` defaults to current deal stage if not provided in body

**`delete_custom_criterion`** (DELETE `/{deal_id}/exit-criteria/{criterion_id}`):
- `if not row.is_custom: raise HTTPException(400, "Cannot delete default criteria...")`
- Only custom criteria can be deleted

**`_fire_nexus_extraction(deal_id, org_id, outcome)`**:
- Background async function called via `asyncio.create_task()`
- Opens `AsyncSessionLocal()` directly (not from request's dependency injection)
- Imports `extract_and_store_features` locally (lazy import inside function)
- Silently logs errors — NEXUS failure must never affect the stage response

---

### 20.2 `deal_ask_ai.py` Router (Complete)

**File**: `/backend/app/routers/deal_ask_ai.py`

**`AskAIQueryRequest`**: `message: str (min_length=1, max_length=2000)`, `conversation_id: Optional[str] = None`

**`_verify_deal(deal_id, org_id, db) → str`**:
- Returns deal name (used for logging)
- Raises 404 if not found or not in org

**`_get_or_create_conversation(deal_id, conversation_id, db) → str`**:
- If `conversation_id` provided: validates it belongs to this deal, returns it
- Otherwise: `INSERT INTO deal_ai_conversations (id, deal_id, user_id='default', messages='[]'::jsonb)`
- Returns UUID string

**`_append_messages(conv_id, user_message, ai_answer, sources, suggestions, steps) → None`**:
- Own session via `async with AsyncSessionLocal() as db`
- Fetches current messages JSONB + title
- Appends user message `{role, content, timestamp}` and assistant message `{role, content, sources, suggestions, steps, timestamp}`
- Auto-titles: first user message[:60] + "…"
- Rolling summary at 8+ messages: `await _generate_summary(msgs[:-4])` (summarizes all but last 4)
- UPDATE with summary if generated, without if not

**`_generate_summary(messages: list) → Optional[str]`**:
- Takes last 12 messages, truncates each content to 200 chars
- GPT-4o-mini: `max_tokens=150, temperature=0.1`
- System: "Summarize this sales deal conversation in 2-3 sentences. Focus on what was asked and what key facts were established."
- Returns None on exception

**`_query_stream(deal_id, org_id, message, conversation_id, db)`**:
- Resolves conv_id (creates new on exception)
- Builds deal_summary + conv_context
- Instantiates `AskAITools(deal_id, db)` and `ReActAgent(tools, deal_summary, conv_context)`
- Collects all `thinking` and `tool_call` events into `collected_steps`
- Captures final answer, sources, suggestions
- After `answer` event: yields `{type: "conversation_id", conversation_id: conv_id}` (frontend stores this)
- Yields `{type: "done"}`
- `asyncio.create_task(_append_messages(...))` — persist after streaming
- `asyncio.create_task(log_activity(..., event_type="deal_ask_ai"))` — with step count

**`ask_ai_query`** (POST `/{deal_id}/ask-ai/query`):
- Rate: `@limiter.limit(AI_RATE)` = 10/minute
- `await track_ai_usage(org_id, "ask_ai_v2")`
- Returns `StreamingResponse(_query_stream(...), media_type="text/event-stream")`
- Headers: `Cache-Control: no-cache, X-Accel-Buffering: no, Connection: keep-alive`

**`suggest_questions`** (POST `/{deal_id}/ask-ai/suggest`):
- Rate: `@limiter.limit("30/minute")` (higher limit than AI endpoints)
- Fetches: stage, win_probability, meddic, risk_flags, score_summary, days_in_stage
- GPT-4o-mini: `temperature=0.7, max_tokens=200`
- Prompt incorporates: stage, days in stage, win prob%, MEDDIC gaps (dimensions with no value), risk_flags[:2]
- Returns `{suggestions: [3 strings]}`

**`get_conversation`** (GET `/{deal_id}/ask-ai/conversations/{conv_id}`):
- Returns full message history with `summary` field
- Messages may be JSON string (deserialized) or already a list

**`graph_stats`** (GET `/{deal_id}/ask-ai/graph/stats`):
- Counts nodes and edges in `deal_kg_nodes` and `deal_kg_edges`
- Also counts chunks
- Returns `{node_count, edge_count, chunk_count, has_graph: bool}`

---

### 20.3 Other Routers

**`analytics.py`** (`GET /v1/analytics/summary`):
- Calls `get_pipeline_summary(db, org_id)` from `analytics_service.py`
- `GET /v1/analytics/usage`: calls `get_ai_usage(org_id, month)` from `rate_limit.py`
  - `month` param format: `YYYY-MM`; defaults to current month

**`activity.py`** (`GET /v1/activity/`):
- All filter params: event_type, entity_type, entity_id, actor_id, search, date_from, date_to, limit (1-200, default 50), offset
- Dynamic WHERE clause built by appending conditions
- `search` param: ILIKE on `entity_name, actor_name, event_type, new_value::text`
- Returns `{total, limit, offset, items: [...]}`
- `GET /v1/activity/event-types`: `SELECT DISTINCT event_type FROM activity_logs WHERE org_id = ... ORDER BY event_type`

**`reports.py`** — path traversal protection:
```python
report_path = (REPORTS_DIR / filename).resolve()
if not report_path.is_relative_to(REPORTS_DIR.resolve()):
    raise HTTPException(403, "Access denied")
```

**`organisations.py`** (`POST /v1/organisations/`):
- No auth required (`get_org_id` NOT injected)
- Checks slug uniqueness: `SELECT id FROM organisations WHERE slug = :slug`
- Default org seeded in migration: id=`00000000-0000-0000-0000-000000000001`

**`transcription.py`** (`POST /v1/transcribe/upload`):
- Uses `BackgroundTasks` (not `asyncio.create_task`): `background_tasks.add_task(process_transcription, tid, ...)`
- Returns immediately with `{transcription_id, status: "pending"}`
- Polling via `GET /v1/transcribe/status/{tid}`

**`ingest.py`** (`POST /v1/ingest/upload`):
- Extension allowlist: `{"pdf","txt","csv","doc","docx","xls","xlsx","json","mp3","mp4","wav","m4a","ogg","webm"}`
- Source type mapping: `{"mp3":"audio","mp4":"audio","wav":"audio","m4a":"audio","ogg":"audio","webm":"audio","pdf":"pdf"}`; all others → `"text"`
- Filename sanitization: `re.sub(r'[^a-zA-Z0-9._-]', '_', filename)` after `Path(filename).name`
- Size check: `len(file_bytes) > settings.max_file_size_mb * 1024 * 1024` → 413

---

## 21. FRONTEND IMPLEMENTATION DETAILS

### 21.1 Deals Page (`/frontend/app/deals/page.tsx`)

**State variables**:
```typescript
deals: Deal[]        // full list from API
filtered: Deal[]     // computed from deals + filterStage + searchText + sortOption
loading: boolean
error: boolean
filterStage: string  // '' = all stages
searchText: string
sortOption: SortOption
creating: boolean    // POST in flight
createError: string
showCreateModal: boolean
// create form:
newName, newCompany, newStage, newValue, newCurrency, newOwner, newTimeToClose
// delete:
deleteTarget: Deal | null
deleteConfirmText: string
deleting: boolean
```

**Sort options** (`SortOption` union type): `'latest' | 'oldest' | 'highest_value' | 'lowest_value' | 'most_days' | 'fewest_days' | 'highest_prob' | 'lowest_prob'`

**`getDaysRemaining(deal)`**: computes days from `created_at + time_to_close_days - now`. Can be negative (overdue).

**`getEstCloseDate(deal)`**: returns `Date` or null.

**Delete confirmation**: requires user to type `"Yes I want to delete this deal"` exactly (`DELETE_PHRASE` constant).

**`OwnerAvatar`** inline component: initials from name (first letter of each word, uppercase, max 2 chars). 6 color palettes chosen by `name.charCodeAt(0) % 6`.

**`DealIcon`** inline component: colored square with `FileBarChart2` icon, colored by stage using `STAGE_COLORS`.

**`ScoreGauge`** (inline, also used in `[id]/page.tsx`):
- SVG semicircle with `viewBox="0 0 200 110"`
- Arc: radius 80, center (100,100), from 180° to 360°
- Needle: rotate by `(prob * 180 - 90)°`
- Color: `prob >= 0.7 → green-600`, `prob >= 0.4 → amber-500`, else `red-500`

### 21.2 Deal Detail Page (`/frontend/app/deals/[id]/page.tsx`)

**Tabs**: `'overview' | 'meddic' | 'signals' | 'brief' | 'followup' | 'documents' | 'calls' | 'pipeline' | 'journey' | 'ask-ai'`

**State variables** (major):
```typescript
deal: Deal | null
docs: Doc[]
transcriptions: Transcription[]
scoreHistory: HistoryPoint[]
activeTab: TabKey
scoring: boolean     // score API in flight
briefOpen: boolean
followupOpen: boolean
editingField: 'value' | 'company' | 'owner' | 'time_to_close_days' | null
editValue: string
saving: boolean
```

**Inline edit flow**: clicking a field sets `editingField` + `editValue`. On save: `dealsApi.update(id, {field: parsedValue})`, clears editingField, re-fetches deal.

**Score button flow**: sets `scoring=true`, calls `dealsApi.score(id)`, updates `deal` state with response, pushes to `scoreHistory`.

**`Deal` interface** (frontend TypeScript):
```typescript
interface Deal {
  id: string; name: string; company: string; stage: string
  value: number; currency: string; owner: string
  win_probability: number | null; probability_low: number | null; probability_high: number | null
  time_to_close_days: number | null; score_summary: string | null
  risk_flags: string[]; signals: Signal[]; meddic: MEDDIC | null
  brief: BriefData | null; brief_generated_at: string | null
  last_scored_at: string | null; created_at: string
  stage_entered_at: string | null; days_in_current_stage: number
}
```

### 21.3 Auth Guard (`/frontend/components/AuthGuard.tsx`)

**Session validation**:
1. `supabase.auth.getSession()` → checks `session?.user`
2. 24-hour max age check: `new Date().getTime() - new Date(user.last_sign_in_at).getTime() > 24 * 60 * 60 * 1000`
3. On `/login` page with valid session: redirects to `/deals`
4. On any other page without session: redirects to `/login`
5. `supabase.auth.onAuthStateChange()` listener refreshes auth state on login/logout events

**Loading state**: renders `<div className="flex items-center justify-center h-screen syn-bg"><Loader2 /></div>` while checking.

### 21.4 Sidebar (`/frontend/components/Sidebar.tsx`)

**Navigation groups**:
- **Intelligence**: Deals (`/deals`), Analytics (`/analytics`)
- **Simulation**: NEXUS Hub (`/nexus`), Win DNA (`/nexus/win-dna`), Scenario Simulator (`/nexus/simulate`), Artifacts (`/nexus/artifacts`)
- **Operations**: Pulse Sync (`/pulse`), Transcription (`/transcribe`), Reports (`/reports`)
- **Monitoring**: Activity Log (`/activity`)

**Active detection**: `pathname.startsWith(item.href)` — so `/deals/123` highlights the `/deals` link.

**Sign out**: `supabase.auth.signOut()` + `router.push('/login')`.

**Width**: `w-60` (240px), background `bg-[#1e1b4b]` (Tailwind JIT arbitrary value = indigo-950).

### 21.5 Currency Utilities (`/frontend/lib/currency.ts`)

**`fmtMoney(n, currencyCode='USD') → string`** — abbreviated:
- INR: ≥1Cr → `₹{n/Cr}Cr`, ≥1L → `₹{n/L}L`, ≥1K → `₹{n/K}K`, else locale
- JPY: ≥100M → `¥{n/億}億`, ≥10K → `¥{n/万}万`, else locale
- Western: ≥1M → `${n/M}M`, ≥1K → `${n/K}K`, else locale

**`fmtFullMoney(n, currencyCode='USD') → string`** — full locale format:
- INR: `toLocaleString('en-IN')`
- Others: `toLocaleString()` (default locale)

**`CURRENCIES` array** — 8 entries with `{code, symbol, label, locale}`:
USD(en-US), EUR(de-DE), GBP(en-GB), INR(en-IN), JPY(ja-JP), CHF(de-CH), CAD(en-CA), AUD(en-AU)

### 21.6 `lib/api.ts` — API Client

**Axios instance** (`api`):
- `baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'`
- Default header: `X-Org-ID: 00000000-0000-0000-0000-000000000001`

**Request interceptor** (JWT attachment):
- `supabase.auth.getSession()` on every request
- If session: sets `Authorization: Bearer {token}` + **deletes** `X-Org-ID` header
- No session: `X-Org-ID` fallback remains

**Response interceptor** (401 handling):
- `await supabase.auth.signOut()`
- `window.location.href = '/login'`

**`askAiApi.query(dealId, message, conversationId?) → Promise<Response>`**:
- Uses native `fetch()` not axios (axios doesn't expose ReadableStream)
- Gets Supabase session → sets Authorization header or X-Org-ID fallback
- POST to `${API_BASE}/deals/${dealId}/ask-ai/query`
- Returns raw `Response` object — caller reads `.body` as ReadableStream

---

## 22. PYDANTIC SCHEMAS

**File**: `/backend/app/models/schemas.py`

### Request Schemas

**`OrganisationCreate`**: `name: str`, `slug: str`, `plan: str = "free"`

**`DealCreate`**:
- `name: str` (required)
- `company: str = ""`
- `stage: str = "Qualification"` (no enum validation — CHECK constraint is in DB)
- `value: float = 0.0`
- `currency: str = "USD"`
- `owner: str = ""`
- `time_to_close_days: Optional[int] = None`

**`StageTransitionRequest`**:
- `to_stage: str` (required)
- `reason: Optional[str] = None`
- `triggered_by: str = "manual"`

**`PulseQuery`**: `query: str`, `deal_id: Optional[str] = None`

**`AskAIQueryRequest`** (in `deal_ask_ai.py` inline):
- `message: str (min_length=1, max_length=2000)`
- `conversation_id: Optional[str] = None`

**`DealUpdate`** (in `deals.py` inline):
- `value: float | None = None`
- `currency: str | None = None`
- `company: str | None = None`
- `owner: str | None = None`
- `time_to_close_days: int | None = None`

**`ExitCriterionCreate`** (in `deals.py` inline):
- `criterion_text: str`
- `stage: str | None = None`

### Response Schemas (in `schemas.py`)

**`PulseProposal`**: `summary, split_options: list[ShipmentOption], total_cost, margin_impact, margin_impact_pct, recommended, win_probability_impact, requires_approval: bool = True`

**`ShipmentOption`**: `qty: int, eta: str, cost: float`

**`DealScore`**: `deal_id, win_probability, confidence_interval: list[float], time_to_close_days, top_reasons: list[EvidenceSpan], risk_flags: list[str], recommended_actions: list[str], score_summary`

**`IngestResponse`**: `document_id, deal_id, filename, status, chunks_created: int = 0, message: str = ""`

**Note**: Most endpoints return plain `dict` responses, not Pydantic models with `response_model=`. The schemas are used for request validation primarily.

---

## 23. NEXUS SCHEMAS

**File**: `/backend/nexus/schemas.py`

**`ExtractFeaturesRequest`**: `deal_id: str, outcome: int (0 or 1)`

**`TrainModelRequest`**: `force_retrain: bool = False`

**`SimulateRequest`**: `deal_id: str, simulation_type: str = "full", n_scenarios: int = 500`

**`SimulationResponse`**: `simulation_id, deal_id, baseline_win_prob, baseline_expected_value, recommended_action_type, recommended_action_params, recommended_win_prob_new, recommended_ev_new, recommended_net_rev_delta, recommended_reasoning, scenario_count, top_scenarios: list[ScenarioResult], erp_validated, erp_flags`

**`ScenarioResult`**: `action_type, action_params, win_prob_new, ev_new, net_revenue_delta, description`

**`WinDNAResponse`**: `org_id, model_version, cv_auc, win_factors: list[WinDNAFactor], loss_factors: list[WinDNAFactor], narrative, trained_at`

**`WinDNAFactor`**: `feature, display_name, importance, direction, shap_score`

**`ModelStatusResponse`**: `org_id, has_model, model_ready, model_version, n_training_samples, cv_auc, trained_at, min_samples_needed, current_sample_count, can_train, training_in_progress`

**`GenerateArtifactRequest`**: `simulation_id: str, deal_id: str, artifact_types: list[str]`

**`ArtifactResponse`**: `artifact_id, simulation_id, deal_id, artifact_type, status, content_json, created_at`

---

## 24. MIGRATION SCRIPTS (COMPLETE)

All migrations use asyncpg directly (not SQLAlchemy). Pattern:
```python
import asyncpg, asyncio, os

async def migrate():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL").replace("+asyncpg", ""))
    await conn.execute("""CREATE TABLE IF NOT EXISTS ...""")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
```

### Migration Files and What They Create

**`migration.py`** (base schema):
- `deals` table: id, name, company, stage, value, owner, win_probability, probability_low/high, time_to_close_days, score_summary, risk_flags (jsonb), signals (jsonb), meddic (jsonb), brief, brief_generated_at, last_scored_at, created_at
- `documents` table: id, deal_id FK, filename, source_type, status, content, sentiment_score, sentiment_label, created_at
- `chunks` table: id, deal_id FK, document_id FK, text, source_type, filename, chunk_index, embedding vector(1536), created_at
- `score_history` table: id, deal_id FK, win_probability, probability_low, probability_high, sentiment_avg, trigger_type, trigger_document, scored_at, created_at
- `call_transcriptions` table: id, deal_id FK, source_url, platform, status, transcript_text, pdf_filename, duration_seconds, attendees, call_title, error_message, created_at, completed_at
- Indexes on deal_id columns
- CREATE EXTENSION IF NOT EXISTS vector

**`migration_reports.py`**:
- `deal_reports` table: id, deal_id FK, filename, page_count, report_type, report_json jsonb, created_at
- Indexes: idx_deal_reports_deal_id

**`migration_multitenancy.py`**:
- `organisations` table with default row INSERT
- `ADD COLUMN IF NOT EXISTS org_id UUID` to: deals, documents, chunks, score_history, call_transcriptions, deal_reports, pulse_actions
- Creates `pulse_actions` table if not exists: id, deal_id FK SET NULL, query, proposal jsonb, raw_answer, status, decision, decided_by, decided_at, created_at, org_id
- DEFAULT org_id = '00000000-0000-0000-0000-000000000001' on all ALTER statements

**`migration_stages.py`**:
- `deal_stage_history` table with all columns + RLS + indexes
- `ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ DEFAULT NOW()` to deals
- `ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD'` to deals

**`migration_exit_criteria.py`**:
- `deal_exit_criteria` table with all columns + RLS + indexes

**`migration_activity.py`**:
- `activity_logs` table with all columns + RLS + indexes
- `deal_field_edits` table: id, deal_id FK, field_name, old_value, new_value, changed_by, changed_at, org_id
- `deal_ai_usage_log` table: id, deal_id FK, feature_name, triggered_by, triggered_at, result_summary jsonb, org_id

**`migration_nexus.py`**:
- `nexus_deal_features` table (all 40+ columns)
- `nexus_models` table (model_blob text, win_dna_narrative, etc.)
- `nexus_simulations` table
- `nexus_artifacts` table
- `nexus_training_jobs` table
- RLS on all 5 tables
- All indexes including UNIQUE constraint on nexus_deal_features(deal_id)

**`migration_nexus_stage_features.py`**:
- `ADD COLUMN IF NOT EXISTS deal_stage TEXT` to score_history
- `ADD COLUMN IF NOT EXISTS stage_health TEXT` to score_history
  - `CHECK (stage_health IN ('on_track','at_risk','stalled'))`
- `ADD COLUMN IF NOT EXISTS final_stage_before_terminal TEXT` to nexus_deal_features
- `ADD COLUMN IF NOT EXISTS stage_health_numeric NUMERIC(4,2)` to nexus_deal_features

**`migration_ask_ai_kg.py`**:
- `deal_kg_nodes` table: id, deal_id, node_type (CHECK 15 types), label, properties jsonb, embedding vector(1536), source_type, source_id, created_at, updated_at
- `deal_kg_edges` table: id, deal_id, source_node_id, target_node_id, relation_type, properties jsonb, source_type, source_id, created_at
- `deal_ai_conversations` table: id, deal_id, user_id, title, messages jsonb, summary, created_at, updated_at
- ivfflat index on deal_kg_nodes.embedding (lists=50)
- RLS on all 3 tables

**`migration_journey.py`**:
- `ADD COLUMN IF NOT EXISTS report_type VARCHAR(50) DEFAULT 'intelligence'` to deal_reports (if column not already added by earlier migration)
- `ADD COLUMN IF NOT EXISTS report_json JSONB` to deal_reports

---

## 25. CONFIGURATION DETAILS

### 25.1 `Settings` Class (`/backend/app/config.py`)

```python
class Settings(BaseSettings):
    openai_api_key: str           # required — no default
    database_url: str             # required — no default
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "change-me-in-production"
    UPLOAD_DIR: str = "uploads"   # note: uppercase to match env var case
    max_file_size_mb: int = 50
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""
    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    environment: str = "development"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle: int = 1800

    class Config:
        env_file = ".env"          # reads from backend/.env
```

**Startup safety checks** (run at module import time, not in lifespan):
- If `secret_key == "change-me-in-production"` AND `is_production`: raises `RuntimeError` — server fails to start
- If `not supabase_url` AND `is_production`: logs warning (does not fail)

**`cors_origin_list`** property: splits `cors_origins` by comma, strips whitespace, filters empty strings.

### 25.2 Rate Limiting Configuration

**Key function** (`_get_rate_limit_key`):
- Priority: `x-org-id` header → `"org:{org_id}"`
- Then: Bearer token → `"tok:{token[7:15]}"` (first 8 chars of token after "Bearer ")
- Fallback: remote IP address

**Storage**:
- Production: always uses `settings.redis_url`
- Dev: tries Redis ping, falls back to in-memory `"memory://"`

**Limits**:
- Default: `100/minute` (applied to all routes via `default_limits`)
- AI endpoints: `10/minute` via `@limiter.limit(AI_RATE)` decorator
- Suggest questions: `30/minute` (higher — lighter AI call)

**AI usage metering** (Redis hash, separate from rate limiting):
- Key: `ai_usage:{org_id}:{YYYY-MM}`
- Fields: per-endpoint call counts + `total`
- TTL: 90 days (auto-expire)

### 25.3 Database Connection

**Engine config** (`database.py`):
```python
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,         # tests connection before use
    pool_size=settings.db_pool_size,       # 10
    max_overflow=settings.db_max_overflow, # 20 (max 30 total)
    pool_recycle=settings.db_pool_recycle, # 1800s = 30 minutes
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
```

**`expire_on_commit=False`**: ORM objects remain accessible after commit without triggering lazy loads.

**`get_db()` dependency**: yields session from `AsyncSessionLocal`, no explicit close (context manager handles it).

---

## 26. ADDITIONAL TECHNICAL DETAILS

### 26.1 Background Task Patterns

Three different patterns are used depending on the criticality:

**Pattern A: `await log_activity(...)`** — awaited directly
- Used when the activity must be logged before returning the response
- Example: `create_deal`, `delete_deal`, `update_deal`

**Pattern B: `asyncio.create_task(log_activity(...))`** — fire-and-forget
- Used for non-critical logging after streaming completes
- Example: after Ask AI stream ends, after stage transition (the stage response is already returned)
- Risk: if the event loop ends before the task completes, the log is lost — acceptable

**Pattern C: `background_tasks.add_task(fn, ...)` (FastAPI BackgroundTasks)**
- Used only in `transcription.py` for the long-running transcription pipeline
- FastAPI guarantees this runs after response is sent, within the same process

### 26.2 UUID Handling Inconsistencies

Several UUID-related inconsistencies exist in the codebase:

1. **`deals.id` is `String` in ORM** but PostgreSQL column is `uuid`. Raw SQL uses `CAST(:id AS uuid)` to bridge this.

2. **`PulseAction.deal_id` is `UUID(as_uuid=True)` in ORM** while `deals.id` is `String`. This creates a type mismatch on joins. The migration creates `deal_id UUID` in PostgreSQL, so the DB type is consistent; the ORM Python types differ.

3. **`DealStageHistory.deal_id` is `UUID(as_uuid=False)` in ORM** (string UUID, not Python UUID object).

4. **`gen_random_uuid()`** is used for most UUID generation in raw SQL INSERTs. Python-generated UUIDs (`str(uuid.uuid4())`) are used when the ID needs to be returned in the response (e.g., deal creation, stage history).

### 26.3 JSONB Field Handling

All JSONB fields in `deals` (signals, risk_flags, meddic, brief) can be stored as either:
- Python dict/list (when using ORM `create_all` path)
- JSON string (when using raw SQL and the JSONB cast fails gracefully)

The `_parse(val)` helper in `deals.py` handles this:
```python
def _parse(val):
    if val is None: return []
    if isinstance(val, (list, dict)): return val
    try: return json.loads(val)
    except: return []
```

The same pattern appears inline in multiple places: `ask_ai_tools.py`, `analytics_service.py`, `journey_aggregator.py`.

### 26.4 Async Session Safety

The `AsyncSession` from FastAPI's `Depends(get_db)` is tied to the request lifecycle. It must NOT be used after the response is sent.

**Safe**: Use `Depends(get_db)` session during request handling.
**Unsafe**: Pass the request's session to `asyncio.create_task()` — the task may run after the request session is closed.

Correct pattern for background tasks with DB access:
```python
# In background tasks — always open a new session:
async with AsyncSessionLocal() as db:
    await db.execute(...)
    await db.commit()
```

Used correctly in: `activity_service.py`, `tracking_service.py`, `deal_ask_ai.py._append_messages()`, `deals.py._fire_nexus_extraction()`.

### 26.5 Supabase Auth: What It Does and Does Not Do

Supabase is used ONLY as a JWT issuer. The application does NOT:
- Store application data in Supabase (no Supabase tables used for app data)
- Use Supabase RLS as the security layer
- Use Supabase storage
- Use Supabase Realtime

What it does:
- Issues JWTs via `supabase.auth.signInWithPassword()` or magic link
- JWT contains `user_metadata.org_id` or `app_metadata.org_id`
- Provides JWKS endpoint for JWT verification: `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`
- Manages session refresh: `autoRefreshToken: true` in client config

**Frontend Supabase client** (`frontend/lib/supabase.ts`):
```typescript
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: true, persistSession: true } }
)
```

### 26.6 Transcription Pipeline (Full Detail)

**File**: `/backend/app/services/transcription_service.py`

1. Whisper-1 API call on the audio file → raw transcript string
2. GPT-4o format call: `temperature=0.2, max_tokens=6000`
   - Input: first 12,000 chars of Whisper output
   - System prompt: produces speaker-labeled text with "Key Points:" section
3. ReportLab PDF generation: renders formatted transcript to PDF
4. Save PDF to `UPLOAD_DIR/reports/{transcription_id}.pdf`
5. `ingest_file(pdf_path, call_title, "audio", deal_id, doc_id, db)` — chunks + embeds the transcript
6. UPDATE `call_transcriptions`: status='done', transcript_text, pdf_filename, completed_at

**Error handling**: any exception → UPDATE status='error', error_message=str(e)

### 26.7 Report Generation (Full Detail)

**Intelligence Report** (`report_service.py`):
1. `retrieve_chunks(comprehensive_query, db, deal_id, top_k=15)` — large context
2. Fetch deal metadata
3. GPT-4o call: generates JSON with sections: executive_summary, deal_overview, stakeholder_analysis, risk_assessment, competitive_analysis, recommended_actions, next_steps
4. ReportLab: multi-page PDF with header (Synvelo logo text), section headings, body paragraphs
5. Save to `UPLOAD_DIR/reports/{report_id}.pdf`
6. INSERT deal_reports: filename, page_count, report_type='intelligence'
7. Logs `report_generated` activity

**Journey Report** (`journey_report_service.py` + `journey_aggregator.py`):
1. `aggregate_deal_journey(deal_id, org_id, db)` collects:
   - Deal metadata (all columns)
   - Stage history with computed durations
   - Field edits from `deal_field_edits`
   - Document uploads (filename, created_at, sentiment)
   - AI feature usage from `deal_ai_usage_log`
   - Win probability timeline (score_history)
   - Activity log events (last 50)
   - Prior intelligence reports
2. GPT-4o: synthesizes narrative JSON with: journey_narrative, key_milestones[], risks_encountered[], turning_points[], outcome_analysis, recommendations[]
3. Stores narrative JSON in `deal_reports.report_json`
4. ReportLab: timeline table, risk section, narrative paragraphs

---

## 27. STAGE CONFIGS COMPLETE REFERENCE

### Stage Pipeline Configuration (from `app/stages.py`)

| Stage | Order | Color | Typical Days | Win Prob Floor | Win Prob Ceiling | Next Stage | Terminal |
|---|---|---|---|---|---|---|---|
| Discovery | 0 | #6366f1 | 7 | 5% | 30% | Qualification | No |
| Qualification | 1 | #3b82f6 | 10 | 20% | 50% | Demo | No |
| Demo | 2 | #06b6d4 | 14 | 30% | 65% | Proposal | No |
| Proposal | 3 | #f59e0b | 10 | 50% | 80% | Negotiation | No |
| Negotiation | 4 | #ec4899 | 14 | 65% | 95% | Closed Won | No |
| Closed Won | 5 | #22c55e | 0 | 100% | 100% | None | Yes |
| Closed Lost | 6 | #ef4444 | 0 | 0% | 0% | None | Yes |

**Exit criteria by stage** (auto-seeded from `STAGE_CONFIGS[stage]["exit_criteria"]`):

**Discovery**:
1. Buyer's core problem clearly identified
2. Key stakeholder(s) named
3. Budget range discussed or estimated
4. Next meeting or demo agreed upon

**Qualification**:
1. Economic buyer identified and engaged
2. Decision criteria documented
3. Timeline confirmed (not vague)
4. Budget approved or in process
5. Champion relationship established

**Demo**:
1. Full demo delivered to decision-maker
2. Key objections surfaced and addressed
3. Technical fit confirmed or scoped
4. Evaluation criteria agreed
5. Next step: formal proposal requested

**Proposal**:
1. Written proposal sent and confirmed received
2. Proposal reviewed with buyer in live meeting
3. Pricing objections surfaced
4. Decision timeline agreed in writing
5. Counter-offer received or verbal intent signaled

**Negotiation**:
1. All commercial terms agreed
2. Legal/procurement review complete
3. Signature process initiated
4. Implementation start date agreed

**Closed Won** and **Closed Lost**: no exit criteria (terminal stages).

**`can_transition(from_stage, to_stage) → (bool, str)`**:
- Returns `(False, "Deal is already in this stage.")` if from == to
- Returns `(False, "Unknown stage '{from_stage}'.")` if from not in STAGE_CONFIGS
- Returns `(False, "Cannot move a deal out of '{from_stage}'. Create a new deal if re-engaging.")` if from is terminal
- Returns `(False, "Unknown target stage '{to_stage}'.")` if to not in STAGE_CONFIGS
- Returns `(True, "ok")` otherwise
- **Any non-terminal stage can transition to any other non-terminal stage** (including regressions like Proposal → Discovery)

**`compute_stage_velocity(stage_durations: dict[str, int]) → float`**:
- `mean(actual_days / typical_days)` per stage where typical > 0
- `< 1.0`: faster than average (correlated with wins)
- `> 1.0`: slower than average (correlated with losses)
- Returns `1.0` if no data

**`encode_stage_health(stage_health: Optional[str]) → float`**:
- `"on_track"` → `1.0`
- `"at_risk"` → `0.5`
- `"stalled"` → `0.0`
- `None` or unknown → `0.5`
- Used by NEXUS feature extractor to convert string health to numeric ML feature

---

## 28. PRODUCT HELP GUIDE (ARIA's Static Knowledge)

The `search_product_help` tool in `ask_ai_tools.py` uses a static dict `_PRODUCT_HELP_GUIDES` to answer "how do I use Synvelo" questions. This is the complete content:

| Keyword | Guide Content |
|---|---|
| `upload` | Upload documents in the Documents tab — drag-and-drop or click to browse. Supports PDF, audio (mp3/m4a/wav), and text files. Files are automatically chunked, embedded, and indexed for AI search. |
| `meddic` | MEDDIC scores are in the MEDDIC tab of every deal. Six dimensions: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion — each with a 0–1 confidence score and AI-generated notes. |
| `stage` | Advance a deal via the Pipeline tab. Click the next stage button or use the stage advancement panel. Exit criteria must be reviewed before transitioning. Stage history is preserved. |
| `score` | Click 'Score Deal' at the top of any deal page. The AI reads all uploaded documents and generates a win probability (with confidence interval), risk flags, and deal signals. |
| `journey` | Journey Reports are in the Journey tab. Click 'Generate Journey Report' for an LLM-synthesized chronological narrative with timeline charts, risk assessment, and next steps. |
| `transcription` | In the Calls tab, upload an audio file or paste a meeting URL. The AI transcribes the call, analyzes sentiment per speaker, and adds it to the deal's searchable knowledge base. |
| `signals` | The Signals tab shows buying signals (intent, urgency, budget, timeline, competition) extracted from all deal documents and calls. |
| `nexus` | NEXUS Revenue Simulation is in the sidebar. It trains an XGBoost model on your historical deals and simulates outcomes for active deals. Requires ≥20 closed deals to train. |
| `activity` | The Activity Log (sidebar) shows a real-time feed of all actions across all deals — scoring events, stage changes, document uploads, AI queries, and more. |
| `analytics` | Analytics dashboard (sidebar) shows pipeline summary: total value by stage, deal count, average win probability, and velocity metrics. |

Fallback (no keyword match): "Synvelo features: document upload (Documents tab), AI deal scoring (Score Deal button), MEDDIC framework (MEDDIC tab), stage pipeline (Pipeline tab), call transcription (Calls tab), journey reports (Journey tab), and NEXUS revenue simulation (sidebar)."

---

## 29. FULL SIGNAL TYPE REFERENCE

Signals are extracted from deal documents by the GPT-4o scoring prompt. Here is the complete specification:

### Signal Types

| Type | Description | Typical Color |
|---|---|---|
| `competitor_mentioned` | Buyer mentioned a named competitor by name in calls/docs | red |
| `budget_concern` | Budget questions, cost challenges, or affordability concerns | red |
| `timeline_risk` | Timeline slippage, deadline pressure, or schedule uncertainty | yellow |
| `multi_stakeholder` | Multiple decision-makers or committee buying process identified | yellow |
| `champion_identified` | A clear internal champion advocating for this solution | green |
| `urgency_signal` | Buyer expressing urgency, deadline pressure, or must-act-now language | green |
| `technical_fit` | Strong technical alignment confirmed between product and buyer needs | green |
| `negotiation_opening` | Buyer initiating price or terms discussion (signal of buying intent) | yellow |

### Signal Object Schema
```json
{
  "type": "competitor_mentioned",
  "severity": "high",
  "label": "Competitor: Salesforce",
  "excerpt": "exact quote from document that triggered this signal",
  "filename": "Q4_discovery_call.pdf",
  "color": "red"
}
```

### Signal Aggregation (Analytics)
- `red_signals`: signals where `color == "red"` — computed per deal in `list_deals()` and `analytics_service.py`
- `yellow_signals`: signals where `color == "yellow"`
- `green_signals`: signals where `color == "green"` (computed in analytics only)
- Analytics `signal_overview`: sorted by `(-red, -yellow)` — most critical deals first

---

## 30. NEXUS PROMPTS REFERENCE

**File**: `/backend/nexus/prompts.py`

All NEXUS artifact generation prompts live here. Called by `artifact_generator.py` and `model_trainer.py`.

**`WIN_DNA_NARRATIVE_PROMPT`**: Instructs GPT-4o to write a 3-4 sentence narrative explaining the top win/loss drivers for the org based on SHAP values. Input: list of win_factors (with SHAP scores) and loss_factors, plus cv_auc metric.

**`PROPOSAL_SYSTEM_PROMPT`**: Instructs GPT-4o to generate a formal sales proposal JSON with sections: exec_summary, value_proposition, solution_overview, implementation_plan, pricing (auto-populated by `generate_proposal()` after LLM call), terms, next_steps.

**`ROI_CALCULATOR_SYSTEM_PROMPT`**: Generates ROI analysis JSON with: roi_headline, current_cost_analysis, projected_savings, investment, net_benefit, payback_period_months, 3yr_roi_pct, business_case_bullets[].

**`BATTLE_CARD_SYSTEM_PROMPT`**: Generates competitive battle card JSON with: competitor_name (inferred from deal signals), our_strengths[], their_weaknesses[], key_differentiators[], objection_handlers[{objection, response}], landmines[].

**`EMAIL_SYSTEM_PROMPT`**: Generates next-best-action email JSON with: subject, opening, value_hook, specific_reference (from MEDDIC/signals data), call_to_action, closing, ps_note.

---

## 31. ERROR PROPAGATION MAP

Tracing how errors flow from service → router → frontend:

### Backend Error Flow

```
Service function (e.g., score_deal)
    → returns {"error": "message"} dict on expected failures
    → raises exception on unexpected failures

Router handler
    → checks "error" in result → raises HTTPException(400, detail=result["error"])
    → LLM/DB exceptions bubble up → caught by FastAPI → 500 response

Frontend axios
    → catches response.status != 2xx
    → 400: displays result.response.data.detail to user
    → 401: interceptor → auto sign-out + redirect
    → 429: displays rate limit message
    → 500: displays generic error message
```

### Common Error Messages (verbatim from code)

| Condition | HTTP Status | Message |
|---|---|---|
| Deal not found | 404 | "Deal not found" |
| Deal not found (stage) | 404 | "Deal not found." (with period) |
| No documents for scoring | 400 | "No documents found for this deal. Upload documents first." |
| Invalid stage transition (same stage) | 400 | "Deal is already in this stage." |
| Invalid stage transition (terminal) | 400 | "Cannot move a deal out of '{stage}'. Create a new deal if re-engaging." |
| Invalid stage name | 400 | "Unknown stage '{stage}'." |
| Delete default criterion | 400 | "Cannot delete default criteria — only custom criteria can be removed" |
| No org_id in JWT | 403 | "User has no organisation. Complete onboarding first." |
| Expired token | 401 | "Token expired" |
| Bad token | 401 | "Malformed token: {error}" |
| Unverifiable token | 401 | "Could not verify token with any available key" |
| File too large | 413 | "File size {size}MB exceeds limit {max}MB" |
| Invalid file extension | 400 | "File type .{ext} is not allowed. Allowed: {list}" |
| Path traversal attempt | 403 | "Access denied" |
| Rate limit exceeded | 429 | "Rate limit exceeded. Please try again later." |
| No update fields provided | 400 | "No fields to update" |

---

## 32. FRONTEND STATE MACHINE (DEAL DETAIL)

The deal detail page (`/deals/[id]/page.tsx`) manages a significant amount of state. This section documents the complete state machine.

### Loading States

```
Initial mount
    → loading = true
    → Promise.all([dealsApi.get(id), ingestApi.documents(id), transcribeApi.list(id)])
    → loading = false
    → if any fails: error = true
```

### Score Button State Machine

```
User clicks "Score Deal"
    → scoring = true (button shows spinner, disabled)
    → dealsApi.score(id)
    → on success: setDeal(result), push to scoreHistory, scoring = false
    → on failure: show error toast (not implemented — silent), scoring = false
```

### Inline Edit State Machine

```
User clicks editable field
    → editingField = 'fieldName'
    → editValue = current value (stringified)

User changes input
    → editValue = new value

User presses Enter or clicks Save
    → saving = true
    → dealsApi.update(id, {field: parsedValue})
    → on success: setDeal(updated), editingField = null, saving = false
    → on failure: editingField = null (silent failure — no error display)

User presses Escape
    → editingField = null
```

### Tab State

Tab switching is purely local state — no URL sync, no data re-fetch on switch. Data is loaded once on mount and shared across all tabs.

Exception: `SentimentTimeline` and `ExitCriteriaChecklist` components fetch their own data on mount.

---

## 33. DEPLOYMENT ARCHITECTURE NOTES

### 33.1 Production Considerations

**Redis**: Required in production for rate limiting. Without Redis, the `memory://` fallback does not persist across worker processes — rate limits are not enforced cross-process.

**File Storage**: All uploads and reports are stored on local filesystem under `UPLOAD_DIR`. In a multi-instance deployment, this would need shared storage (NFS, S3, etc.). Currently no S3/blob storage integration exists.

**Worker concurrency**: Uvicorn with `--workers N` would share no state in the in-memory rate limiter. Always use Redis in production.

**Nginx integration**: The `X-Accel-Buffering: no` header on SSE responses is critical for Nginx to not buffer the stream. Without it, SSE events would be delivered all at once after the stream closes.

### 33.2 CI/CD

**Files**: `.github/workflows/ci.yml` and `cd.yml` exist but their contents were not read during this analysis.

### 33.3 Local Development Prerequisites

1. PostgreSQL with pgvector: `CREATE EXTENSION IF NOT EXISTS vector;`
2. Database: `CREATE DATABASE synvelo_db;`
3. Redis (optional for dev — falls back to in-memory)
4. OpenAI API key with access to: gpt-4o, gpt-4o-mini, whisper-1, text-embedding-3-small
5. Supabase project (optional for dev — X-Org-ID header fallback works without it)
6. Run all 10 migration scripts in order (see Section 2.6)
7. Backend auto-creates ORM-mapped tables on startup via `init_db()`

---

## 34. FRONTEND PAGE DETAILS (CONTINUED)

### 34.1 Root Page (`/frontend/app/page.tsx`)

Server component. Immediately calls `redirect('/login')`. No rendering — exists only to catch the root URL.

---

### 34.2 Login / Signup Page (`/frontend/app/login/page.tsx`)

**Mode toggle**: `'login' | 'signup'` (controlled by `mode` state).

**Login flow**:
1. `supabase.auth.signInWithPassword({ email, password })`
2. On success → `router.push('/deals')`
3. `AuthGuard` picks up the new session and allows through

**Signup flow** (5 steps):
1. `supabase.auth.signUp({ email, password })` — creates Supabase user
2. `POST /organisations/` (unversioned, no auth) — creates org with unique slug: `${baseSlug}-${random4chars}`
3. `supabase.auth.updateUser({ data: { org_id: org.id, org_name: org.name } })` — embeds org_id into JWT metadata
4. `supabase.auth.signOut()` — necessary so next login issues a fresh JWT with org_id embedded
5. `await new Promise(r => setTimeout(r, 400))` — waits for AuthGuard to process signOut before showing success message

**State variables**: `email`, `password`, `loading`, `error`, `success`, `mode`, `orgName`

**Important**: The signup flow requires signing out immediately after creating the user, because the initial JWT from `signUp()` does NOT include the `user_metadata.org_id` that was added in step 3. The user must then log in again to get a fresh JWT.

---

### 34.3 Reports Page (`/frontend/app/reports/page.tsx`)

Shows all intelligence reports across all deals. Uses `GET /v1/reports/all` (raw `api` axios instance, not `reportsApi`).

**State**: `reports: Report[]`, `loading`, `error`, `selectedDeal: string`, `generating`, `showGen` (modal), `deals: Deal[]`

**`Report` interface**:
```typescript
{
  report_id: string; deal_id: string; deal_name: string; company: string | null
  stage: string | null; win_probability: number | null
  filename: string; page_count: number; report_type: string; created_at: string
}
```

**Actions**:
- Generate: modal with deal selector → `POST /v1/reports/generate/{deal_id}` → refetch
- Download: `GET /v1/reports/download/{report_id}` → blob → `URL.createObjectURL` → programmatic click
- Delete: `DELETE /v1/reports/{report_id}` → remove from list

**`ProbPill`** inline component: renders win probability with green/amber/red coloring at 65/40% thresholds.

**`STAGE_COLOR`** map: note this uses slightly different color names from `lib/stage-utils.ts` (e.g., "Qualification" is `bg-slate-100` here vs `bg-blue-50` in stage-utils). The reports page has its own local mapping.

---

### 34.4 Transcribe Page (`/frontend/app/transcribe/page.tsx`)

Global transcription hub — not tied to a specific deal, unlike `CallCaptureZone` on the deal detail page.

**State**: `deals: Deal[]`, `dealId: string` (selected deal from dropdown), `jobs: Job[]`, `loadingJobs: boolean`

**`Job` interface**:
```typescript
{
  id: string; platform: string; status: string; call_title: string | null
  duration_seconds: number | null; error_message: string | null
  created_at: string; completed_at: string | null
}
```

**Flow**:
1. On mount: fetch all deals → auto-select first deal
2. When `dealId` changes: `transcribeApi.list(dealId)` → populate `jobs`
3. `CallCaptureZone` component handles the actual upload within this page

**`STATUS_STYLE`** map: `pending` → gray, `downloading` → cyan, `processing` → violet, `done` → emerald, `error` → red

**`PLATFORM_LABEL`** map: zoom, meet, teams, slack, loom, upload → human-readable labels

**`fmtDur(s)`**: formats seconds → `{m}m {s}s`

---

### 34.5 NEXUS Hub Page (`/frontend/app/nexus/page.tsx`)

Entry point for the NEXUS simulation engine. Shows model status + training controls + navigation to sub-modules.

**`ModelStatus` interface** (from `GET /api/nexus/status`):
```typescript
{
  org_id: string; has_model: boolean; model_ready: boolean
  model_version: number | null; n_training_samples: number | null; cv_auc: number | null
  trained_at: string | null; min_samples_needed: number; current_sample_count: number
  can_train: boolean; training_in_progress: boolean
}
```

**State**: `status: ModelStatus | null`, `loading`, `extracting`, `training`

**Actions**:
- Extract All: `nexusApi.extractAll()` → re-fetch status
- Train (force): `nexusApi.train(true)` → re-fetch status
- Both use `force_retrain=true` in the train call from the UI

**`NEXUS_MODULES`** array defines 3 sub-modules with icons and routing:
- Win DNA → `/nexus/win-dna` (emerald, `Dna` icon)
- Scenario Simulator → `/nexus/simulate` (violet, `FlaskConical` icon)
- Execution Artifacts → `/nexus/artifacts` (amber, `FileOutput` icon)

---

### 34.6 Win DNA Page (`/frontend/app/nexus/win-dna/page.tsx`)

Shows SHAP-attributed win/loss factors with a GPT-4o narrative.

**`WinDNA` interface** (from `GET /api/nexus/win-dna`):
```typescript
{
  org_id: string; model_version: number; n_training_samples: number; cv_auc: number
  top_win_factors: Factor[]; top_loss_factors: Factor[]
  narrative: string; trained_at: string | null; ready: boolean
}
```

**`Factor` interface**:
```typescript
{ factor_name: string; display_name: string; direction: string; magnitude: number; plain_text: string }
```

**`FactorBar`** component: renders a labeled horizontal bar. Width = `(factor.magnitude / maxMag) * 100%`. Hover reveals `factor.plain_text` explanation. Win bars are `bg-emerald-500`, loss bars are `bg-red-500`.

**State**: `data: WinDNA | null`, `loading`, `error`

---

### 34.7 Scenario Simulator Page (`/frontend/app/nexus/simulate/page.tsx`)

Runs NEXUS scenarios on a selected live deal.

**`SimResult` interface** (from `POST /api/nexus/simulate`):
```typescript
{
  simulation_id: string; deal_id: string
  baseline_win_prob: number; baseline_expected_value: number
  recommended_action_type: string; recommended_action_params: Record<string, any>
  recommended_win_prob_new: number; recommended_ev_new: number
  recommended_net_rev_delta: number; recommended_reasoning: string
  top_scenarios: Scenario[]
  erp_validated: boolean; erp_flags: string[]
  model_version: number; run_duration_ms: number
}
```

**`Scenario` interface**:
```typescript
{
  scenario_id: string; action_type: string; action_params: Record<string, any>
  win_prob: number; margin_pct: number; expected_value: number
  net_revenue_delta: number; rank: number; plain_text: string
}
```

**State**: `deals: Deal[]`, `selectedDeal: string`, `loading`, `simulating`, `result: SimResult | null`

**Flow**: select deal from dropdown → "Run Simulation" → `nexusApi.simulate(selectedDeal)` → display results

**`fmt(n)`** local helper: `≥1M → $XM`, `≥1K → $XK`, else `$X`

**ERP flags**: if `result.erp_flags.length > 0`, displays warning cards listing each flag (e.g., margin floor violations).

---

### 34.8 Execution Artifacts Page (`/frontend/app/nexus/artifacts/page.tsx`)

Generate and view NEXUS execution artifacts for a deal.

**URL**: Accepts `?deal_id=...` via `useSearchParams()` — can be pre-selected from the simulate page.

**Artifact types** with icons and colors:
| Type | Icon | Label | Color |
|---|---|---|---|
| `proposal_pdf` | `FileText` | Proposal | indigo |
| `roi_calculator` | `Calculator` | ROI Calculator | emerald |
| `battle_card` | `Swords` | Battle Card | amber |
| `next_best_email` | `Mail` | Next Best Email | violet |

**State**: `deals: Deal[]`, `selectedDeal: string`, `artifacts: Artifact[]`, `loading`, `generating`, `selectedTypes: string[]`

**Flow**:
1. Select deal → load existing artifacts: `nexusApi.artifacts(selectedDeal)`
2. Toggle artifact types to generate (checkboxes for all 4 types)
3. "Generate Artifacts" → `nexusApi.generateArtifacts(simId, dealId, types)` — requires an existing simulation
4. Artifacts are displayed as collapsible `ArtifactCard` components

**`ArtifactCard`** component: collapsible card with `ChevronDown`/`ChevronUp` toggle. Shows `content_json` as key-value pairs when expanded.

**`Artifact` interface**:
```typescript
{ artifact_id: string; artifact_type: string; status: string; content_json: Record<string, any> | null; created_at: string | null }
```

---

## 35. COMPONENT CORRECTIONS & ADDITIONS

### 35.1 ScoreGauge Component (Correction)

**Previous documentation error**: Section 7.2 stated ScoreGauge is "inline in `/deals/[id]/page.tsx`". This is INCORRECT as of the current codebase.

**Correct**: ScoreGauge is a standalone component at `components/ScoreGauge.tsx`.

**Props** (CORRECTED):
```typescript
interface ScoreGaugeProps {
  probability: number  // 0 to 1 (NOT "prob")
  low: number
  high: number
}
```

**Implementation** (CORRECTED — dark-themed SVG arc, not semicircle):
- `viewBox="0 0 140 100"`, radius=54, center=(70,70)
- Arc from -210° to +30° (240° total sweep)
- Track color: `#21262d` (GitHub dark gray)
- Fill color: `#3fb950` (green) ≥70%, `#d29922` (amber) ≥40%, `#f85149` (red) otherwise
- Center text: `{pct}%` in the fill color, bold
- Sub-text: `"WIN PROBABILITY"` in `#8b949e`
- Below SVG: `"CI: {lowPct}% – {highPct}%"` in `text-xs text-gray-600`

This is a dark-themed component, styled for contrast against dark card backgrounds. It differs from the deals list page's inline gauge which uses a simpler semicircle design.

---

### 35.2 DealCard Component (`/frontend/components/DealCard.tsx`)

Standalone component for rendering a deal in the deals list. Has a **dark theme** (GitHub dark palette), unlike the rest of the app which uses the white enterprise theme.

**Props**:
```typescript
interface DealCardProps {
  id: string; name: string; company: string; stage: string
  value: number; win_probability: number | null
  risk_flags: string[]; time_to_close_days: number | null
}
```

**Dark theme colors** (note: these are different from the main app palette):
- Card background: `bg-[#161b22]` (GitHub dark)
- Card border: `border-[#30363d]`
- Hover: `hover:border-purple-500/50 hover:bg-[#1c2230]`
- Stage badges use dark `bg-blue-900/40`, `bg-purple-900/40`, etc.
- Win probability: green-400/yellow-400/red-400 (not emerald-600/amber-600/red-600)

**Design note**: `DealCard` uses a different color palette from the main app. This appears to be an older component that predates the white enterprise design system. The deals list page (`/deals/page.tsx`) uses this component but also renders its own `DealIcon` and `OwnerAvatar` inline components using the newer palette.

---

## 36. ACTIVITY SYSTEM: COMPLETE EVENT TYPE REFERENCE

### 36.1 All Known Event Types

| Event Type | Label | Icon | Category | Description |
|---|---|---|---|---|
| `deal_created` | Deal Created | Plus | Deals | New deal created |
| `deal_deleted` | Deal Deleted | Trash2 | Deals | Deal deleted |
| `deal_stage_changed` | Stage Changed | ArrowRightLeft | Pipeline | Stage transition |
| `deal_value_changed` | Value Changed | DollarSign | Deals | Value field edit |
| `deal_company_changed` | Company Changed | Building2 | Deals | Company field edit |
| `deal_owner_changed` | Owner Changed | User | Deals | Owner field edit |
| `deal_time_to_close_days_changed` | Est. Close Changed | Clock | Deals | Time-to-close edit |
| `deal_ask_ai` | Ask AI Query | MessageSquare | AI | Ask AI (ReAct agent) query — see note below |
| `deal_scored` | Deal Scored | Target | AI | Win probability scoring run |
| `brief_generated` | Brief Generated | BookOpen | AI | Executive brief generation |
| `followup_generated` | Follow-up Generated | Mail | AI | Follow-up email generation |
| `document_uploaded` | Document Uploaded | Upload | Documents | File upload + ingestion |
| `transcription_uploaded` | Transcription Started | Mic | Documents | Audio transcription job created |
| `transcription_from_url` | URL Transcription | Mic | Documents | URL-based transcription job created |
| `pulse_query` | Pulse Query | Zap | Operations | ERP query submitted |
| `pulse_approved` | Pulse Decision | CheckCircle | Operations | Pulse action approved/rejected |
| `report_generated` | Report Generated | FileText | Documents | Intelligence PDF report created |
| `report_deleted` | Report Deleted | Trash2 | Documents | Report deleted |
| `nexus_model_trained` | Model Trained | Brain | NEXUS | XGBoost model training completed |
| `nexus_simulation_run` | Simulation Run | FlaskConical | NEXUS | Scenario simulation completed |
| `nexus_artifacts_generated` | Artifacts Generated | FileOutput | NEXUS | Execution artifacts generated |

**Important note on `deal_ask_ai`**: The router `deal_ask_ai.py` previously logged this as `deal_ask_ai_v2` (which was an unrecognized event type, falling back to the "System" category with default styling). As of 2026-03-29 this was corrected to `deal_ask_ai` so it matches the `EVENT_META` entry in `/activity/page.tsx` and renders correctly with the blue `MessageSquare` icon and "AI" category badge.

### 36.2 `ChangeDetail` Component Rendering Rules

The `ChangeDetail` component in `activity/page.tsx` renders additional context below the event title:

- `deal_created`: `{company} · {stage} · ${value}`
- `deal_deleted`: `Last state: {stage} · ${value}`
- `deal_stage_changed`: `{old_stage} → {new_stage}` with optional reason
- `deal_ask_ai`: italic `"{query}"` from `new_value.query`
- `deal_scored`: `Win probability: {win_probability}%`
- `document_uploaded`: `{source_type} · {chunks_created} chunks`
- `nexus_model_trained`: `v{version} · {n_training_samples} samples · AUC {cv_auc}`
- `nexus_simulation_run`: `{simulation_type} · {n_scenarios} scenarios`
- Generic field change (old_value + new_value): `{oldV} → {newV}` per changed key
- `metadata.deal_name`: `Deal: {deal_name}` (fallback for entity context)

---

## 37. ONBOARDING / REGISTRATION FLOW

### Complete New User → First Deal Flow

```
User visits /
  → app/page.tsx → redirect('/login')
  → login/page.tsx renders

User clicks "Create account":
  → mode = 'signup'
  → inputs: email, password, orgName

Submit:
  1. supabase.auth.signUp({ email, password })
     → Supabase creates user (no org_id in JWT yet)
  2. POST /organisations/ { name, slug: "{baseSlug}-{random4}" }
     → creates org in PostgreSQL organisations table
     → returns { id, name, slug, plan, created_at }
  3. supabase.auth.updateUser({ data: { org_id: org.id, org_name: org.name } })
     → writes org_id into Supabase user_metadata
     → CRITICAL: this does NOT refresh the current JWT
  4. supabase.auth.signOut()
     → forces JWT invalidation
     → AuthGuard detects signOut → does NOT redirect (already on /login)
  5. await new Promise(r => setTimeout(r, 400))
     → waits for AuthGuard to process the auth state change
  6. setSuccess("Account created! Please log in.")
     → mode switches back to 'login'

User logs in:
  1. supabase.auth.signInWithPassword({ email, password })
     → Supabase issues new JWT with user_metadata.org_id embedded
  2. router.push('/deals')
  3. AuthGuard validates session → allows through
  4. All subsequent API calls include org_id from JWT
```

**Why signOut is required**: Supabase's `signUp()` returns a session, but `updateUser()` modifies metadata server-side. The current session's JWT is already issued and cached — it does NOT pick up the new metadata. Signing out forces re-authentication, which triggers a new JWT issuance with the updated metadata.

---

## 38. QUICK CORRECTIONS INDEX

Corrections to earlier sections discovered during session 2026-03-29:

| Section | What was wrong | Correct information |
|---|---|---|
| §7.2 ScoreGauge | "inline in /deals/[id]/page.tsx, props: {prob, low, high}" | Standalone `components/ScoreGauge.tsx`, props: `{probability, low, high}` |
| §7.2 ScoreGauge | "SVG semicircle, viewBox 0 0 200 110, radius 80, center (100,100)" | Arc gauge, viewBox "0 0 140 100", radius 54, center (70,70), dark theme |
| §6.12 Activity | `deal_ask_ai_v2` event type used by ask-ai router | Fixed to `deal_ask_ai` as of 2026-03-29 (router: `deal_ask_ai.py` line ~292) |
| §21.1 Deals | ScoreGauge described as inline in deals page | ScoreGauge is imported from `@/components/ScoreGauge` |

---

## 39. APRIL 2026 CHANGES — MULTI-CURRENCY, LIVE FX, SETTINGS HUB

### 39.1 Multi-Currency Consolidation

**Problem solved**: Aggregate views (Total Pipeline, Weighted Pipeline, Analytics totals, NEXUS simulation EVs) were summing raw `value` columns across mixed-currency deals, producing meaningless totals when an org had USD + EUR + INR deals.

**Solution**: A user-selectable "consolidation currency" (default USD). Individual deal values still display in their native currency. Aggregates convert each deal to the consolidation currency before summing.

**Implementation**:

| File | Role |
|---|---|
| `frontend/lib/exchangeRates.ts` | `RATES_FROM_USD` static fallback; `fetchLiveRates()` (Frankfurter API + 24h localStorage cache); `convertCurrency(amount, from, to, rates?)`; `isMultiCurrency()`; `getCachedRatesTimestamp()` |
| `frontend/lib/currencyContext.tsx` | `CurrencyProvider` — exposes `consolidationCurrency`, `setConsolidationCurrency`, `exchangeRates`, `ratesLastUpdated`, `ratesFetching`, `convert(a, f, t)` (useCallback bound to live rates), `refreshRates()` |
| `frontend/components/ClientProviders.tsx` | Thin `'use client'` wrapper hosting `CurrencyProvider` (required because `app/layout.tsx` is a server component that exports `metadata`) |

**Pages updated to use `convert()` from context** (instead of static `convertCurrency`):
- `app/deals/page.tsx` — `totalValue`, `weightedValue` aggregates with `≈` indicator when `multiCurrency`
- `app/analytics/page.tsx` — fetches `dealsApi.list({ limit: 200 })` in parallel with summary, builds a `dealMap` for currency cross-reference, computes `convertedTotal`, `convertedWeighted`, `stageValues`, `ownerValues`. Header shows "Values in {CURRENCY} ≈" badge when multi-currency
- `app/nexus/simulate/page.tsx` — uses each *selected deal's native currency* (not the consolidation currency), since simulation outputs represent a single deal's projections

**Pulse Sync exception**: ERP mock inventory is hardcoded in USD. No conversion is applied. The Settings page surfaces this as an amber warning.

**dealsApi.list signature change**: Now `(params?: { limit?: number; offset?: number })` — previously `()` only. Required by analytics fetching.

### 39.2 Live FX Rates (Frankfurter API)

**Source**: `https://api.frankfurter.app/latest?base=USD` — free, no API key, CORS-enabled, ECB data, updates daily on business days.

**Cache strategy**:
- localStorage key: `synvelo_exchange_rates_v1`
- Stored as `{ rates: Record<string, number>, fetchedAt: number }`
- TTL: 24 hours. Stale or missing → network fetch.
- Network failure → silent fallback to static `RATES_FROM_USD`.

**Fetch lifecycle** (in `CurrencyProvider`):
1. On mount: `getCachedRatesTimestamp()` initialises `ratesLastUpdated` immediately so UI doesn't flash "loading"
2. Calls `fetchLiveRates()` (which respects cache)
3. Updates `exchangeRates` state → triggers re-render of all pages using `convert()`
4. `refreshRates()` deletes the cache entry then re-fetches (forces network call)

**Note**: Frankfurter response omits USD (it's the base), so the fetcher prepends `{ USD: 1.0, ...data.rates }` before storing.

### 39.3 Settings Hub Redesign

The previous flat 8-card grid landing page was replaced with a multi-page settings shell. Pattern: Linear / GitHub / Stripe.

**Shell layout** (`app/settings/layout.tsx`):
- 240px left rail (sub-sidebar inside the global sidebar's content area), grouped as:
  - **Account**: Profile, Security & Privacy
  - **Workspace**: Workspace, AI Usage
  - **Preferences**: Currency, Notifications, Appearance
  - **Advanced**: Integrations
- Right content panel (max-w-3xl, mx-auto, px-10 py-10)
- Active state: `pathname === item.href || pathname.startsWith(item.href + '/')`

**Sub-page anatomy**:
- `<SettingsHeader title description />` — h1 (22px) + subtitle + bottom border
- One or more `<SettingsSection title? description? children />` — optional title above a bordered white card
- Cards inside use `divide-y divide-gray-100` for clean row separation

**Sub-page contents** (concrete data only — no placeholders that don't actually do anything):

| Route | What it shows | What it writes |
|---|---|---|
| `/settings/profile` | Editable display name, read-only email, user ID, org ID, account-created and last-sign-in timestamps | `supabase.auth.updateUser({ data: { full_name } })` |
| `/settings/security` | Session age (hours since last sign-in), auth provider, password reset email button, data/privacy notice, sign-out | `supabase.auth.resetPasswordForEmail()` and `signOut()` |
| `/settings/workspace` | Gradient avatar (first letter of org name), org name, slug, plan badge, org details rows, support `mailto:` link | Read-only (no PATCH endpoint exists for orgs) |
| `/settings/usage` | Hero: total AI calls this month. Per-feature horizontal bars. Rate-limit reference table | Read-only — calls `analyticsApi.usage()` |
| `/settings/currency` | 8-currency picker grid, live rates table, last-updated relative time, refresh button, Pulse-USD-only warning | Updates context state |
| `/settings/notifications` | Browser permission state with status badge, three toggles (at-risk / score-change / stage-transition) | localStorage via `useUserPrefs()` |
| `/settings/appearance` | Theme picker (Light selected; Dark + Auto disabled with "Coming soon"), density chips, UI element toggles | localStorage via `useUserPrefs()` |
| `/settings/integrations` | Three grouped sections (Core infra, AI & auth, External data) with status badges per service | Read-only — calls `/health` |

**Honesty notes (visible in UI)**:
- Theme dark/auto chips are disabled (clearly labeled "Coming soon")
- Density toggle persists but is not yet read by consuming components
- Notification toggles persist but the trigger logic is not yet wired
- Pulse Sync ERP card shows "Mock" status with roadmap note
- Workspace renaming/plan changes route to `mailto:support@synvelo.com`

### 39.4 Settings-Related Components & Hooks

| File | Purpose |
|---|---|
| `frontend/components/SettingsHeader.tsx` | Page-level title + description + bottom border. Replaces the previous icon-square header |
| `frontend/components/SettingsSection.tsx` | Reusable titled card section (`{title?, description?, children, className?}`) |
| `frontend/lib/userPrefs.ts` | `useUserPrefs()` hook — reads/writes `synvelo_user_prefs_v1` localStorage key with `UserPrefs` interface (notifications, density, showWelcomeBanner, autoSuggestQuestions) |

### 39.5 New API Helpers

Added to `frontend/lib/api.ts`:
```typescript
analyticsApi.usage(month?: string)   // GET /v1/analytics/usage  (Redis-backed AI call counts)
organisationsApi.get(orgId: string)  // GET /v1/organisations/{id}
```

Updated:
```typescript
dealsApi.list(params?: { limit?: number; offset?: number })  // was: ()
```

### 39.6 AuthGuard Timeout Fix

**Problem**: When Supabase Auth was slow/unreachable, `supabase.auth.getSession()` would internally retry multiple times, blocking the entire UI for 10–30 seconds with a blank loading spinner.

**Fix** (`frontend/components/AuthGuard.tsx`):
```typescript
const AUTH_TIMEOUT_MS = 4000

async function getSessionWithTimeout() {
  const timeout = new Promise<null>(resolve =>
    setTimeout(() => resolve(null), AUTH_TIMEOUT_MS),
  )
  const sessionPromise = supabase.auth.getSession()
    .then(({ data: { session } }) => session)
    .catch(() => null)
  return Promise.race([sessionPromise, timeout])
}
```

If Supabase is unreachable, the user is treated as unauthenticated after 4 seconds and redirected to `/login` rather than blocked indefinitely.

**Note**: The Supabase SDK still logs `TypeError: Failed to fetch` and `AuthRetryableFetchError` to the console from its own internal background tasks (`_initialize`, `_recoverAndRefresh`, `_emitInitialSession`) when the project is unreachable. These are harmless and outside our control. The most common root cause is a paused free-tier Supabase project — check the dashboard.

### 39.7 docker-compose Cleanup

Two cosmetic fixes:
- Removed obsolete `version: '3.8'` (Compose v2 ignores it and warns)
- Healthcheck updated to `pg_isready -U synvelo -d synvelo_db` (was missing `-d`, which caused spurious `FATAL: database "synvelo" does not exist` log lines because `pg_isready` defaulted to a database matching the username)

### 39.8 Sidebar — Settings Link

`frontend/components/Sidebar.tsx`: A Settings link is rendered in the bottom-left section of the sidebar, immediately above Sign Out. Active state matches `pathname.startsWith('/settings')`.

### 39.9 Sidebar Collapse / Expand (April 30)

The global sidebar (`frontend/components/Sidebar.tsx`) is now collapsible. Pattern: Linear / VSCode primary side bar.

**Widths** (animated via `transition-[width] duration-300 ease-in-out`):
- Expanded: `240px` (constant `SIDEBAR_W_OPEN`)
- Collapsed: `72px` (constant `SIDEBAR_W_CLOSED`)

**State**:
- React `useState` named `collapsed` — persisted to `localStorage('synvelo_sidebar_collapsed')` as `'1'` or `'0'`
- An `hydrated` flag plus `invisible` class on first render prevents flash-of-wrong-state before localStorage is read

**Toggle controls (two entry points)**:
- **Chevron button** — only visible when expanded. White `ChevronLeft` icon (`w-4 h-4`) inside a 28×28 `text-white/70 hover:bg-white/10` button at the right of the header. Fades out with `opacity-0 scale-90 w-0 pointer-events-none` when collapsed.
- **Logo button** — when collapsed, the entire logo container is wrapped in a `<button>` that toggles. Hover gives `opacity-80`, active gives `scale-95`. When expanded the button is `disabled` with `cursor-default` so the brand mark is static.

**Logo policy**:
- Logo image (`/SynveloLogo_v1.png`) stays at **50×50 in both states** — never resized
- "Synvelo" wordmark fades via `max-w-[140px] → max-w-0` + `opacity-100 → opacity-0` + `ml-1 → ml-0` (300ms)

**Nav item layout (NavLink)**:
- `w-full h-10 flex items-center rounded-lg`
- Expanded: `gap-2.5 px-3` — icon then label
- Collapsed: `justify-center px-0` — icon centered in the column. Label gets `max-w-0 opacity-0` (animated 200ms) so it never affects layout
- `title={label}` attribute when collapsed for native browser tooltips
- Group labels (`INTELLIGENCE`, `SIMULATION`, etc.) collapse via `h-0 mb-0 opacity-0`

**Active state indicator**:
- A 3px wide × 20px tall `bg-indigo-400 rounded-r-full` strip anchored at the sidebar's left edge (positioned `absolute -left-2` to escape the parent column's `px-2`)
- Plus a subtle `bg-white/[0.10]` pill on the link itself
- Both visible in both states

**Sign-out button** mirrors the same expanded/collapsed layout pattern as `NavLink`.

**Layout impact**: The main content area (`<main>` in `app/layout.tsx`) is `flex-1` so it automatically reflows when the sidebar width changes. No content-side changes were needed.

