import logging
import subprocess
import sys
import uuid
from pathlib import Path

from celery import Celery

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.feedback import Feedback
from app.models.enums import EnrichmentStatus
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
        if company.enrichment_status != EnrichmentStatus.ENRICHED.value:
            return {
                "company_id": company_id,
                "status": "failed",
                "documents_scraped": len(documents),
            }

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


@celery_app.task(name="leadintel.enrich_pending_companies")
def enrich_pending_companies_task() -> dict:
    """Run the full scrape -> NLP -> score chain for pending companies."""
    db = SessionLocal()
    try:
        company_ids = [
            str(company.id)
            for company in db.query(Company.id)
            .filter(Company.enrichment_status == EnrichmentStatus.PENDING.value)
            .all()
        ]
    finally:
        db.close()

    results = [enrich_company_task.run(company_id) for company_id in company_ids]
    return {
        "companies_seen": len(results),
        "companies_enriched": sum(result["status"] == "enriched" for result in results),
        "companies_failed": sum(result["status"] == "failed" for result in results),
    }


@celery_app.task(name="leadintel.score_all_companies")
def score_all_companies_task(mode: str = "incremental") -> dict:
    """Batch (re)scoring across all companies — backs POST /api/scoring/run."""
    db = SessionLocal()
    try:
        query = db.query(Company)
        if mode == "incremental":
            query = query.filter(
                Company.enrichment_status == EnrichmentStatus.ENRICHED.value,
                ~Company.lead_scores.any(),
            )

        companies = query.all()
        scored = 0
        for company in companies:
            score_and_persist(db, company)
            scored += 1

        return {"mode": mode, "companies_scored": scored}
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Feedback-loop task — §3.7 step 6 "Lead scoring model" improvement cycle.
# Checks recent user feedback accuracy; if it falls below the configured
# threshold, triggers the V2 training script automatically so the model
# learns from BD team corrections without manual intervention.
# ---------------------------------------------------------------------------

_FEEDBACK_WINDOW_DAYS = 30
_ACCURACY_THRESHOLD = 0.70   # retrain when <70 % of recent feedback is positive
_MIN_FEEDBACK_SAMPLES = 10   # need at least this many before acting


@celery_app.task(name="leadintel.check_feedback_and_retrain")
def check_feedback_and_retrain_task() -> dict:
    """Evaluate recent feedback accuracy and trigger V2 retraining if needed.

    Called nightly by Celery Beat. Reads Feedback rows from the last
    FEEDBACK_WINDOW_DAYS days, computes positive-accuracy rate, and runs
    ml/training/train_scoring_model.py when accuracy drops below threshold.
    """
    from datetime import UTC, datetime, timedelta

    db = SessionLocal()
    try:
        cutoff = datetime.now(UTC) - timedelta(days=_FEEDBACK_WINDOW_DAYS)
        recent = db.query(Feedback).filter(Feedback.created_at >= cutoff).all()

        total = len(recent)
        if total < _MIN_FEEDBACK_SAMPLES:
            logger.info(
                "check_feedback_and_retrain: only %d feedback entries in last %d days — skipping",
                total,
                _FEEDBACK_WINDOW_DAYS,
            )
            return {"status": "skipped", "reason": "insufficient_feedback", "total": total}

        accurate = sum(1 for f in recent if f.is_accurate)
        accuracy_rate = accurate / total

        logger.info(
            "check_feedback_and_retrain: accuracy %.2f (%d/%d) — threshold %.2f",
            accuracy_rate,
            accurate,
            total,
            _ACCURACY_THRESHOLD,
        )

        if accuracy_rate >= _ACCURACY_THRESHOLD:
            return {
                "status": "ok",
                "accuracy_rate": round(accuracy_rate, 4),
                "total": total,
                "retrain_triggered": False,
            }

        # Accuracy below threshold — kick off V2 training
        logger.warning(
            "check_feedback_and_retrain: accuracy %.2f below threshold %.2f — triggering retraining",
            accuracy_rate,
            _ACCURACY_THRESHOLD,
        )
        training_script = Path(__file__).resolve().parents[2] / "ml" / "training" / "train_scoring_model.py"
        result = subprocess.run(
            [sys.executable, str(training_script)],
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode == 0:
            logger.info("check_feedback_and_retrain: retraining succeeded\n%s", result.stdout)
            return {
                "status": "retrained",
                "accuracy_rate": round(accuracy_rate, 4),
                "total": total,
                "retrain_triggered": True,
                "train_output": result.stdout.strip(),
            }
        else:
            logger.error("check_feedback_and_retrain: retraining failed\n%s", result.stderr)
            return {
                "status": "retrain_failed",
                "accuracy_rate": round(accuracy_rate, 4),
                "total": total,
                "retrain_triggered": True,
                "error": result.stderr.strip(),
            }
    finally:
        db.close()
