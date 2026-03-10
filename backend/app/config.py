from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str
    database_url: str
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "change-me"
    UPLOAD_DIR: str = "uploads" 
    max_file_size_mb: int = 50

    class Config:
        env_file = ".env"

settings = Settings()