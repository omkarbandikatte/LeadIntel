"""Celery Beat schedule — cron definitions for scraping/scoring jobs.

Kept separate from application code (per 04_PROJECT_SETUP_AND_REPO_STRUCTURE.md
§1) so ops can tune ingestion/scoring cadence without touching backend/app.
Loaded by app.worker via celery_app.conf.beat_schedule.
"""

from datetime import timedelta

BEAT_SCHEDULE = {
    "rescore-enriched-companies-nightly": {
        "task": "leadintel.score_all_companies",
        "schedule": timedelta(hours=24),
        "args": ("incremental",),
    },
    "full-rescore-weekly": {
        "task": "leadintel.score_all_companies",
        "schedule": timedelta(days=7),
        "args": ("full",),
    },
}
