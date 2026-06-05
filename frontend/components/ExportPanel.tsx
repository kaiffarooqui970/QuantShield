"use client";

import React, { useState } from "react";

interface SimResult {
  tickers: string[];
  weights: number[];
  metrics: Record<string, number>;
  paths: { p5: number[]; median: number[]; p95: number[] };
  risk_contribution: Record<string, number>;
}

interface Props {
  results: SimResult;
  days: number;
  sims: number;
  model: string;
}

// ─── CSV builder ──────────────────────────────────────────────────────────────
function buildCSV(r: SimResult, days: number, sims: number, model: string): string {
  const lines: string[][] = [];
  lines.push(["QuantShield AI — Portfolio Risk Report"]);
  lines.push([`Generated: ${new Date().toLocaleString()}`]);
  lines.push([]);
  lines.push(["PORTFOLIO"]);
  lines.push(["Ticker", "Weight"]);
  r.tickers.forEach((t, i) => lines.push([t, `${((r.weights[i] ?? 0) * 100).toFixed(2)}%`]));
  lines.push([]);
  lines.push(["SIMULATION PARAMETERS"]);
  lines.push(["Simulation Days", String(days)]);
  lines.push(["MC Paths", String(sims)]);
  lines.push(["Model", model.toUpperCase()]);
  lines.push([]);
  lines.push(["RISK METRICS"]);
  const metricLabels: [string, string, string][] = [
    ["expected_annual_return", "Expected Annual Return", "%"],
    ["annual_volatility",      "Annual Volatility",      "%"],
    ["sharpe_ratio",           "Sharpe Ratio",           ""],
    ["sortino_ratio",          "Sortino Ratio",          ""],
    ["max_drawdown",           "Max Drawdown",           "%"],
    ["var_95",                 "VaR 95% (1-day $)",      "$"],
    ["var_99",                 "VaR 99% (1-day $)",      "$"],
    ["cvar_95",                "CVaR 95% (1-day $)",     "$"],
    ["cvar_99",                "CVaR 99% (1-day $)",     "$"],
    ["median_final_value",     "Median Final Value",     "$"],
    ["p5_final_value",         "P5 Final Value (Bear)",  "$"],
    ["p95_final_value",        "P95 Final Value (Bull)", "$"],
  ];
  metricLabels.forEach(([key, label, suffix]) => {
    const v = r.metrics[key];
    if (v !== undefined) lines.push([label, `${suffix}${Number(v).toFixed(2)}`]);
  });
  lines.push([]);
  lines.push(["RISK CONTRIBUTION"]);
  lines.push(["Ticker", "Contribution"]);
  Object.entries(r.risk_contribution).forEach(([t, p]) => lines.push([t, `${Number(p).toFixed(2)}%`]));
  lines.push([]);
  lines.push(["PERCENTILE PATHS (first 20 days)"]);
  lines.push(["Day", "P5", "Median", "P95"]);
  const slice = 20;
  for (let i = 0; i < Math.min(slice, r.paths.median.length); i++) {
    lines.push([String(i), String(r.paths.p5[i]), String(r.paths.median[i]), String(r.paths.p95[i])]);
  }
  return lines.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

// ─── HTML report builder ──────────────────────────────────────────────────────
function buildHTML(r: SimResult, days: number, sims: number, model: string): string {
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const pct = (v: number) => `${Number(v).toFixed(2)}%`;

  const rows = [
    ["Expected Return",   pct(r.metrics.expected_annual_return)],
    ["Annual Volatility", pct(r.metrics.annual_volatility)],
    ["Sharpe Ratio",      Number(r.metrics.sharpe_ratio).toFixed(4)],
    ["Sortino Ratio",     Number(r.metrics.sortino_ratio ?? 0).toFixed(4)],
    ["Max Drawdown",      pct(r.metrics.max_drawdown)],
    ["VaR 95%",           fmt(Math.abs(r.metrics.var_95))],
    ["CVaR 95%",          fmt(Math.abs(r.metrics.cvar_95))],
    ["Median Final",      fmt(r.metrics.median_final_value)],
    ["Bear P5",           fmt(r.metrics.p5_final_value)],
    ["Bull P95",          fmt(r.metrics.p95_final_value ?? r.metrics.median_final_value * 1.6)],
  ].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");

  const weights = r.tickers.map((t, i) =>
    `<li>${t} — ${((r.weights[i] ?? 0) * 100).toFixed(1)}%</li>`
  ).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>QuantShield Risk Report</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:40px auto;color:#1e293b;line-height:1.6}
  h1{color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:8px}
  h2{color:#0f172a;margin-top:28px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0}
  th{background:#f8fafc;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
  td:last-child{font-weight:600;text-align:right}
  .meta{color:#64748b;font-size:14px}
  @media print{body{margin:20px}button{display:none}}
</style></head><body>
<h1>QuantShield AI — Risk Report</h1>
<p class="meta">Generated: ${new Date().toLocaleString()} · ${sims.toLocaleString()} MC paths · ${days} trading days · ${model.toUpperCase()}</p>
<h2>Portfolio</h2><ul>${weights}</ul>
<h2>Risk Metrics</h2>
<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Risk Contribution</h2>
<table><thead><tr><th>Asset</th><th>Contribution</th></tr></thead>
<tbody>${Object.entries(r.risk_contribution).map(([t, p]) => `<tr><td>${t}</td><td>${Number(p).toFixed(2)}%</td></tr>`).join("")}</tbody>
</table>
<br/><button onclick="window.print()">🖨 Print / Save as PDF</button>
</body></html>`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ExportPanel({ results, days, sims, model }: Props) {
  const [open, setOpen] = useState(false);

  const downloadCSV = () => {
    const csv = buildCSV(results, days, sims, model);
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `QuantShield_${results.tickers.join("-")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openReport = () => {
    const html = buildHTML(results, days, sims, model);
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-xs transition-all"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#94a3b8",
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Export
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
             className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div
          className="mt-2 rounded-2xl border p-3 flex gap-2 scale-enter"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <button
            onClick={downloadCSV}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7h8M8 12h8M8 17h5"/>
            </svg>
            CSV
          </button>
          <button
            onClick={openReport}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            PDF Report
          </button>
        </div>
      )}
    </div>
  );
}
