import logging
import time

import requests

from app.core.config import get_settings
from app.services.ingestion.robots import is_scraping_allowed

logger = logging.getLogger(__name__)
settings = get_settings()

_last_request_at: dict[str, float] = {}


def _throttle(host: str) -> None:
    last = _last_request_at.get(host)
    if last is not None:
        elapsed = time.monotonic() - last
        wait = settings.SCRAPER_REQUEST_DELAY_SECONDS - elapsed
        if wait > 0:
            time.sleep(wait)
    _last_request_at[host] = time.monotonic()


def fetch_text(url: str, *, timeout: float = 10.0) -> str | None:
    """Fetch a URL's HTML/text, respecting robots.txt and a per-host request delay.

    Returns None (rather than raising) on any failure — scraping is a best-effort
    signal source, not a hard dependency for the rest of the pipeline.
    """
    if not is_scraping_allowed(url):
        logger.info("Skipping %s: disallowed by robots.txt", url)
        return None

    from urllib.parse import urlparse

    _throttle(urlparse(url).netloc)

    headers = {"User-Agent": settings.SCRAPER_USER_AGENT}
    try:
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.info("Fetch failed for %s: %s", url, exc)
        return None

    return response.text
