"""
QuantShield API – FastAPI backend
Monte Carlo risk simulation + AI Copilot advisor (Google GenAI + ElevenLabs TTS)
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import threading
import time
import traceback
import uuid
from collections import OrderedDict
from typing import Optional, Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

# ─── Secure logging (scrubs secrets from output) ──────────────────────────────
_SECRET_PATTERN = re.compile(r'(key|token|secret|password|auth)["\s:=]+[\w.\-_/+=]{8,}', re.I)

class _ScrubFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = _SECRET_PATTERN.sub(r'\1=[REDACTED]', str(record.msg))
        return True

logging.basicConfig(level=logging.INFO)
_logger = logging.getLogger("quantshield")
_logger.addFilter(_ScrubFilter())

# ─── API Keys (env only — never hardcoded) ────────────────────────────────────
GROQ_API_KEY: str           = os.environ["GROQ_API_KEY"]
ELEVENLABS_API_KEY: str     = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID: str    = os.environ.get("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
INTERNAL_SECRET: str        = os.environ.get("INTERNAL_API_SECRET", "")
STRIPE_SECRET_KEY: str      = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET: str  = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE_ID: str    = os.environ.get("STRIPE_PRO_PRICE_ID", "")
STRIPE_ENT_PRICE_ID: str    = os.environ.get("STRIPE_ENTERPRISE_PRICE_ID", "")
SITE_URL: str               = os.environ.get("SITE_URL", "http://localhost:3000")

# ─── Stripe client ────────────────────────────────────────────────────────────
import stripe as stripe_lib
if STRIPE_SECRET_KEY:
    stripe_lib.api_key = STRIPE_SECRET_KEY

# ─── Supabase auth ────────────────────────────────────────────────────────────
from auth import get_auth, auth_from_api_key, AuthInfo, check_and_increment_sim_usage, generate_api_key
from validate import router as validate_router

# ─── Groq Client ──────────────────────────────────────────────────────────────
from groq import Groq

groq_client = Groq(api_key=GROQ_API_KEY)
GROQ_MODEL = "llama-3.3-70b-versatile"

# ─── Rate limiter (in-memory, per IP) ─────────────────────────────────────────
# Sliding-window: max N calls per window_seconds per IP per endpoint group.
_RATE_STORE: dict[str, list[float]] = {}
_RATE_LOCK = threading.Lock()

def _check_rate(ip: str, group: str, limit: int, window: int) -> None:
    key = f"{ip}:{group}"
    now = time.time()
    with _RATE_LOCK:
        timestamps = [t for t in _RATE_STORE.get(key, []) if now - t < window]
        if len(timestamps) >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded — max {limit} requests per {window}s.",
                headers={"Retry-After": str(window)},
            )
        timestamps.append(now)
        _RATE_STORE[key] = timestamps

# ─── Internal auth dependency ──────────────────────────────────────────────────
# Token is used by server-to-server calls (e.g. scripts, tests).
# Browser clients are protected by CORS origin locking instead.
def _verify_token(request: Request) -> None:
    """
    Validates X-QuantShield-Token header when INTERNAL_API_SECRET is set.
    Browser requests from localhost:3000 are trusted via CORS; the token is
    only required for non-browser (programmatic) callers.
    """
    if not INTERNAL_SECRET:
        return  # no secret configured — open (dev mode)
    origin = request.headers.get("origin", "")
    # Allow browser requests from the known frontend origin without a token
    if origin in _ALLOWED_ORIGINS:
        return
    # Require valid token for all other callers (scripts, bots, etc.)
    token = request.headers.get("X-QuantShield-Token", "")
    if not hmac.compare_digest(
        hashlib.sha256(token.encode()).digest(),
        hashlib.sha256(INTERNAL_SECRET.encode()).digest(),
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")

# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="QuantShield API",
    version="2.0.0",
    docs_url=None,      # disable /docs in production
    redoc_url=None,     # disable /redoc in production
    openapi_url=None,   # disable schema leak
)

_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://quant-shield.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "X-QuantShield-Token", "Accept", "Cache-Control", "Authorization"],
    expose_headers=["Content-Type", "X-Accel-Buffering"],
)

app.include_router(validate_router)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

# --- Pydantic Schemas ---

class SimulationRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=10, example=["AAPL", "MSFT", "NVDA"])
    simulation_days: int = Field(default=252, ge=30, le=1260)
    n_simulations: int = Field(default=20000, ge=100, le=20000)
    weights: Optional[list[float]] = Field(default=None)
    initial_portfolio_value: float = Field(default=10000.0, ge=100.0)
    model: str = Field(default="gbm", pattern="^(gbm|student_t)$")
    student_t_df: int = Field(default=5, ge=3, le=30)
    rng_seed: Optional[int] = Field(default=None, ge=0, le=2**31 - 1)

    # PASTE IT RIGHT HERE (Ensure it aligns with the variables above)
    @model_validator(mode="before")
    @classmethod
    def normalize_keys(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Map symbols -> tickers if needed
            if "symbols" in data and not data.get("tickers"):
                data["tickers"] = data["symbols"]
            # Handle comma-separated strings from text inputs
            if isinstance(data.get("tickers"), str):
                data["tickers"] = [t.strip() for t in data["tickers"].split(",") if t.strip()]
            
            # Map days -> simulation_days
            if "days" in data and "simulation_days" not in data:
                data["simulation_days"] = data["days"]
                
            # Map num_simulations -> n_simulations
            if "num_simulations" in data and "n_simulations" not in data:
                data["n_simulations"] = data["num_simulations"]
                
            # Guarantee a fallback empty list if tickers is completely missing
            if not data.get("tickers"):
                data["tickers"] = ["AAPL"]
        return data

class SimulationResponse(BaseModel):
    tickers: list[str]
    weights: list[float]
    simulation_days: int
    n_simulations: int
    initial_portfolio_value: float
    metrics: dict
    paths: dict
    risk_contribution: dict
    correlation_matrix: dict


class AdvisorRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    simulation_metrics: Optional[dict] = Field(default=None)
    tickers: Optional[list[str]] = Field(default=None)
    voice_id: Optional[str] = Field(default=None)   # overrides server default


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=600)
    voice_id: Optional[str] = Field(default=None)


class AdvisorResponse(BaseModel):
    answer: str
    audio_base64: Optional[str] = None
    audio_available: bool = False


# ─── Multi-turn chat schemas ───────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    messages: list[ChatMessage] = Field(..., min_length=1)
    simulation_metrics: Optional[dict] = None
    tickers: Optional[list[str]] = None


# ─── In-memory session store ───────────────────────────────────────────────────
# Stores Gemini-format history: [{"role": "user"|"model", "parts": [{"text": "..."}]}]
_sessions: OrderedDict[str, list[dict]] = OrderedDict()
_MAX_SESSIONS = 200
_MAX_TURNS = 20   # message pairs kept per session

def _load(session_id: str) -> list[dict]:
    return list(_sessions.get(session_id, []))

def _save(session_id: str, history: list[dict]) -> None:
    if session_id not in _sessions and len(_sessions) >= _MAX_SESSIONS:
        _sessions.popitem(last=False)       # evict oldest session
    _sessions[session_id] = history[-(_MAX_TURNS * 2):]   # keep last N turns


# ─── Shared system prompt ──────────────────────────────────────────────────────
_SYSTEM_PROMPT = (
    "You are QuantShield Copilot, an expert quantitative financial analyst AI. "
    "You provide concise, insightful, and actionable portfolio risk analysis. "
    "You explain complex financial concepts clearly. "
    "Your responses are well-structured with markdown when helpful. "
    "Keep responses under 300 words unless a deeper explanation is specifically requested. "
    "Never provide investment advice — always recommend consulting a licensed financial advisor."
)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "QuantShield API is live", "version": "2.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/simulate", response_model=SimulationResponse)
async def simulate(req: SimulationRequest, request: Request, _auth=Depends(_verify_token)):
    """Run Monte Carlo GBM portfolio risk simulation."""
    _check_rate(request.client.host, "simulate", limit=10, window=60)

    # ── Auth + tier — anonymous guests allowed for one free baseline run ─────────
    auth = await auth_from_api_key(request)

    if not auth.authenticated:
        # Guest: no usage tracking; IP rate-limit (above) is the only guard.
        req.simulation_days = min(req.simulation_days, 252)
        req.n_simulations   = min(req.n_simulations, 500)
    elif auth.tier == "free":
        await check_and_increment_sim_usage(auth.user_id, auth.email or "")
        req.simulation_days = min(req.simulation_days, 252)
        req.n_simulations   = min(req.n_simulations, 1000)

    from engine import run_monte_carlo

    if req.weights and len(req.weights) > 0:
        if len(req.weights) != len(req.tickers):
            raise HTTPException(
                status_code=422,
                detail=f"weights length ({len(req.weights)}) must match tickers length ({len(req.tickers)})"
            )
    else:
        req.weights = None

    try:
        result = run_monte_carlo(
            tickers=[t.upper() for t in req.tickers],
            simulation_days=req.simulation_days,
            n_simulations=req.n_simulations,
            weights=req.weights,
            initial_portfolio_value=req.initial_portfolio_value,
            model=req.model,
            student_t_df=req.student_t_df,
            rng_seed=req.rng_seed,
        )
        # Strip CVaR / Sortino for free-tier and anonymous users
        if not auth.authenticated or auth.tier == "free":
            result["metrics"].pop("cvar_95", None)
            result["metrics"].pop("cvar_99", None)
            result["metrics"].pop("sortino_ratio", None)
        return SimulationResponse(**result)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")


@app.post("/api/advisor", response_model=AdvisorResponse)
async def advisor(req: AdvisorRequest, request: Request, _auth=Depends(_verify_token)):
    """AI Copilot: answers questions about portfolio risk using Gemini + ElevenLabs TTS."""
    _check_rate(request.client.host, "ai", limit=20, window=60)

    # ── Build context-enriched prompt ────────────────────────────────────────
    context_block = ""
    if req.simulation_metrics:
        m = req.simulation_metrics
        context_block = f"""
