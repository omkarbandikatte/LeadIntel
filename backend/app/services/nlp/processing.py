import logging

from sqlalchemy.orm import Session

from app.models.nlp_feature import NLPFeature
from app.models.raw_document import RawDocument
from app.services.nlp.entity_extraction import extract_entities
from app.services.nlp.need_classifier import classify_need

logger = logging.getLogger(__name__)

_MIN_TEXT_LENGTH = 30


def process_document(db: Session, document: RawDocument) -> NLPFeature | None:
    """Run the NLP pipeline over one raw document and persist the result.

    Per 01_TECHNICAL_ARCHITECTURE.md §2.2: output is written to the feature
    store (nlp_features table) as structured columns — predicted category,
    confidence, and extracted entities.
    """
    if not document.raw_text or len(document.raw_text) < _MIN_TEXT_LENGTH:
        return None

    try:
        entities = extract_entities(document.raw_text)
        category, confidence = classify_need(document.raw_text)
    except Exception:
        logger.exception("NLP processing failed for document %s", document.id)
        return None

    feature = NLPFeature(
        company_id=document.company_id,
        raw_document_id=document.id,
        predicted_need_category=category.value,
        confidence=confidence,
        extracted_entities=entities,
    )
    db.add(feature)
    db.commit()
    db.refresh(feature)
    return feature


def process_unprocessed_documents(db: Session, documents: list[RawDocument]) -> list[NLPFeature]:
    features: list[NLPFeature] = []
    for document in documents:
        feature = process_document(db, document)
        if feature is not None:
            features.append(feature)
    return features
