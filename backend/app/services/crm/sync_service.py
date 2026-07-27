import csv
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.company import Company
from app.models.crm_deal import CRMDeal
from app.models.crm_sync_log import CRMSyncLog
from app.models.enums import SyncStatus
from app.models.lead_score import LeadScore

settings = get_settings()
logger = logging.getLogger(__name__)

EXPORT_FIELDNAMES = [
    "company_id",
    "company_name",
    "conversion_probability",
    "recommended_service",
    "recommendation_confidence",
    "industry",
    "location",
    "last_scored_at",
]

# Expected columns for a pull-import CSV, matching crm_deals.
IMPORT_FIELDNAMES = [
    "company_id",
    "deal_stage",
    "service_line",
    "deal_value",
    "outcome",
    "closed_at",
]


def _latest_scores(db: Session) -> list[tuple[Company, LeadScore]]:
    rows = (
        db.query(Company, LeadScore)
        .join(LeadScore, LeadScore.company_id == Company.id)
        .order_by(LeadScore.company_id, LeadScore.scored_at.desc())
        .all()
    )
    seen: set[uuid.UUID] = set()
    latest: list[tuple[Company, LeadScore]] = []
    for company, score in rows:
        if company.id in seen:
            continue
        seen.add(company.id)
        latest.append((company, score))
    return latest


def push_to_csv(db: Session) -> CRMSyncLog:
    """Export newly scored leads to CSV.

    This is the CSV/spreadsheet sync path from 05_FREE_STACK_DECISIONS.md §6,
    used when the target CRM has no self-hosted DB to sync against directly.
    """
    export_dir = settings.resolve_path(settings.CRM_SYNC_EXPORT_DIR)
    export_dir.mkdir(parents=True, exist_ok=True)
    filename = export_dir / f"leads_export_{datetime.now(UTC):%Y%m%dT%H%M%S}.csv"

    record_count = 0
    sync_status = SyncStatus.SUCCESS.value
    error_detail: str | None = None

    try:
        with filename.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=EXPORT_FIELDNAMES)
            writer.writeheader()
            for company, score in _latest_scores(db):
                writer.writerow(
                    {
                        "company_id": str(company.id),
                        "company_name": company.name,
                        "conversion_probability": float(score.conversion_probability),
                        "recommended_service": score.recommended_service or "",
                        "recommendation_confidence": (
                            float(score.recommendation_confidence)
                            if score.recommendation_confidence is not None
                            else ""
                        ),
                        "industry": company.industry or "",
                        "location": company.location_city or company.location_country or "",
                        "last_scored_at": score.scored_at.isoformat(),
                    }
                )
                record_count += 1
    except OSError as exc:
        sync_status = SyncStatus.FAILED.value
        error_detail = str(exc)
        record_count = 0

    log_entry = CRMSyncLog(
        direction="push", record_count=record_count, status=sync_status, error_detail=error_detail
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry


def pull_from_csv(db: Session) -> CRMSyncLog:
    """Ingest updated deal outcomes back from CSV files dropped in CRM_SYNC_IMPORT_DIR.

    Feeds the retraining loop (crm_deals -> ml/training/train_scoring_model.py),
    per 01_TECHNICAL_ARCHITECTURE.md §2.7.
    """
    import_dir = settings.resolve_path(settings.CRM_SYNC_IMPORT_DIR)
    import_dir.mkdir(parents=True, exist_ok=True)

    record_count = 0
    row_errors: list[str] = []

    try:
        for csv_file in sorted(import_dir.glob("*.csv")):
            with csv_file.open(newline="", encoding="utf-8-sig") as fh:
                reader = csv.DictReader(fh)
                for row_number, row in enumerate(reader, start=2):
                    company_id_raw = (row.get("company_id") or "").strip()
                    if not company_id_raw:
                        row_errors.append(f"{csv_file.name}:{row_number} missing company_id")
                        continue
                    try:
                        company_id = uuid.UUID(company_id_raw)
                    except ValueError:
                        row_errors.append(f"{csv_file.name}:{row_number} invalid company_id")
                        continue

                    closed_at = None
                    if row.get("closed_at"):
                        try:
                            closed_at = datetime.fromisoformat(row["closed_at"])
                        except ValueError:
                            row_errors.append(f"{csv_file.name}:{row_number} invalid closed_at")

                    deal = CRMDeal(
                        company_id=company_id,
                        deal_stage=(row.get("deal_stage") or "").strip() or None,
                        service_line=(row.get("service_line") or "").strip() or None,
                        deal_value=float(row["deal_value"]) if row.get("deal_value") else None,
                        outcome=(row.get("outcome") or "").strip() or None,
                        closed_at=closed_at,
                    )
                    db.add(deal)
                    record_count += 1

            csv_file.rename(csv_file.with_suffix(".csv.processed"))
        db.commit()
    except Exception as exc:
        db.rollback()
        log_entry = CRMSyncLog(
            direction="pull", record_count=0, status=SyncStatus.FAILED.value, error_detail=str(exc)
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry

    sync_status = SyncStatus.PARTIAL.value if row_errors else SyncStatus.SUCCESS.value
    error_detail = "; ".join(row_errors[:20]) if row_errors else None

    log_entry = CRMSyncLog(
        direction="pull", record_count=record_count, status=sync_status, error_detail=error_detail
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
