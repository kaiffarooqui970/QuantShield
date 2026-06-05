"""
QuantShield Backtesting Engine
Static or periodically-rebalanced portfolio backtest with multi-benchmark support.
"""

import numpy as np
import pandas as pd
from typing import Optional

from engine import fetch_portfolio_prices

RISK_FREE_RATE = 0.0525
TRADING_DAYS   = 252

_REBAL_PERIODS = {"monthly": 21, "quarterly": 63, "annual": 252}


def _build_portfolio_curve(
    port_prices: pd.DataFrame,
    w: np.ndarray,
    initial_value: float,
    rebalance_frequency: str,
) -> pd.Series:
    """Return a portfolio-value time series, optionally with periodic rebalancing."""
    period = _REBAL_PERIODS.get(rebalance_frequency)

    if period is None:
        # Simple buy-and-hold
        norm = port_prices / port_prices.iloc[0]
        return (norm @ w) * initial_value

    # Periodic rebalancing: buy-and-hold within each window, then reset weights
    n = len(port_prices)
    all_values: list[float] = []
    current_val = initial_value

    i = 0
    while i < n:
        end = min(i + period, n)
        window = port_prices.iloc[i:end]
        norm = window / window.iloc[0]
        window_vals = (norm @ w) * current_val
        # Avoid duplicating the boundary point
        slice_vals = window_vals.values if i == 0 else window_vals.values[1:]
        all_values.extend(slice_vals.tolist())
        current_val = float(window_vals.iloc[-1])
        i = end

    return pd.Series(all_values[:n], index=port_prices.index)


