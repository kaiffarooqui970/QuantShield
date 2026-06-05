"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BenchStats {
  ticker: string;
  total_return_pct: number;
  cagr_pct: number;
  annual_volatility_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  final_value: number;
}

interface BacktestResult {
  tickers: string[];
  weights: number[];
  benchmark: string | null;
  rebalance_frequency: string;
  period_years: number;
  start_date: string;
  end_date: string;
  summary: {
    total_return_pct: number;
    cagr_pct: number;
    annual_volatility_pct: number;
    max_drawdown_pct: number;
    sharpe_ratio: number;
    sortino_ratio: number;
    final_value: number;
  };
  benchmark_stats: BenchStats | null;
  benchmark_curve: { date: string; value: number }[] | null;
  benchmarks_stats: BenchStats[];
  benchmarks_curves: { date: string; value: number }[][];
  equity_curve: { date: string; value: number }[];
  underwater_curve: { date: string; drawdown_pct: number }[];
  rolling_12m_returns: { date: string; return_pct: number }[];
  calendar_year_returns: { year: number; return_pct: number }[];
}

interface Props {
  tickers: string[];
  weights: number[];
  initialValue: number;
  apiBaseUrl?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const BENCH_COLORS = ["#64748b", "#f59e0b", "#a78bfa"];
const PORTFOLIO_COLOR = "#10b981";
const BENCH_OPTIONS = ["SPY", "QQQ", "DIA", "AGG", "IWM", "TLT"];
const REBAL_OPTIONS = [
  { id: "none",      label: "Buy & Hold" },
  { id: "monthly",   label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "annual",    label: "Annual" },
] as const;

// ─── Multi-series canvas line chart ──────────────────────────────────────────
function MultiLineChart({
  seriesList,
  colors,
  labels,
  yFmt = (v) => `$${(v / 1000).toFixed(0)}k`,
  height = 240,
}: {
  seriesList: { date: string; value: number }[][];
  colors: string[];
  labels: string[];
  yFmt?: (v: number) => string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; vals: { label: string; val: number; color: string }[] } | null>(null);
  const [hoverPx, setHoverPx] = useState(0);

  const draw = useCallback((hoverIdx: number | null = null) => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap || !seriesList[0]?.length) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = wrap.clientWidth  * dpr;
    canvas.height = wrap.clientHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const PAD = { top: 16, right: 16, bottom: 36, left: 60 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;

    const allVals = seriesList.flatMap(s => s.map(p => p.value));
    const minV = Math.min(...allVals) * 0.97, maxV = Math.max(...allVals) * 1.03;
    const n = seriesList[0].length;
    const sx = (i: number) => PAD.left + (i / (n - 1)) * cW;
    const sy = (v: number) => PAD.top  + (1 - (v - minV) / (maxV - minV)) * cH;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
    for (let r = 0; r <= 4; r++) {
      const y = PAD.top + (r / 4) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    }
    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top + cH); ctx.lineTo(PAD.left + cW, PAD.top + cH); ctx.stroke();

    // Y labels
    ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "10px 'IBM Plex Mono',monospace"; ctx.textAlign = "right";
    for (let r = 0; r <= 4; r++) {
      const v = minV + ((4 - r) / 4) * (maxV - minV);
      ctx.fillText(yFmt(v), PAD.left - 6, PAD.top + (r / 4) * cH + 4);
    }

    // X labels
    ctx.textAlign = "center";
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const idx = Math.round(f * (n - 1));
      ctx.fillText((seriesList[0][idx]?.date ?? "").slice(0, 7), sx(idx), PAD.top + cH + 18);
    });

    // Lines — draw benchmarks first (dimmer), portfolio on top
    const drawOrder = seriesList.map((s, i) => ({ s, i })).reverse();
    drawOrder.forEach(({ s, i }) => {
      if (!s.length) return;
      const color = colors[i];
      const isPortfolio = i === 0;
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = isPortfolio ? 8 : 4;
      ctx.strokeStyle = color; ctx.lineWidth = isPortfolio ? 2.5 : 1.5;
      ctx.globalAlpha = isPortfolio ? 1 : 0.65;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      s.forEach((pt, j) => { j === 0 ? ctx.moveTo(sx(j), sy(pt.value)) : ctx.lineTo(sx(j), sy(pt.value)); });
      ctx.stroke();
      ctx.restore();
    });

    // Hover line + dots
    if (hoverIdx !== null) {
      const hx = sx(hoverIdx);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, PAD.top + cH); ctx.stroke();
      ctx.setLineDash([]);
      seriesList.forEach((s, i) => {
        if (!s[hoverIdx]) return;
        ctx.fillStyle = colors[i]; ctx.shadowColor = colors[i]; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(hx, sy(s[hoverIdx].value), 4, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }
  }, [seriesList, colors, yFmt]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || !seriesList[0]?.length) return;
    const n = seriesList[0].length;
    const idx = Math.round(((e.clientX - r.left - 60) / (r.width - 76)) * (n - 1));
    if (idx < 0 || idx >= n) { setHover(null); draw(null); return; }
    const vals = seriesList.map((s, i) => ({ label: labels[i], val: s[idx]?.value ?? 0, color: colors[i] }));
    setHover({ x: idx, vals });
    setHoverPx(e.clientX - r.left);
    draw(idx);
  };
  const handleLeave = () => { setHover(null); draw(null); };

  return (
    <div>
      <div ref={wrapRef} style={{ height, position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
          onMouseMove={handleMove} onMouseLeave={handleLeave}
        />
        {hover && (
          <div
            className="absolute pointer-events-none rounded-xl p-3 text-xs"
            style={{
              left: Math.min(hoverPx + 12, 9999), top: 16,
              background: "rgba(2,8,23,0.92)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)", minWidth: 130,
            }}
          >
            <p className="text-slate-500 mb-1.5 text-[10px] font-semibold">
              {seriesList[0][hover.x]?.date?.slice(0, 7)}
            </p>
            {hover.vals.map(v => (
              <div key={v.label} className="flex justify-between gap-3">
                <span style={{ color: v.color }}>{v.label}</span>
                <span className="font-mono font-bold tabnum" style={{ color: v.color }}>{fmt(v.val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 px-1">
        {labels.map((l, i) => (
          <div key={l} className="flex items-center gap-1.5 text-[10px]">
            <div className="w-4 h-0.5 rounded" style={{ background: colors[i], opacity: i === 0 ? 1 : 0.65 }} />
            <span className="text-slate-500">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Simple single-series chart (underwater / rolling) ────────────────────────
function SimpleChart({
  data, color, yFmt = (v) => v.toFixed(1), height = 130,
}: { data: { date: string; value: number }[]; color: string; yFmt?: (v: number) => string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap || !data.length) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const PAD = { top: 6, right: 10, bottom: 22, left: 44 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const ys = data.map(d => d.value);
    const minV = Math.min(...ys), maxV = Math.max(...ys);
    const range = Math.max(maxV - minV, 0.01);
    const lo = minV - range * 0.1, hi = maxV + range * 0.1;
    const n = data.length;
    const sx = (i: number) => PAD.left + (i / (n - 1)) * cW;
    const sy = (v: number) => PAD.top  + (1 - (v - lo) / (hi - lo)) * cH;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
    for (let r = 0; r <= 3; r++) {
      const y = PAD.top + (r / 3) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    }
    // Zero line if range crosses zero
    if (lo < 0 && hi > 0) {
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.setLineDash([3, 4]);
      const zy = sy(0);
      ctx.beginPath(); ctx.moveTo(PAD.left, zy); ctx.lineTo(PAD.left + cW, zy); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
    // Fill
    ctx.save();
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(sx(i), sy(d.value)) : ctx.lineTo(sx(i), sy(d.value)); });
    ctx.lineTo(sx(n - 1), PAD.top + cH); ctx.lineTo(PAD.left, PAD.top + cH); ctx.closePath();
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
    grad.addColorStop(0, `${color}30`); grad.addColorStop(1, `${color}04`);
    ctx.fillStyle = grad; ctx.fill(); ctx.restore();
    // Line
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.8;
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.lineJoin = "round"; ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(sx(i), sy(d.value)) : ctx.lineTo(sx(i), sy(d.value)); });
    ctx.stroke(); ctx.restore();
    // Y labels
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.font = "9px 'IBM Plex Mono',monospace"; ctx.textAlign = "right";
    for (let r = 0; r <= 3; r++) {
      const v = lo + ((3 - r) / 3) * (hi - lo);
      ctx.fillText(yFmt(v), PAD.left - 5, PAD.top + (r / 3) * cH + 3);
    }
    // X labels
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.2)";
    [0, 0.5, 1].forEach(f => {
      const idx = Math.round(f * (n - 1));
      ctx.fillText((data[idx]?.date ?? "").slice(0, 7), sx(idx), PAD.top + cH + 16);
    });
  }, [data, color, yFmt]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current, wrap = wrapRef.current;
      if (canvas && wrap) { canvas.width = 0; canvas.height = 0; }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ height }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

// ─── Calendar-year bar chart ───────────────────────────────────────────────────
function CalendarBars({ data }: { data: { year: number; return_pct: number }[] }) {
  const max = Math.max(...data.map(d => Math.abs(d.return_pct)), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map(d => {
        const h = Math.abs(d.return_pct) / max * 100;
        const pos = d.return_pct >= 0;
        return (
          <div key={d.year} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] font-mono" style={{ color: pos ? "#10b981" : "#ef4444" }}>
              {pos ? "+" : ""}{d.return_pct.toFixed(0)}%
            </span>
            <div className="w-full rounded-t" style={{ height: `${h}%`, background: pos ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.6)", minHeight: 3 }} />
            <span className="text-[9px] text-slate-600">{String(d.year).slice(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-xl font-extrabold tabnum" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Backtester({ tickers, weights, initialValue, apiBaseUrl = "http://localhost:8000" }: Props) {
  const [result, setResult]         = useState<BacktestResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [selectedBenches, setSelectedBenches] = useState<string[]>(["SPY"]);
  const [customBench, setCustomBench]         = useState("");
  const [rebalFreq, setRebalFreq]   = useState<"none" | "monthly" | "quarterly" | "annual">("none");

  const toggleBench = (b: string) =>
    setSelectedBenches(prev =>
      prev.includes(b) ? prev.filter(x => x !== b) : [...prev.slice(0, 2), b]
    );

  const handleRun = async () => {
    if (!tickers.length) return;
    setLoading(true); setError(null); setResult(null);
    const benches = [...selectedBenches, ...(customBench.trim() ? [customBench.trim().toUpperCase()] : [])].slice(0, 3);
    try {
      const resp = await fetch(`${apiBaseUrl}/api/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers,
          weights: weights.length === tickers.length ? weights : undefined,
          initial_value: initialValue,
          benchmark: benches[0] ?? "SPY",
          benchmarks: benches,
          days_back: 1260,
          rebalance_frequency: rebalFreq,
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).detail || "Backtest failed");
      setResult(await resp.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const s = result?.summary;

  // Build series arrays for the multi-line chart
  const chartSeries = result ? [
    result.equity_curve,
    ...(result.benchmarks_curves ?? [result.benchmark_curve ? [result.benchmark_curve] : []].flat()),
  ] : [];
  const chartColors  = [PORTFOLIO_COLOR, ...BENCH_COLORS];
  const chartLabels  = result ? [
    "Portfolio",
    ...(result.benchmarks_stats?.map(b => b.ticker) ?? (result.benchmark ? [result.benchmark] : [])),
  ] : [];

  return (
    <div className="flex flex-col gap-6">

      {/* ── Controls ── */}
      <div className="rounded-3xl border p-6 flex flex-col gap-5" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Backtesting</h2>
          <p className="text-slate-500 text-sm">5-year historical performance — buy-and-hold or periodic rebalancing, up to 3 benchmarks.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Benchmark checkboxes */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-2">Benchmarks (pick up to 3)</label>
            <div className="flex flex-wrap gap-2">
              {BENCH_OPTIONS.map(b => {
                const active = selectedBenches.includes(b);
                return (
                  <button
                    key={b}
                    onClick={() => toggleBench(b)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: active ? "rgba(6,182,212,0.14)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? "rgba(6,182,212,0.35)" : "rgba(255,255,255,0.08)"}`,
                      color: active ? "#22d3ee" : "#64748b",
                    }}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Custom (e.g. ARKK)"
                value={customBench}
                onChange={e => setCustomBench(e.target.value)}
                className="flex-1 rounded-xl px-3 py-2 text-xs text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
          </div>

          {/* Rebalancing selector */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-2">Rebalancing</label>
            <div className="grid grid-cols-2 gap-2">
              {REBAL_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setRebalFreq(id)}
                  className="py-2 px-3 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: rebalFreq === id ? "rgba(139,92,246,0.14)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${rebalFreq === id ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.08)"}`,
                    color: rebalFreq === id ? "#a78bfa" : "#64748b",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          {error && <p className="text-red-400 text-xs flex-1">{error}</p>}
          <button
            onClick={handleRun}
            disabled={loading || !tickers.length}
            className="px-6 py-2.5 rounded-2xl font-bold text-sm transition-all disabled:opacity-50 shrink-0"
            style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)", color: "#fff", boxShadow: "0 0 20px rgba(16,185,129,0.25)" }}
          >
            {loading ? "Running…" : "Run Backtest"}
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {result && s && (
        <>
          {/* Period + rebalancing badge */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="px-2 py-1 rounded-md" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)", color: "#10b981" }}>
              {result.start_date} → {result.end_date}
            </span>
            <span>{result.period_years.toFixed(1)}y · {result.tickers.join(", ")}</span>
            {result.rebalance_frequency !== "none" && (
              <span className="px-2 py-1 rounded-md" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", color: "#a78bfa" }}>
                {result.rebalance_frequency} rebalance
              </span>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="CAGR" value={`${s.cagr_pct > 0 ? "+" : ""}${s.cagr_pct.toFixed(1)}%`} color={s.cagr_pct >= 0 ? "#10b981" : "#ef4444"} sub="Compound annual growth" />
            <StatCard label="Total Return" value={`${s.total_return_pct > 0 ? "+" : ""}${s.total_return_pct.toFixed(1)}%`} color={s.total_return_pct >= 0 ? "#10b981" : "#ef4444"} sub={`→ ${fmt(s.final_value)}`} />
            <StatCard label="Sharpe Ratio" value={s.sharpe_ratio.toFixed(3)} color="#3b82f6" sub="Risk-adjusted return" />
            <StatCard label="Max Drawdown" value={`${s.max_drawdown_pct.toFixed(1)}%`} color="#ef4444" sub="Worst peak-to-trough" />
          </div>

          {/* Benchmark comparison table */}
          {result.benchmarks_stats?.length > 0 && (
            <div className="rounded-2xl border overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
              <div className="grid text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-4 py-2.5"
                   style={{ gridTemplateColumns: `repeat(${2 + result.benchmarks_stats.length}, 1fr)`, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span>Metric</span>
                <span className="text-center" style={{ color: PORTFOLIO_COLOR }}>Portfolio</span>
                {result.benchmarks_stats.map((b, i) => (
                  <span key={b.ticker} className="text-center" style={{ color: BENCH_COLORS[i] }}>{b.ticker}</span>
                ))}
              </div>
              {[
                { label: "CAGR",       port: `${s.cagr_pct.toFixed(1)}%`,               vals: result.benchmarks_stats.map(b => `${b.cagr_pct.toFixed(1)}%`) },
                { label: "Volatility", port: `${s.annual_volatility_pct.toFixed(1)}%`,   vals: result.benchmarks_stats.map(b => `${b.annual_volatility_pct.toFixed(1)}%`) },
                { label: "Max DD",     port: `${s.max_drawdown_pct.toFixed(1)}%`,        vals: result.benchmarks_stats.map(b => `${b.max_drawdown_pct.toFixed(1)}%`) },
                { label: "Sharpe",     port: s.sharpe_ratio.toFixed(3),                  vals: result.benchmarks_stats.map(b => b.sharpe_ratio.toFixed(3)) },
              ].map(({ label, port, vals }, ri) => (
                <div key={label}
                     className="grid px-4 py-2.5 text-xs"
                     style={{
                       gridTemplateColumns: `repeat(${2 + vals.length}, 1fr)`,
                       borderBottom: ri < 3 ? "1px solid rgba(255,255,255,0.04)" : "none",
                     }}>
                  <span className="text-slate-400">{label}</span>
                  <span className="text-center font-mono font-semibold" style={{ color: PORTFOLIO_COLOR }}>{port}</span>
                  {vals.map((v, i) => (
                    <span key={i} className="text-center font-mono" style={{ color: BENCH_COLORS[i] }}>{v}</span>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Equity curve */}
          <div className="rounded-3xl border p-5" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Equity Curve</p>
            <MultiLineChart
              seriesList={chartSeries}
              colors={chartColors}
              labels={chartLabels}
              yFmt={v => fmt(v)}
              height={240}
            />
          </div>

          {/* Underwater + calendar year */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-3xl border p-5" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Underwater Curve (Drawdown)</p>
              <SimpleChart
                data={result.underwater_curve.map(p => ({ date: p.date, value: p.drawdown_pct }))}
                color="#ef4444"
                yFmt={v => `${v.toFixed(1)}%`}
                height={150}
              />
            </div>
            <div className="rounded-3xl border p-5" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Calendar Year Returns</p>
              <CalendarBars data={result.calendar_year_returns} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
