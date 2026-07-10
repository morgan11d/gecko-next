from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from typing import Iterable

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .models import RoleName, User
from .store import store


SECRET = os.environ.get("GECKO_NEXT_SECRET", "dev-gecko-next-secret-change-me")
bearer = HTTPBearer(auto_error=False)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_access_token(user: User) -> str:
    payload = _b64(json.dumps({"sub": user.id, "role": user.role.value}, separators=(",", ":")).encode("utf-8"))
    signature = _b64(hmac.new(SECRET.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def verify_access_token(token: str) -> User | None:
    try:
        payload, signature = token.split(".", 1)
    except ValueError:
        return None

    expected = _b64(hmac.new(SECRET.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        return None

    try:
        data = json.loads(_unb64(payload))
    except (json.JSONDecodeError, ValueError):
        return None

    user = store.users.get(str(data.get("sub")))
    if not user or user.status != "active":
        return None
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> User:
    if credentials:
        user = verify_access_token(credentials.credentials)
        if user:
            return user

    if x_user_id and x_user_id in store.users:
        user = store.users[x_user_id]
        if user.status == "active":
            return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_roles(*roles: RoleName):
    allowed = set(roles)

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        return user

    return dependency


def can_read_task(user: User, assignee_id: str, verifier_id: str) -> bool:
    if user.role in {RoleName.admin, RoleName.supervisor, RoleName.ml, RoleName.customer}:
        return True
    return user.id in {assignee_id, verifier_id}


def ensure_task_reader(user: User, assignee_id: str, verifier_id: str) -> None:
    if not can_read_task(user, assignee_id, verifier_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task is not visible for this role")


WRITE_ROLES: Iterable[RoleName] = (RoleName.annotator, RoleName.supervisor, RoleName.admin)
VERIFY_ROLES: Iterable[RoleName] = (RoleName.verifier, RoleName.supervisor, RoleName.admin)

