import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint(
            "enrichment_status IN ('pending', 'enriched', 'failed')",
            name="companies_enrichment_status_check",
        ),
        # Matches 02_DATABASE_SCHEMA.sql's idx_companies_name exactly — a GIN
        # trigram index for fast fuzzy/substring search, not a plain btree.
        Index(
            "idx_companies_name",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index("idx_companies_industry", "industry"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()")
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    website: Mapped[str | None] = mapped_column(String(500))
    industry: Mapped[str | None] = mapped_column(String(255))
    employee_count_band: Mapped[str | None] = mapped_column(String(50))
    revenue_band: Mapped[str | None] = mapped_column(String(50))
    location_city: Mapped[str | None] = mapped_column(String(255))
    location_state: Mapped[str | None] = mapped_column(String(255))
    location_country: Mapped[str | None] = mapped_column(String(255), server_default=text("'India'"))
    incorporation_date: Mapped[date | None] = mapped_column(Date)
    source: Mapped[str | None] = mapped_column(String(100))
    enrichment_status: Mapped[str] = mapped_column(String(20), server_default=text("'pending'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()")
    )

    raw_documents = relationship("RawDocument", back_populates="company", cascade="all, delete-orphan")
    nlp_features = relationship("NLPFeature", back_populates="company", cascade="all, delete-orphan")
    lead_scores = relationship(
        "LeadScore",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="LeadScore.scored_at.desc()",
    )
    crm_deals = relationship("CRMDeal", back_populates="company")
