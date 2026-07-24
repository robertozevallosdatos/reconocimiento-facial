import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    TELEGRAM_API_ID: int
    TELEGRAM_API_HASH: str
    TARGET_BOT_USERNAME: str
    SESSION_NAME: str = "user_session"
    MAX_FILE_SIZE_MB: int = 10
    TIMEOUT_SECONDS: int = 120

    class Config:
        env_file = ".env"

settings = Settings()