def _bench_stats(
    bench_series: pd.Series,
    ticker: str,
    n_years: float,
    chart_idx: pd.Index,
    step: int,
) -> tuple[dict, list[dict]]:
    b_rets   = bench_series.pct_change().dropna()
    b_total  = float(bench_series.iloc[-1] / bench_series.iloc[0] - 1)
    b_cagr   = float((1.0 + b_total) ** (1.0 / max(n_years, 0.001)) - 1)
    b_vol    = float(b_rets.std() * np.sqrt(TRADING_DAYS))
    b_rm     = bench_series.cummax()
    b_dd     = float(((bench_series - b_rm) / b_rm).min())
    b_sharpe = (b_cagr - RISK_FREE_RATE) / b_vol if b_vol > 0 else 0.0

    stats = {
        "ticker":                ticker,
        "total_return_pct":      round(b_total * 100, 2),
        "cagr_pct":              round(b_cagr * 100, 2),
        "annual_volatility_pct": round(b_vol * 100, 2),
        "max_drawdown_pct":      round(b_dd * 100, 2),
        "sharpe_ratio":          round(b_sharpe, 4),
        "final_value":           round(float(bench_series.iloc[-1]), 2),
    }
    curve = [
        {"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
        for d, v in zip(chart_idx, bench_series[::step])
    ]
    return stats, curve


def run_backtest(
    tickers: list[str],
    weights: list[float],
    initial_value: float = 10_000.0,
    benchmark_tickers: list[str] | None = None,
    days_back: int = 1260,
    rebalance_frequency: str = "none",   # "none" | "monthly" | "quarterly" | "annual"
) -> dict:
    """
    Backtest a portfolio (buy-and-hold or periodically rebalanced) against 1–3 benchmarks.
    """
    if benchmark_tickers is None:
        benchmark_tickers = ["SPY"]

    n = len(tickers)
    w = np.array(weights if weights else [1.0 / n] * n, dtype=float)
    w /= w.sum()

    # Fetch all price data in one shot so dates align
    unique_tickers = list(dict.fromkeys(tickers + benchmark_tickers))
    try:
        all_prices = fetch_portfolio_prices(unique_tickers, days_back=days_back)
    except ValueError:
        all_prices = fetch_portfolio_prices(tickers, days_back=days_back)
        benchmark_tickers = [b for b in benchmark_tickers if b in all_prices.columns]

    port_prices = all_prices[tickers]

    # ── Portfolio equity curve ────────────────────────────────────────────────
    port_values = _build_portfolio_curve(port_prices, w, initial_value, rebalance_frequency)

    # ── Core statistics ───────────────────────────────────────────────────────
    port_returns = port_values.pct_change().dropna()
    n_days  = len(port_returns)
    n_years = n_days / TRADING_DAYS

    total_ret  = float(port_values.iloc[-1] / port_values.iloc[0] - 1)
    cagr       = float((1.0 + total_ret) ** (1.0 / max(n_years, 0.001)) - 1)
    annual_vol = float(port_returns.std() * np.sqrt(TRADING_DAYS))
    sharpe     = (cagr - RISK_FREE_RATE) / annual_vol if annual_vol > 0 else 0.0

    down_rets = port_returns[port_returns < 0]
    down_std  = float(down_rets.std() * np.sqrt(TRADING_DAYS)) if len(down_rets) > 0 else annual_vol
    sortino   = (cagr - RISK_FREE_RATE) / down_std if down_std > 0 else 0.0

    # ── Drawdown ──────────────────────────────────────────────────────────────
    roll_max = port_values.cummax()
    dd_series = (port_values - roll_max) / roll_max
    max_dd = float(dd_series.min())

    # ── Downsample for chart payloads ─────────────────────────────────────────
    step = max(1, len(port_values) // 500)
    chart_idx = port_values.index[::step]

    equity_curve = [
        {"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
        for d, v in zip(chart_idx, port_values[::step])
    ]
    underwater_curve = [
        {"date": d.strftime("%Y-%m-%d"), "drawdown_pct": round(float(v) * 100, 2)}
        for d, v in zip(chart_idx, dd_series[::step])
    ]

    # ── Rolling 12m returns ───────────────────────────────────────────────────
    roll_12m  = port_values.pct_change(TRADING_DAYS).dropna()
    roll_step = max(1, len(roll_12m) // 300)
    rolling_12m = [
        {"date": d.strftime("%Y-%m-%d"), "return_pct": round(float(v) * 100, 2)}
        for d, v in zip(roll_12m.index[::roll_step], roll_12m[::roll_step])
    ]

    # ── Calendar-year returns ─────────────────────────────────────────────────
    yearly = port_values.resample("YE").last()
    calendar_returns = [
        {"year": int(yearly.index[i].year),
         "return_pct": round(float(yearly.iloc[i] / yearly.iloc[i - 1] - 1) * 100, 2)}
        for i in range(1, len(yearly))
    ]

    # ── Multi-benchmark ───────────────────────────────────────────────────────
    benchmarks_stats: list[dict]  = []
    benchmarks_curves: list[list] = []

    for bt in benchmark_tickers:
        if bt not in all_prices.columns:
            continue
        b_series = (all_prices[bt] / all_prices[bt].iloc[0]) * initial_value
        stats, curve = _bench_stats(b_series, bt, n_years, chart_idx, step)
        benchmarks_stats.append(stats)
        benchmarks_curves.append(curve)

    # Keep legacy single-benchmark keys for backward compat
    benchmark_stats = benchmarks_stats[0] if benchmarks_stats else None
    benchmark_curve = benchmarks_curves[0] if benchmarks_curves else None

    return {
        "tickers":              tickers,
        "weights":              [round(float(x), 4) for x in w],
        "benchmark":            benchmark_tickers[0] if benchmark_tickers else None,
        "rebalance_frequency":  rebalance_frequency,
        "period_years":         round(n_years, 2),
        "start_date":           port_values.index[0].strftime("%Y-%m-%d"),
        "end_date":             port_values.index[-1].strftime("%Y-%m-%d"),
        "summary": {
            "total_return_pct":      round(total_ret * 100, 2),
            "cagr_pct":              round(cagr * 100, 2),
            "annual_volatility_pct": round(annual_vol * 100, 2),
            "max_drawdown_pct":      round(max_dd * 100, 2),
            "sharpe_ratio":          round(sharpe, 4),
            "sortino_ratio":         round(sortino, 4),
            "final_value":           round(float(port_values.iloc[-1]), 2),
        },
        "benchmark_stats":      benchmark_stats,
        "benchmark_curve":      benchmark_curve,
        # Extended multi-benchmark arrays
        "benchmarks_stats":     benchmarks_stats,
        "benchmarks_curves":    benchmarks_curves,
        "equity_curve":         equity_curve,
        "underwater_curve":     underwater_curve,
        "rolling_12m_returns":  rolling_12m,
        "calendar_year_returns": calendar_returns,
    }
