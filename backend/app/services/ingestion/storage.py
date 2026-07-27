import hashlib
import uuid

from sqlalchemy.orm import Session

from app.models.raw_document import RawDocument


def compute_content_hash(raw_text: str) -> str:
    return hashlib.sha256(raw_text.strip().encode("utf-8")).hexdigest()


def save_raw_document(
    db: Session,
    *,
    company_id: uuid.UUID,
    doc_type: str,
    source_url: str | None,
    raw_text: str,
) -> RawDocument | None:
    """Persist a scraped document, deduping on content hash.

    Returns None if a document with identical content already exists (idempotent
    re-scrape, per 01_TECHNICAL_ARCHITECTURE.md §5) rather than raising, so
    scraper loops can simply skip the result and move on.
    """
    content_hash = compute_content_hash(raw_text)

    existing = db.query(RawDocument).filter(RawDocument.content_hash == content_hash).first()
    if existing is not None:
        return None

    document = RawDocument(
        company_id=company_id,
        doc_type=doc_type,
        source_url=source_url,
        raw_text=raw_text,
        content_hash=content_hash,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document
