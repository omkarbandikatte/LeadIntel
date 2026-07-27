import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class RawDocument(Base):
    __tablename__ = "raw_documents"
    __table_args__ = (
        CheckConstraint(
            "doc_type IN ('job_posting', 'company_about', 'news_mention', 'press_release')",
            name="raw_documents_doc_type_check",
        ),
        Index("idx_raw_documents_company", "company_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()")
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE")
    )
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1000))
    raw_text: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    company = relationship("Company", back_populates="raw_documents")
    nlp_features = relationship("NLPFeature", back_populates="raw_document", cascade="all, delete-orphan")
