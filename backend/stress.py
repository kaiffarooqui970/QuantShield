"""
QuantShield Stress Testing Engine
Applies historical scenario shocks to a portfolio and reports before/after risk metrics.
"""

import numpy as np
import pandas as pd
from typing import Optional

from engine import fetch_portfolio_prices

RISK_FREE_RATE = 0.0525
TRADING_DAYS = 252

# Each scenario carries:
#   portfolio_shock  : immediate fractional loss applied to starting value
#   vol_scale        : multiplier on the historical covariance matrix (sigma * vol_scale)
#                      reflects that crises cause volatility to spike
#   return_adj       : absolute annual return adjustment (e.g. -0.05 = -5 ppts)
#                      reflects that forward expected returns compress during crises
# These are the levers that make stressed Expected Return / Vol / Sharpe actually move.
BUILTIN_SCENARIOS: dict[str, dict] = {
    "2008_crash": {
        "name": "2008 Financial Crisis",
        "description": "Lehman Brothers collapse, global credit crunch — ~50% equity drawdown over 17 months",
        "portfolio_shock": -0.50,
        "vol_scale": 2.5,      # VIX peaked at ~80, roughly 2.5× normal
        "return_adj": -0.07,   # forward earnings collapse; -7 ppts annual
    },
    "covid_drop": {
        "name": "COVID-19 Crash (Mar 2020)",
        "description": "Pandemic-driven panic selling — fastest -35% decline in market history, recovered in 5 months",
        "portfolio_shock": -0.35,
        "vol_scale": 2.0,
        "return_adj": -0.04,
    },
    "rate_shock": {
        "name": "Rate Shock +300bps",
        "description": "Fed emergency hike of 300bps repricing growth/tech assets sharply lower (~2022 scenario)",
        "portfolio_shock": -0.22,
        "vol_scale": 1.6,
        "return_adj": -0.03,   # higher rates hurt growth valuations but not catastrophic
    },
    "tech_bubble": {
        "name": "Dot-com Bubble Burst",
        "description": "2000–2002 NASDAQ collapse — tech stocks lose ~78% peak-to-trough over 31 months",
        "portfolio_shock": -0.78,
        "vol_scale": 2.2,
        "return_adj": -0.10,
    },
}


def _compute_metrics(
    prices: pd.DataFrame,
    weights: np.ndarray,
    initial_value: float,
    n_simulations: int = 1000,
    simulation_days: int = 252,
    seed: int = 42,
    vol_scale: float = 1.0,
    return_adj: float = 0.0,
) -> dict:
    """
    Compute MC risk metrics from a price DataFrame.

    vol_scale  : multiply the covariance matrix by this factor (sigma scaled by sqrt).
                 Allows stressed scenarios to reflect crisis-level volatility.
    return_adj : additive annual return adjustment (e.g. -0.05 means -5 ppts/yr).
                 Applied to daily drift so that expected return and Sharpe actually change.
    """
    n = len(prices.columns)
    rng = np.random.default_rng(seed)

    log_returns = np.log(prices / prices.shift(1)).dropna()
    mu = log_returns.mean().values
    cov = log_returns.cov().values * (vol_scale ** 2)    # scale variance; sigma scales by vol_scale
    sigma = np.sqrt(np.diag(cov))

    # Apply return adjustment: convert annual adj to daily and add to mu
    daily_return_adj = return_adj / TRADING_DAYS
    mu_stressed = mu + daily_return_adj

    annual_return = float(weights @ (mu_stressed * TRADING_DAYS))
    annual_vol = float(np.sqrt(weights @ cov @ weights) * np.sqrt(TRADING_DAYS))

    try:
        chol = np.linalg.cholesky(cov + 1e-10 * np.eye(n))
    except np.linalg.LinAlgError:
        chol = np.eye(n)

    Z = rng.standard_normal((n_simulations, simulation_days, n))
    shocks = Z @ chol.T
    drift = mu_stressed - 0.5 * sigma ** 2
    increments = drift + sigma * shocks
    paths = initial_value * (np.exp(np.cumsum(increments, axis=1)) @ weights)

    final = paths[:, -1]
    pnl = final - initial_value

    var_95 = float(np.percentile(pnl, 5))
    var_99 = float(np.percentile(pnl, 1))
    cvar_95 = float(pnl[pnl <= var_95].mean()) if (pnl <= var_95).any() else var_95
    cvar_99 = float(pnl[pnl <= var_99].mean()) if (pnl <= var_99).any() else var_99

    running_max = np.maximum.accumulate(paths, axis=1)
    max_dd = float(((paths - running_max) / running_max).min())

    sharpe = (annual_return - RISK_FREE_RATE) / annual_vol if annual_vol > 0 else 0.0
    daily_pct = (paths[:, 1:] - paths[:, :-1]) / paths[:, :-1]
    down = daily_pct[daily_pct < 0]
    down_std = float(np.sqrt(np.mean(down ** 2)) * np.sqrt(TRADING_DAYS)) if len(down) > 0 else annual_vol
    sortino = (annual_return - RISK_FREE_RATE) / down_std if down_std > 0 else 0.0

    return {
        "expected_annual_return": round(annual_return * 100, 2),
        "annual_volatility": round(annual_vol * 100, 2),
        "sharpe_ratio": round(sharpe, 4),
        "sortino_ratio": round(sortino, 4),
        "max_drawdown": round(max_dd * 100, 2),
        "var_95": round(var_95, 2),
        "var_99": round(var_99, 2),
        "cvar_95": round(cvar_95, 2),
        "cvar_99": round(cvar_99, 2),
        "median_final_value": round(float(np.median(final)), 2),
        "p5_final_value": round(float(np.percentile(final, 5)), 2),
        "p95_final_value": round(float(np.percentile(final, 95)), 2),
    }


