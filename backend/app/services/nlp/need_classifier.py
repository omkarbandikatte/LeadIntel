from functools import lru_cache

from app.core.config import get_settings

settings = get_settings()


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


def classify_need(text: str, candidate_offerings: list[tuple[str, str]]) -> tuple[str, float]:
    """Classify scraped text into one of an organization's own service-offering
    categories.

    Per 01_TECHNICAL_ARCHITECTURE.md §2.2 / 05_FREE_STACK_DECISIONS.md §3: a
    locally-run, open-weight Hugging Face model — zero-shot classification
    avoids the need for a labeled fine-tuning set before this is useful, and
    nothing here calls a paid LLM API.

    candidate_offerings is (key, description) pairs from the calling
    company's organization's service_offerings (see app.services.tenancy) —
    this is what makes classification tenant-agnostic instead of hardcoded to
    Cloud Counselage's 4 service lines: any organization's own catalog is fed
    in as the zero-shot candidate labels.
    """
    classifier = _get_classifier()
    label_to_key = {description: key for key, description in candidate_offerings}
    result = classifier(text[:2000], candidate_labels=list(label_to_key.keys()))

    top_label = result["labels"][0]
    top_score = float(result["scores"][0])

    return label_to_key[top_label], top_score
