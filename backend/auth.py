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

# Emails and user IDs that always get enterprise tier and bypass all usage limits.
# User ID is the reliable key — emails can change or differ across providers.
ADMIN_EMAILS: set[str] = {
    "kaif.farooqui10@gmail.com",
    "kaif.is.master@gmail.com",
}
ADMIN_USER_IDS: set[str] = {
    "8b9a9543-138a-4686-9fab-2a266d6a4a06",  # kaif — visible in server logs
}

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
    def __init__(self, user_id: Optional[str], tier: str, authenticated: bool, email: Optional[str] = None):
        self.user_id = user_id
        self.tier = tier
        self.authenticated = authenticated
        self.email = email

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
        # Admin override — match by email OR user ID (ID is more reliable across OAuth providers)
        if user.email in ADMIN_EMAILS or user.id in ADMIN_USER_IDS:
            tier = "enterprise"
        return AuthInfo(user_id=user.id, tier=tier, authenticated=True, email=user.email)

    except Exception:
        return AuthInfo(user_id=None, tier="free", authenticated=False)


# ─── Simulation usage (free tier: 3/day) ─────────────────────────────────────

async def check_and_increment_sim_usage(user_id: str, user_email: str = "") -> None:
    """
    For free users, enforce 3 simulations/day hard limit.
    Raises HTTP 429 if limit exceeded. Admin emails are exempt.
    """
    if user_email in ADMIN_EMAILS or user_id in ADMIN_USER_IDS:
        return  # no limits for admin
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
