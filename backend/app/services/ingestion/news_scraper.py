import logging
from urllib.parse import quote_plus

import feedparser
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.enums import DocType
from app.models.raw_document import RawDocument
from app.services.ingestion.storage import save_raw_document

logger = logging.getLogger(__name__)

_NEWS_RSS_TEMPLATE = "https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"
_PRESS_KEYWORDS = ("funding", "raises", "series ", "acquisition", "acquires", "ipo", "investment")
_MAX_ENTRIES = 15


def scrape_news_mentions(db: Session, company: Company) -> list[RawDocument]:
    """Pull recent public news/press mentions via free RSS (no paid news API).

    Per 01_TECHNICAL_ARCHITECTURE.md §2.1: uses Google News RSS via feedparser
    rather than a paid news API (NewsAPI, etc.). Funding/growth signals are
    inferred from press-mention keywords per 05_FREE_STACK_DECISIONS.md §1,
    since a structured funding database (Crunchbase paid tier) is out of scope.
    """
    feed_url = _NEWS_RSS_TEMPLATE.format(query=quote_plus(company.name))

    try:
        parsed = feedparser.parse(feed_url)
    except Exception as exc:
        logger.info("News feed parse failed for %s: %s", company.name, exc)
        return []

    saved: list[RawDocument] = []
    for entry in parsed.entries[:_MAX_ENTRIES]:
        title = getattr(entry, "title", "").strip()
        summary = getattr(entry, "summary", "").strip()
        link = getattr(entry, "link", None)
        if not title:
            continue

        raw_text = f"{title}\n{summary}".strip()
        lowered = raw_text.lower()
        doc_type = (
            DocType.PRESS_RELEASE.value
            if any(keyword in lowered for keyword in _PRESS_KEYWORDS)
            else DocType.NEWS_MENTION.value
        )

        document = save_raw_document(
            db,
            company_id=company.id,
            doc_type=doc_type,
            source_url=link,
            raw_text=raw_text,
        )
        if document is not None:
            saved.append(document)

    return saved
