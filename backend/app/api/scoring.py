import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status

from app.api.deps import require_admin
from app.core.config import get_settings
from app.models.user import User
from app.schemas.scoring import ModelReportResponse, ScoringRunRequest, ScoringRunResponse
from app.services.scoring import rules_engine
from app.worker import score_all_companies_task

router = APIRouter(prefix="/api/scoring", tags=["scoring"])
settings = get_settings()


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


@router.get("/model-report", response_model=ModelReportResponse | None)
def get_model_report(
    _: User = Depends(require_admin),
) -> ModelReportResponse | None:
    """Latest V2 training report, including Precision@K / Lift@K ranking metrics.

    Reads ml/artifacts/training_report.json (written by
    ml/training/train_scoring_model.py) rather than recomputing — training is
    an offline/Celery job, this endpoint just surfaces its last result for the
    Admin UI's "evaluate the model" view. Returns null if no model has been
    trained yet (cold-start, rules_v1-only).
    """
    report_path = settings.resolve_path("./ml/artifacts/training_report.json")
    if not report_path.exists():
        return None
    return ModelReportResponse(**json.loads(report_path.read_text()))
