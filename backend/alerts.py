"""
QuantShield Portfolio Alerts
SQLite-backed alert rules with real-time trigger checking against simulation metrics.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "quantshield_alerts.db"

ALERT_TYPES = {
    "var_95_breach":      "VaR 95% exceeds threshold (absolute $)",
    "drawdown_threshold": "Max drawdown exceeds threshold (%)",
    "sharpe_drop":        "Sharpe ratio falls below threshold",
    "volatility_spike":   "Annual volatility exceeds threshold (%)",
}


# ─── DB init ──────────────────────────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT    NOT NULL,
                tickers       TEXT    NOT NULL,
                alert_type    TEXT    NOT NULL,
                threshold     REAL    NOT NULL,
                comparison    TEXT    NOT NULL DEFAULT 'above',
                active        INTEGER NOT NULL DEFAULT 1,
                created_at    TEXT    NOT NULL,
                last_triggered TEXT
            )
        """)
        c.commit()


init_db()


# ─── CRUD ─────────────────────────────────────────────────────────────────────

def create_alert(
    name: str,
    tickers: list[str],
    alert_type: str,
    threshold: float,
    comparison: str = "above",
) -> dict:
    if alert_type not in ALERT_TYPES:
        raise ValueError(f"alert_type must be one of: {list(ALERT_TYPES)}")
    if comparison not in ("above", "below"):
        raise ValueError("comparison must be 'above' or 'below'")

    with _conn() as c:
        cur = c.execute(
            """INSERT INTO alerts (name, tickers, alert_type, threshold, comparison, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, json.dumps([t.upper() for t in tickers]),
             alert_type, threshold, comparison, datetime.utcnow().isoformat()),
        )
        c.commit()
        return get_alert(cur.lastrowid)  # type: ignore[arg-type]


def get_alert(alert_id: int) -> dict:
    with _conn() as c:
        row = c.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    if not row:
        raise KeyError(f"Alert {alert_id} not found")
    return _row_to_dict(row)


def list_alerts(active_only: bool = False) -> list[dict]:
    sql = "SELECT * FROM alerts"
    if active_only:
        sql += " WHERE active = 1"
    sql += " ORDER BY created_at DESC"
    with _conn() as c:
        rows = c.execute(sql).fetchall()
    return [_row_to_dict(r) for r in rows]


def delete_alert(alert_id: int) -> bool:
    with _conn() as c:
        cur = c.execute("DELETE FROM alerts WHERE id = ?", (alert_id,))
        c.commit()
    return cur.rowcount > 0


def toggle_alert(alert_id: int, active: bool) -> dict:
    with _conn() as c:
        c.execute("UPDATE alerts SET active = ? WHERE id = ?", (int(active), alert_id))
        c.commit()
    return get_alert(alert_id)


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id":             row["id"],
        "name":           row["name"],
        "tickers":        json.loads(row["tickers"]),
        "alert_type":     row["alert_type"],
        "description":    ALERT_TYPES.get(row["alert_type"], ""),
        "threshold":      row["threshold"],
        "comparison":     row["comparison"],
        "active":         bool(row["active"]),
        "created_at":     row["created_at"],
        "last_triggered": row["last_triggered"],
    }


# ─── Alert checking ───────────────────────────────────────────────────────────

def check_alerts(metrics: dict, tickers: list[str]) -> list[dict]:
    """
    Check all active alerts against a fresh simulation result.

    Compares alert thresholds against these metric fields:
      - var_95_breach      → abs(metrics["var_95"])
      - drawdown_threshold → abs(metrics["max_drawdown"])
      - sharpe_drop        → metrics["sharpe_ratio"]   (comparison should be 'below')
      - volatility_spike   → metrics["annual_volatility"]

    Returns a list of triggered alert dicts (with actual_value + message).
    """
    active = list_alerts(active_only=True)
    ticker_set = {t.upper() for t in tickers}
    triggered: list[dict] = []
    now = datetime.utcnow().isoformat()

    metric_extract = {
        "var_95_breach":      abs(metrics.get("var_95", 0.0)),
        "drawdown_threshold": abs(metrics.get("max_drawdown", 0.0)),
        "sharpe_drop":        metrics.get("sharpe_ratio", 999.0),
        "volatility_spike":   metrics.get("annual_volatility", 0.0),
    }

    for alert in active:
        # Only evaluate alerts whose ticker set overlaps the current simulation
        if alert["tickers"] and not set(alert["tickers"]).intersection(ticker_set):
            continue

        actual = metric_extract.get(alert["alert_type"])
        if actual is None:
            continue

        comp = alert["comparison"]
        thr  = alert["threshold"]
        fired = (comp == "above" and actual > thr) or (comp == "below" and actual < thr)

        if fired:
            triggered.append({
                **alert,
                "actual_value": round(actual, 4),
                "message": _fmt_message(alert["alert_type"], actual, thr, comp),
                "fired_at": now,
            })
            with _conn() as c:
                c.execute("UPDATE alerts SET last_triggered = ? WHERE id = ?",
                          (now, alert["id"]))
                c.commit()

    return triggered


def _fmt_message(alert_type: str, value: float, threshold: float, comparison: str) -> str:
    dirword = "exceeded" if comparison == "above" else "dropped below"
    msgs = {
        "var_95_breach":
            f"VaR 95% is ${value:,.0f} — {dirword} threshold ${threshold:,.0f}",
        "drawdown_threshold":
            f"Max drawdown is {value:.1f}% — {dirword} threshold {threshold:.1f}%",
        "sharpe_drop":
            f"Sharpe ratio is {value:.2f} — {dirword} threshold {threshold:.2f}",
        "volatility_spike":
            f"Annual volatility is {value:.1f}% — {dirword} threshold {threshold:.1f}%",
    }
    return msgs.get(alert_type, f"{alert_type}: {value:.4f} vs {threshold:.4f}")
