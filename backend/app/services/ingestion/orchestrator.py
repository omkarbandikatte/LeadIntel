import logging

from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.enums import EnrichmentStatus
from app.models.raw_document import RawDocument
from app.services.ingestion.firmographic_scraper import scrape_company_about
from app.services.ingestion.job_posting_scraper import scrape_job_postings
from app.services.ingestion.news_scraper import scrape_news_mentions

logger = logging.getLogger(__name__)


def run_ingestion(db: Session, company: Company) -> list[RawDocument]:
    """Run all ingestion scrapers for a single company and mark enrichment status.

    Mirrors the ingestion fan-out in 01_TECHNICAL_ARCHITECTURE.md §1: firmographic,
    job-posting, and news scrapers all write into the same raw_documents store.
    """
    documents: list[RawDocument] = []
    try:
        documents.extend(scrape_company_about(db, company))
        documents.extend(scrape_job_postings(db, company))
        documents.extend(scrape_news_mentions(db, company))
        company.enrichment_status = EnrichmentStatus.ENRICHED.value
    except Exception:
        logger.exception("Ingestion failed for company %s", company.id)
        company.enrichment_status = EnrichmentStatus.FAILED.value
    finally:
        db.add(company)
        db.commit()

    return documents
