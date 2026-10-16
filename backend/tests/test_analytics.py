import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models.company import Company
from app.models.crm_deal import CRMDeal
from app.models.feedback import Feedback
from app.models.lead_score import LeadScore
from app.models.organization import Organization, ServiceOffering


@pytest.mark.parametrize("headers_fixture", ["manager_headers", "admin_headers"])
def test_extended_analytics_empty(client, request, headers_fixture):
    response = client.get("/api/analytics/extended", headers=request.getfixturevalue(headers_fixture))
    assert response.status_code == 200
    body = response.json()
    assert body["total_leads_scored"] == 0
    assert body["avg_conversion_probability"] == 0
    assert body["enrichment_breakdown"] == {"pending": 0, "enriched": 0, "failed": 0}
    assert body["deal_pipeline"] == {"open": 0, "won": 0, "lost": 0, "total_deal_value": 0}
    assert body["feedback_summary"] == {"accurate": 0, "inaccurate": 0}
    assert len(body["service_performance"]) == 4
    assert len(body["score_distribution"]) == 10
    assert len(body["scoring_activity_14d"]) == 14
    assert all(point["count"] == 0 for point in body["scoring_activity_14d"])


@pytest.mark.parametrize("endpoint", ["team", "extended"])
def test_analytics_requires_manager(client, bd_headers, endpoint):
    assert client.get(f"/api/analytics/{endpoint}").status_code == 401
    assert client.get(f"/api/analytics/{endpoint}", headers=bd_headers).status_code == 403


@pytest.mark.parametrize("legacy", [False, True])
def test_analytics_uses_only_current_organization(client, db_session, manager_user, manager_headers, legacy):
    now = datetime.now(UTC)
    own_org = Organization(id=uuid.uuid4(), name="Own organization")
    other_org = Organization(id=uuid.uuid4(), name="Other organization")
    db_session.add_all([own_org, other_org])
    db_session.flush()
    org_id = None if legacy else own_org.id
    manager_user.organization_id = org_id
    service = "hiring" if legacy else "robotics_integration"
    db_session.add_all(
        [
            ServiceOffering(organization_id=own_org.id, key=service, label="Active service"),
            ServiceOffering(organization_id=own_org.id, key="retired", label="Retired", is_active=False),
            ServiceOffering(organization_id=other_org.id, key="foreign_service", label="Foreign service"),
        ]
    )
    company = Company(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Own lead",
        industry="Manufacturing",
        enrichment_status="enriched",
    )
    db_session.add_all(
        [
            company,
            Company(organization_id=org_id, name="Pending lead", enrichment_status="pending"),
            Company(organization_id=org_id, name="Failed lead", enrichment_status="failed"),
        ]
    )
    foreign_companies = [
        Company(
            id=uuid.uuid4(),
            organization_id=excluded_org_id,
            name="Excluded lead",
            industry="Excluded industry",
            enrichment_status="enriched",
        )
        for excluded_org_id in ([other_org.id] if legacy else [other_org.id, None])
    ]
    db_session.add_all(foreign_companies)
    db_session.flush()
    old_score = LeadScore(
        id=uuid.uuid4(),
        company_id=company.id,
        conversion_probability=20,
        recommended_service=service,
        scored_at=now - timedelta(days=30),
    )
    latest_score = LeadScore(
        id=uuid.uuid4(),
        company_id=company.id,
        conversion_probability=85,
        recommended_service=service,
        scored_at=now,
    )
    foreign_scores = [
        LeadScore(
            id=uuid.uuid4(),
            company_id=c.id,
            conversion_probability=100,
            recommended_service="foreign_service",
            scored_at=now,
        )
        for c in foreign_companies
    ]
    db_session.add_all([old_score, latest_score, *foreign_scores])
    db_session.flush()
    db_session.add_all(
        [
            CRMDeal(
                organization_id=org_id,
                company_id=company.id,
                service_line=service,
                outcome="won",
                deal_value=100,
                closed_at=now,
            ),
            CRMDeal(
                organization_id=org_id,
                company_id=company.id,
                service_line=service,
                outcome="lost",
                deal_value=200,
                closed_at=now,
            ),
            CRMDeal(organization_id=org_id, company_id=company.id, outcome="open", deal_value=300),
            CRMDeal(organization_id=org_id, service_line=service, outcome="won", deal_value=50),
            Feedback(lead_score_id=old_score.id, user_id=manager_user.id, is_accurate=False),
            Feedback(lead_score_id=latest_score.id, user_id=manager_user.id, is_accurate=True),
        ]
    )
    for score, foreign_company in zip(foreign_scores, foreign_companies, strict=True):
        db_session.add_all(
            [
                CRMDeal(
                    organization_id=foreign_company.organization_id,
                    company_id=foreign_company.id,
                    service_line="foreign_service",
                    outcome="won",
                    deal_value=9999,
                    closed_at=now,
                ),
                Feedback(lead_score_id=score.id, user_id=manager_user.id, is_accurate=True),
            ]
        )
    db_session.commit()

    response = client.get("/api/analytics/extended", headers=manager_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_leads_scored"] == 1
    assert body["avg_conversion_probability"] == 85
    assert body["enrichment_breakdown"] == {"pending": 1, "enriched": 1, "failed": 1}
    assert body["deal_pipeline"] == {"open": 1, "won": 2, "lost": 1, "total_deal_value": 150}
    assert body["feedback_summary"] == {"accurate": 1, "inaccurate": 1}
    assert body["industry_performance"] == [{"industry": "Manufacturing", "count": 1, "win_rate": 0.5}]
    services = {item["service"]: item for item in body["service_performance"]}
    assert services[service] == {
        "service": service,
        "recommended_count": 1,
        "won_count": 2,
        "lost_count": 1,
    }
    if legacy:
        assert set(services) == {"branding", "hiring", "learning_development", "iac_partnership"}
    else:
        assert set(services) == {service}
    assert sum(bucket["count"] for bucket in body["score_distribution"]) == 1
    assert next(bucket for bucket in body["score_distribution"] if bucket["bucket"] == "80-89")["count"] == 1
    assert sum(point["count"] for point in body["scoring_activity_14d"]) == 1
    assert body["scoring_activity_14d"][-1]["count"] == 1
    assert body["score_band_performance"][0] == {"band": "80-100", "count": 1, "closed_won_rate": 0.5}
    assert body["model_accuracy_trend"] == [
        {"period": now.strftime("%Y-%m"), "top1_recommendation_accuracy": 0.5}
    ]
    team = client.get("/api/analytics/team", headers=manager_headers)
    assert team.status_code == 200
    assert team.json() == {key: body[key] for key in team.json()}
