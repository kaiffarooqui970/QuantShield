"""
Batch ticker validation — piggybacks on the existing Yahoo Finance fetch.

Phase 8 TODO: swap _probe() for a Polygon.io / FMP call to get proper
              ticker metadata, better rate limits, and broader asset coverage
              (ETFs, FX, ADRs). Add POLYGON_API_KEY to env at that point.
"""
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# ── In-memory cache ────────────────────────────────────────────────────────────
# ticker.upper() -> (is_valid: bool, expires: float[monotonic])
_CACHE: dict[str, tuple[bool, float]] = {}
_CACHE_TTL = 3600.0  # 1 hour

# Thread pool for concurrent synchronous Yahoo fetches
_POOL = ThreadPoolExecutor(max_workers=12, thread_name_prefix="qs-validate")


class ValidateRequest(BaseModel):
    tickers: list[str]


class ValidateResponse(BaseModel):
    valid: list[str]
    invalid: list[str]


def _probe(raw: str) -> tuple[str, bool]:
    """
    Probe a single ticker with a 7-day price fetch.
    Called from a thread pool — safe to block here.
    Updates _CACHE before returning.
    """
    from engine import _fetch_price_series

    t = raw.upper().strip()
    now = time.monotonic()

    # Re-check inside the thread: another worker may have populated it already
    hit = _CACHE.get(t)
    if hit and now < hit[1]:
        return t, hit[0]

    try:
        _fetch_price_series(t, days_back=7)
        _CACHE[t] = (True, now + _CACHE_TTL)
        return t, True
    except Exception:
        _CACHE[t] = (False, now + _CACHE_TTL)
        return t, False


@router.post("/api/validate-tickers", response_model=ValidateResponse)
async def validate_tickers(req: ValidateRequest) -> ValidateResponse:
    """
    Validate a batch of ticker symbols in one request.

    - Deduplicates and uppercases input.
    - Serves cache hits immediately (TTL 1 hour).
    - Fetches cache misses concurrently via a thread pool.
    - Returns two sorted lists: valid and invalid.
    """
    if not req.tickers:
        return ValidateResponse(valid=[], invalid=[])

    # Deduplicate preserving first-seen order
    unique = list(dict.fromkeys(t.upper().strip() for t in req.tickers if t.strip()))

    now = time.monotonic()
    valid: list[str] = []
    invalid: list[str] = []
    to_fetch: list[str] = []

    for t in unique:
        hit = _CACHE.get(t)
        if hit and now < hit[1]:
            (valid if hit[0] else invalid).append(t)
        else:
            to_fetch.append(t)

    if to_fetch:
        loop = asyncio.get_event_loop()
        results: list[tuple[str, bool]] = await asyncio.gather(
            *[loop.run_in_executor(_POOL, _probe, t) for t in to_fetch]
        )
        for ticker, ok in results:
            (valid if ok else invalid).append(ticker)

    return ValidateResponse(valid=valid, invalid=invalid)
