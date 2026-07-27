import logging
import sys
import uuid
from pathlib import Path

from celery import Celery

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.company import Company
from app.services.ingestion.orchestrator import run_ingestion
from app.services.nlp.processing import process_unprocessed_documents
from app.services.scoring.ml_scorer import score_and_persist

settings = get_settings()
logger = logging.getLogger(__name__)

# infra/celerybeat_schedule.py lives outside the app package (per
# 04_PROJECT_SETUP_AND_REPO_STRUCTURE.md §1) so ops can tune cron cadence
# without touching application code.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "infra"))
from celerybeat_schedule import BEAT_SCHEDULE  # noqa: E402

celery_app = Celery("leadintel", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule=BEAT_SCHEDULE,
)


@celery_app.task(name="leadintel.enrich_company")
def enrich_company_task(company_id: str) -> dict:
    """Full enrichment chain for one company: scrape -> NLP -> score.

    Mirrors the pipeline in 01_TECHNICAL_ARCHITECTURE.md §1 — triggered either
    on a schedule (Celery Beat) or on-demand via POST /api/companies/{id}/enrich.
    """
    db = SessionLocal()
    try:
        company = db.get(Company, uuid.UUID(company_id))
        if company is None:
            logger.warning("enrich_company_task: company %s not found", company_id)
            return {"company_id": company_id, "status": "not_found"}

        documents = run_ingestion(db, company)
        features = process_unprocessed_documents(db, documents)
        lead_score = score_and_persist(db, company)

        return {
            "company_id": company_id,
            "status": "enriched",
            "documents_scraped": len(documents),
            "nlp_features_written": len(features),
            "conversion_probability": float(lead_score.conversion_probability),
        }
    finally:
        db.close()


@celery_app.task(name="leadintel.score_all_companies")
def score_all_companies_task(mode: str = "incremental") -> dict:
    """Batch (re)scoring across all companies — backs POST /api/scoring/run."""
    db = SessionLocal()
    try:
        query = db.query(Company)
        if mode == "incremental":
            query = query.filter(Company.enrichment_status == "enriched")

        companies = query.all()
        scored = 0
        for company in companies:
            score_and_persist(db, company)
            scored += 1

        return {"mode": mode, "companies_scored": scored}
    finally:
        db.close()
