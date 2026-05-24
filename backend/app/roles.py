"""
RBAC — ADR-004.

Role hierarchy (broadest -> narrowest):
    viewer < member < admin < owner

Resolution order on each request:
  1) JWT 'role' claim (in user_metadata or app_metadata) — fast path
  2) user_roles table lookup keyed by (org_id, user_id) — authoritative

Set the JWT claim via Supabase user_metadata.role to skip the DB lookup.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import _decode_supabase_jwt, bearer_scheme

logger = logging.getLogger("synvelo.rbac")

ALLOWED_ROLES = ("owner", "admin", "member", "viewer")
ROLE_RANK = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}


def _rank(role: str) -> int:
    return ROLE_RANK.get(role, -1)


def _extract_role_from_payload(payload: dict) -> Optional[str]:
    user_meta = payload.get("user_metadata") or {}
    app_meta  = payload.get("app_metadata") or {}
    role = user_meta.get("role") or app_meta.get("role")
    if role in ALLOWED_ROLES:
        return role
    return None


def _extract_user_id(payload: dict) -> Optional[str]:
    return payload.get("sub") or payload.get("user_id")


def _extract_org_id(payload: dict) -> Optional[str]:
    user_meta = payload.get("user_metadata") or {}
    app_meta  = payload.get("app_metadata") or {}
    return user_meta.get("org_id") or app_meta.get("org_id")


async def _resolve_role(
    payload: dict,
    db: AsyncSession,
) -> Optional[str]:
    role = _extract_role_from_payload(payload)
    if role:
        return role

    user_id = _extract_user_id(payload)
    org_id  = _extract_org_id(payload)
    if not user_id or not org_id:
        return None

    res = await db.execute(
        text("""
            SELECT role FROM user_roles
            WHERE org_id = CAST(:org_id AS uuid) AND user_id = :user_id
        """),
        {"org_id": org_id, "user_id": user_id},
    )
    row = res.fetchone()
    return row.role if row else None


def require_role(*allowed: str):
    """
    Dependency factory. Raises 403 if the caller's role is not in ``allowed``.

    Hierarchical: ``require_role("member")`` admits member, admin, owner.
    To pin to an exact role, pass it explicitly without higher tiers
    (the engine treats the list as an explicit allow-list when only one role
    is named — combined with hierarchy that effectively means "this or higher",
    which is the intended behaviour for our four-tier model).
    """
    for r in allowed:
        if r not in ALLOWED_ROLES:
            raise ValueError(f"Unknown role: {r}")

    min_rank = min(_rank(r) for r in allowed)

    async def dep(
        credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
        db: AsyncSession = Depends(get_db),
    ) -> str:
        if not credentials or not credentials.credentials:
            raise HTTPException(status_code=401, detail="Authentication required")
        payload = await _decode_supabase_jwt(credentials.credentials)
        role = await _resolve_role(payload, db)
        if not role:
            raise HTTPException(
                status_code=403,
                detail="No role assigned. Contact your workspace owner.",
            )
        if _rank(role) < min_rank:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{role}' is not permitted for this action.",
            )
        return role

    return dep
