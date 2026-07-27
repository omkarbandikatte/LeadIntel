import logging
from typing import Any

import joblib
import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.company import Company
from app.models.lead_score import LeadScore
from app.services.scoring import rules_engine
from app.services.scoring.features import FEATURE_NAMES, build_feature_vector
from app.services.scoring.rules_engine import ScoringResult

logger = logging.getLogger(__name__)
settings = get_settings()

_artifact_cache: dict[str, Any] = {}


def _load_artifact() -> dict[str, Any] | None:
    """Load the trained V2 model artifact if one exists on disk.

    The artifact is produced by ml/training/train_scoring_model.py and is a
    dict of {"model": <sklearn/XGBoost estimator>, "model_version": str}.
    """
    path = settings.resolve_path(settings.SCORING_MODEL_ARTIFACT_PATH)
    if not path.exists():
        return None

    cached_path = _artifact_cache.get("path")
    if cached_path != str(path):
        _artifact_cache["artifact"] = joblib.load(path)
        _artifact_cache["path"] = str(path)
    return _artifact_cache["artifact"]


def score_company(db: Session, company: Company) -> tuple[ScoringResult, str]:
    """Score via the trained ML model if one exists, else the V1 rules engine.

    Per 01_TECHNICAL_ARCHITECTURE.md §2.4: "V2 (supervised classifier) replaces
    the V1 rules-based scorer as data volume grows." Explanation factors always
    come from the rules engine's transparent scoring, since this project's
    approved ML stack (scikit-learn / XGBoost / LightGBM per 01 §3) doesn't
    include SHAP — the rule factors double as the human-readable explanation
    for the ML-predicted probability.
    """
    rules_result = rules_engine.score_company(db, company)

    artifact = _load_artifact()
    if artifact is None:
        return rules_result, rules_engine.MODEL_VERSION

    model = artifact["model"]
    feature_vector = build_feature_vector(db, company, rules_result)
    # A DataFrame with matching column names, not a plain list — the model was
    # trained on a named DataFrame (ml/training/train_scoring_model.py) and
    # warns about missing feature names otherwise.
    features_df = pd.DataFrame([feature_vector], columns=FEATURE_NAMES)

    try:
        probability = float(model.predict_proba(features_df)[0][1]) * 100
    except Exception:
        logger.exception("ML scoring failed for company %s — falling back to rules engine", company.id)
        return rules_result, rules_engine.MODEL_VERSION

    ml_result = ScoringResult(
        fit_score=rules_result.fit_score,
        intent_score=rules_result.intent_score,
        conversion_probability=round(probability, 2),
        recommended_service=rules_result.recommended_service,
        recommendation_confidence=rules_result.recommendation_confidence,
        top_factors=rules_result.top_factors,
    )
    return ml_result, artifact["model_version"]


def score_and_persist(db: Session, company: Company) -> LeadScore:
    result, model_version = score_company(db, company)
    return rules_engine.persist_score(db, company, result, model_version=model_version)
