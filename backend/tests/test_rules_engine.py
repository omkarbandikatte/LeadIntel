from datetime import UTC, datetime, timedelta

import pytest

from app.models.company import Company
from app.models.nlp_feature import NLPFeature
from app.models.raw_document import RawDocument
from app.services.scoring.rules_engine import persist_score, score_company


def _make_company(db_session, **overrides) -> Company:
    defaults = dict(
        name="Acme SaaS Pvt Ltd",
        industry="SaaS",
        employee_count_band="51-200",
        revenue_band="10cr-50cr",
        location_country="India",
    )
    defaults.update(overrides)
    company = Company(**defaults)
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


def test_fit_score_rewards_strong_icp_match(db_session):
    strong_fit_company = _make_company(db_session)
    weak_fit_company = _make_company(
        db_session,
        name="Weak Fit Co",
        industry="Retail",
        employee_count_band="1-10",
        revenue_band="<1cr",
        location_country="USA",
    )

    strong_result = score_company(db_session, strong_fit_company)
    weak_result = score_company(db_session, weak_fit_company)

    assert strong_result.fit_score > weak_result.fit_score
    assert any("ICP fit" in factor.factor for factor in strong_result.top_factors)


def test_intent_score_rewards_recent_job_postings(db_session):
    company = _make_company(db_session)

    for i in range(3):
        db_session.add(
            RawDocument(
                company_id=company.id,
                doc_type="job_posting",
                source_url="https://acme.example.com/careers",
                raw_text=f"Senior Backend Engineer #{i}",
                content_hash=f"hash-job-{i}",
                scraped_at=datetime.now(UTC) - timedelta(days=2),
            )
        )
    db_session.commit()

    result = score_company(db_session, company)

    assert result.intent_score > 0
    assert any("open role" in factor.factor for factor in result.top_factors)


def test_intent_score_ignores_stale_job_postings(db_session):
    company = _make_company(db_session)
    db_session.add(
        RawDocument(
            company_id=company.id,
            doc_type="job_posting",
            source_url="https://acme.example.com/careers",
            raw_text="Old Posting",
            content_hash="hash-old",
            scraped_at=datetime.now(UTC) - timedelta(days=90),
        )
    )
    db_session.commit()

    result = score_company(db_session, company)

    assert result.intent_score == 0.0


def test_recommend_service_uses_highest_confidence_category(db_session):
    company = _make_company(db_session)
    document = RawDocument(
        company_id=company.id,
        doc_type="company_about",
        raw_text="We are hiring aggressively across engineering.",
        content_hash="hash-about",
    )
    db_session.add(document)
    db_session.commit()
    db_session.refresh(document)

    db_session.add_all(
        [
            NLPFeature(
                company_id=company.id,
                raw_document_id=document.id,
                predicted_need_category="hiring",
                confidence=0.9,
            ),
            NLPFeature(
                company_id=company.id,
                raw_document_id=document.id,
                predicted_need_category="branding",
                confidence=0.2,
            ),
        ]
    )
    db_session.commit()

    result = score_company(db_session, company)

    assert result.recommended_service == "hiring"
    # recommendation_confidence is now the normalised service probability (0-1):
    # hiring = 0.9 / (0.9 + 0.2) * 100 = 81.82 %, so confidence = 0.8182
    assert result.recommendation_confidence == pytest.approx(0.8182, abs=1e-3)
    assert result.service_probabilities["hiring"] > result.service_probabilities["branding"]


def test_conversion_probability_is_average_of_fit_and_intent(db_session):
    company = _make_company(db_session)
    result = score_company(db_session, company)
    assert result.conversion_probability == round((result.fit_score + result.intent_score) / 2, 2)


def test_persist_score_writes_lead_score_row(db_session):
    company = _make_company(db_session)
    result = score_company(db_session, company)

    lead_score = persist_score(db_session, company, result)

    assert lead_score.id is not None
    assert lead_score.model_version == "rules_v1"
    assert float(lead_score.conversion_probability) == result.conversion_probability
    assert isinstance(lead_score.top_factors, list)
