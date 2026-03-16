import logging
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str
    database_url: str
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "change-me-in-production"
    UPLOAD_DIR: str = "uploads"
    max_file_size_mb: int = 50

    # Supabase
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""

    # CORS — comma-separated origins, e.g. "http://localhost:3000,https://app.synvelo.com"
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    # Environment: "development", "staging", "production"
    environment: str = "development"

    # DB pool
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle: int = 1800

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()

# ── Startup safety checks ────────────────────────────────────────────────────
_log = logging.getLogger("synvelo.config")
if settings.secret_key == "change-me-in-production" and settings.is_production:
    raise RuntimeError("SECRET_KEY must be set in production — refusing to start with the default value")
if not settings.supabase_url and settings.is_production:
    _log.warning("SUPABASE_URL is empty — authentication will not work")
