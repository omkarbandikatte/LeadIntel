import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import require_any_role
from app.db.session import get_db
from app.models.company import Company
from app.models.enums import EnrichmentStatus
from app.models.raw_document import RawDocument
from app.models.user import User
from app.schemas.company import (
    BulkUploadResponse,
    BulkUploadRowError,
    CompanyCreateRequest,
    CompanyDetailResponse,
    CompanyListResponse,
    CompanyResponse,
    EnrichTriggerResponse,
    RawDocumentResponse,
)
from app.worker import enrich_company_task

router = APIRouter(prefix="/api/companies", tags=["companies"])


def _get_company_or_404(db: Session, company_id: uuid.UUID) -> Company:
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "COMPANY_NOT_FOUND", "message": "No company with this id exists."}},
        )
    return company


@router.get("", response_model=CompanyListResponse)
def list_companies(
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_role),
) -> CompanyListResponse:
    q = db.query(Company)
    if search:
        q = q.filter(Company.name.ilike(f"%{search}%"))
    total = q.count()
    results = q.order_by(Company.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return CompanyListResponse(total=total, page=page, page_size=page_size, results=results)


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_role),
) -> Company:
    company = Company(name=payload.name, website=payload.website, industry=payload.industry)
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.post("/bulk-upload", response_model=BulkUploadResponse)
def bulk_upload_companies(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_role),
) -> BulkUploadResponse:
    raw = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))

    accepted = 0
    errors: list[BulkUploadRowError] = []

    for row_number, row in enumerate(reader, start=2):  # header is row 1
        name = (row.get("name") or "").strip()
        if not name:
            errors.append(BulkUploadRowError(row=row_number, reason="Missing required field 'name'"))
            continue

        company = Company(
            name=name,
            website=(row.get("website") or "").strip() or None,
            industry=(row.get("industry") or "").strip() or None,
        )
        db.add(company)
        accepted += 1

    db.commit()
    return BulkUploadResponse(accepted=accepted, rejected=len(errors), errors=errors)


@router.get("/{company_id}", response_model=CompanyDetailResponse)
def get_company(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_role),
) -> Company:
    company = _get_company_or_404(db, company_id)
    company.latest_nlp_features = sorted(company.nlp_features, key=lambda f: f.processed_at, reverse=True)[
        :10
    ]
    return company


@router.post(
    "/{company_id}/enrich", response_model=EnrichTriggerResponse, status_code=status.HTTP_202_ACCEPTED
)
def trigger_enrichment(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_role),
) -> EnrichTriggerResponse:
    company = _get_company_or_404(db, company_id)
    company.enrichment_status = EnrichmentStatus.PENDING.value
    db.add(company)
    db.commit()

    enrich_company_task.delay(str(company.id))

    return EnrichTriggerResponse(company_id=company.id, enrichment_status=company.enrichment_status)


@router.get("/{company_id}/documents", response_model=list[RawDocumentResponse])
def list_company_documents(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_role),
) -> list[RawDocument]:
    _get_company_or_404(db, company_id)
    return (
        db.query(RawDocument)
        .filter(RawDocument.company_id == company_id)
        .order_by(RawDocument.scraped_at.desc())
        .all()
    )
