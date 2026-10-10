"""Tenant-aware defaults for scoring/NLP — the bridge between the old,
hardcoded single-tenant (Cloud Counselage) behavior and a real multi-tenant
Organization.

Every organization declares its own ServiceOffering catalog and (optionally)
its own ICP weight tables at signup. Companies/tests that don't have an
organization attached (legacy rows, unit tests) fall back to exactly the
original Cloud Counselage constants so existing behavior is unchanged.
"""

from app.models.company import Company

# The platform's original, single-tenant service catalog — now just the
# default a new organization starts with (and the fallback for org-less rows).
DEFAULT_SERVICE_OFFERINGS: list[tuple[str, str]] = [
    ("branding", "branding, marketing, or public image"),
    ("hiring", "hiring, recruitment, or workforce expansion"),
    ("learning_development", "employee learning, training, or upskilling"),
    ("iac_partnership", "IT infrastructure, cloud, or technology partnership"),
]

DEFAULT_INDUSTRY_WEIGHTS: dict[str, float] = {
    "saas": 100.0,
    "information technology": 95.0,
    "it services": 95.0,
    "fintech": 90.0,
    "financial services": 85.0,
    "e-commerce": 80.0,
    "education": 70.0,
    "healthcare": 65.0,
    "manufacturing": 60.0,
    "retail": 55.0,
}

DEFAULT_EMPLOYEE_BAND_WEIGHTS: dict[str, float] = {
    "51-200": 100.0,
    "11-50": 80.0,
    "201-1000": 70.0,
    "1000+": 45.0,
    "1-10": 40.0,
}

DEFAULT_REVENUE_BAND_WEIGHTS: dict[str, float] = {
    "10cr-50cr": 100.0,
    "50cr-250cr": 85.0,
    "1cr-10cr": 70.0,
    "250cr+": 55.0,
    "<1cr": 35.0,
}


def get_service_offerings(company: Company) -> list[tuple[str, str]]:
    """(key, description) pairs for the company's organization, or the
    original 4 Cloud Counselage service lines if it has none configured."""
    org = getattr(company, "organization", None)
    if org is not None:
        active = [o for o in org.service_offerings if o.is_active]
        if active:
            return [(o.key, o.description or o.label) for o in active]
    return DEFAULT_SERVICE_OFFERINGS


def get_icp_weights(company: Company) -> dict[str, dict[str, float]]:
    """industry/employee_band/revenue_band weight maps, overridden per-field
    by the organization's icp_config JSON when present."""
    weights = {
        "industry_weights": dict(DEFAULT_INDUSTRY_WEIGHTS),
        "employee_band_weights": dict(DEFAULT_EMPLOYEE_BAND_WEIGHTS),
        "revenue_band_weights": dict(DEFAULT_REVENUE_BAND_WEIGHTS),
    }
    org = getattr(company, "organization", None)
    icp_config = getattr(org, "icp_config", None) if org is not None else None
    if icp_config:
        for field in weights:
            override = icp_config.get(field)
            if override:
                weights[field].update(override)
    return weights
