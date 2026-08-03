"""Load the Kaggle CRM Sales Opportunities dataset into the LeadIntel database.

Replaces generate_fixture_dataset.py as the fixture seeder for local dev and
ML model training.  The raw CSVs (accounts.csv, sales_pipeline.csv, etc.) live
in ml/training/data/ and are committed to the repo.

Source: https://www.kaggle.com/datasets/innocentmfa/crm-sales-opportunities
Files used: accounts.csv (85 companies), sales_pipeline.csv (8,800 deals)

What gets loaded
----------------
- 85 Company rows from accounts.csv  (real sector / employee / revenue data)
- job_posting RawDocument for companies with >500 employees
- press_release RawDocument for companies with revenue >500 M USD
- NLPFeature per company derived from sector + product → service-line mapping
- All 8,800 CRMDeal rows (Won → "won", Lost → "lost", rest → "open")

Training note
-------------
train_scoring_model.py de-duplicates by company_id, so 85 training rows are
produced.  That is intentional: each row represents a *unique real company*
rather than repeating the same feature vector for every deal.  The model
quality will improve as real deals accumulate from the live CRM sync.

Run (from backend/ with its venv active):
    python ../ml/training/load_real_fixture_dataset.py

    # Point at a different data directory:
    python ../ml/training/load_real_fixture_dataset.py --data-dir /path/to/csvs

    # Wipe existing real-dataset rows before reloading:
    python ../ml/training/load_real_fixture_dataset.py --reset
"""

import argparse
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.db.session import SessionLocal  # noqa: E402
from app.models.company import Company  # noqa: E402
from app.models.crm_deal import CRMDeal  # noqa: E402
from app.models.enums import ServiceLine  # noqa: E402
from app.models.nlp_feature import NLPFeature  # noqa: E402
from app.models.raw_document import RawDocument  # noqa: E402

DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "data"

SOURCE_TAG = "crm_kaggle_dataset"

# ---------------------------------------------------------------------------
# Mapping tables
# ---------------------------------------------------------------------------

# Sector (from accounts.csv) → industry string that matches rules_engine.py
SECTOR_TO_INDUSTRY: dict[str, str] = {
    "software": "SaaS",
    "technolgy": "Information Technology",   # intentional typo in source data
    "technology": "Information Technology",
    "finance": "Fintech",
    "medical": "Healthcare",
    "retail": "Retail",
    "marketing": "Branding",
    "employment": "IT Services",
    "entertainment": "Media",
    "telecommunications": "IT Services",
    "services": "IT Services",
}

# Product (from sales_pipeline.csv) → ServiceLine
PRODUCT_TO_SERVICE_LINE: dict[str, str] = {
    "GTX Basic": ServiceLine.BRANDING.value,
    "GTX Pro": ServiceLine.BRANDING.value,
    "GTX Plus Basic": ServiceLine.BRANDING.value,
    "GTX Plus Pro": ServiceLine.IAC_PARTNERSHIP.value,
    "GTK 500": ServiceLine.IAC_PARTNERSHIP.value,
    "MG Special": ServiceLine.HIRING.value,
    "MG Advanced": ServiceLine.LEARNING_DEVELOPMENT.value,
}

# Sector fallback → ServiceLine (used when product mapping is unknown)
SECTOR_TO_SERVICE_LINE: dict[str, str] = {
    "software": ServiceLine.HIRING.value,
    "technolgy": ServiceLine.BRANDING.value,
    "technology": ServiceLine.BRANDING.value,
    "finance": ServiceLine.IAC_PARTNERSHIP.value,
    "medical": ServiceLine.LEARNING_DEVELOPMENT.value,
    "retail": ServiceLine.BRANDING.value,
    "marketing": ServiceLine.BRANDING.value,
    "employment": ServiceLine.HIRING.value,
    "entertainment": ServiceLine.BRANDING.value,
    "telecommunications": ServiceLine.IAC_PARTNERSHIP.value,
    "services": ServiceLine.LEARNING_DEVELOPMENT.value,
}


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _employee_band(n: int) -> str:
    if n <= 10:
        return "1-10"
    if n <= 50:
        return "11-50"
    if n <= 200:
        return "51-200"
    if n <= 1000:
        return "201-1000"
    return "1000+"


