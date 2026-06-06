"""
Auth middleware for QuantShield API.
Verifies Supabase JWT tokens and returns the user's tier.
"""

import os
import secrets
from typing import Optional

from fastapi import HTTPException, Request
from supabase import create_client, Client

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_supabase: Optional[Client] = None

def _get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


# ─── Tier rank helpers ────────────────────────────────────────────────────────

TIER_RANK = {"free": 0, "pro": 1, "enterprise": 2}

def has_tier(user_tier: str, required: str) -> bool:
    return TIER_RANK.get(user_tier, 0) >= TIER_RANK.get(required, 0)


# ─── Auth dependency ──────────────────────────────────────────────────────────

class AuthInfo:
    def __init__(self, user_id: Optional[str], tier: str, authenticated: bool):
        self.user_id = user_id
        self.tier = tier
        self.authenticated = authenticated

    def require_auth(self):
        if not self.authenticated:
            raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")

    def require_tier(self, required: str):
        self.require_auth()
        if not has_tier(self.tier, required):
            raise HTTPException(
                status_code=403,
                detail=f"This feature requires a {required.capitalize()} plan. Upgrade at /settings.",
            )


async def get_auth(request: Request) -> AuthInfo:
    """
    Extract and verify Supabase JWT from Authorization header.
    Returns AuthInfo with user_id and tier.
    Unauthenticated requests return AuthInfo(user_id=None, tier='free', authenticated=False)
    instead of raising — callers decide whether auth is required.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return AuthInfo(user_id=None, tier="free", authenticated=False)

    token = auth_header.split(" ", 1)[1]
    try:
        supabase = _get_supabase()
        user_resp = supabase.auth.get_user(token)
        user = user_resp.user
        if not user:
            return AuthInfo(user_id=None, tier="free", authenticated=False)

        profile = (
            supabase.table("profiles")
            .select("tier")
            .eq("id", user.id)
            .single()
            .execute()
        )
        tier = profile.data.get("tier", "free") if profile.data else "free"
        return AuthInfo(user_id=user.id, tier=tier, authenticated=True)

    except Exception:
        return AuthInfo(user_id=None, tier="free", authenticated=False)


# ─── Simulation usage (free tier: 3/day) ─────────────────────────────────────

async def check_and_increment_sim_usage(user_id: str) -> None:
    """
    For free users, enforce 3 simulations/day hard limit.
    Raises HTTP 429 if limit exceeded.
    """
    from datetime import date
    supabase = _get_supabase()
    today = date.today().isoformat()

    existing = (
        supabase.table("simulation_usage")
        .select("count")
        .eq("user_id", user_id)
        .eq("date", today)
        .execute()
    )

    current_count = existing.data[0]["count"] if existing.data else 0

    if current_count >= 3:
        raise HTTPException(
            status_code=429,
            detail="Daily simulation limit reached (3/day on Free plan). Upgrade to Pro for unlimited simulations.",
            headers={"Retry-After": "86400"},
        )

    if existing.data:
        supabase.table("simulation_usage").update({"count": current_count + 1}).eq("user_id", user_id).eq("date", today).execute()
    else:
        supabase.table("simulation_usage").insert({"user_id": user_id, "date": today, "count": 1}).execute()


# ─── Enterprise API key auth ──────────────────────────────────────────────────

async def auth_from_api_key(request: Request) -> AuthInfo:
    """Allow Enterprise users to authenticate via X-API-Key header."""
    api_key = request.headers.get("X-API-Key", "")
    if not api_key:
        return await get_auth(request)

    supabase = _get_supabase()
    profile = (
        supabase.table("profiles")
        .select("id, tier")
        .eq("api_key", api_key)
        .single()
        .execute()
    )
    if not profile.data:
        raise HTTPException(status_code=401, detail="Invalid API key.")

    return AuthInfo(
        user_id=profile.data["id"],
        tier=profile.data["tier"],
        authenticated=True,
    )


# ─── Generate API key for Enterprise users ────────────────────────────────────

async def generate_api_key(user_id: str) -> str:
    key = f"qs_{''.join(secrets.token_hex(24))}"
    supabase = _get_supabase()
    supabase.table("profiles").update({"api_key": key}).eq("id", user_id).execute()
    return key