def run_stress_test(
    tickers: list[str],
    weights: list[float],
    scenario: str,
    initial_portfolio_value: float = 10_000.0,
    custom_shocks: Optional[dict[str, float]] = None,
    simulation_days: int = 252,
    n_simulations: int = 1000,
) -> dict:
    """
    Run a stress test on a portfolio under a named scenario.

    The immediate shock scales the starting portfolio value.  Forward simulation
    uses scenario-specific vol_scale and return_adj so that Expected Return,
    Volatility, and Sharpe genuinely change — not just dollar metrics.

    Parameters
    ----------
    tickers          : list of ticker symbols
    weights          : portfolio weights (normalised internally)
    scenario         : one of BUILTIN_SCENARIOS keys, or 'custom'
    custom_shocks    : {ticker: fractional_shock} — required for scenario='custom'
    """
    n = len(tickers)
    w = np.array(weights if weights else [1.0 / n] * n, dtype=float)
    w /= w.sum()

    prices = fetch_portfolio_prices(tickers)

    # ── Baseline (no scaling) ─────────────────────────────────────────────────
    baseline = _compute_metrics(prices, w, initial_portfolio_value, n_simulations, simulation_days)

    # ── Resolve scenario ──────────────────────────────────────────────────────
    vol_scale  = 1.0
    return_adj = 0.0

    if scenario == "custom":
        if not custom_shocks:
            raise ValueError("custom_shocks dict is required when scenario='custom'.")
        scenario_meta = {
            "name": "Custom Scenario",
            "description": "User-defined per-asset shocks",
        }
        portfolio_shock = float(sum(w[i] * custom_shocks.get(tickers[i], 0.0) for i in range(n)))
        # Derive stress factors from shock magnitude: larger shock → more vol, lower return
        abs_shock = abs(portfolio_shock)
        vol_scale  = 1.0 + abs_shock * 3.0   # e.g. -30% shock → vol_scale ≈ 1.9
        return_adj = -abs_shock * 0.15        # rough forward return compression

    elif scenario in BUILTIN_SCENARIOS:
        s = BUILTIN_SCENARIOS[scenario]
        scenario_meta = {"name": s["name"], "description": s["description"]}
        portfolio_shock = s["portfolio_shock"]
        vol_scale  = s["vol_scale"]
        return_adj = s["return_adj"]

    else:
        valid = list(BUILTIN_SCENARIOS.keys()) + ["custom"]
        raise ValueError(f"Unknown scenario '{scenario}'. Valid: {valid}")

    shocked_initial = max(initial_portfolio_value * (1.0 + portfolio_shock), 100.0)

    # ── Stressed metrics: use original price history but apply vol/return stress ─
    # (Applying a uniform multiplier to prices cancels in log-returns, so we stress
    #  the *distribution parameters* directly via vol_scale and return_adj instead.)
    stressed = _compute_metrics(
        prices, w, shocked_initial, n_simulations, simulation_days,
        seed=99, vol_scale=vol_scale, return_adj=return_adj,
    )

    # ── Deltas ────────────────────────────────────────────────────────────────
    delta: dict = {}
    for k, bv in baseline.items():
        sv = stressed.get(k)
        if isinstance(bv, (int, float)) and isinstance(sv, (int, float)):
            delta[k] = round(sv - bv, 4)
        else:
            delta[k] = None

    return {
        "scenario": scenario,
        "scenario_name": scenario_meta["name"],
        "scenario_description": scenario_meta["description"],
        "tickers": tickers,
        "weights": [round(float(x), 4) for x in w],
        "baseline_metrics": baseline,
        "stressed_metrics": stressed,
        "delta_metrics": delta,
        "immediate_loss_usd": round(shocked_initial - initial_portfolio_value, 2),
        "immediate_loss_pct": round(portfolio_shock * 100, 2),
    }
