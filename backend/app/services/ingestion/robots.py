from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

from app.core.config import get_settings

settings = get_settings()

_robots_cache: dict[str, RobotFileParser] = {}


def _robots_url_for(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}/robots.txt"


def is_scraping_allowed(url: str) -> bool:
    """Check the target site's robots.txt before scraping it.

    Per 01_TECHNICAL_ARCHITECTURE.md §5: if a site disallows scraping, drop it
    rather than working around the block. Fails closed (disallow) only when a
    robots.txt exists and explicitly disallows the path; an unreachable
    robots.txt is treated as permissive, matching standard crawler behavior.
    """
    robots_url = _robots_url_for(url)

    parser = _robots_cache.get(robots_url)
    if parser is None:
        parser = RobotFileParser()
        parser.set_url(robots_url)
        try:
            parser.read()
        except Exception:
            # No reachable robots.txt — treat as permissive.
            _robots_cache[robots_url] = parser
            return True
        _robots_cache[robots_url] = parser

    return parser.can_fetch(settings.SCRAPER_USER_AGENT, url)
