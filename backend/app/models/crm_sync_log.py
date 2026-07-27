import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class CRMSyncLog(Base):
    __tablename__ = "crm_sync_log"
    __table_args__ = (
        CheckConstraint("direction IN ('push', 'pull')", name="crm_sync_log_direction_check"),
        CheckConstraint("status IN ('success', 'failed', 'partial')", name="crm_sync_log_status_check"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()")
    )
    direction: Mapped[str | None] = mapped_column(String(10))
    record_count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String(20))
    error_detail: Mapped[str | None] = mapped_column(Text)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
