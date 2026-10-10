import uuid


def _signup_payload(**overrides):
    payload = {
        "organization_name": "Acme Robotics",
        "industry": "Manufacturing",
        "employee_count_band": "51-200",
        "admin_full_name": "Ada Admin",
        "admin_email": f"ada-{uuid.uuid4().hex[:8]}@acme-robotics.example.com",
        "admin_password": "Password123!",
        "service_offerings": [
            {"key": "robotics_integration", "label": "Robotics Integration", "description": "industrial robotics integration"},
            {"key": "maintenance_contracts", "label": "Maintenance Contracts", "description": "equipment maintenance and support contracts"},
        ],
    }
    payload.update(overrides)
    return payload


def test_signup_creates_organization_and_admin_user(client):
    response = client.post("/api/organizations/signup", json=_signup_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "admin"
    assert body["access_token"]
    assert body["organization"]["name"] == "Acme Robotics"
    assert {o["key"] for o in body["organization"]["service_offerings"]} == {
        "robotics_integration",
        "maintenance_contracts",
    }


def test_signup_rejects_duplicate_admin_email(client):
    payload = _signup_payload()
    first = client.post("/api/organizations/signup", json=payload)
    assert first.status_code == 201

    second = client.post("/api/organizations/signup", json=payload)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"


def test_signup_requires_at_least_one_service_offering(client):
    payload = _signup_payload(service_offerings=[])
    response = client.post("/api/organizations/signup", json=payload)
    assert response.status_code == 422


def test_get_my_organization(client):
    signup = client.post("/api/organizations/signup", json=_signup_payload())
    token = signup.json()["access_token"]

    response = client.get("/api/organizations/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["name"] == "Acme Robotics"


def test_companies_are_isolated_between_organizations(client):
    org_a = client.post("/api/organizations/signup", json=_signup_payload(organization_name="Org A")).json()
    org_b = client.post(
        "/api/organizations/signup",
        json=_signup_payload(organization_name="Org B", admin_email=f"bob-{uuid.uuid4().hex[:8]}@org-b.example.com"),
    ).json()
    headers_a = {"Authorization": f"Bearer {org_a['access_token']}"}
    headers_b = {"Authorization": f"Bearer {org_b['access_token']}"}

    created = client.post(
        "/api/companies", headers=headers_a, json={"name": "Org A's Target Co", "industry": "Manufacturing"}
    )
    company_id = created.json()["id"]

    # Org B cannot see Org A's company by id or in its list.
    assert client.get(f"/api/companies/{company_id}", headers=headers_b).status_code == 404
    list_b = client.get("/api/companies", headers=headers_b).json()
    assert all(c["id"] != company_id for c in list_b["results"])

    list_a = client.get("/api/companies", headers=headers_a).json()
    assert any(c["id"] == company_id for c in list_a["results"])


def test_discover_imports_companies_from_other_organizations(client):
    org_a = client.post(
        "/api/organizations/signup",
        json=_signup_payload(organization_name="Org A Discover", admin_email=f"a-{uuid.uuid4().hex[:8]}@example.com"),
    ).json()
    org_b = client.post(
        "/api/organizations/signup",
        json=_signup_payload(organization_name="Org B Discover", admin_email=f"b-{uuid.uuid4().hex[:8]}@example.com"),
    ).json()
    headers_a = {"Authorization": f"Bearer {org_a['access_token']}"}
    headers_b = {"Authorization": f"Bearer {org_b['access_token']}"}

    client.post(
        "/api/companies",
        headers=headers_a,
        json={"name": "Discoverable Target Co", "industry": "Manufacturing"},
    )

    response = client.post(
        "/api/companies/discover",
        headers=headers_b,
        json={"industries": ["Manufacturing"], "max_results": 10},
    )
    assert response.status_code == 202
    body = response.json()
    assert body["discovered"] == 1

    list_b = client.get("/api/companies", headers=headers_b).json()
    assert any(c["name"] == "Discoverable Target Co" for c in list_b["results"])

    # Running discover again shouldn't re-import the same company (dedup by name).
    response_again = client.post(
        "/api/companies/discover",
        headers=headers_b,
        json={"industries": ["Manufacturing"], "max_results": 10},
    )
    assert response_again.json()["discovered"] == 0
