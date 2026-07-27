def test_bd_executive_cannot_run_scoring(client, bd_headers):
    response = client.post("/api/scoring/run", headers=bd_headers, json={"mode": "incremental"})
    assert response.status_code == 403


def test_bd_executive_cannot_trigger_crm_sync(client, bd_headers):
    response = client.post("/api/crm/sync", headers=bd_headers, json={"direction": "push"})
    assert response.status_code == 403


def test_bd_executive_cannot_view_analytics(client, bd_headers):
    response = client.get("/api/analytics/team", headers=bd_headers)
    assert response.status_code == 403


def test_manager_can_view_analytics(client, manager_headers):
    response = client.get("/api/analytics/team", headers=manager_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_leads_scored"] == 0
    assert body["score_band_performance"]


def test_admin_can_run_scoring(client, admin_headers):
    response = client.post("/api/scoring/run", headers=admin_headers, json={"mode": "incremental"})
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["task_id"]
