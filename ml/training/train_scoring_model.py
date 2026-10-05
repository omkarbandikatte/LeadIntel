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

import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

# scipy ≥1.11 dropped the internal `iprint` kwarg that sklearn's lbfgs wrapper
# passes to optimize.minimize — the OptimizeWarning is cosmetic (lbfgs still
# converges correctly), so we suppress it here rather than swapping solvers.
warnings.filterwarnings("ignore", message="Unknown solver options: iprint")
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
    """Build one training row per company, labelled by majority deal outcome
    (win_rate >= 0.5), falling back to a median split only if that collapses
    to a single class.

    IMPORTANT — three iterations of debugging landed on this approach (2026-10-04):

    1. The original version emitted one row per *deal* (~6,700 rows with the
       Kaggle dataset). Verified empirically that all 85 companies in the
       loaded Kaggle CRM data have BOTH won and lost deals, so every company
       contributed contradictory labels against an *identical* company-level
       feature vector (features don't vary per-deal) — unlearnable. Trained
       to ROC AUC ~0.50 (coin-flip) on both logreg_v2 and xgb_v2.

    2. One row per company with an absolute majority-vote label (win_rate >=
       0.5) also failed on the Kaggle-only data: every one of those 85
       companies' per-company win rate falls in [0.53, 0.75] (clusters around
       a ~63% global rate, nothing below 50%), so the absolute threshold
       produced a single-class target and sklearn refused to fit.

    3. A population-median split fixed that, but turned out to be fragile to
       dataset composition: once the (single-deal-per-company, genuinely
       binary 0%/100%) synthetic fixture data was mixed in alongside the
       noisy-but-real Kaggle companies, the combined median landed on 0.0
       (most fixture companies lost), which made the median split degenerate
       back to all-positive — the opposite failure of step 2.

    4. (2026-10-06 EDA finding, see ml/training/eda_scoring_dataset.py) Step
       3's *global* majority-vote threshold (win_rate >= 0.5) quietly
       reintroduced step 2's exact bug for the real Kaggle cohort specifically:
       since every one of the 85 Kaggle companies' win rate already sits in
       [0.53, 0.75], the global 0.5 cutoff labels **100% of them positive**
       regardless of their win rate *relative to each other* — the model
       never sees a single real negative example, so real-company label
       variance is zero (confirmed: per-source correlation of every feature
       with label is NaN for the Kaggle cohort, i.e. zero variance). All of
       the model's actual learned signal comes from the synthetic fixture
       rows; the real rows just dilute the training set with noise.
       Fix: apply the majority-vote/median-fallback logic *per source cohort*
       instead of globally, so each population (real vs. synthetic, or any
       future data source) is labeled relative to its own distribution.
    """
    db = SessionLocal()
    try:
        closed_deals = db.query(CRMDeal).filter(CRMDeal.outcome.in_(["won", "lost"])).all()

        deals_by_company: dict = {}
        for deal in closed_deals:
            if deal.company_id is None or deal.company is None:
                continue
            deals_by_company.setdefault(deal.company_id, []).append(deal)

        win_rates = {
            company_id: sum(1 for d in deals if d.outcome == "won") / len(deals)
            for company_id, deals in deals_by_company.items()
        }

        cohorts: dict[str, list] = {}
        for company_id, deals in deals_by_company.items():
            cohorts.setdefault(deals[0].company.source or "unknown", []).append(company_id)

        labels: dict = {}
        for cohort_ids in cohorts.values():
            cohort_rates = {cid: win_rates[cid] for cid in cohort_ids}
            cohort_labels = {cid: (1 if rate >= 0.5 else 0) for cid, rate in cohort_rates.items()}
            if len(set(cohort_labels.values())) < 2:
                median_win_rate = float(np.median(list(cohort_rates.values())))
                cohort_labels = {cid: (1 if rate >= median_win_rate else 0) for cid, rate in cohort_rates.items()}
            labels.update(cohort_labels)

        rows: list[dict] = []
        # Sorted by company_id — the unordered CRMDeal query above can return
        # rows in a different physical scan order after any DB write (UPDATE/
        # VACUUM/etc.), which silently changes train_test_split's partition
        # even with a fixed random_state (it shuffles *positions*, not
        # company identities) — without this, reported metrics aren't
        # reproducible run-to-run despite RANDOM_STATE being fixed.
        for company_id, deals in sorted(deals_by_company.items(), key=lambda item: str(item[0])):
            company = deals[0].company
            rules_result = score_company(db, company)
            feature_vector = build_feature_vector(db, company, rules_result)
            feature_vector["label"] = labels[company_id]
            rows.append(feature_vector)

        return pd.DataFrame(rows)
    finally:
        db.close()


def _ranking_metrics(y_test: pd.Series, probabilities: np.ndarray, k_values: tuple[int, ...] = (10, 20, 50)) -> dict:
    """Precision@K and Lift@K — "if BD can only contact the top K leads, how
    many of them are actually worth it?" per the roadmap's ML-evaluation ask.

    Precision@K is threshold-independent ROC AUC's opposite number: it only
    cares about the ranking of the top K, which is exactly how a BD team
    actually consumes scored leads (a prioritized list, not a classifier
    cutoff). Lift@K expresses that as a multiple of the random baseline.
    """
    y = np.asarray(y_test)
    order = np.argsort(-probabilities)
    y_sorted = y[order]
    overall_rate = float(y.mean()) if len(y) else 0.0

    metrics: dict[str, float] = {}
    for k in k_values:
        k_clamped = min(k, len(y_sorted))
        if k_clamped == 0:
            continue
        precision_at_k = float(y_sorted[:k_clamped].mean())
        lift_at_k = round(precision_at_k / overall_rate, 4) if overall_rate > 0 else 0.0
        metrics[f"precision_at_{k}"] = round(precision_at_k, 4)
        metrics[f"lift_at_{k}"] = lift_at_k
    return metrics


def _evaluate(model, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]
    return {
        "accuracy": round(accuracy_score(y_test, predictions), 4),
        "precision": round(precision_score(y_test, predictions, zero_division=0), 4),
        "recall": round(recall_score(y_test, predictions, zero_division=0), 4),
        "f1_score": round(f1_score(y_test, predictions, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(y_test, probabilities), 4),
        "ranking_metrics": _ranking_metrics(y_test, probabilities),
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

    # Class imbalance: won deals are typically far fewer than lost.
    # LogisticRegression uses class_weight='balanced'; XGBoost uses scale_pos_weight.
    neg_count = int((y_train == 0).sum())
    pos_count = int((y_train == 1).sum())
    scale_pos_weight = neg_count / pos_count if pos_count > 0 else 1.0

    # --- Logistic regression baseline ---
    logistic_search = GridSearchCV(
        LogisticRegression(max_iter=1000, random_state=RANDOM_STATE, class_weight="balanced"),
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
            scale_pos_weight=scale_pos_weight,
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
