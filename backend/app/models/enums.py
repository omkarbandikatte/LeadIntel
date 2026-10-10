import enum


class UserRole(str, enum.Enum):
    BD_EXECUTIVE = "bd_executive"
    MANAGER = "manager"
    ADMIN = "admin"


class EnrichmentStatus(str, enum.Enum):
    PENDING = "pending"
    ENRICHED = "enriched"
    FAILED = "failed"


class DocType(str, enum.Enum):
    JOB_POSTING = "job_posting"
    COMPANY_ABOUT = "company_about"
    NEWS_MENTION = "news_mention"
    PRESS_RELEASE = "press_release"


class ServiceLine(str, enum.Enum):
    BRANDING = "branding"
    HIRING = "hiring"
    LEARNING_DEVELOPMENT = "learning_development"
    IAC_PARTNERSHIP = "iac_partnership"


class DealOutcome(str, enum.Enum):
    WON = "won"
    LOST = "lost"
    OPEN = "open"


class SyncDirection(str, enum.Enum):
    PUSH = "push"
    PULL = "pull"


class SyncStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


class SignalType(str, enum.Enum):
    """Structured business-signal taxonomy for the Signal Engine."""

    HIRING = "hiring"
    EXPANSION = "expansion"
    FUNDING = "funding"
    TECHNOLOGY_ADOPTION = "technology_adoption"
    LEADERSHIP_CHANGE = "leadership_change"
    LAYOFFS = "layoffs"
    HIRING_FREEZE = "hiring_freeze"


class SignalDirection(str, enum.Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