Current Portfolio Risk Metrics:
- Tickers: {', '.join(req.tickers or [])}
- Expected Annual Return: {m.get('expected_annual_return', 'N/A')}%
- Annual Volatility: {m.get('annual_volatility', 'N/A')}%
- Sharpe Ratio: {m.get('sharpe_ratio', 'N/A')}
- Sortino Ratio: {m.get('sortino_ratio', 'N/A')}
- Max Drawdown: {m.get('max_drawdown', 'N/A')}%
- VaR (95%): ${m.get('var_95', 'N/A')}
- VaR (99%): ${m.get('var_99', 'N/A')}
- CVaR (95%): ${m.get('cvar_95', 'N/A')}
- CVaR (99%): ${m.get('cvar_99', 'N/A')}
- Median Final Portfolio Value: ${m.get('median_final_value', 'N/A')}
- P5 Final Value: ${m.get('p5_final_value', 'N/A')}
- P95 Final Value: ${m.get('p95_final_value', 'N/A')}
"""

    system_prompt = (
        "You are QuantShield Copilot, an expert quantitative financial analyst AI. "
        "You provide concise, insightful, and actionable portfolio risk analysis. "
        "You explain complex financial concepts clearly. "
        "Your responses are well-structured with markdown when helpful. "
        "Keep responses under 300 words unless a deeper explanation is specifically requested. "
        "Never provide investment advice — always recommend consulting a licensed financial advisor."
    )

    # ── AI Market Context: fetch live news headlines ──────────────────────────
    news_block = ""
    if req.tickers:
        news_lines = []
        for t in req.tickers[:5]:
            headline = await _fetch_ticker_news(t)
            if headline:
                news_lines.append(f"- {t}: {headline}")
        if news_lines:
            news_block = "\nLatest Market News:\n" + "\n".join(news_lines) + "\n"

    full_prompt = f"{system_prompt}\n\n{context_block}{news_block}\nUser Question: {req.question}"

    # ── Call Groq ─────────────────────────────────────────────────────────────
    try:
        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": full_prompt}],
            max_tokens=600,
        )
        ai_text = response.choices[0].message.content.strip()
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"AI advisor error: {str(e)}")

    # ── ElevenLabs Text-to-Speech ─────────────────────────────────────────────
    audio_base64: Optional[str] = None
    audio_available = False

    if ELEVENLABS_API_KEY and ELEVENLABS_API_KEY != "YOUR_ELEVENLABS_API_KEY_HERE":
        _voice = req.voice_id or ELEVENLABS_VOICE_ID
        tts_url = f"https://api.elevenlabs.io/v1/text-to-speech/{_voice}"
        tts_headers = {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
        }
        # Trim text for TTS (max ~500 chars to keep latency low)
        tts_text = ai_text[:500] + ("..." if len(ai_text) > 500 else "")
        tts_payload = {
            "text": tts_text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                tts_resp = await client.post(tts_url, json=tts_payload, headers=tts_headers)
                if tts_resp.status_code == 200:
                    audio_bytes = tts_resp.content
                    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
                    audio_available = True
                else:
                    print(f"[ElevenLabs] TTS failed: {tts_resp.status_code} – {tts_resp.text[:200]}")
        except Exception as tts_err:
            print(f"[ElevenLabs] TTS exception: {tts_err}")

    return AdvisorResponse(
        answer=ai_text,
        audio_base64=audio_base64,
        audio_available=audio_available,
    )


# ─── /api/tts — standalone TTS for post-stream audio ─────────────────────────

@app.post("/api/tts")
async def tts(req: TTSRequest, request: Request, _auth=Depends(_verify_token)):
    """Convert text to speech via ElevenLabs. Used by the frontend after SSE streaming."""
    _check_rate(request.client.host, "tts", limit=15, window=60)
    if not ELEVENLABS_API_KEY or ELEVENLABS_API_KEY == "YOUR_ELEVENLABS_API_KEY_HERE":
        raise HTTPException(status_code=503, detail="ElevenLabs API key not configured.")

    voice = req.voice_id or ELEVENLABS_VOICE_ID
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
    payload = {
        "text": req.text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75,
                           "style": 0.0, "use_speaker_boost": True},
    }
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=502,
                                detail=f"ElevenLabs error {resp.status_code}: {resp.text[:200]}")
        return {"audio_base64": base64.b64encode(resp.content).decode("utf-8")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")


# ─── /api/v1/chat — streaming SSE multi-turn endpoint ─────────────────────────

@app.post("/api/v1/chat")
async def chat(req: ChatRequest, request: Request, _auth=Depends(_verify_token)):
    """
    Multi-turn streaming chat.
    Client sends full messages[] history; server streams tokens via SSE.
    Session history is also persisted server-side for future turns.
    """
    _check_rate(request.client.host, "ai", limit=20, window=60)
    # ── Build context block (injected once, on first turn) ─────────────────
    context_block = ""
    if req.simulation_metrics:
        m = req.simulation_metrics
        context_block = (
            "Current Portfolio Risk Metrics:\n"
            f"- Tickers: {', '.join(req.tickers or [])}\n"
            f"- Expected Annual Return: {m.get('expected_annual_return', 'N/A')}%\n"
            f"- Annual Volatility: {m.get('annual_volatility', 'N/A')}%\n"
            f"- Sharpe Ratio: {m.get('sharpe_ratio', 'N/A')}\n"
            f"- Sortino Ratio: {m.get('sortino_ratio', 'N/A')}\n"
            f"- Max Drawdown: {m.get('max_drawdown', 'N/A')}%\n"
            f"- VaR (95%): ${m.get('var_95', 'N/A')}\n"
            f"- VaR (99%): ${m.get('var_99', 'N/A')}\n"
            f"- CVaR (95%): ${m.get('cvar_95', 'N/A')}\n"
            f"- CVaR (99%): ${m.get('cvar_99', 'N/A')}\n"
            f"- Median Final Value: ${m.get('median_final_value', 'N/A')}\n"
            f"- P5 Final Value: ${m.get('p5_final_value', 'N/A')}\n"
            f"- P95 Final Value: ${m.get('p95_final_value', 'N/A')}\n"
        )

    # ── Build Groq messages list ───────────────────────────────────────────
    groq_messages: list[dict] = [{"role": "system", "content": _SYSTEM_PROMPT}]
    if context_block:
        groq_messages.append({"role": "system", "content": context_block})
    for msg in req.messages:
        groq_messages.append({
            "role": "user" if msg.role == "user" else "assistant",
            "content": msg.content,
        })

    # ── Streaming generator ────────────────────────────────────────────────
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        accumulated: list[str] = []

        def _sync_generate():
            try:
                stream = groq_client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=groq_messages,
                    max_tokens=600,
                    stream=True,
                )
                for chunk in stream:
                    token = chunk.choices[0].delta.content or ""
                    if token:
                        asyncio.run_coroutine_threadsafe(queue.put(token), loop)
            except Exception as exc:
                asyncio.run_coroutine_threadsafe(queue.put(exc), loop)
            finally:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        t = threading.Thread(target=_sync_generate, daemon=True)
        t.start()

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                yield f"data: {json.dumps({'error': str(item)})}\n\n"
                break
            accumulated.append(item)
            yield f"data: {json.dumps({'token': item})}\n\n"

        yield "data: [DONE]\n\n"

        # Persist turn to server-side session store
        full_reply = "".join(accumulated)
        history = list(groq_messages) + [{"role": "assistant", "content": full_reply}]
        _save(req.session_id, history)

    origin = request.headers.get("origin", "http://localhost:3000")
    allowed_origin = origin if origin in _ALLOWED_ORIGINS else _ALLOWED_ORIGINS[0]
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": allowed_origin,
            "Access-Control-Allow-Credentials": "false",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ─── Stress Testing ───────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class StressRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=10)
    weights: Optional[list[float]] = None
    scenario: str = Field(default="2008_crash")
    initial_portfolio_value: float = Field(default=10_000.0, ge=100.0)
    custom_shocks: Optional[dict[str, float]] = None
    simulation_days: int = Field(default=252, ge=30, le=1260)
    n_simulations: int = Field(default=1000, ge=100, le=5000)


class StressResponse(BaseModel):
    scenario: str
    scenario_name: str
    scenario_description: str
    tickers: list[str]
    weights: list[float]
    baseline_metrics: dict
    stressed_metrics: dict
    delta_metrics: dict
    immediate_loss_usd: float
    immediate_loss_pct: float


@app.post("/api/stress", response_model=StressResponse)
async def stress_test(req: StressRequest, request: Request, _auth=Depends(_verify_token)):
    """Run a historical scenario stress test on a portfolio."""
    _check_rate(request.client.host, "simulate", limit=10, window=60)
    from stress import run_stress_test
    try:
        result = run_stress_test(
            tickers=[t.upper() for t in req.tickers],
            weights=req.weights,
            scenario=req.scenario,
            initial_portfolio_value=req.initial_portfolio_value,
            custom_shocks=req.custom_shocks,
            simulation_days=req.simulation_days,
            n_simulations=req.n_simulations,
        )
        return StressResponse(**result)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Stress test error: {str(e)}")


@app.get("/api/stress/scenarios")
async def list_scenarios():
    """Return available built-in stress scenarios."""
    from stress import BUILTIN_SCENARIOS
    return {
        "scenarios": [
            {"id": k, "name": v["name"], "description": v["description"], "shock_pct": round(v["portfolio_shock"] * 100, 0)}
            for k, v in BUILTIN_SCENARIOS.items()
        ]
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ─── Efficient Frontier ───────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class FrontierRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=2, max_length=10)
    n_portfolios: int = Field(default=500, ge=100, le=2000)


class FrontierResponse(BaseModel):
    tickers: list[str]
    n_portfolios: int
    frontier: list[dict]
    min_volatility: dict
    max_sharpe: dict


@app.post("/api/frontier", response_model=FrontierResponse)
async def efficient_frontier(req: FrontierRequest, request: Request, _auth=Depends(_verify_token)):
    """Generate the efficient frontier via random weight sampling + analytical optimisation."""
    _check_rate(request.client.host, "simulate", limit=5, window=60)
    from optimizer import run_efficient_frontier
    try:
        result = run_efficient_frontier(
            tickers=[t.upper() for t in req.tickers],
            n_portfolios=req.n_portfolios,
        )
        return FrontierResponse(**result)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Frontier error: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# ─── Backtesting ──────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class BacktestRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=10)
    weights: Optional[list[float]] = None
    initial_value: float = Field(default=10_000.0, ge=100.0)
    benchmark: str = Field(default="SPY")                    # kept for backward compat
    benchmarks: list[str] = Field(default=["SPY"])           # multi-benchmark
    days_back: int = Field(default=1260, ge=252, le=3780)
    rebalance_frequency: str = Field(default="none", pattern="^(none|monthly|quarterly|annual)$")


class BacktestResponse(BaseModel):
    tickers: list[str]
    weights: list[float]
    benchmark: Optional[str]
    period_years: float
    start_date: str
    end_date: str
    summary: dict
    benchmark_stats: Optional[dict]
    equity_curve: list[dict]
    benchmark_curve: Optional[list[dict]]
    underwater_curve: list[dict]
    rolling_12m_returns: list[dict]
    calendar_year_returns: list[dict]


@app.post("/api/backtest", response_model=BacktestResponse)
async def backtest(req: BacktestRequest, request: Request, _auth=Depends(_verify_token)):
    """Backtest a static-weight portfolio against historical data."""
    _check_rate(request.client.host, "simulate", limit=5, window=60)
    from backtest import run_backtest
    if req.weights and len(req.weights) != len(req.tickers):
        raise HTTPException(status_code=422, detail="weights length must match tickers length")
    try:
        # Merge single benchmark + multi-benchmark list, deduplicate
        bench_list = list(dict.fromkeys(
            [b.upper() for b in req.benchmarks] + ([req.benchmark.upper()] if req.benchmark else [])
        ))[:3]  # cap at 3
        result = run_backtest(
            tickers=[t.upper() for t in req.tickers],
            weights=req.weights or [],
            initial_value=req.initial_value,
            benchmark_tickers=bench_list,
            days_back=req.days_back,
            rebalance_frequency=req.rebalance_frequency,
        )
        return BacktestResponse(**result)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Backtest error: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# ─── Portfolio Alerts ─────────────────────────────────════════════════════════
# ═══════════════════════════════════════════════════════════════════════════════

class AlertCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    tickers: list[str] = Field(default_factory=list)
    alert_type: str
    threshold: float
    comparison: str = Field(default="above")


class AlertCheckRequest(BaseModel):
    metrics: dict
    tickers: list[str] = Field(default_factory=list)


@app.post("/api/alerts")
async def create_alert_endpoint(req: AlertCreateRequest, request: Request, _auth=Depends(_verify_token)):
    """Create a new portfolio alert rule."""
    _check_rate(request.client.host, "ai", limit=30, window=60)
    from alerts import create_alert
    try:
        return create_alert(req.name, req.tickers, req.alert_type, req.threshold, req.comparison)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@app.get("/api/alerts")
async def list_alerts_endpoint(request: Request, _auth=Depends(_verify_token)):
    """List all alert rules."""
    from alerts import list_alerts
    return {"alerts": list_alerts()}


@app.delete("/api/alerts/{alert_id}")
async def delete_alert_endpoint(alert_id: int, request: Request, _auth=Depends(_verify_token)):
    """Delete an alert rule."""
    from alerts import delete_alert
    if not delete_alert(alert_id):
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    return {"deleted": alert_id}


@app.post("/api/alerts/check")
async def check_alerts_endpoint(req: AlertCheckRequest, request: Request, _auth=Depends(_verify_token)):
    """Check metrics against all active alerts. Returns triggered alerts."""
    from alerts import check_alerts
    triggered = check_alerts(req.metrics, req.tickers)
    return {"triggered": triggered, "count": len(triggered)}


# ═══════════════════════════════════════════════════════════════════════════════
# ─── News context helper (used by /api/advisor) ───────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_ticker_news(ticker: str) -> str:
    """Fetch latest 2 news headlines for a ticker from Yahoo Finance."""
    url = (
        f"https://query2.finance.yahoo.com/v1/finance/search"
        f"?q={ticker}&newsCount=2&enableFuzzyQuery=false&lang=en-US"
    )
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            items = resp.json().get("news", [])
            if items:
                return "; ".join(item.get("title", "") for item in items[:2])
    except Exception:
        pass
    return ""


# ═══════════════════════════════════════════════════════════════════════════════
# ─── Stripe Checkout & Webhook ────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class CheckoutRequest(BaseModel):
    price_id: str


@app.post("/api/stripe/checkout")
async def create_checkout_session(req: CheckoutRequest, request: Request):
    """Create a Stripe Checkout session and return the redirect URL."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured.")

    auth = await get_auth(request)
    auth.require_auth()

    if req.price_id not in (STRIPE_PRO_PRICE_ID, STRIPE_ENT_PRICE_ID):
        raise HTTPException(status_code=400, detail="Invalid price ID.")

    try:
        session = stripe_lib.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": req.price_id, "quantity": 1}],
            mode="subscription",
            customer_email=auth.email,
            metadata={"supabase_user_id": auth.user_id},
            success_url=f"{SITE_URL}/settings?payment=success",
            cancel_url=f"{SITE_URL}/settings?payment=cancel",
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    """Receive Stripe webhook events and update user tier in Supabase."""
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Stripe webhook secret not configured.")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe_lib.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload.")
    except stripe_lib.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature.")

    from auth import _get_supabase
    supabase = _get_supabase()

    event_type = event["type"]

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("supabase_user_id")
        price_id = None
        # Fetch line items to determine which plan was bought
        try:
            items = stripe_lib.checkout.Session.list_line_items(session["id"])
            price_id = items.data[0].price.id if items.data else None
        except Exception:
            pass

        if user_id and price_id:
            tier = "pro" if price_id == STRIPE_PRO_PRICE_ID else "enterprise"
            supabase.table("profiles").update({"tier": tier}).eq("id", user_id).execute()
            stripe_customer_id = session.get("customer")
            subscription_id = session.get("subscription")
            supabase.table("profiles").update({
                "stripe_customer_id": stripe_customer_id,
                "stripe_subscription_id": subscription_id,
            }).eq("id", user_id).execute()

    elif event_type in ("customer.subscription.deleted",):
        subscription = event["data"]["object"]
        customer_id = subscription.get("customer")
        if customer_id:
            supabase.table("profiles").update({"tier": "free"}).eq("stripe_customer_id", customer_id).execute()

    elif event_type == "customer.subscription.updated":
        subscription = event["data"]["object"]
        customer_id = subscription.get("customer")
        status = subscription.get("status")
        if customer_id and status not in ("active", "trialing"):
            supabase.table("profiles").update({"tier": "free"}).eq("stripe_customer_id", customer_id).execute()

    return {"received": True}


# ═══════════════════════════════════════════════════════════════════════════════
# ─── Settings: Enterprise API Key ─────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/settings/api-key")
async def create_api_key(request: Request):
    """Generate (or regenerate) an API key for Enterprise users."""
    auth = await get_auth(request)
    auth.require_tier("enterprise")
    key = await generate_api_key(auth.user_id)
    return {"api_key": key}
