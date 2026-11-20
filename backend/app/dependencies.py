import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request

from backend.app.config import ORYN_BOT_API_KEY, ORYN_WEBHOOK_SECRET, SESSION_TTL_HOURS
from backend.app.database import execute_query


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_user_session(user: dict) -> str:
    """Generates a session token, persists its SHA-256 hash in user_sessions, and returns the raw token."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_session_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)
    execute_query(
        """
        INSERT INTO user_sessions (token_hash, user_id, email, role, expires_at, created_at)
        VALUES (%s, %s, %s, %s, %s, NOW())
        ON CONFLICT (token_hash) DO NOTHING;
        """,
        (token_hash, user["id"], user["email"], user["role"], expires_at),
        commit=True,
    )
    return raw_token


def revoke_user_sessions(user_id: int) -> None:
    """Immediately invalidates all active portal sessions for a user."""
    execute_query(
        "UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = %s AND revoked_at IS NULL;",
        (user_id,),
        commit=True,
    )


def extract_bearer_token(request: Request) -> Optional[str]:
    auth_header = (request.headers.get("authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


def _lookup_session_user(raw_token: str) -> Optional[dict]:
    if not raw_token:
        return None
    token_hash = hash_session_token(raw_token)
    return execute_query(
        """
        SELECT u.id, u.email, u.name, u.role, u.is_dept_head, u.department_id,
               u.designation, u.status, u.is_test, u.revoked_at,
               s.id AS session_id, s.expires_at, s.revoked_at AS session_revoked_at
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = %s
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.status = 'ACTIVE'
          AND u.revoked_at IS NULL
        LIMIT 1;
        """,
        (token_hash,),
        fetch_one=True,
    )


def get_current_user(request: Request) -> dict:
    """Validates Bearer session token and verifies the user is still ACTIVE and unrevoked."""
    token = extract_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    user = _lookup_session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or access revoked. Please sign in again.")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Restricts endpoint access to verified ADMIN sessions."""
    if (user.get("role") or "").upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Administrator privileges required.")
    return user


async def _verify_hmac_signature(request: Request) -> bool:
    if not ORYN_WEBHOOK_SECRET:
        return False
    sig = (
        request.headers.get("x-oryn-signature")
        or request.headers.get("x-signature-256")
        or ""
    ).strip()
    if not sig:
        return False
    sig_hex = sig.split("=", 1)[-1].strip() if sig.startswith("sha256=") else sig
    body = await request.body()
    expected = hmac.new(ORYN_WEBHOOK_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return secrets.compare_digest(expected, sig_hex)


def _extract_bot_api_key(request: Request) -> str:
    for header_name in ("x-api-key", "x-oryn-api-key", "x-oryn-key"):
        val = (request.headers.get(header_name) or "").strip()
        if val:
            return val
    bearer = extract_bearer_token(request)
    if bearer:
        return bearer
    return (request.query_params.get("api_key") or "").strip()


async def require_oryn_bot_or_admin(request: Request) -> dict:
    """
    Authorizes either:
    1) Oryn Bot via ORYN_BOT_API_KEY (X-API-Key / X-Oryn-Api-Key / Bearer / ?api_key=) or HMAC webhook secret, OR
    2) An authenticated ADMIN session token.
    """
    provided_key = _extract_bot_api_key(request)

    if ORYN_BOT_API_KEY and provided_key and secrets.compare_digest(provided_key, ORYN_BOT_API_KEY):
        return {
            "actor_type": "ORYN_BOT",
            "email": "oryn@1mg.com",
            "name": "Oryn Bot (RACM)",
            "role": "BOT_SERVICE",
        }

    if await _verify_hmac_signature(request):
        return {
            "actor_type": "ORYN_WEBHOOK",
            "email": "oryn@1mg.com",
            "name": "Oryn Webhook",
            "role": "BOT_SERVICE",
        }

    bearer = extract_bearer_token(request)
    if bearer:
        session_user = _lookup_session_user(bearer)
        if session_user and (session_user.get("role") or "").upper() == "ADMIN":
            return {
                "actor_type": "ADMIN",
                "id": session_user["id"],
                "email": session_user["email"],
                "name": session_user["name"],
                "role": "ADMIN",
            }

    if not ORYN_BOT_API_KEY and not ORYN_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Oryn Bot connector key is not configured. Set ORYN_BOT_API_KEY in Render environment variables or sign in as Admin.",
        )

    raise HTTPException(status_code=401, detail="Invalid or missing Oryn Bot API key / Admin token.")


async def require_authenticated_actor(request: Request) -> dict:
    """Allows either a valid logged-in portal user session OR a valid Oryn Bot key."""
    provided_key = _extract_bot_api_key(request)
    if ORYN_BOT_API_KEY and provided_key and secrets.compare_digest(provided_key, ORYN_BOT_API_KEY):
        return {"actor_type": "ORYN_BOT", "email": "oryn@1mg.com", "name": "Oryn Bot (RACM)", "role": "BOT_SERVICE"}
    if await _verify_hmac_signature(request):
        return {"actor_type": "ORYN_WEBHOOK", "email": "oryn@1mg.com", "name": "Oryn Webhook", "role": "BOT_SERVICE"}
    return get_current_user(request)
