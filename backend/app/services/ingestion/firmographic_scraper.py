import logging

from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.enums import DocType
from app.models.raw_document import RawDocument
from app.services.ingestion.http_client import fetch_text
from app.services.ingestion.storage import save_raw_document

logger = logging.getLogger(__name__)

_ABOUT_PATHS = ("/about", "/about-us", "/company", "/")


def _extract_visible_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    return " ".join(text.split())


def scrape_company_about(db: Session, company: Company) -> list[RawDocument]:
    """Pull public "About" text from the company's own website.

    Per 01_TECHNICAL_ARCHITECTURE.md §2.1 / 05_FREE_STACK_DECISIONS.md §1:
    self-built scraper against public "About Us" pages only — no paid
    firmographic API (Clearbit/ZoomInfo/Apollo).
    """
    if not company.website:
        return []

    base = company.website.rstrip("/")
    saved: list[RawDocument] = []

    for path in _ABOUT_PATHS:
        url = base if path == "/" else f"{base}{path}"
        html = fetch_text(url)
        if not html:
            continue

        text = _extract_visible_text(html)
        if len(text) < 50:
            continue

        document = save_raw_document(
            db,
            company_id=company.id,
            doc_type=DocType.COMPANY_ABOUT.value,
            source_url=url,
            raw_text=text,
        )
        if document is not None:
            saved.append(document)
            break  # one good "about" document is enough per scrape run

    return saved
