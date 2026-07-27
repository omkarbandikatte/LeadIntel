"""Train the V2 supervised lead-scoring classifier.

Per 01_TECHNICAL_ARCHITECTURE.md §2.4: "V2: supervised classifier
(scikit-learn logistic regression -> XGBoost/LightGBM as data volume grows)
trained on historical CRM won/lost labels." This script trains both a
logistic-regression baseline and an XGBoost model, cross-validates,
hyperparameter-searches, evaluates on a held-out split, and saves whichever
model has the higher ROC AUC as the artifact app/services/scoring/ml_scorer.py
loads at inference time.

Run with (from backend/ with its venv active):
    python ../ml/training/train_scoring_model.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from xgboost import XGBClassifier

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.crm_deal import CRMDeal  # noqa: E402
from app.services.scoring.features import FEATURE_NAMES, build_feature_vector  # noqa: E402
from app.services.scoring.rules_engine import score_company  # noqa: E402

settings = get_settings()
ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"

RANDOM_STATE = 42


def load_training_data() -> pd.DataFrame:
    """Build one training row per company with a closed (won/lost) CRM deal.

    Uses the same feature pipeline (rules_engine + features.build_feature_vector)
    that ml_scorer.py uses at inference time, so training and serving stay
    consistent.
    """
    db = SessionLocal()
    try:
        closed_deals = db.query(CRMDeal).filter(CRMDeal.outcome.in_(["won", "lost"])).all()

        rows: list[dict] = []
        seen_companies: set = set()
        for deal in closed_deals:
            if deal.company_id is None or deal.company_id in seen_companies:
                continue
            seen_companies.add(deal.company_id)

            company = deal.company
            if company is None:
                continue

            rules_result = score_company(db, company)
            feature_vector = build_feature_vector(db, company, rules_result)
            feature_vector["label"] = 1 if deal.outcome == "won" else 0
            rows.append(feature_vector)

        return pd.DataFrame(rows)
    finally:
        db.close()


def _evaluate(model, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]
    return {
        "accuracy": round(accuracy_score(y_test, predictions), 4),
        "precision": round(precision_score(y_test, predictions, zero_division=0), 4),
        "recall": round(recall_score(y_test, predictions, zero_division=0), 4),
        "f1_score": round(f1_score(y_test, predictions, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(y_test, probabilities), 4),
    }


def train() -> dict:
    data = load_training_data()
    if len(data) < 20:
        raise RuntimeError(
            f"Only {len(data)} labeled companies found (need at least 20). "
            "Run `python ../ml/training/generate_fixture_dataset.py` first, or "
            "wait for real crm_deals history via CRM sync pull."
        )

    X = data[FEATURE_NAMES]
    y = data["label"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    # --- Logistic regression baseline ---
    logistic_search = GridSearchCV(
        LogisticRegression(max_iter=1000, random_state=RANDOM_STATE),
        param_grid={"C": [0.01, 0.1, 1.0, 10.0]},
        scoring="roc_auc",
        cv=cv,
    )
    logistic_search.fit(X_train, y_train)
    logistic_metrics = _evaluate(logistic_search.best_estimator_, X_test, y_test)

    # --- XGBoost ---
    xgb_search = GridSearchCV(
        XGBClassifier(
            eval_metric="logloss",
            random_state=RANDOM_STATE,
        ),
        param_grid={
            "n_estimators": [100, 200],
            "max_depth": [3, 5],
            "learning_rate": [0.05, 0.1],
        },
        scoring="roc_auc",
        cv=cv,
    )
    xgb_search.fit(X_train, y_train)
    xgb_metrics = _evaluate(xgb_search.best_estimator_, X_test, y_test)

    candidates = [
        ("logreg_v2", logistic_search.best_estimator_, logistic_metrics, logistic_search.best_params_),
        ("xgb_v2", xgb_search.best_estimator_, xgb_metrics, xgb_search.best_params_),
    ]
    best_name, best_model, best_metrics, best_params = max(candidates, key=lambda c: c[2]["roc_auc"])

    model_version = f"{best_name}_{datetime.now(timezone.utc):%Y-%m-%d}"

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = settings.resolve_path(settings.SCORING_MODEL_ARTIFACT_PATH)
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {"model": best_model, "model_version": model_version, "feature_names": FEATURE_NAMES},
        artifact_path,
    )

    report = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_rows": len(data),
        "selected_model": best_name,
        "model_version": model_version,
        "best_params": best_params,
        "candidates": {
            "logreg_v2": logistic_metrics,
            "xgb_v2": xgb_metrics,
        },
        "feature_importance": (
            dict(zip(FEATURE_NAMES, np.round(best_model.feature_importances_, 4).tolist()))
            if hasattr(best_model, "feature_importances_")
            else None
        ),
    }
    report_path = ARTIFACTS_DIR / "training_report.json"
    report_path.write_text(json.dumps(report, indent=2))

    print(f"Selected {best_name} (ROC AUC {best_metrics['roc_auc']}) — artifact written to {artifact_path}")
    print(f"Full report written to {report_path}")
    return report


if __name__ == "__main__":
    train()
