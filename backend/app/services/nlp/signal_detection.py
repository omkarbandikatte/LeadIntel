"""Structured business-signal detection — Business Signal Engine.

Classifies scraped text into typed, directional signals instead of the
free-form keyword list in entity_extraction.py's growth_signals: each hit is
a (signal_type, direction, confidence) tuple persisted as its own `signals`
row, so the API/frontend can render a timeline and the scoring engine can
decay-weight it by recency.

Deliberately keyword-based rather than a trained classifier: per
05_FREE_STACK_DECISIONS.md §3 this project avoids paid LLM APIs, and a
fine-tuned 7-way classifier would need a labeled dataset that doesn't exist
yet. This mirrors the same "transparent now, upgradeable later" tradeoff
already used by the V1 rules engine and entity_extraction.py.
"""

from app.models.enums import SignalDirection, SignalType

_SIGNAL_KEYWORDS: dict[SignalType, tuple[str, ...]] = {
    SignalType.HIRING: (
        "we're hiring",
        "now hiring",
        "open roles",
        "open positions",
        "join our team",
        "actively hiring",
    ),
    SignalType.EXPANSION: (
        "expansion",
        "expanding",
        "new office",
        "new location",
        "scaling up",
        "opening a new",
        "entering the",
    ),
    SignalType.FUNDING: (
        "series a",
        "series b",
        "series c",
        "raises $",
        "raised $",
        "funding round",
        "investment round",
        "venture capital",
        "seed round",
    ),
    SignalType.TECHNOLOGY_ADOPTION: (
        "migrated to",
        "migrating to",
        "adopts",
        "adoption of",
        "rolling out",
        "new platform",
        "cloud migration",
        "digital transformation",
    ),
    SignalType.LEADERSHIP_CHANGE: (
        "appoints",
        "appointed",
        "new ceo",
        "new cto",
        "new cfo",
        "new coo",
        "steps down",
        "joins as",
        "named as",
        "promoted to",
    ),
    SignalType.LAYOFFS: (
        "layoff",
        "layoffs",
        "lays off",
        "job cuts",
        "workforce reduction",
        "restructuring its workforce",
    ),
    SignalType.HIRING_FREEZE: (
        "hiring freeze",
        "freeze on hiring",
        "paused hiring",
        "pausing hiring",
    ),
}

_DIRECTION_BY_TYPE: dict[SignalType, SignalDirection] = {
    SignalType.HIRING: SignalDirection.POSITIVE,
    SignalType.EXPANSION: SignalDirection.POSITIVE,
    SignalType.FUNDING: SignalDirection.POSITIVE,
    SignalType.TECHNOLOGY_ADOPTION: SignalDirection.POSITIVE,
    SignalType.LEADERSHIP_CHANGE: SignalDirection.POSITIVE,
    SignalType.LAYOFFS: SignalDirection.NEGATIVE,
    SignalType.HIRING_FREEZE: SignalDirection.NEGATIVE,
}

_BASE_CONFIDENCE = 0.55
_CONFIDENCE_PER_EXTRA_MATCH = 0.10
_MAX_CONFIDENCE = 0.95
_HEADLINE_CONTEXT_CHARS = (40, 60)  # (before, after) the matched keyword


def detect_signals(text: str) -> list[dict]:
    """Return every structured signal detected in one piece of scraped text.

    A single document can surface more than one signal type (e.g. a press
    release mentioning both funding and hiring) — each gets its own row.
    Confidence scales with the number of distinct matching keywords for that
    type, capped at `_MAX_CONFIDENCE` since this is keyword matching, not a
    calibrated model.
    """
    if not text:
        return []

    lowered = text.lower()
    results: list[dict] = []

    for signal_type, keywords in _SIGNAL_KEYWORDS.items():
        matches = [kw for kw in keywords if kw in lowered]
        if not matches:
            continue

        confidence = min(
            _BASE_CONFIDENCE + (len(matches) - 1) * _CONFIDENCE_PER_EXTRA_MATCH, _MAX_CONFIDENCE
        )

        before, after = _HEADLINE_CONTEXT_CHARS
        idx = lowered.find(matches[0])
        start = max(0, idx - before)
        end = min(len(text), idx + len(matches[0]) + after)
        headline = text[start:end].strip()

        results.append(
            {
                "signal_type": signal_type.value,
                "direction": _DIRECTION_BY_TYPE[signal_type].value,
                "confidence": round(confidence, 4),
                "headline": headline,
            }
        )

    return results
