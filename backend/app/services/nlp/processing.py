import logging

from sqlalchemy.orm import Session

from app.models.nlp_feature import NLPFeature
from app.models.raw_document import RawDocument
from app.models.signal import Signal
from app.services import tenancy
from app.services.nlp.entity_extraction import extract_entities
from app.services.nlp.need_classifier import classify_need
from app.services.nlp.signal_detection import detect_signals

logger = logging.getLogger(__name__)

_MIN_TEXT_LENGTH = 30


def _persist_signals(db: Session, document: RawDocument) -> list[Signal]:
    """Detect and persist structured Business Signal Engine rows for one document.

    `detected_at` is pinned to the document's `scraped_at` (not "now") so the
    time-decay recency weighting in the scoring engine reflects when the
    underlying event was actually observed, not when NLP happened to run.
    """
    detections = detect_signals(document.raw_text or "")
    signals: list[Signal] = []
    for detection in detections:
        signal = Signal(
            company_id=document.company_id,
            raw_document_id=document.id,
            signal_type=detection["signal_type"],
            direction=detection["direction"],
            confidence=detection["confidence"],
            headline=detection["headline"],
            detected_at=document.scraped_at,
        )
        db.add(signal)
        signals.append(signal)
    if signals:
        db.commit()
    return signals


def process_document(db: Session, document: RawDocument) -> NLPFeature | None:
    """Run the NLP pipeline over one raw document and persist the result.

    Per 01_TECHNICAL_ARCHITECTURE.md §2.2: output is written to the feature
    store (nlp_features table) as structured columns — predicted category,
    confidence, and extracted entities. Also runs the Business Signal Engine
    (signal_detection.py) over the same text to surface typed, directional
    signals independently of the 4-way service-need classification above.
    """
    if not document.raw_text or len(document.raw_text) < _MIN_TEXT_LENGTH:
        return None

    try:
        entities = extract_entities(document.raw_text)
        candidate_offerings = tenancy.get_service_offerings(document.company)
        category, confidence = classify_need(document.raw_text, candidate_offerings)
    except Exception:
        logger.exception("NLP processing failed for document %s", document.id)
        return None

    feature = NLPFeature(
        company_id=document.company_id,
        raw_document_id=document.id,
        predicted_need_category=category,
        confidence=confidence,
        extracted_entities=entities,
    )
    db.add(feature)
    db.commit()
    db.refresh(feature)

    try:
        _persist_signals(db, document)
    except Exception:
        logger.exception("Signal detection failed for document %s", document.id)

    return feature


def process_unprocessed_documents(db: Session, documents: list[RawDocument]) -> list[NLPFeature]:
    features: list[NLPFeature] = []
    for document in documents:
        feature = process_document(db, document)
        if feature is not None:
            features.append(feature)
    return features
