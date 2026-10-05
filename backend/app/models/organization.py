import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Organization(Base):
    """A tenant — the business using LeadIntel to generate leads for itself.

    Previously the whole platform was hardcoded to one company (Cloud
    Counselage) and its 4 fixed service lines. This table is what makes the
    platform multi-tenant: any company can sign up, describe itself and its
    own service catalog (see ServiceOffering), and get leads generated and
    scored against its own ICP instead of Cloud Counselage's.
    """

    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()")
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(255))
    employee_count_band: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(500))
    # Optional per-tenant override of the rules-engine ICP weight tables
    # (industry_weights / employee_band_weights / revenue_band_weights).
    # When null/missing keys, rules_engine falls back to the original
    # Cloud-Counselage-derived defaults in app/services/tenancy.py.
    icp_config: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    service_offerings = relationship(
        "ServiceOffering", back_populates="organization", cascade="all, delete-orphan"
    )
    users = relationship("User", back_populates="organization")
    companies = relationship("Company", back_populates="organization")


class ServiceOffering(Base):
    """One service/product an organization sells — replaces the old hardcoded
    ServiceLine enum (branding/hiring/learning_development/iac_partnership),
    which was Cloud Counselage's specific catalog, not a universal concept.
    """

    __tablename__ = "service_offerings"
    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_service_offerings_org_key"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    # Short natural-language phrasing fed to the zero-shot NLP classifier as
    # a candidate label, e.g. "hiring, recruitment, or workforce expansion".
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    organization = relationship("Organization", back_populates="service_offerings")
