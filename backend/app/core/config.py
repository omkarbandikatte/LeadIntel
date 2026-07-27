from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> app/core -> app -> backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "postgresql://leadintel:leadintel@localhost:5432/leadintel"

    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET_KEY: str = "replace-with-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440

    SCRAPER_USER_AGENT: str = "LeadIntelBot/1.0 (+contact: your-email@cloudcounselage.com)"
    SCRAPER_REQUEST_DELAY_SECONDS: float = 2.0

    SPACY_MODEL: str = "en_core_web_sm"
    NEED_CLASSIFIER_HF_MODEL: str = "typeform/distilbert-base-uncased-mnli"

    SCORING_MODEL_ARTIFACT_PATH: str = "./ml/artifacts/scoring_model.joblib"

    CRM_SYNC_EXPORT_DIR: str = "./data/crm_sync/export"
    CRM_SYNC_IMPORT_DIR: str = "./data/crm_sync/import"

    def resolve_path(self, value: str) -> Path:
        """Resolve a config path against the repo root when it's relative.

        Config values like `./ml/artifacts/...` are written relative to the
        repo root, but the process cwd varies (backend/ in local dev, /app in
        Docker) — this keeps them pointing at the same place either way.
        """
        path = Path(value)
        return path if path.is_absolute() else REPO_ROOT / path


@lru_cache
def get_settings() -> Settings:
    return Settings()
