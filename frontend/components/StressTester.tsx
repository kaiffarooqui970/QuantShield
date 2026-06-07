"use client";

import React, { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Metrics {
  expected_annual_return: number;
  annual_volatility: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  var_95: number;
  var_99: number;
  cvar_95: number;
  cvar_99: number;
  median_final_value: number;
  p5_final_value: number;
  p95_final_value: number;
}

interface StressResult {
  scenario: string;
  scenario_name: string;
  scenario_description: string;
  tickers: string[];
  weights: number[];
  baseline_metrics: Metrics;
  stressed_metrics: Metrics;
  delta_metrics: Metrics;
  immediate_loss_usd: number;
  immediate_loss_pct: number;
}

interface Props {
  tickers: string[];
  weights: number[];
  initialValue: number;
  apiBaseUrl?: string;
}

// ─── Scenario config ──────────────────────────────────────────────────────────
const SCENARIOS = [
  { id: "2008_crash",  label: "2008 Crisis",     shock: "-50%", color: "#ef4444", desc: "Lehman collapse, global credit crunch" },
  { id: "covid_drop",  label: "COVID Crash",      shock: "-35%", color: "#f97316", desc: "March 2020 pandemic selloff" },
  { id: "rate_shock",  label: "Rate Shock +300bp", shock: "-22%", color: "#f59e0b", desc: "Fed emergency 300bps hike" },
  { id: "tech_bubble", label: "Dot-com Burst",    shock: "-78%", color: "#8b5cf6", desc: "2000–2002 NASDAQ collapse" },
  { id: "custom",      label: "Custom",           shock: "user", color: "#06b6d4", desc: "Define per-asset shocks" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function DeltaCell({ value, invert = false }: { value: number; invert?: boolean }) {
  const good = invert ? value > 0 : value < 0;
  const bad  = invert ? value < 0 : value > 0;
  const color = bad ? "#ef4444" : good ? "#10b981" : "#94a3b8";
  const sign = value > 0 ? "+" : "";
  return (
    <span className="font-mono font-bold text-xs" style={{ color }}>
      {sign}{value.toFixed(2)}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StressTester({ tickers, weights, initialValue, apiBaseUrl = "/backend" }: Props) {
  const [scenario, setScenario] = useState("2008_crash");
  const [customShocks, setCustomShocks] = useState<Record<string, string>>({});
  const [result, setResult] = useState<StressResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!tickers.length) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const payload: Record<string, unknown> = {
      tickers,
      weights: weights.length === tickers.length ? weights : undefined,
      scenario,
      initial_portfolio_value: initialValue,
      n_simulations: 1000,
    };

    if (scenario === "custom") {
      const parsed: Record<string, number> = {};
      for (const [t, v] of Object.entries(customShocks)) {
        const n = parseFloat(v) / 100;
        if (!isNaN(n)) parsed[t] = n;
      }
      payload.custom_shocks = parsed;
    }

    try {
      const resp = await fetch(`${apiBaseUrl}/api/stress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error((await resp.json()).detail || "Stress test failed");
      setResult(await resp.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedScenario = SCENARIOS.find(s => s.id === scenario)!;

  // ── Metric row definitions ─────────────────────────────────────────────────
  const metricRows = result ? [
    { label: "Expected Return",  base: result.baseline_metrics.expected_annual_return,  stress: result.stressed_metrics.expected_annual_return,  delta: result.delta_metrics.expected_annual_return,  suffix: "%",  invertDelta: false },
    { label: "Annual Volatility",base: result.baseline_metrics.annual_volatility,       stress: result.stressed_metrics.annual_volatility,        delta: result.delta_metrics.annual_volatility,        suffix: "%",  invertDelta: true  },
    { label: "Sharpe Ratio",     base: result.baseline_metrics.sharpe_ratio,            stress: result.stressed_metrics.sharpe_ratio,             delta: result.delta_metrics.sharpe_ratio,             suffix: "",   invertDelta: false },
    { label: "Max Drawdown",     base: result.baseline_metrics.max_drawdown,            stress: result.stressed_metrics.max_drawdown,             delta: result.delta_metrics.max_drawdown,             suffix: "%",  invertDelta: true  },
    { label: "VaR 95%",          base: result.baseline_metrics.var_95,                 stress: result.stressed_metrics.var_95,                   delta: result.delta_metrics.var_95,                   suffix: "$",  invertDelta: true  },
    { label: "CVaR 95%",         base: result.baseline_metrics.cvar_95,                stress: result.stressed_metrics.cvar_95,                  delta: result.delta_metrics.cvar_95,                  suffix: "$",  invertDelta: true  },
    { label: "Median Final",     base: result.baseline_metrics.median_final_value,      stress: result.stressed_metrics.median_final_value,       delta: result.delta_metrics.median_final_value,       suffix: "$",  invertDelta: false },
    { label: "P5 Final",         base: result.baseline_metrics.p5_final_value,         stress: result.stressed_metrics.p5_final_value,           delta: result.delta_metrics.p5_final_value,           suffix: "$",  invertDelta: false },
  ] : [];

  return (
    <div className="flex flex-col gap-6">

      {/* ── Scenario selector ── */}
      <div
        className="rounded-3xl border p-6 flex flex-col gap-5"
        style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Stress Testing</h2>
          <p className="text-slate-500 text-sm">Apply historical crisis scenarios to your portfolio and compare risk metrics.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {SCENARIOS.map(s => (
            <button
              key={s.id}
              onClick={() => setScenario(s.id)}
              className="rounded-xl p-3 text-left transition-all duration-200 flex flex-col gap-1"
              style={{
                border: `1px solid ${scenario === s.id ? s.color : "rgba(255,255,255,0.08)"}`,
                background: scenario === s.id ? `${s.color}14` : "rgba(255,255,255,0.02)",
                boxShadow: scenario === s.id ? `0 0 16px ${s.color}22` : "none",
              }}
            >
              <span className="text-xs font-bold" style={{ color: scenario === s.id ? s.color : "#94a3b8" }}>{s.label}</span>
              <span className="text-[10px] text-slate-600 leading-tight">{s.desc}</span>
              {s.shock !== "user" && (
                <span className="text-[10px] font-mono font-bold mt-0.5" style={{ color: "#ef4444" }}>{s.shock}</span>
              )}
            </button>
          ))}
        </div>

        {/* Custom shocks input */}
        {scenario === "custom" && (
          <div className="rounded-2xl border p-4 flex flex-col gap-3"
               style={{ background: "rgba(6,182,212,0.04)", borderColor: "rgba(6,182,212,0.15)" }}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Per-Asset Shocks (%)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {tickers.map(t => (
                <div key={t}>
                  <label className="block text-xs text-slate-500 mb-1">{t}</label>
                  <input
                    type="number"
                    placeholder="-20"
                    value={customShocks[t] ?? ""}
                    onChange={e => setCustomShocks(prev => ({ ...prev, [t]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={loading || !tickers.length}
          className="self-start px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 disabled:opacity-50"
          style={{
            background: loading ? "rgba(239,68,68,0.2)" : `linear-gradient(135deg, ${selectedScenario.color}, #ef4444)`,
            color: "#fff",
            boxShadow: loading ? "none" : `0 0 24px ${selectedScenario.color}40`,
          }}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" className="opacity-75" />
              </svg>
              Running Stress Test…
            </span>
          ) : (
            `Run: ${selectedScenario.label}`
          )}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-2xl border border-red-900/50 p-4 text-red-400 text-sm"
             style={{ background: "rgba(239,68,68,0.06)" }}>
          {error}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="flex flex-col gap-4">

          {/* Immediate loss banner */}
          <div
            className="rounded-3xl border p-6 flex flex-wrap items-center justify-between gap-4"
            style={{
              background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(139,92,246,0.06))",
              borderColor: "rgba(239,68,68,0.25)",
            }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: selectedScenario.color }}>
                {result.scenario_name}
              </p>
              <p className="text-3xl font-extrabold text-white">
                {result.immediate_loss_usd < 0 ? "-" : "+"}{fmt(Math.abs(result.immediate_loss_usd))}
              </p>
              <p className="text-slate-500 text-sm mt-1">{result.scenario_description}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-1">Immediate Portfolio Shock</p>
              <p className="text-3xl font-extrabold" style={{ color: result.immediate_loss_pct < 0 ? "#ef4444" : "#10b981" }}>
                {result.immediate_loss_pct > 0 ? "+" : ""}{result.immediate_loss_pct.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Before / After table */}
          <div
            className="rounded-3xl border overflow-hidden"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
          >
            <div className="grid grid-cols-4 px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-widest"
                 style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span>Metric</span>
              <span className="text-right">Baseline</span>
              <span className="text-right">Stressed</span>
              <span className="text-right">Delta</span>
            </div>
            {metricRows.map((row, i) => (
              <div
                key={row.label}
                className="grid grid-cols-4 px-6 py-3.5 text-sm"
                style={{ borderBottom: i < metricRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              >
                <span className="text-slate-400 font-medium">{row.label}</span>
                <span className="text-right font-mono text-slate-300">
                  {row.suffix === "$" ? fmt(row.base) : `${row.base.toFixed(2)}${row.suffix}`}
                </span>
                <span className="text-right font-mono" style={{ color: "#f87171" }}>
                  {row.suffix === "$" ? fmt(row.stress) : `${row.stress.toFixed(2)}${row.suffix}`}
                </span>
                <span className="text-right">
                  <DeltaCell value={row.delta} invert={row.invertDelta} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