def _revenue_band(revenue_m_usd: float) -> str:
    """Convert millions-USD to INR-crore bucket (1 M USD ≈ 8.3 Cr INR)."""
    cr_inr = revenue_m_usd * 8.3
    if cr_inr < 1:
        return "<1cr"
    if cr_inr < 10:
        return "1cr-10cr"
    if cr_inr < 50:
        return "10cr-50cr"
    if cr_inr < 250:
        return "50cr-250cr"
    return "250cr+"


def _parse_date(s: str) -> datetime | None:
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            continue
    return None


def _safe_float(s: str) -> float:
    try:
        return float(s.strip()) if s and s.strip() else 0.0
    except ValueError:
        return 0.0


def _safe_int(s: str) -> int:
    try:
        return int(float(s.strip())) if s and s.strip() else 0
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Main loader
# ---------------------------------------------------------------------------

def load(data_dir: Path, reset: bool = False) -> None:
    accounts_path = data_dir / "accounts.csv"
    pipeline_path = data_dir / "sales_pipeline.csv"

    if not accounts_path.exists() or not pipeline_path.exists():
        sys.exit(
            f"ERROR: CSVs not found in {data_dir}. "
            "Run from backend/ and ensure ml/training/data/ contains the dataset files."
        )

    # -----------------------------------------------------------------------
    # Pre-read pipeline to know the first product sold per account
    # (used to pick the best service-line mapping for the NLPFeature row)
    # -----------------------------------------------------------------------
    pipeline_rows: list[dict] = []
    account_first_product: dict[str, str] = {}
    with open(pipeline_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            pipeline_rows.append(row)
            acc = row["account"]
            if acc not in account_first_product:
                account_first_product[acc] = row.get("product", "")

    # -----------------------------------------------------------------------
    # Read accounts
    # -----------------------------------------------------------------------
    accounts: dict[str, dict] = {}
    with open(accounts_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            accounts[row["account"]] = row

    db = SessionLocal()
    try:
        if reset:
            removed = (
                db.query(Company)
                .filter(Company.source == SOURCE_TAG)
                .count()
            )
            db.query(Company).filter(Company.source == SOURCE_TAG).delete(
                synchronize_session="fetch"
            )
            db.commit()
            print(f"Removed {removed} existing companies with source='{SOURCE_TAG}'.")

        # -------------------------------------------------------------------
        # Insert companies + related documents / NLP features
        # -------------------------------------------------------------------
        company_map: dict[str, Company] = {}

        for account_name, acct in accounts.items():
            sector = acct.get("sector", "").strip().lower()
            employees = _safe_int(acct.get("employees", ""))
            revenue_m = _safe_float(acct.get("revenue", ""))

            # Activity-signal heuristics
            # employees > 500  →  actively hiring (large org)
            # revenue > 500 M USD  →  newsworthy / press coverage likely
            has_job_postings = employees > 500
            has_press = revenue_m > 500.0

            company = Company(
                name=account_name,
                website=f"https://{account_name.lower().replace(' ', '-')}.com",
                industry=SECTOR_TO_INDUSTRY.get(sector, sector.title() if sector else None),
                employee_count_band=_employee_band(employees) if employees else None,
                revenue_band=_revenue_band(revenue_m) if revenue_m else None,
                location_country=acct.get("office_location", "").strip() or None,
                enrichment_status="enriched",
                source=SOURCE_TAG,
            )
            db.add(company)
            db.flush()
            company_map[account_name] = company

            # Job posting document
            if has_job_postings:
                db.add(
                    RawDocument(
                        company_id=company.id,
                        doc_type="job_posting",
                        source_url=f"{company.website}/careers",
                        raw_text=(
                            f"{account_name} is hiring across multiple departments. "
                            f"The company employs {employees:,} people globally."
                        ),
                        content_hash=f"real-job-{company.id}",
                    )
                )

            # Press release document
            if has_press:
                db.add(
                    RawDocument(
                        company_id=company.id,
                        doc_type="press_release",
                        raw_text=(
                            f"{account_name} reports strong results with annual revenue of "
                            f"${revenue_m:.0f}M and announces expansion plans."
                        ),
                        content_hash=f"real-press-{company.id}",
                    )
                )

            # Company-about document + NLPFeature
            product = account_first_product.get(account_name, "")
            service_line = PRODUCT_TO_SERVICE_LINE.get(
                product,
                SECTOR_TO_SERVICE_LINE.get(sector, ServiceLine.BRANDING.value),
            )

            about_doc = RawDocument(
                company_id=company.id,
                doc_type="company_about",
                raw_text=(
                    f"{account_name} is a {sector} company established in "
                    f"{acct.get('year_established', 'N/A')} with {employees:,} employees."
                ),
                content_hash=f"real-about-{company.id}",
            )
            db.add(about_doc)
            db.flush()

            db.add(
                NLPFeature(
                    company_id=company.id,
                    raw_document_id=about_doc.id,
                    predicted_need_category=service_line,
                    confidence=0.78,
                    extracted_entities={
                        "entities": [{"text": account_name, "label": "ORG"}],
                        "noun_phrases": [sector],
                        "growth_signals": ["hiring"] if has_job_postings else [],
                    },
                )
            )

        # -------------------------------------------------------------------
        # Insert pipeline deals
        # -------------------------------------------------------------------
        n_skipped = 0
        for row in pipeline_rows:
            account_name = row["account"]
            company = company_map.get(account_name)
            if company is None:
                # Deal references an account not in accounts.csv — skip
                n_skipped += 1
                continue

            stage_raw = row.get("deal_stage", "").strip()
            if stage_raw == "Won":
                outcome = "won"
            elif stage_raw == "Lost":
                outcome = "lost"
            else:
                outcome = "open"

            close_date = _parse_date(row.get("close_date", ""))
            deal_value = _safe_float(row.get("close_value", ""))

            product = row.get("product", "").strip()
            service_line = PRODUCT_TO_SERVICE_LINE.get(
                product,
                SECTOR_TO_SERVICE_LINE.get(
                    accounts.get(account_name, {}).get("sector", "").strip().lower(),
                    ServiceLine.BRANDING.value,
                ),
            )

            db.add(
                CRMDeal(
                    company_id=company.id,
                    deal_stage=stage_raw,
                    service_line=service_line,
                    deal_value=deal_value if deal_value else None,
                    outcome=outcome,
                    closed_at=close_date if outcome in ("won", "lost") else None,
                )
            )

        db.commit()

        n_won = sum(1 for r in pipeline_rows if r.get("deal_stage") == "Won")
        n_lost = sum(1 for r in pipeline_rows if r.get("deal_stage") == "Lost")
        n_open = len(pipeline_rows) - n_won - n_lost - n_skipped
        print(
            f"Loaded {len(company_map)} companies, "
            f"{n_won} won deals, {n_lost} lost deals, {n_open} open deals."
        )
        if n_skipped:
            print(f"Skipped {n_skipped} pipeline rows (account not in accounts.csv).")
        print(
            "\nTip: run `python ../ml/training/train_scoring_model.py` to retrain "
            "the V2 classifier on this real data."
        )

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help="Directory containing accounts.csv and sales_pipeline.csv (default: ml/training/data/)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete previously loaded real-dataset companies before reloading.",
    )
    args = parser.parse_args()
    load(args.data_dir, reset=args.reset)
