import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class CRMDeal(Base):
    __tablename__ = "crm_deals"
    __table_args__ = (
        CheckConstraint(
            "service_line IN ('branding', 'hiring', 'learning_development', 'iac_partnership')",
            name="crm_deals_service_line_check",
        ),
        CheckConstraint("outcome IN ('won', 'lost', 'open')", name="crm_deals_outcome_check"),
        Index("idx_crm_deals_company", "company_id"),
        Index("idx_crm_deals_outcome", "outcome"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()")
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL")
    )
    deal_stage: Mapped[str | None] = mapped_column(String(50))
    service_line: Mapped[str | None] = mapped_column(String(50))
    deal_value: Mapped[float | None] = mapped_column(Numeric(14, 2))
    outcome: Mapped[str | None] = mapped_column(String(20))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    company = relationship("Company", back_populates="crm_deals")
