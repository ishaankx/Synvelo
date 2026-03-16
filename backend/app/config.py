from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str
    database_url: str
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "change-me"
    UPLOAD_DIR: str = "uploads"
    max_file_size_mb: int = 50

    # Supabase
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""

    class Config:
        env_file = ".env"

settings = Settings()