import re
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from app.core.config import get_settings

if TYPE_CHECKING:
    import spacy

settings = get_settings()

_GROWTH_KEYWORDS = (
    "expand",
    "expansion",
    "growth",
    "scale",
    "scaling",
    "funding",
    "series",
    "raise",
    "acquisition",
    "partnership",
    "launch",
    "new office",
)


@lru_cache(maxsize=1)
def _get_nlp() -> "spacy.language.Language":
    # Imported lazily, like need_classifier.py's transformers import — spaCy
    # is a heavy dep (requirements-heavy.txt) that shouldn't be required just
    # to import this module or boot the app.
    import spacy

    return spacy.load(settings.SPACY_MODEL)


def extract_entities(text: str) -> dict[str, Any]:
    """Entity/keyword extraction per 01_TECHNICAL_ARCHITECTURE.md §2.2.

    Runs fully locally via spaCy — pulls named entities, role/department
    noun phrases, and growth-related language out of scraped text.
    """
    nlp = _get_nlp()
    doc = nlp(text[:20_000])

    entities = [{"text": ent.text, "label": ent.label_} for ent in doc.ents]

    noun_phrases = sorted(
        {chunk.text.strip() for chunk in doc.noun_chunks if 2 <= len(chunk.text.strip()) <= 80}
    )

    lowered = text.lower()
    growth_signals = sorted({kw for kw in _GROWTH_KEYWORDS if kw in lowered})

    return {
        "entities": entities[:50],
        "noun_phrases": noun_phrases[:50],
        "growth_signals": growth_signals,
    }


def word_count(text: str) -> int:
    return len(re.findall(r"\w+", text))
