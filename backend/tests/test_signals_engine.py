from datetime import UTC, datetime, timedelta

from app.models.company import Company
from app.models.crm_deal import CRMDeal
from app.models.raw_document import RawDocument
from app.models.signal import Signal
from app.services.nlp.signal_detection import detect_signals
from app.services.scoring.rules_engine import score_company


def _make_company(db_session, **overrides) -> Company:
    defaults = dict(
        name="Signal Co",
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


def test_detect_signals_finds_positive_and_negative_types():
    text = "We're hiring across engineering and just closed our Series B funding round."
    detections = detect_signals(text)
    types = {d["signal_type"] for d in detections}
    assert "hiring" in types
    assert "funding" in types
    assert all(d["direction"] == "positive" for d in detections)


def test_detect_signals_finds_negative_signals():
    detections = detect_signals("The company announced layoffs affecting 10% of staff.")
    assert len(detections) == 1
    assert detections[0]["signal_type"] == "layoffs"
    assert detections[0]["direction"] == "negative"


def test_detect_signals_returns_empty_for_unrelated_text():
    assert detect_signals("We sell artisanal coffee beans online.") == []


def test_opportunity_score_rewards_recent_positive_signal(db_session):
    company = _make_company(db_session)
    db_session.add(
        Signal(
            company_id=company.id,
            signal_type="funding",
            direction="positive",
            confidence=0.9,
            headline="raised a Series B",
            detected_at=datetime.now(UTC) - timedelta(days=1),
        )
    )
    db_session.commit()

    result = score_company(db_session, company)

    assert result.opportunity_score > 0
    assert result.why_now is not None
    assert len(result.evidence) == 1


def test_opportunity_score_penalized_by_negative_signal(db_session):
    no_signal_company = _make_company(db_session, name="Clean Co")
    negative_signal_company = _make_company(db_session, name="Layoff Co")
    db_session.add(
        Signal(
            company_id=negative_signal_company.id,
            signal_type="layoffs",
            direction="negative",
            confidence=0.9,
            headline="announced layoffs",
            detected_at=datetime.now(UTC) - timedelta(days=1),
        )
    )
    db_session.commit()

    clean_result = score_company(db_session, no_signal_company)
    negative_result = score_company(db_session, negative_signal_company)

    assert negative_result.opportunity_score < clean_result.opportunity_score


def test_engagement_score_reflects_deal_stage(db_session):
    no_deal_company = _make_company(db_session, name="No Deal Co")
    engaged_company = _make_company(db_session, name="Engaged Co")
    db_session.add(
        CRMDeal(company_id=engaged_company.id, deal_stage="negotiation", outcome="open")
    )
    db_session.commit()

    no_deal_result = score_company(db_session, no_deal_company)
    engaged_result = score_company(db_session, engaged_company)

    assert no_deal_result.engagement_score == 0.0
    assert engaged_result.engagement_score > no_deal_result.engagement_score


def test_intent_score_decays_with_age_instead_of_hard_cutoff(db_session):
    fresh_company = _make_company(db_session, name="Fresh Co")
    older_company = _make_company(db_session, name="Older Co")

    for company, age_days in ((fresh_company, 1), (older_company, 30)):
        db_session.add(
            RawDocument(
                company_id=company.id,
                doc_type="job_posting",
                raw_text="Backend Engineer",
                content_hash=f"hash-{company.id}",
                scraped_at=datetime.now(UTC) - timedelta(days=age_days),
            )
        )
    db_session.commit()

    fresh_result = score_company(db_session, fresh_company)
    older_result = score_company(db_session, older_company)

    assert fresh_result.intent_score > older_result.intent_score > 0
