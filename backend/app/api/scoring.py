from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status

from app.api.deps import require_admin
from app.models.user import User
from app.schemas.scoring import ScoringRunRequest, ScoringRunResponse
from app.services.scoring import rules_engine
from app.worker import score_all_companies_task

router = APIRouter(prefix="/api/scoring", tags=["scoring"])


@router.post("/run", response_model=ScoringRunResponse, status_code=status.HTTP_202_ACCEPTED)
def run_scoring(
    payload: ScoringRunRequest,
    _: User = Depends(require_admin),
) -> ScoringRunResponse:
    """Trigger a full or incremental scoring batch, per 03_API_SPECIFICATION.md.

    Runs async via Celery (consistent with how enrichment runs) and returns
    202 immediately; poll GET /api/leads for updated scores once the batch
    completes.
    """
    async_result = score_all_companies_task.delay(payload.mode)

    return ScoringRunResponse(
        mode=payload.mode,
        task_id=async_result.id,
        model_version=rules_engine.MODEL_VERSION,
        queued_at=datetime.now(UTC),
    )
