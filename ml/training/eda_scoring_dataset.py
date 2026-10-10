"""EDA on the V2 scoring-model training set — run before any retrain.

Profiles the exact population train_scoring_model.py's load_training_data()
builds (one row per company with closed deals), broken out by Company.source
("crm_kaggle_dataset" = 85 real companies, "fixture_dataset" = synthetic),
so data-quality issues hidden by pooling both sources together are visible.

Run with (from backend/ with its venv active):
    python ../ml/training/eda_scoring_dataset.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.db.session import SessionLocal  # noqa: E402
from app.models.company import Company  # noqa: E402
from app.models.crm_deal import CRMDeal  # noqa: E402
from app.services.scoring.features import FEATURE_NAMES, build_feature_vector  # noqa: E402
from app.services.scoring.rules_engine import score_company  # noqa: E402

pd.set_option("display.width", 140)
pd.set_option("display.max_columns", 20)


def load_tagged_data() -> pd.DataFrame:
    db = SessionLocal()
    try:
        closed_deals = db.query(CRMDeal).filter(CRMDeal.outcome.in_(["won", "lost"])).all()

        deals_by_company: dict = {}
        for deal in closed_deals:
            if deal.company_id is None or deal.company is None:
                continue
            deals_by_company.setdefault(deal.company_id, []).append(deal)

        win_rates = {
            cid: sum(1 for d in deals if d.outcome == "won") / len(deals)
            for cid, deals in deals_by_company.items()
        }

        cohorts: dict[str, list] = {}
        for cid, deals in deals_by_company.items():
            cohorts.setdefault(deals[0].company.source or "unknown", []).append(cid)

        labels: dict = {}
        for cohort_ids in cohorts.values():
            cohort_rates = {cid: win_rates[cid] for cid in cohort_ids}
            cohort_labels = {cid: (1 if rate >= 0.5 else 0) for cid, rate in cohort_rates.items()}
            if len(set(cohort_labels.values())) < 2:
                median = float(np.median(list(cohort_rates.values())))
                cohort_labels = {cid: (1 if rate >= median else 0) for cid, rate in cohort_rates.items()}
            labels.update(cohort_labels)

        rows: list[dict] = []
        for company_id, deals in deals_by_company.items():
            company = deals[0].company
            rules_result = score_company(db, company)
            feature_vector = build_feature_vector(db, company, rules_result)
            feature_vector.update(
                {
                    "company_id": str(company_id),
                    "source": company.source or "unknown",
                    "industry": company.industry,
                    "employee_count_band": company.employee_count_band,
                    "n_deals": len(deals),
                    "win_rate": win_rates[company_id],
                    "label": labels[company_id],
                }
            )
            rows.append(feature_vector)
        return pd.DataFrame(rows)
    finally:
        db.close()


def main() -> None:
    df = load_tagged_data()
    print(f"\n=== Dataset shape: {df.shape} ===")
    print(df["source"].value_counts(dropna=False))

    print("\n=== Label balance overall ===")
    print(df["label"].value_counts(normalize=True).round(3))

    print("\n=== Label balance by source ===")
    print(df.groupby("source")["label"].value_counts(normalize=True).round(3))

    print("\n=== win_rate distribution by source (the raw signal labels are derived from) ===")
    print(df.groupby("source")["win_rate"].describe().round(3))

    print("\n=== Missing values ===")
    print(df[FEATURE_NAMES].isna().sum())

    print("\n=== Duplicate feature vectors (exact dupes across all 9 features) ===")
    dupe_mask = df.duplicated(subset=FEATURE_NAMES, keep=False)
    print(f"{dupe_mask.sum()} / {len(df)} rows share an identical feature vector with >=1 other row")
    if dupe_mask.any():
        print(
            df.loc[dupe_mask, ["source", "label"] + FEATURE_NAMES]
            .groupby(FEATURE_NAMES, dropna=False)["label"]
            .agg(["count", "nunique"])
            .sort_values("count", ascending=False)
            .head(10)
        )

    print("\n=== Feature stats by source (mean) ===")
    print(df.groupby("source")[FEATURE_NAMES].mean().round(3).T)

    print("\n=== Per-source separability (naive): correlation of each feature with label ===")
    for src, group in df.groupby("source"):
        corrs = group[FEATURE_NAMES].apply(lambda col: col.corr(group["label"]))
        print(f"-- {src} (n={len(group)}) --")
        print(corrs.round(3).sort_values(key=lambda s: s.abs(), ascending=False))

    print("\n=== industry x source cross-tab ===")
    print(pd.crosstab(df["industry"], df["source"]))

    out_path = Path(__file__).resolve().parents[1] / "artifacts" / "eda_scoring_dataset_snapshot.csv"
    df.to_csv(out_path, index=False)
    print(f"\nFull tagged dataset written to {out_path}")


if __name__ == "__main__":
    main()
