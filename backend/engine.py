"""
QuantShield Risk Simulation Engine
Monte Carlo GBM-based portfolio risk analytics
"""

import numpy as np
import pandas as pd
import requests
from datetime import datetime, timedelta
from typing import Optional, TypedDict
import warnings

warnings.filterwarnings("ignore")

# ─── Constants ────────────────────────────────────────────────────────────────

TRADING_DAYS_PER_YEAR: int = 252
_RISK_FREE_RATE: float = 0.0525


# ─── Result Type ──────────────────────────────────────────────────────────────

class SimulationResult(TypedDict):
    tickers: list
    weights: list
    simulation_days: int
    n_simulations: int
    initial_portfolio_value: float
    metrics: dict
    paths: dict
    risk_contribution: dict
    correlation_matrix: dict


# ─── Modular Analytics Functions ─────────────────────────────────────────────

def build_portfolio_returns(prices: pd.DataFrame, weights: Optional[list] = None) -> np.ndarray:
    """Compute equal-weighted (or custom-weighted) portfolio log returns from price DataFrame."""
    n = len(prices.columns)
    w = np.array(weights, dtype=float) if weights is not None else np.full(n, 1.0 / n)
    w /= w.sum()
    log_rets = np.log(prices / prices.shift(1)).dropna()
    return (log_rets.values @ w).astype(np.float64)


def run_gbm_simulation(
    portfolio_log_returns: np.ndarray,
    projection_days: int,
    n_simulations: int,
    rng_seed: Optional[int] = None,
) -> np.ndarray:
    """
    Simulate GBM paths from historical portfolio log returns.

    Returns array of shape (n_simulations, projection_days + 1).
    Column 0 is the starting value 1.0; subsequent columns are cumulative price ratios.
    """
    rng = np.random.default_rng(rng_seed)
    mu = portfolio_log_returns.mean()
    sigma = portfolio_log_returns.std(ddof=1)
    drift = mu - 0.5 * sigma ** 2
    shocks = rng.standard_normal((n_simulations, projection_days))
    increments = drift + sigma * shocks
    log_paths = np.cumsum(increments, axis=1)
    price_paths = np.exp(log_paths)
    ones = np.ones((n_simulations, 1))
    return np.concatenate([ones, price_paths], axis=1)


def calculate_expected_return(log_returns: np.ndarray) -> float:
    """Annualised expected return from daily log returns (converts to simple return first)."""
    return float(np.expm1(log_returns.mean()) * TRADING_DAYS_PER_YEAR)


def calculate_sharpe_ratio(
    log_returns: np.ndarray,
    risk_free_rate: float = _RISK_FREE_RATE,
) -> float:
    """Annualised Sharpe ratio. Returns 0.0 when volatility is zero."""
    vol = log_returns.std(ddof=1)
    if vol == 0.0:
        return 0.0
    annual_return = log_returns.mean() * TRADING_DAYS_PER_YEAR
    annual_vol = vol * np.sqrt(TRADING_DAYS_PER_YEAR)
    return float((annual_return - risk_free_rate) / annual_vol)


def calculate_max_drawdown(paths: np.ndarray) -> float:
    """
    Worst peak-to-trough drawdown across all simulation paths.

    paths shape: (n_simulations, n_days)
    Returns a value <= 0.
    """
    running_max = np.maximum.accumulate(paths, axis=1)
    drawdowns = (paths - running_max) / running_max
    return float(drawdowns.min())


def calculate_var_cvar(
    log_returns: np.ndarray,
    portfolio_value: float = 1.0,
) -> tuple:
    """
    Compute VaR 95%, VaR 99%, and CVaR 99% from a daily log-return series.

    Returns (var_95, var_99, cvar_99) – all <= 0.
    """
    pnl = log_returns * portfolio_value
    var95 = float(np.percentile(pnl, 5))
    var99 = float(np.percentile(pnl, 1))
    tail = pnl[pnl <= var99]
    cvar99 = float(tail.mean()) if len(tail) > 0 else var99
    return min(var95, 0.0), min(var99, 0.0), min(cvar99, 0.0)

# ─── Yahoo Finance Fetch ──────────────────────────────────────────────────────

