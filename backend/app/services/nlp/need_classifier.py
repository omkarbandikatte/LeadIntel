from functools import lru_cache

from app.core.config import get_settings
from app.models.enums import ServiceLine

settings = get_settings()

# Natural-language phrasing per category, fed to the zero-shot model as
# candidate labels — mapped back to the ServiceLine enum values that
# 02_DATABASE_SCHEMA.sql's nlp_features.predicted_need_category expects.
_CANDIDATE_LABELS: dict[ServiceLine, str] = {
    ServiceLine.BRANDING: "branding, marketing, or public image",
    ServiceLine.HIRING: "hiring, recruitment, or workforce expansion",
    ServiceLine.LEARNING_DEVELOPMENT: "employee learning, training, or upskilling",
    ServiceLine.IAC_PARTNERSHIP: "IT infrastructure, cloud, or technology partnership",
}


@lru_cache(maxsize=1)
def _get_classifier():
    # Imported lazily: transformers + torch are heavy, and importing them
    # eagerly would slow down every process that touches this module (API
    # boot, tests that don't exercise NLP, etc.).
    from transformers import pipeline

    # device="cpu" is required, not just a default: this runs inside a Celery
    # prefork worker, and GPU contexts (CUDA, Apple MPS) are unsafe across
    # fork() — letting transformers auto-select an accelerator here crashes
    # the forked child outright (observed: MPS SIGABRT reaching the Metal
    # compiler service) instead of raising a catchable Python exception. Per
    # 05_FREE_STACK_DECISIONS.md, CPU is the expected deployment target anyway.
    return pipeline("zero-shot-classification", model=settings.NEED_CLASSIFIER_HF_MODEL, device="cpu")


def classify_need(text: str) -> tuple[ServiceLine, float]:
    """Classify scraped text into one of the four service-line need categories.

    Per 01_TECHNICAL_ARCHITECTURE.md §2.2 / 05_FREE_STACK_DECISIONS.md §3: a
    locally-run, open-weight Hugging Face model — zero-shot classification
    avoids the need for a labeled fine-tuning set before this is useful, and
    nothing here calls a paid LLM API.
    """
    classifier = _get_classifier()
    candidate_labels = list(_CANDIDATE_LABELS.values())
    result = classifier(text[:2000], candidate_labels=candidate_labels)

    top_label = result["labels"][0]
    top_score = float(result["scores"][0])

    category = next(line for line, label in _CANDIDATE_LABELS.items() if label == top_label)
    return category, top_score
