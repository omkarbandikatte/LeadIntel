from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models.crm_sync_log import CRMSyncLog
from app.models.user import User
from app.schemas.crm import CRMSyncHistoryResponse, CRMSyncRequest, CRMSyncResponse
from app.services.crm.sync_service import pull_from_csv, push_to_csv

router = APIRouter(prefix="/api/crm", tags=["crm"])


@router.post("/sync", response_model=CRMSyncResponse)
def sync_crm(
    payload: CRMSyncRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> CRMSyncResponse:
    if payload.direction == "push":
        log_entry = push_to_csv(db)
    else:
        log_entry = pull_from_csv(db)

    return CRMSyncResponse(
        direction=log_entry.direction,
        record_count=log_entry.record_count or 0,
        status=log_entry.status,
        error_detail=log_entry.error_detail,
    )


@router.get("/sync/history", response_model=CRMSyncHistoryResponse)
def get_sync_history(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> CRMSyncHistoryResponse:
    entries = db.query(CRMSyncLog).order_by(CRMSyncLog.run_at.desc()).limit(100).all()
    return CRMSyncHistoryResponse(results=entries)
