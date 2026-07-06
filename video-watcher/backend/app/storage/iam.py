from typing import Optional

import requests
from fastapi import Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import GATESTACK_API_URL, GATESTACK_FALLBACK_URLS


def gatestack_urls(request: Request) -> list[str]:
    inferred: list[str] = []
    host = request.url.hostname
    if host and host not in {"localhost", "127.0.0.1"}:
        inferred.append(f"{request.url.scheme}://{host}:8000")
    return list(
        dict.fromkeys(
            [
                GATESTACK_API_URL,
                *inferred,
                *GATESTACK_FALLBACK_URLS,
                "http://host.docker.internal:8000",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
            ]
        )
    )


def session_headers(request: Request, credentials: Optional[HTTPAuthorizationCredentials]) -> dict[str, str]:
    headers: dict[str, str] = {}
    if credentials:
        headers["Authorization"] = f"Bearer {credentials.credentials}"
    elif request.cookies.get("gatestack_access"):
        headers["Cookie"] = f"gatestack_access={request.cookies['gatestack_access']}"
        csrf = request.cookies.get("gatestack_csrf")
        if csrf:
            headers["Cookie"] += f"; gatestack_csrf={csrf}"
    elif request.cookies.get("gatestack_token"):
        headers["Authorization"] = f"Bearer {request.cookies['gatestack_token']}"
    return headers


def get_current_user_from_gatestack(
    request: Request,
    db: Session,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> dict | None:
    headers = session_headers(request, credentials)
    if not headers:
        return None

    for url in gatestack_urls(request):
        try:
            response = requests.get(f"{url}/auth/me", headers=headers, timeout=2.5)
            if response.status_code == 200:
                user = response.json()
                user["permissions"] = local_effective_permissions(db, user)
                return user
        except requests.RequestException:
            continue
    return None


def local_effective_permissions(db: Session, user: dict) -> list[str]:
    user_id = user.get("id")
    token_permissions = sorted({str(permission) for permission in user.get("permissions") or []})
    if not user_id:
        return token_permissions

    try:
        template_permissions = db.execute(
            text(
                """
                SELECT p.code
                FROM permissions p
                JOIN template_permissions tp ON tp.permission_id = p.id
                JOIN user_permission_templates upt ON upt.template_id = tp.template_id
                WHERE upt.user_id = :user_id
                """
            ),
            {"user_id": user_id},
        ).scalars()
        effective = set(template_permissions)
        overrides = db.execute(
            text(
                """
                SELECT p.code, upo.effect
                FROM permissions p
                JOIN user_permission_overrides upo ON upo.permission_id = p.id
                WHERE upo.user_id = :user_id
                """
            ),
            {"user_id": user_id},
        ).all()
        for code, effect in overrides:
            if effect == "allow":
                effective.add(code)
            elif effect == "deny":
                effective.discard(code)
        if user.get("is_platform_admin"):
            all_permissions = db.execute(text("SELECT code FROM permissions")).scalars()
            effective.update(all_permissions)
        return sorted(effective)
    except Exception:
        return token_permissions
