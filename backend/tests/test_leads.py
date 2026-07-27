import uuid

from app.models.company import Company
from app.models.lead_score import LeadScore


def _make_scored_company(db_session, *, name: str, probability: float, industry: str = "SaaS") -> Company:
    company = Company(name=name, industry=industry, location_country="India")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    lead_score = LeadScore(
        company_id=company.id,
        fit_score=probability,
        intent_score=probability,
        conversion_probability=probability,
        recommended_service="hiring",
        recommendation_confidence=0.8,
        top_factors=[{"factor": "3 open roles posted in last 14 days", "weight": 0.34}],
        model_version="rules_v1",
    )
    db_session.add(lead_score)
    db_session.commit()
    return company


def test_list_leads_sorted_by_score_desc(client, bd_headers, db_session):
    _make_scored_company(db_session, name="Low Score Co", probability=30.0)
    _make_scored_company(db_session, name="High Score Co", probability=90.0)

    response = client.get("/api/leads", headers=bd_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["results"][0]["company_name"] == "High Score Co"
    assert body["results"][1]["company_name"] == "Low Score Co"


def test_list_leads_filters_by_min_score(client, bd_headers, db_session):
    _make_scored_company(db_session, name="Low Score Co", probability=30.0)
    _make_scored_company(db_session, name="High Score Co", probability=90.0)

    response = client.get("/api/leads", headers=bd_headers, params={"min_score": 50})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["company_name"] == "High Score Co"


def test_list_leads_pagination(client, bd_headers, db_session):
    for i in range(5):
        _make_scored_company(db_session, name=f"Company {i}", probability=float(i * 10))

    response = client.get("/api/leads", headers=bd_headers, params={"page": 1, "page_size": 2})
    body = response.json()
    assert body["total"] == 5
    assert body["page_size"] == 2
    assert len(body["results"]) == 2


def test_lead_explanation_not_found(client, bd_headers):
    response = client.get(f"/api/leads/{uuid.uuid4()}/explanation", headers=bd_headers)
    assert response.status_code == 404


def test_lead_explanation_returns_top_factors(client, bd_headers, db_session):
    company = _make_scored_company(db_session, name="Explained Co", probability=78.4)

    response = client.get(f"/api/leads/{company.id}/explanation", headers=bd_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["conversion_probability"] == 78.4
    assert body["recommended_service"] == "hiring"
    assert body["top_factors"][0]["factor"] == "3 open roles posted in last 14 days"


def test_submit_feedback(client, bd_headers, db_session):
    company = _make_scored_company(db_session, name="Feedback Co", probability=60.0)

    response = client.post(
        f"/api/leads/{company.id}/feedback",
        headers=bd_headers,
        json={"is_accurate": False, "comment": "Already has an in-house recruiter."},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["is_accurate"] is False
    assert body["comment"] == "Already has an in-house recruiter."