def _fetch_price_series(ticker: str, days_back: int = 730) -> pd.Series:
    """Fetch adjusted close prices from Yahoo Finance v8 chart API with fallback."""
    end_ts = int(datetime.now().timestamp())
    start_ts = int((datetime.now() - timedelta(days=days_back)).timestamp())

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }

    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?period1={start_ts}&period2={end_ts}&interval=1d&includeAdjustedClose=true"
    )
    try:
        resp = requests.get(url, headers=headers, timeout=12)
        resp.raise_for_status()
        data = resp.json()
        result = data["chart"]["result"][0]
        timestamps = result["timestamp"]
        closes = (
            result["indicators"].get("adjclose", [{}])[0].get("adjclose")
            or result["indicators"]["quote"][0]["close"]
        )
        series = pd.Series(closes, index=pd.to_datetime(timestamps, unit="s"), name=ticker)
        return series.dropna()
    except Exception as e:
        # Fallback: v7 download endpoint
        url2 = (
            f"https://query2.finance.yahoo.com/v7/finance/download/{ticker}"
            f"?period1={start_ts}&period2={end_ts}&interval=1d&events=history"
        )
        try:
            resp2 = requests.get(url2, headers=headers, timeout=12)
            resp2.raise_for_status()
            from io import StringIO
            df = pd.read_csv(StringIO(resp2.text))
            df["Date"] = pd.to_datetime(df["Date"])
            df = df.set_index("Date").sort_index()
            col = "Adj Close" if "Adj Close" in df.columns else "Close"
            return df[col].dropna().rename(ticker)
        except Exception as e2:
            raise ValueError(
                f"Could not fetch data for ticker '{ticker}'. "
                f"Primary error: {e}. Fallback error: {e2}"
            )


def fetch_portfolio_prices(tickers: list[str], days_back: int = 730) -> pd.DataFrame:
    """Fetch and align price data for all tickers."""
    series_list = []
    for t in tickers:
        s = _fetch_price_series(t.upper(), days_back)
        series_list.append(s)
    df = pd.concat(series_list, axis=1).dropna()
    if df.empty or len(df) < 30:
        raise ValueError("Insufficient overlapping price data across tickers.")
    return df


# ─── GBM Monte Carlo Engine ───────────────────────────────────────────────────

