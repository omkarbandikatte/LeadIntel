import io
import uuid


def test_create_company(client, bd_headers):
    response = client.post(
        "/api/companies",
        headers=bd_headers,
        json={"name": "Acme SaaS Pvt Ltd", "website": "https://acme.example.com", "industry": "SaaS"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Acme SaaS Pvt Ltd"
    assert body["enrichment_status"] == "pending"


def test_get_company_not_found(client, bd_headers):
    response = client.get(f"/api/companies/{uuid.uuid4()}", headers=bd_headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "COMPANY_NOT_FOUND"


def test_get_company_returns_nlp_features(client, bd_headers):
    create_response = client.post(
        "/api/companies", headers=bd_headers, json={"name": "Beta Corp", "industry": "Fintech"}
    )
    company_id = create_response.json()["id"]

    get_response = client.get(f"/api/companies/{company_id}", headers=bd_headers)
    assert get_response.status_code == 200
    body = get_response.json()
    assert body["name"] == "Beta Corp"
    assert body["latest_nlp_features"] == []


def test_bulk_upload_accepts_valid_rows_and_rejects_invalid(client, bd_headers):
    csv_content = "name,website,industry\nGamma Inc,https://gamma.example.com,Retail\n,https://noname.example.com,Retail\n"
    file = io.BytesIO(csv_content.encode("utf-8"))

    response = client.post(
        "/api/companies/bulk-upload",
        headers=bd_headers,
        files={"file": ("companies.csv", file, "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] == 1
    assert body["rejected"] == 1
    assert body["errors"][0]["reason"] == "Missing required field 'name'"


def test_list_company_documents_empty(client, bd_headers):
    create_response = client.post("/api/companies", headers=bd_headers, json={"name": "Delta Ltd"})
    company_id = create_response.json()["id"]

    response = client.get(f"/api/companies/{company_id}/documents", headers=bd_headers)
    assert response.status_code == 200
    assert response.json() == []
