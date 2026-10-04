"""Standalone exploratory model for the new "B2B Lead Conversion Dataset (10K
Records)" (Kaggle, CC0, ayoubhannachi) saved at ml/training/data/
lead_conversion_dataset_10000.csv.

IMPORTANT — why this is a SEPARATE script, not a change to train_scoring_model.py:
This dataset's grain is one row per individual lead/demo engagement event
(web visits, session duration, email opens, live-demo ratings) with no
company identity and no firmographic fields at all. The production scorer
(train_scoring_model.py -> ml_scorer.py -> rules_engine.py) is built around
FEATURE_NAMES = [fit_score, intent_score, job_posting_count_14d, ...], all
derived from a company's industry/size/revenue + scraped documents. Forcing
this dataset into that schema would mean fabricating firmographic data that
doesn't exist in the source. Training a *different* feature set under the
same artifact path would silently break app/services/scoring/ml_scorer.py's
column-aligned inference. So this produces its own artifact
(engagement_model.joblib) and its own report (engagement_model_report.json)
— it does not touch or replace the production scoring_model.joblib.

Purpose: validate whether engagement-style signals (visits, session
duration, demo requests, ratings) are predictive of conversion at all — this
directly informs the Engagement Score component of the Opportunity Score
roadmap item, which currently only has a crude CRM deal-stage proxy
(rules_engine.py's _engagement_score). If this model performs well, it's
evidence that adding real web/product engagement tracking to the ingestion
pipeline would be worth the effort.

Run with (from backend/ with its venv active):
    python ../ml/training/train_engagement_model.py
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_scoring_model import _ranking_metrics  # noqa: E402

DATA_PATH = Path(__file__).resolve().parent / "data" / "lead_conversion_dataset_10000.csv"
ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"
RANDOM_STATE = 42

NUMERIC_FEATURES = [
    "Email_Valid",
    "Email_Opens",
    "Opted_Out_Email",
    "Do_Not_Call",
    "Tel_Valid",
    "Total_Visits",
    "Session_Duration",
    "Hour_of_Day",
    "Day_of_Week",
    "Live_Demo_Requested",
    "App_Rating",
    "Demo_Rating",
    "Company_Valid",
]


def load_training_data() -> tuple[pd.DataFrame, list[str]]:
    """Load the CSV and one-hot encode Product_Name into the feature set.

    Free-text columns (App_Opinion, Demo_Opinion) and the raw Session_Start
    timestamp are dropped — Hour_of_Day/Day_of_Week already extract the
    useful signal from the timestamp, and the opinion text would need its
    own NLP pipeline (out of scope for this first pass).
    """
    df = pd.read_csv(DATA_PATH)
    product_dummies = pd.get_dummies(df["Product_Name"], prefix="product", dtype=float)
    feature_names = NUMERIC_FEATURES + list(product_dummies.columns)
    features = pd.concat([df[NUMERIC_FEATURES].astype(float), product_dummies], axis=1)
    features["label"] = df["Is_Converted"]
    return features, feature_names


def _evaluate(model, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]
    return {
        "accuracy": round(accuracy_score(y_test, predictions), 4),
        "precision": round(precision_score(y_test, predictions, zero_division=0), 4),
        "recall": round(recall_score(y_test, predictions, zero_division=0), 4),
        "f1_score": round(f1_score(y_test, predictions, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(y_test, probabilities), 4),
        "ranking_metrics": _ranking_metrics(y_test, probabilities, k_values=(50, 100, 200)),
    }


def train() -> dict:
    data, feature_names = load_training_data()
    X = data[feature_names]
    y = data["label"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    neg_count = int((y_train == 0).sum())
    pos_count = int((y_train == 1).sum())
    scale_pos_weight = neg_count / pos_count if pos_count > 0 else 1.0

    logistic_search = GridSearchCV(
        LogisticRegression(max_iter=1000, random_state=RANDOM_STATE, class_weight="balanced"),
        param_grid={"C": [0.01, 0.1, 1.0, 10.0]},
        scoring="roc_auc",
        cv=cv,
    )
    logistic_search.fit(X_train, y_train)
    logistic_metrics = _evaluate(logistic_search.best_estimator_, X_test, y_test)

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
        ("logreg_engagement", logistic_search.best_estimator_, logistic_metrics, logistic_search.best_params_),
        ("xgb_engagement", xgb_search.best_estimator_, xgb_metrics, xgb_search.best_params_),
    ]
    best_name, best_model, best_metrics, best_params = max(candidates, key=lambda c: c[2]["roc_auc"])
    model_version = f"{best_name}_{datetime.now(timezone.utc):%Y-%m-%d}"

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = ARTIFACTS_DIR / "engagement_model.joblib"
    joblib.dump(
        {"model": best_model, "model_version": model_version, "feature_names": feature_names},
        artifact_path,
    )

    report = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_rows": len(data),
        "data_source": str(DATA_PATH.relative_to(DATA_PATH.parents[2])),
        "selected_model": best_name,
        "model_version": model_version,
        "best_params": best_params,
        "candidates": {
            "logreg_engagement": logistic_metrics,
            "xgb_engagement": xgb_metrics,
        },
        "feature_importance": (
            dict(zip(feature_names, np.round(best_model.feature_importances_, 4).tolist()))
            if hasattr(best_model, "feature_importances_")
            else None
        ),
    }
    report_path = ARTIFACTS_DIR / "engagement_model_report.json"
    report_path.write_text(json.dumps(report, indent=2))

    print(f"Selected {best_name} (ROC AUC {best_metrics['roc_auc']}) — artifact written to {artifact_path}")
    print(f"Full report written to {report_path}")
    return report


if __name__ == "__main__":
    train()
