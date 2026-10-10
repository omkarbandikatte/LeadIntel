from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.organization import Organization, ServiceOffering
from app.models.user import User
from app.schemas.organization import OrganizationResponse, OrganizationSignupRequest, OrganizationSignupResponse

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.post("/signup", response_model=OrganizationSignupResponse, status_code=status.HTTP_201_CREATED)
def signup_organization(payload: OrganizationSignupRequest, db: Session = Depends(get_db)) -> OrganizationSignupResponse:
    """Onboard a brand-new tenant: any company can describe itself and its own
    service catalog here, instead of the platform being hardcoded to Cloud
    Counselage's 4 service lines. Creates the Organization, its
    ServiceOfferings, and its first (admin) user, then logs that user in.
    """
    existing = db.query(User).filter(User.email == payload.admin_email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "EMAIL_ALREADY_REGISTERED",
                    "message": "A user with this email already exists.",
                }
            },
        )

    seen_keys: set[str] = set()
    for offering in payload.service_offerings:
        if offering.key in seen_keys:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": {
                        "code": "DUPLICATE_SERVICE_OFFERING",
                        "message": f"Service offering key '{offering.key}' is listed more than once.",
                    }
                },
            )
        seen_keys.add(offering.key)

    organization = Organization(
        name=payload.organization_name,
        industry=payload.industry,
        employee_count_band=payload.employee_count_band,
        website=payload.website,
    )
    db.add(organization)
    db.flush()

    for offering in payload.service_offerings:
        db.add(
            ServiceOffering(
                organization_id=organization.id,
                key=offering.key,
                label=offering.label,
                description=offering.description,
            )
        )

    admin_user = User(
        organization_id=organization.id,
        email=payload.admin_email,
        full_name=payload.admin_full_name,
        hashed_password=hash_password(payload.admin_password),
        role=UserRole.ADMIN.value,
    )
    db.add(admin_user)
    db.commit()
    db.refresh(organization)
    db.refresh(admin_user)

    token = create_access_token(subject=admin_user.id, role=admin_user.role)
    return OrganizationSignupResponse(
        access_token=token,
        role=admin_user.role,
        organization=OrganizationResponse.model_validate(organization),
    )


@router.get("/me", response_model=OrganizationResponse)
def get_my_organization(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Organization:
    if current_user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NO_ORGANIZATION", "message": "This account is not attached to an organization."}},
        )
    organization = db.get(Organization, current_user.organization_id)
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ORGANIZATION_NOT_FOUND", "message": "Organization not found."}},
        )
    return organization