def run_monte_carlo(
    tickers: list[str],
    simulation_days: int = 252,
    n_simulations: int = 1000,
    weights: Optional[list[float]] = None,
    initial_portfolio_value: float = 10_000.0,
    model: str = "gbm",          # "gbm" | "student_t"
    student_t_df: int = 5,       # degrees of freedom (Student-t only)
) -> dict:
    """
    Run a Geometric Brownian Motion Monte Carlo simulation on a portfolio.

    Returns a rich dict of risk metrics and simulation paths.
    """
    if not tickers:
        raise ValueError("At least one ticker must be provided.")

    n = len(tickers)
    if weights is None:
        weights = [1.0 / n] * n
    weights = np.array(weights, dtype=float)
    weights /= weights.sum()  # normalise

    # ── Fetch historical prices ───────────────────────────────────────────────
    prices = fetch_portfolio_prices(tickers)
    log_returns = np.log(prices / prices.shift(1)).dropna()

    # ── Historical statistics ─────────────────────────────────────────────────
    mu = log_returns.mean().values                       # daily mean log-returns
    cov_matrix = log_returns.cov().values                # daily covariance matrix
    sigma = np.sqrt(np.diag(cov_matrix))                 # daily std-devs
    chol = np.linalg.cholesky(cov_matrix + 1e-10 * np.eye(n))

    # Annualised figures
    annual_mu = mu * 252
    annual_sigma = sigma * np.sqrt(252)
    portfolio_annual_return = float(weights @ annual_mu)
    portfolio_annual_vol = float(
        np.sqrt(weights @ cov_matrix @ weights) * np.sqrt(252)
    )

    # ── Monte Carlo paths ─────────────────────────────────────────────────────
    # Shape: (n_simulations, simulation_days, n_assets)
    rng = np.random.default_rng()
    if model == "student_t":
        # Student-t draws normalised to unit variance: divide by sqrt(df/(df-2))
        df = max(int(student_t_df), 3)
        raw = rng.standard_t(df=df, size=(n_simulations, simulation_days, n))
        rand_normals = raw / np.sqrt(df / (df - 2))
    else:
        rand_normals = rng.standard_normal((n_simulations, simulation_days, n))
    correlated_shocks = rand_normals @ chol.T  # (sims, days, n)

    # Daily log-return increments using GBM discretisation
    dt = 1.0
    drift = (mu - 0.5 * sigma ** 2) * dt                 # (n,)
    diffusion = sigma * np.sqrt(dt) * correlated_shocks   # (sims, days, n)
    increments = drift + diffusion                         # (sims, days, n)

    # Cumulative price paths (relative to 1.0)
    log_cum = np.cumsum(increments, axis=1)               # (sims, days, n)
    price_paths = np.exp(log_cum)                          # (sims, days, n)

    # Portfolio value paths
    portfolio_paths = initial_portfolio_value * (price_paths @ weights)  # (sims, days)

    # ── Risk Metrics ──────────────────────────────────────────────────────────
    final_values = portfolio_paths[:, -1]                 # (sims,)
    pnl = final_values - initial_portfolio_value

    # VaR / CVaR
    var_95 = float(np.percentile(pnl, 5))
    var_99 = float(np.percentile(pnl, 1))
    cvar_95 = float(pnl[pnl <= var_95].mean()) if (pnl <= var_95).any() else var_95
    cvar_99 = float(pnl[pnl <= var_99].mean()) if (pnl <= var_99).any() else var_99

    # Max Drawdown (across all simulations → worst-case)
    running_max = np.maximum.accumulate(portfolio_paths, axis=1)
    drawdowns = (portfolio_paths - running_max) / running_max
    max_drawdown = float(drawdowns.min())

    # Sharpe Ratio (annualised, risk-free ≈ 5.25% ≈ current fed rate)
    risk_free_rate = 0.0525
    sharpe = (
        (portfolio_annual_return - risk_free_rate) / portfolio_annual_vol
        if portfolio_annual_vol > 0
        else 0.0
    )

    # Sortino Ratio (downside deviation)
    portfolio_daily_pnl_pct = (portfolio_paths[:, 1:] - portfolio_paths[:, :-1]) / portfolio_paths[:, :-1]
    mean_daily_return = portfolio_daily_pnl_pct.mean()
    downside_returns = portfolio_daily_pnl_pct[portfolio_daily_pnl_pct < 0]
    downside_std = (
        np.sqrt(np.mean(downside_returns ** 2)) * np.sqrt(252)
        if len(downside_returns) > 0
        else portfolio_annual_vol
    )
    sortino = (portfolio_annual_return - risk_free_rate) / downside_std if downside_std > 0 else 0.0

    # Median / P5 / P95 paths for charting (sampled to 252 points max)
    sample_paths = portfolio_paths[:50, :]  # send 50 paths for charting
    p5_path = np.percentile(portfolio_paths, 5, axis=0).tolist()
    median_path = np.percentile(portfolio_paths, 50, axis=0).tolist()
    p95_path = np.percentile(portfolio_paths, 95, axis=0).tolist()

    # Per-asset contribution to portfolio volatility (sums to 100 %)
    portfolio_variance = float(weights @ cov_matrix @ weights)
    risk_contribution = {
        tickers[i]: float(round(weights[i] * (cov_matrix @ weights)[i] / portfolio_variance * 100, 2))
        for i in range(n)
    }

    # Correlation matrix
    corr_matrix = log_returns.corr().round(4).to_dict()

    return {
        "tickers": tickers,
        "weights": weights.tolist(),
        "simulation_days": simulation_days,
        "n_simulations": n_simulations,
        "initial_portfolio_value": initial_portfolio_value,
        "metrics": {
            "expected_annual_return": round(portfolio_annual_return * 100, 4),
            "annual_volatility": round(portfolio_annual_vol * 100, 4),
            "sharpe_ratio": round(sharpe, 4),
            "sortino_ratio": round(sortino, 4),
            "max_drawdown": round(max_drawdown * 100, 4),
            "var_95": round(var_95, 2),
            "var_99": round(var_99, 2),
            "cvar_95": round(cvar_95, 2),
            "cvar_99": round(cvar_99, 2),
            "median_final_value": round(float(np.median(final_values)), 2),
            "p5_final_value": round(float(np.percentile(final_values, 5)), 2),
            "p95_final_value": round(float(np.percentile(final_values, 95)), 2),
        },
        "paths": {
            "p5": [round(v, 2) for v in p5_path],
            "median": [round(v, 2) for v in median_path],
            "p95": [round(v, 2) for v in p95_path],
        },
        "risk_contribution": risk_contribution,
        "correlation_matrix": corr_matrix,
    }