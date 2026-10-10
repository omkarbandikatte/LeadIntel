import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Signal(Base):
    """A single structured business signal detected from scraped text.

    Part of the Business Signal Engine: unlike nlp_features.extracted_entities
    (a free-form JSONB blob), each row here is one typed, directional,
    timestamped event (e.g. "hiring" / positive / 0.75 confidence) so it can
    be decay-weighted and rendered as a timeline.
    """

    __tablename__ = "signals"
    __table_args__ = (
        CheckConstraint(
            "signal_type IN ('hiring', 'expansion', 'funding', 'technology_adoption', "
            "'leadership_change', 'layoffs', 'hiring_freeze')",
            name="signals_signal_type_check",
        ),
        CheckConstraint("direction IN ('positive', 'negative')", name="signals_direction_check"),
        Index("idx_signals_company", "company_id"),
        Index("idx_signals_detected_at", text("detected_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()")
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE")
    )
    raw_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_documents.id", ondelete="SET NULL")
    )
    signal_type: Mapped[str] = mapped_column(String(50), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    headline: Mapped[str | None] = mapped_column(Text)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    company = relationship("Company", back_populates="signals")
    raw_document = relationship("RawDocument")
