from app.models.company import Company
from app.services.scoring import ml_scorer, rules_engine
from app.services.scoring.features import FEATURE_NAMES, build_feature_vector


def _make_company(db_session) -> Company:
    company = Company(
        name="ML Fallback Co",
        industry="SaaS",
        employee_count_band="51-200",
        revenue_band="10cr-50cr",
        location_country="India",
    )
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


def test_score_company_falls_back_to_rules_engine_when_no_artifact(db_session, monkeypatch):
    monkeypatch.setattr(
        ml_scorer.settings, "SCORING_MODEL_ARTIFACT_PATH", "./nonexistent/scoring_model.joblib"
    )
    ml_scorer._artifact_cache.clear()

    company = _make_company(db_session)

    result, model_version = ml_scorer.score_company(db_session, company)

    assert model_version == rules_engine.MODEL_VERSION
    assert result.conversion_probability == round((result.fit_score + result.intent_score) / 2, 2)


def test_score_and_persist_writes_lead_score(db_session, monkeypatch):
    monkeypatch.setattr(
        ml_scorer.settings, "SCORING_MODEL_ARTIFACT_PATH", "./nonexistent/scoring_model.joblib"
    )
    ml_scorer._artifact_cache.clear()

    company = _make_company(db_session)
    lead_score = ml_scorer.score_and_persist(db_session, company)

    assert lead_score.model_version == "rules_v1"
    assert lead_score.company_id == company.id


def test_build_feature_vector_has_all_expected_keys(db_session):
    company = _make_company(db_session)
    rules_result = rules_engine.score_company(db_session, company)

    feature_vector = build_feature_vector(db_session, company, rules_result)

    assert set(feature_vector.keys()) == set(FEATURE_NAMES)
    assert feature_vector["fit_score"] == rules_result.fit_score
    assert feature_vector["intent_score"] == rules_result.intent_score
    assert feature_vector["job_posting_count_14d"] == 0.0
    assert feature_vector["has_press_30d"] == 0.0
