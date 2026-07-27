import logging
import re

from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.enums import DocType
from app.models.raw_document import RawDocument
from app.services.ingestion.http_client import fetch_text
from app.services.ingestion.storage import save_raw_document

logger = logging.getLogger(__name__)

_CAREER_PATHS = ("/careers", "/careers/", "/jobs", "/join-us", "/work-with-us")

_ROLE_KEYWORDS = (
    "engineer",
    "developer",
    "manager",
    "analyst",
    "designer",
    "sales",
    "executive",
    "lead",
    "intern",
    "specialist",
    "consultant",
    "director",
    "recruiter",
    "associate",
    "architect",
    "scientist",
    "administrator",
    "coordinator",
    "head of",
    "vp ",
)

_MAX_TITLE_LEN = 120


def _looks_like_job_title(text: str) -> bool:
    if not (3 <= len(text) <= _MAX_TITLE_LEN):
        return False
    lowered = text.lower()
    return any(keyword in lowered for keyword in _ROLE_KEYWORDS)


def _extract_candidate_titles(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    candidates: set[str] = set()
    for element in soup.find_all(["a", "li", "h1", "h2", "h3", "h4"]):
        text = re.sub(r"\s+", " ", element.get_text(strip=True))
        if _looks_like_job_title(text):
            candidates.add(text)

    return sorted(candidates)


def scrape_job_postings(db: Session, company: Company) -> list[RawDocument]:
    """Pull open roles from the company's own public career page.

    Per 01_TECHNICAL_ARCHITECTURE.md §2.1 / 05_FREE_STACK_DECISIONS.md §2:
    this is the primary hiring-intent signal, sourced from public career pages
    only — never Bombora/6sense/Sales Navigator.
    """
    if not company.website:
        return []

    base = company.website.rstrip("/")
    saved: list[RawDocument] = []

    for path in _CAREER_PATHS:
        url = f"{base}{path}"
        html = fetch_text(url)
        if not html:
            continue

        titles = _extract_candidate_titles(html)
        for title in titles:
            document = save_raw_document(
                db,
                company_id=company.id,
                doc_type=DocType.JOB_POSTING.value,
                source_url=url,
                raw_text=title,
            )
            if document is not None:
                saved.append(document)

        if titles:
            break  # found a working careers path — no need to try the rest

    return saved
