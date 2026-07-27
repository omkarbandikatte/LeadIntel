import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "postgresql://leadintel:leadintel@localhost:5432/leadintel_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")

from app.core.config import get_settings  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.base_class import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402

settings = get_settings()


@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(settings.DATABASE_URL, future=True)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    """A fresh session per test, with all tables emptied afterwards.

    Deletes rather than truncates so FK-dependent ordering (via
    Base.metadata.sorted_tables) is respected without needing CASCADE.
    """
    session_factory = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        with db_engine.connect() as connection:
            trans = connection.begin()
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(table.delete())
            trans.commit()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _make_user(db_session, role: str) -> User:
    user = User(
        email=f"{role}-{uuid.uuid4().hex[:8]}@cloudcounselage.com",
        full_name=f"Test {role.title()}",
        hashed_password=hash_password("Password123!"),
        role=role,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _auth_headers(user: User) -> dict[str, str]:
    token = create_access_token(subject=user.id, role=user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def bd_executive_user(db_session):
    return _make_user(db_session, "bd_executive")


@pytest.fixture()
def manager_user(db_session):
    return _make_user(db_session, "manager")


@pytest.fixture()
def admin_user(db_session):
    return _make_user(db_session, "admin")


@pytest.fixture()
def bd_headers(bd_executive_user):
    return _auth_headers(bd_executive_user)


@pytest.fixture()
def manager_headers(manager_user):
    return _auth_headers(manager_user)


@pytest.fixture()
def admin_headers(admin_user):
    return _auth_headers(admin_user)
