def test_login_success(client, bd_executive_user):
    response = client.post(
        "/api/auth/login", json={"email": bd_executive_user.email, "password": "Password123!"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["role"] == "bd_executive"
    assert body["access_token"]


def test_login_wrong_password(client, bd_executive_user):
    response = client.post(
        "/api/auth/login", json={"email": bd_executive_user.email, "password": "wrong-password"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_unknown_email(client):
    response = client.post(
        "/api/auth/login", json={"email": "nobody@cloudcounselage.com", "password": "whatever"}
    )
    assert response.status_code == 401


def test_register_requires_admin(client, bd_headers):
    response = client.post(
        "/api/auth/register",
        headers=bd_headers,
        json={
            "email": "new.exec@cloudcounselage.com",
            "full_name": "New Exec",
            "password": "Password123!",
            "role": "bd_executive",
        },
    )
    assert response.status_code == 403


def test_register_as_admin_succeeds(client, admin_headers):
    response = client.post(
        "/api/auth/register",
        headers=admin_headers,
        json={
            "email": "new.manager@cloudcounselage.com",
            "full_name": "New Manager",
            "password": "Password123!",
            "role": "manager",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new.manager@cloudcounselage.com"
    assert body["role"] == "manager"

    login_response = client.post(
        "/api/auth/login",
        json={"email": "new.manager@cloudcounselage.com", "password": "Password123!"},
    )
    assert login_response.status_code == 200


def test_register_duplicate_email_conflicts(client, admin_headers, admin_user):
    response = client.post(
        "/api/auth/register",
        headers=admin_headers,
        json={
            "email": admin_user.email,
            "full_name": "Duplicate",
            "password": "Password123!",
            "role": "admin",
        },
    )
    assert response.status_code == 409


def test_unauthenticated_request_rejected(client):
    response = client.get("/api/leads")
    assert response.status_code == 401
