"""
QuantShield Portfolio Optimizer
Efficient frontier generation, max-Sharpe, and min-volatility optimisation.
"""

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from typing import Optional

from engine import fetch_portfolio_prices

_RISK_FREE_RATE = 0.0525


class PortfolioOptimizer:
    def __init__(self, historical_prices: pd.DataFrame, risk_free_rate: float = _RISK_FREE_RATE):
        self.prices = historical_prices
        self.risk_free_rate = risk_free_rate
        self.returns = np.log(self.prices / self.prices.shift(1)).dropna()
        self.mean_returns = self.returns.mean() * 252
        self.cov_matrix = self.returns.cov() * 252
        self.tickers = historical_prices.columns.tolist()

    def portfolio_performance(self, weights: np.ndarray) -> tuple[float, float]:
        """Return (annualised_return, annualised_volatility) for given weights."""
        ret = float(np.sum(self.mean_returns * weights))
        vol = float(np.sqrt(weights @ self.cov_matrix.values @ weights))
        return ret, vol

    def _neg_sharpe(self, w: np.ndarray) -> float:
        r, s = self.portfolio_performance(w)
        return -(r - self.risk_free_rate) / s if s > 0 else 0.0

    def _portfolio_vol(self, w: np.ndarray) -> float:
        return self.portfolio_performance(w)[1]

    def _solve(self, objective, extra_constraints: list | None = None) -> dict:
        n = len(self.tickers)
        constraints = [{"type": "eq", "fun": lambda x: np.sum(x) - 1}]
        if extra_constraints:
            constraints.extend(extra_constraints)
        bounds = tuple((0.0, 1.0) for _ in range(n))
        x0 = np.full(n, 1.0 / n)
        res = minimize(objective, x0, method="SLSQP", bounds=bounds, constraints=constraints,
                       options={"ftol": 1e-9, "maxiter": 1000})
        w = res.x
        ret, vol = self.portfolio_performance(w)
        sharpe = (ret - self.risk_free_rate) / vol if vol > 0 else 0.0
        return {
            "weights":        {self.tickers[i]: round(float(w[i]), 4) for i in range(n)},
            "return_pct":     round(ret * 100, 2),
            "volatility_pct": round(vol * 100, 2),
            "sharpe_ratio":   round(sharpe, 4),
        }

    def optimize_max_sharpe(self) -> dict:
        return self._solve(self._neg_sharpe)

    def optimize_min_vol(self) -> dict:
        return self._solve(self._portfolio_vol)

    def optimize_target_return(self, target_return: float) -> dict:
        """Minimum-vol portfolio for a specified target annual return."""
        extra = [{"type": "eq", "fun": lambda w: float(np.sum(self.mean_returns * w)) - target_return}]
        return self._solve(self._portfolio_vol, extra_constraints=extra)


# ─── Frontier generation ──────────────────────────────────────────────────────

def run_efficient_frontier(
    tickers: list[str],
    n_portfolios: int = 500,
) -> dict:
    """
    Generate the efficient frontier via random Dirichlet weight sampling,
    plus analytically-optimised min-vol and max-Sharpe portfolios.

    Returns
    -------
    dict with keys: tickers, frontier (list of points), min_volatility, max_sharpe.
    """
    prices = fetch_portfolio_prices(tickers)
    opt = PortfolioOptimizer(prices)
    n = len(tickers)

    rng = np.random.default_rng(42)
    frontier: list[dict] = []
    for _ in range(n_portfolios):
        w = rng.dirichlet(np.ones(n))
        ret, vol = opt.portfolio_performance(w)
        sharpe = (ret - _RISK_FREE_RATE) / vol if vol > 0 else 0.0
        frontier.append({
            "volatility_pct": round(vol * 100, 3),
            "return_pct":     round(ret * 100, 3),
            "sharpe_ratio":   round(sharpe, 4),
            "weights":        {tickers[i]: round(float(w[i]), 4) for i in range(n)},
        })

    min_vol    = opt.optimize_min_vol()
    max_sharpe = opt.optimize_max_sharpe()

    # Add optimised points to the frontier list for rendering
    frontier.append({**min_vol, "is_min_vol": True, "is_max_sharpe": False})
    frontier.append({**max_sharpe, "is_min_vol": False, "is_max_sharpe": True})

    return {
        "tickers":       tickers,
        "n_portfolios":  n_portfolios,
        "frontier":      frontier,
        "min_volatility": min_vol,
        "max_sharpe":     max_sharpe,
    }
