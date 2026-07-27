from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User

_bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Could not validate credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": {"code": "NOT_AUTHENTICATED", "message": detail}},
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized("Missing bearer token")

    token_payload = decode_access_token(credentials.credentials)
    if token_payload is None:
        raise _unauthorized("Invalid or expired token")

    user = db.get(User, token_payload.user_id)
    if user is None or not user.is_active:
        raise _unauthorized("User not found or inactive")

    return user


def require_roles(*allowed_roles: UserRole) -> Callable[[User], User]:
    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in {role.value for role in allowed_roles}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": {
                        "code": "FORBIDDEN",
                        "message": "You do not have permission to perform this action.",
                    }
                },
            )
        return current_user

    return _checker


require_admin = require_roles(UserRole.ADMIN)
require_manager_or_admin = require_roles(UserRole.MANAGER, UserRole.ADMIN)
require_any_role = require_roles(UserRole.BD_EXECUTIVE, UserRole.MANAGER, UserRole.ADMIN)
