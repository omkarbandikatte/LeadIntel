"""Seed a small synthetic labeled dataset for local development.

This exists solely to give ml/training/train_scoring_model.py something to
fit before real crm_deals history accumulates from actual sales activity —
it is NOT a stand-in for a large-scale synthetic dataset; it's a modest,
clearly-synthetic fixture (a few hundred companies) whose only purpose is to
prove the V1-rules -> V2-ML rollout described in
01_TECHNICAL_ARCHITECTURE.md §2.4 end-to-end.

Run with (from backend/ with its venv active):
    python ../ml/training/generate_fixture_dataset.py
"""

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.db.session import SessionLocal  # noqa: E402
from app.models.company import Company  # noqa: E402
from app.models.crm_deal import CRMDeal  # noqa: E402
from app.models.enums import ServiceLine  # noqa: E402
from app.models.nlp_feature import NLPFeature  # noqa: E402
from app.models.raw_document import RawDocument  # noqa: E402

random.seed(42)

INDUSTRIES = ["SaaS", "Fintech", "E-commerce", "Manufacturing", "Retail", "Healthcare", "Education"]
EMPLOYEE_BANDS = ["1-10", "11-50", "51-200", "201-1000", "1000+"]
REVENUE_BANDS = ["<1cr", "1cr-10cr", "10cr-50cr", "50cr-250cr", "250cr+"]
SERVICE_LINES = [line.value for line in ServiceLine]

N_COMPANIES = 400


def _synthetic_win_probability(industry: str, employee_band: str, has_job_postings: bool, has_press: bool) -> float:
    """Bakes in the same ICP intuitions as rules_engine.py so the fixture
    labels are learnable signal rather than pure noise."""
    score = 0.15
    if industry in ("SaaS", "Fintech"):
        score += 0.25
    if employee_band == "51-200":
        score += 0.25
    if has_job_postings:
        score += 0.20
    if has_press:
        score += 0.10
    return min(score, 0.9)


def generate(n_companies: int = N_COMPANIES) -> None:
    db = SessionLocal()
    try:
        for i in range(n_companies):
            industry = random.choice(INDUSTRIES)
            employee_band = random.choice(EMPLOYEE_BANDS)
            revenue_band = random.choice(REVENUE_BANDS)
            has_job_postings = random.random() < 0.5
            has_press = random.random() < 0.2

            company = Company(
                name=f"Fixture Co {i:04d}",
                website=f"https://fixture-{i:04d}.example.com",
                industry=industry,
                employee_count_band=employee_band,
                revenue_band=revenue_band,
                location_country="India",
                enrichment_status="enriched",
                source="fixture_dataset",
            )
            db.add(company)
            db.flush()

            if has_job_postings:
                for j in range(random.randint(1, 4)):
                    db.add(
                        RawDocument(
                            company_id=company.id,
                            doc_type="job_posting",
                            source_url=f"{company.website}/careers",
                            raw_text=f"Open role {j} at fixture company {i}",
                            content_hash=f"fixture-job-{i}-{j}",
                        )
                    )

            if has_press:
                db.add(
                    RawDocument(
                        company_id=company.id,
                        doc_type="press_release",
                        raw_text=f"Fixture Co {i:04d} raises Series A funding",
                        content_hash=f"fixture-press-{i}",
                    )
                )

            need_category = random.choice(SERVICE_LINES)
            about_document = RawDocument(
                company_id=company.id,
                doc_type="company_about",
                raw_text="Synthetic fixture company description for training purposes.",
                content_hash=f"fixture-about-{i}",
            )
            db.add(about_document)
            db.flush()

            db.add(
                NLPFeature(
                    company_id=company.id,
                    raw_document_id=about_document.id,
                    predicted_need_category=need_category,
                    confidence=round(random.uniform(0.55, 0.95), 4),
                    extracted_entities={"entities": [], "noun_phrases": [], "growth_signals": []},
                )
            )

            win_probability = _synthetic_win_probability(industry, employee_band, has_job_postings, has_press)
            outcome = "won" if random.random() < win_probability else "lost"
            closed_at = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 180))

            db.add(
                CRMDeal(
                    company_id=company.id,
                    deal_stage="closed_won" if outcome == "won" else "closed_lost",
                    service_line=need_category,
                    deal_value=round(random.uniform(50_000, 2_000_000), 2),
                    outcome=outcome,
                    closed_at=closed_at,
                )
            )

        db.commit()
        print(f"Seeded {n_companies} fixture companies with job postings, NLP features, and CRM deal outcomes.")
    finally:
        db.close()


if __name__ == "__main__":
    generate()
