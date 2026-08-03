import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class LeadScore(Base):
    __tablename__ = "lead_scores"
    __table_args__ = (
        CheckConstraint(
            "recommended_service IN ('branding', 'hiring', 'learning_development', 'iac_partnership')",
            name="lead_scores_recommended_service_check",
        ),
        Index("idx_lead_scores_company", "company_id"),
        Index("idx_lead_scores_probability", text("conversion_probability DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()")
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE")
    )
    fit_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    intent_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    conversion_probability: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    recommended_service: Mapped[str | None] = mapped_column(String(50))
    recommendation_confidence: Mapped[float | None] = mapped_column(Numeric(5, 4))
    top_factors: Mapped[list | None] = mapped_column(JSONB)
    service_probabilities: Mapped[dict | None] = mapped_column(JSONB)
    model_version: Mapped[str | None] = mapped_column(String(50))
    scored_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    company = relationship("Company", back_populates="lead_scores")
    feedback_entries = relationship("Feedback", back_populates="lead_score", cascade="all, delete-orphan")
