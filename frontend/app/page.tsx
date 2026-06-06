"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import CopilotWidget from "@/components/CopilotWidget";
import MonteCarloChart from "@/components/MonteCarloChart";
import StressTester from "@/components/StressTester";
import EfficientFrontier from "@/components/EfficientFrontier";
import Backtester from "@/components/Backtester";
import WeightEditor, { equalWeights, normalizeAssets, type Asset } from "@/components/WeightEditor";
import PortfolioManager, { saveRunToHistory, type SavedPortfolio } from "@/components/PortfolioManager";
import CorrelationHeatmap from "@/components/CorrelationHeatmap";
import ReturnHistogram from "@/components/ReturnHistogram";
import SectorExposure from "@/components/SectorExposure";
import ExportPanel from "@/components/ExportPanel";
import RollingMetrics from "@/components/RollingMetrics";
import TierGate from "@/components/TierGate";
import { useAuth } from "@/lib/auth-context";

// ─── Count-up animation hook ──────────────────────────────────────────────────
function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    setVal(0);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(target * ease);
      if (t < 1) requestAnimationFrame(tick);
      else setVal(target);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

// ─── Metric tooltip ───────────────────────────────────────────────────────────
const METRIC_TIPS: Record<string, string> = {
  "Expected Return":  "Annualised return predicted by GBM drift, based on 2 years of daily price history.",
  "Annual Volatility":"Annualised standard deviation of daily returns. Higher = more price uncertainty.",
  "Sharpe Ratio":     "Return earned per unit of risk (vs 5.25% risk-free rate). >1 is good; >2 is excellent.",
  "Max Drawdown":     "Largest peak-to-trough decline across all simulated paths. Worst-case loss scenario.",
  "VaR 95%":          "Value-at-Risk: the dollar loss you'd expect not to exceed on 95% of trading days.",
  "CVaR 95%":         "Conditional VaR (Expected Shortfall): the average loss in the worst 5% of scenarios.",
  "Median Final":     "The 50th-percentile portfolio value at the end of the simulation horizon.",
  "Worst Case P5":    "The 5th-percentile final value — what your portfolio looks like in a bad scenario.",
};
function Tip({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  const text = METRIC_TIPS[label];
  if (!text) return null;
  return (
    <div className="relative inline-flex">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center leading-none"
        style={{ background: "rgba(255,255,255,0.07)", color: "#475569" }}
        aria-label={`Explain ${label}`}
      >?</button>
      {show && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 p-2.5 rounded-xl text-[11px] text-slate-300 leading-snug scale-enter"
          style={{ background: "rgba(2,8,23,0.97)", border: "1px solid rgba(255,255,255,0.1)", width: 200, backdropFilter: "blur(12px)" }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────
const TrendUpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
);
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const ZapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1={12} y1={9} x2={12} y2={13} /><line x1={12} y1={17} x2="12.01" y2={17} />
  </svg>
);
const BarChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <line x1={18} y1={20} x2={18} y2={10} /><line x1={12} y1={20} x2={12} y2={4} />
    <line x1={6} y1={20} x2={6} y2={14} />
  </svg>
);
const ActivityIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const DollarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <line x1={12} y1={1} x2={12} y2={23} />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);
const TargetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <circle cx={12} cy={12} r={10} /><circle cx={12} cy={12} r={6} /><circle cx={12} cy={12} r={2} />
  </svg>
);
const LockIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface Metrics {
  expected_annual_return: number;
  annual_volatility: number;
  sharpe_ratio: number;
  sortino_ratio?: number;
  max_drawdown: number;
  var_95: number;
  var_99?: number;
  cvar_95: number;
  cvar_99?: number;
  median_final_value: number;
  p5_final_value: number;
  p95_final_value?: number;
}
interface SimResult {
  tickers: string[];
  metrics: Metrics;
  risk_contribution: Record<string, number>;
  weights?: number[];
  paths: { p5: number[]; median: number[]; p95: number[] };
  correlation_matrix?: Record<string, Record<string, number>>;
}

// ─── Helper: format currency ──────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

// ─── Demo data generation (seeded GBM, runs once at module load) ──────────────
function mulberry32(seed: number) {
  let s = seed;
  return (): number => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function buildDemoPaths(): { p5: number[]; median: number[]; p95: number[] } {
  // Fix: compute actual percentiles from 500 paths so p5 < median < p95 is
  // guaranteed by definition — not three independent random walks.
  const N = 101, S0 = 10000, DT = 1 / 100, N_PATHS = 500;
  const rand = mulberry32(42); // fixed seed → deterministic demo
  const mu = 0.22, sigma = 0.26; // realistic AAPL/MSFT/NVDA equal-weight params

  const allPaths: number[][] = Array.from({ length: N_PATHS }, () => {
    const path = [S0];
    for (let i = 1; i < N; i++) {
      const u = Math.max(1e-10, rand());
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
      path.push(path[i - 1] * Math.exp((mu - 0.5 * sigma * sigma) * DT + sigma * Math.sqrt(DT) * z));
    }
    return path;
  });

  const p5: number[] = [], median: number[] = [], p95: number[] = [];
  for (let i = 0; i < N; i++) {
    const vals = allPaths.map(p => p[i]).sort((a, b) => a - b);
    p5.push(Math.round(vals[Math.floor(0.05 * (N_PATHS - 1))]));
    median.push(Math.round(vals[Math.floor(0.50 * (N_PATHS - 1))]));
    p95.push(Math.round(vals[Math.floor(0.95 * (N_PATHS - 1))]));
  }
  return { p5, median, p95 };
}
const DEMO_PATHS = buildDemoPaths();
const DEMO_RESULT = {
  tickers: ["AAPL", "MSFT", "NVDA"],
  metrics: {
    expected_annual_return: 18.4,
    annual_volatility: 24.7,
    sharpe_ratio: 0.71,
    sortino_ratio: 1.02,
    max_drawdown: -27.3,
    var_95:  -312,
    var_99:  -441,
    cvar_95: -447,
    cvar_99: -623,
    median_final_value: Math.round(DEMO_PATHS.median[100]),
    p5_final_value:     Math.round(DEMO_PATHS.p5[100]),
    p95_final_value:    Math.round(DEMO_PATHS.p95[100]),
  },
  risk_contribution: { AAPL: 35.2, MSFT: 28.7, NVDA: 36.1 },
  weights: [0.40, 0.30, 0.30],
  paths: DEMO_PATHS,
};

// ─── LockedCard — blurs content and shows upgrade prompt ─────────────────────
function LockedCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div style={{ filter: "blur(6px)", userSelect: "none", pointerEvents: "none" }}>{children}</div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
        style={{ background: "rgba(3,7,18,0.5)", backdropFilter: "blur(2px)" }}
      >
        <span style={{ color: "#8b5cf6" }}><LockIcon className="w-5 h-5" /></span>
        <p className="text-[10px] font-bold tracking-widest text-white/50 uppercase">Subscribe to unlock</p>
      </div>
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, icon, accent,
}: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-5 flex flex-col gap-3 group transition-all duration-300 hover:scale-[1.02]"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 0%, ${accent}18 0%, transparent 70%)` }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
          <Tip label={label} />
        </div>
        <span style={{ color: accent }} className="opacity-70">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-white leading-none tabnum panel-enter">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PortfolioSimulator() {
  const { user, tier, getToken } = useAuth();
  const [tickers, setTickers] = useState("AAPL, MSFT, NVDA");
  const [assets, setAssets] = useState<Asset[]>(equalWeights(["AAPL", "MSFT", "NVDA"]));
  const [model, setModel] = useState<"gbm" | "student_t">("gbm");
  const [days, setDays] = useState(252);
  const [sims, setSims] = useState(20000);
  const [initialValue, setInitialValue] = useState(10000);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SimResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [activeTab, setActiveTab] = useState<"simulate" | "stress" | "frontier" | "backtest" | "advanced">("simulate");
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Authenticated fetch — injects Bearer token automatically
  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  }, [getToken]);

  // Keep assets in sync when ticker string changes
  const handleTickerChange = useCallback((raw: string) => {
    setTickers(raw);
    const parsed = raw.split(",").map(t => t.trim().toUpperCase()).filter(Boolean);
    setAssets(prev => {
      const existingMap = Object.fromEntries(prev.map(a => [a.ticker, a]));
      const next = parsed.map(t => existingMap[t] ?? { ticker: t, weight: 0, locked: false });
      return normalizeAssets(next.length ? next : [{ ticker: "AAPL", weight: 100, locked: false }]);
    });
  }, []);

  const handleLoadPortfolio = useCallback((p: SavedPortfolio) => {
    const tickerStr = p.tickers.join(", ");
    setTickers(tickerStr);
    setModel(p.model as "gbm" | "student_t");
    setAssets(p.tickers.map((t, i) => ({
      ticker: t,
      weight: (p.weights[i] ?? 0) * 100,
      locked: false,
    })));
  }, []);

  const handleTryDemo = () => {
    setTickers("AAPL, MSFT, NVDA");
    setAssets([
      { ticker: "AAPL", weight: 40, locked: false },
      { ticker: "MSFT", weight: 30, locked: false },
      { ticker: "NVDA", weight: 30, locked: false },
    ]);
    setDays(252);
    setSims(10000);
    setInitialValue(10000);
    setModel("gbm");
    setResults(DEMO_RESULT as SimResult);
    setIsDemo(true);
    setError(null);
  };

  const handleExitDemo = () => {
    setIsDemo(false);
    setResults(null);
  };

  useEffect(() => {
    if (isLoading) {
      setProgress(5);
      progressRef.current = setInterval(() => {
        setProgress((p) => (p < 88 ? p + (88 - p) * 0.08 : p));
      }, 250);
    } else {
      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(results ? 100 : 0);
    }
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [isLoading, results]);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Please sign in to run simulations. Click 'Get Started' to create a free account.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setResults(null);
    setIsDemo(false);
    const normalised = normalizeAssets(assets);
    const cleanTickers = normalised.map(a => a.ticker);
    const cleanWeights = normalised.map(a => a.weight / 100);
    const payload = {
      tickers: cleanTickers,
      weights: cleanWeights,
      simulation_days: Number(days),
      n_simulations: Number(sims),
      initial_portfolio_value: Number(initialValue),
      model,
      student_t_df: 5,
    };
    try {
      const response = await apiFetch("http://localhost:8000/api/simulate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const txt = await response.text();
        try { throw new Error(JSON.stringify(JSON.parse(txt).detail || JSON.parse(txt))); }
        catch { throw new Error(txt || "Simulation failed."); }
      }
      const data: SimResult = await response.json();
      setResults(data);
      // Save to run history (downsample median path to ≤50 pts for localStorage)
      const fullMedian = data.paths.median;
      const step = Math.max(1, Math.floor(fullMedian.length / 50));
      const medianPath = fullMedian.filter((_, i) => i % step === 0);
      saveRunToHistory({
        name: cleanTickers.join(", "),
        tickers: cleanTickers,
        weights: cleanWeights,
        model,
        days: Number(days),
        initialValue: Number(initialValue),
        metrics: data.metrics as unknown as Record<string, number>,
        medianPath,
      });
    } catch (err: any) {
      setError(err.message || "Unexpected error connecting to the engine.");
    } finally {
      setIsLoading(false);
    }
  };

  const tickerList = tickers.split(",").map((t) => t.trim()).filter((t) => t.length > 0);

  // Risk colour scale
  const riskColour = (pct: number) =>
    pct > 40 ? "#ef4444" : pct > 25 ? "#f59e0b" : "#10b981";

  return (
    <>
      {/* ── Page shell ── */}
      <div className="min-h-screen text-white" style={{ background: "#030712" }}>

        {/* Ambient glow orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute rounded-full blur-[120px] opacity-20"
            style={{ width: 600, height: 600, top: -200, left: -100, background: "radial-gradient(circle, #06b6d4, transparent)" }}
          />
          <div
            className="absolute rounded-full blur-[120px] opacity-10"
            style={{ width: 500, height: 500, bottom: -150, right: -100, background: "radial-gradient(circle, #8b5cf6, transparent)" }}
          />
          {/* subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        {/* ── Top accent bar ── */}
        <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, transparent, #06b6d4, #3b82f6, #8b5cf6, transparent)" }} />

        {/* ── Header ── */}
        <header className="relative z-10 max-w-7xl mx-auto px-6 pt-10 pb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}
            >
              <ShieldIcon />
            </div>
            <div>
              <h1
                className="text-3xl font-extrabold tracking-tight leading-none"
                style={{ background: "linear-gradient(90deg, #e2e8f0, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                QuantShield<span style={{ WebkitTextFillColor: "#06b6d4" }}>AI</span>
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">Institutional-Grade Monte Carlo Risk Engine</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            {isDemo && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold"
                style={{ borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.1)", color: "#a78bfa" }}>
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                Demo Mode
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-medium text-emerald-400"
              style={{ borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.06)" }}>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Engine Online
            </div>
          </div>
        </header>

        {/* ── AI Hero CTA ── */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-6">
          <button
            onClick={() => tier === "free" ? window.location.href = "/settings#upgrade" : setCopilotOpen(true)}
            className="group relative w-full overflow-hidden rounded-2xl px-6 py-4 flex items-center justify-between transition-all duration-300 hover:scale-[1.01]"
            style={{
              background: "linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(139,92,246,0.08) 50%, rgba(59,130,246,0.08) 100%)",
              border: "1px solid rgba(6,182,212,0.25)",
              boxShadow: "0 0 40px rgba(6,182,212,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* animated shimmer */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ background: "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.06) 50%, transparent 100%)", animation: "shimmer 2s infinite" }}
            />
            <div className="flex items-center gap-4">
              {/* Pulsing orb */}
              <div className="relative flex items-center justify-center w-12 h-12 shrink-0">
                <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: "radial-gradient(circle, #06b6d4, #8b5cf6)" }} />
                <div className="absolute inset-1 rounded-full opacity-40" style={{ background: "radial-gradient(circle, #06b6d4, #8b5cf6)" }} />
                <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-4 h-4">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
              </div>
              <div className="text-left">
                <p
                  className="text-base font-bold"
                  style={{ background: "linear-gradient(90deg, #06b6d4, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  Ask QUANT AI for Suggestions
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Powered by Llama 3.3 · Streaming analysis · Voice enabled
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex gap-2">
                {["Portfolio Risk", "Stock Analysis", "Diversification"].map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform"
                style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth={2.5} className="w-4 h-4">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        </div>

        {/* ── Tab navigation ── */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-4">
          <div
            className="inline-flex rounded-2xl p-1 gap-1"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {([
              { id: "simulate",  label: "Simulate",          icon: "⚡" },
              { id: "stress",    label: "Stress Test",       icon: "💥" },
              { id: "frontier",  label: "Frontier",          icon: "📈" },
              { id: "backtest",  label: "Backtest",          icon: "📅" },
              { id: "advanced",  label: "Advanced",          icon: "🔬" },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200"
                style={{
                  background: activeTab === tab.id ? "rgba(6,182,212,0.15)" : "transparent",
                  color: activeTab === tab.id ? "#22d3ee" : "#64748b",
                  border: activeTab === tab.id ? "1px solid rgba(6,182,212,0.3)" : "1px solid transparent",
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <main className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">

            {/* ── LEFT: Config panel ── */}
            <div
              className="rounded-3xl border p-7 flex flex-col gap-6 h-fit"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}
            >
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Simulation Parameters</h2>
                <p className="text-slate-500 text-sm">Configure your portfolio risk analysis</p>
              </div>

              <form onSubmit={handleRunSimulation} className="flex flex-col gap-5">
                {/* Tickers */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                    Asset Tickers
                  </label>
                  <input
                    type="text"
                    value={tickers}
                    onChange={(e) => handleTickerChange(e.target.value)}
                    placeholder="AAPL, MSFT, NVDA, BTC-USD"
                    required
                    className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    onFocus={(e) => (e.target.style.borderColor = "#06b6d4")}
                    onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                  />
                  <p className="text-xs text-slate-600 mt-1.5">NYSE/NASDAQ/Crypto (BTC-USD, ETH-USD)</p>

                  {/* Weight editor */}
                  <div className="mt-3">
                    <WeightEditor assets={assets} onChange={setAssets} />
                  </div>
                </div>

                {/* Days + Simulations row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                      Trading Days
                    </label>
                    <input
                      type="number" value={days} min={30} max={1260} required
                      onChange={(e) => setDays(Number(e.target.value))}
                      className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      onFocus={(e) => (e.target.style.borderColor = "#06b6d4")}
                      onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                      MC Paths
                    </label>
                    <input
                      type="number" value={sims} min={100} max={20000} required
                      onChange={(e) => setSims(Number(e.target.value))}
                      className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      onFocus={(e) => (e.target.style.borderColor = "#06b6d4")}
                      onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                    />
                  </div>
                </div>

                {/* Initial capital */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                    Initial Capital
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">$</span>
                    <input
                      type="number" value={initialValue} min={100} required
                      onChange={(e) => setInitialValue(Number(e.target.value))}
                      className="w-full rounded-xl pl-8 pr-4 py-3 text-sm text-white outline-none transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      onFocus={(e) => (e.target.style.borderColor = "#06b6d4")}
                      onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                    />
                  </div>
                </div>

                {/* Model selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                    Simulation Model
                  </label>
                  <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    {([["gbm", "GBM (Normal)", "Standard"], ["student_t", "Student-t (Fat tails)", "Heavier tails"]] as const).map(([id, label, sub]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setModel(id)}
                        className="flex-1 py-2 px-3 text-xs transition-colors text-left"
                        style={{
                          background: model === id ? "rgba(6,182,212,0.12)" : "rgba(255,255,255,0.02)",
                          borderRight: id === "gbm" ? "1px solid rgba(255,255,255,0.08)" : "none",
                          color: model === id ? "#22d3ee" : "#475569",
                        }}
                      >
                        <span className="font-bold block">{label}</span>
                        <span className="text-[10px] opacity-60">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="relative w-full py-3.5 rounded-2xl font-bold text-sm overflow-hidden transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: isLoading ? "rgba(6,182,212,0.3)" : "linear-gradient(135deg, #06b6d4, #3b82f6)", color: "#fff", boxShadow: isLoading ? "none" : "0 0 30px rgba(6,182,212,0.4)" }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Running {sims.toLocaleString()} Paths…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <ZapIcon /> Run Simulation
                    </span>
                  )}
                </button>

                {/* Progress bar */}
                {isLoading && (
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${progress}%`, background: "linear-gradient(90deg, #06b6d4, #3b82f6)" }}
                    />
                  </div>
                )}
              </form>

              {/* Quick presets */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Quick Presets</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Tech Giants", val: "AAPL, MSFT, NVDA, GOOGL" },
                    { label: "Mag 7", val: "AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA" },
                    { label: "Diversified", val: "SPY, QQQ, GLD, TLT, VNQ" },
                    { label: "Growth", val: "NVDA, AMD, TSLA, PLTR" },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => handleTickerChange(p.val)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Portfolio Manager ── */}
              <div
                className="rounded-2xl border p-4"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <PortfolioManager
                  currentAssets={assets}
                  currentModel={model}
                  onLoad={handleLoadPortfolio}
                />
              </div>
            </div>

            {/* ── RIGHT: Results panel ── */}
            <div className="flex flex-col gap-6">
              {/* ── Non-simulate tabs ── */}
              {activeTab === "stress" && (
                <StressTester
                  tickers={tickerList}
                  weights={results?.weights ?? []}
                  initialValue={initialValue}
                  apiBaseUrl="http://localhost:8000"
                />
              )}
              {activeTab === "frontier" && (
                <EfficientFrontier
                  tickers={tickerList}
                  apiBaseUrl="http://localhost:8000"
                />
              )}
              {activeTab === "backtest" && (
                <Backtester
                  tickers={tickerList}
                  weights={results?.weights ?? []}
                  initialValue={initialValue}
                  apiBaseUrl="http://localhost:8000"
                />
              )}
              {activeTab === "advanced" && (
                <TierGate requiredTier="enterprise" feature="Advanced Analytics">
                  <div className="rounded-3xl border p-8 flex flex-col items-center justify-center min-h-[300px] gap-3"
                    style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(139,92,246,0.2)" }}>
                    <p className="text-slate-300 font-semibold">Advanced Analytics</p>
                    <p className="text-slate-500 text-sm text-center max-w-sm">
                      Alpha, Treynor Ratio, Rolling Sharpe, Position VaR, Crash Survival Probability, Regime Badge
                    </p>
                  </div>
                </TierGate>
              )}
              {/* ── Simulate tab content ── */}
              {activeTab === "simulate" && <>

              {/* Error */}
              {error && (
                <div className="rounded-2xl border border-red-900/50 p-5" style={{ background: "rgba(239,68,68,0.06)" }}>
                  <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
                    <AlertIcon /> Simulation Failed
                  </div>
                  <pre className="text-red-300/80 text-xs whitespace-pre-wrap font-mono">{error}</pre>
                </div>
              )}

              {/* Empty state */}
              {!results && !error && !isLoading && (
                <div
                  className="rounded-3xl border flex flex-col items-center justify-center min-h-[480px] gap-4 px-8"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)", borderStyle: "dashed" }}
                >
                  <div
                    className="w-20 h-20 rounded-3xl flex items-center justify-center"
                    style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)" }}
                  >
                    <ActivityIcon />
                  </div>
                  <div className="text-center">
                    <p className="text-slate-300 font-semibold text-lg">Ready to Simulate</p>
                    <p className="text-slate-600 text-sm mt-1">Configure your portfolio and hit Run Simulation</p>
                  </div>
                  <div className="flex gap-6">
                    {["Monte Carlo GBM", "Cholesky Correlation", "CVaR / VaR"].map((f) => (
                      <div key={f} className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />{f}
                      </div>
                    ))}
                  </div>

                  {/* ── Demo CTA ── */}
                  <div className="flex flex-col items-center gap-3 pt-2 w-full max-w-sm">
                    <div className="flex items-center gap-3 w-full">
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                      <span className="text-xs text-slate-600 font-medium">or skip straight to a live example</span>
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                    </div>
                    <button
                      onClick={handleTryDemo}
                      className="group relative w-full overflow-hidden rounded-2xl py-3.5 px-6 font-bold text-sm transition-all duration-300 hover:scale-[1.02]"
                      style={{
                        background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))",
                        border: "1px solid rgba(139,92,246,0.35)",
                        color: "#c4b5fd",
                        boxShadow: "0 0 24px rgba(139,92,246,0.12)",
                      }}
                    >
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.2))" }}
                      />
                      <span className="relative flex items-center justify-center gap-2">
                        <ZapIcon />
                        Try Demo — No sign up required
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 group-hover:translate-x-1 transition-transform">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </span>
                    </button>
                    <p className="text-xs text-slate-600 text-center">
                      Sample portfolio: <span className="text-slate-500 font-medium">AAPL 40% · MSFT 30% · NVDA 30%</span> · $10,000 · 252 days
                    </p>
                  </div>
                </div>
              )}

              {/* Loading skeleton */}
              {isLoading && (
                <div className="rounded-3xl border p-8 flex flex-col items-center justify-center min-h-[480px] gap-6"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 animate-spin" viewBox="0 0 96 96" fill="none">
                      <circle cx={48} cy={48} r={42} stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
                      <path d="M48 6 A42 42 0 0 1 90 48" stroke="url(#spin-grad)" strokeWidth={6} strokeLinecap="round" />
                      <defs>
                        <linearGradient id="spin-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ShieldIcon />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-200 font-semibold">Computing Correlated GBM Paths</p>
                    <p className="text-slate-500 text-sm mt-1">{sims.toLocaleString()} Monte Carlo simulations in progress…</p>
                  </div>
                  {/* Skeleton cards */}
                  <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Results ── */}
              {results && !isLoading && (
                <div className="flex flex-col gap-5">

                  {/* Demo info banner */}
                  {isDemo && (
                    <div
                      className="rounded-2xl border px-5 py-3.5 flex items-center justify-between gap-4"
                      style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.06))", borderColor: "rgba(139,92,246,0.25)" }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}
                        >
                          <ZapIcon />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Viewing Demo Portfolio</p>
                          <p className="text-xs text-slate-500 mt-0.5">AAPL 40% · MSFT 30% · NVDA 30% · $10,000 · 252 days · 10,000 paths</p>
                        </div>
                      </div>
                      <button
                        onClick={handleExitDemo}
                        className="text-xs text-slate-600 hover:text-slate-400 transition-colors shrink-0 flex items-center gap-1.5"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Exit demo
                      </button>
                    </div>
                  )}

                  {/* Hero strip */}
                  <div
                    className="rounded-3xl border p-6 flex flex-wrap items-center justify-between gap-4"
                    style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(59,130,246,0.08))", borderColor: "rgba(6,182,212,0.2)" }}
                  >
                    <div>
                      <p className="text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-1">Median Portfolio Value</p>
                      <p className="text-4xl font-extrabold text-white">{fmt(results.metrics.median_final_value)}</p>
                      <p className="text-slate-500 text-sm mt-1">
                        After {days} trading days · {sims.toLocaleString()} simulated paths
                      </p>
                    </div>
                    <div className="flex gap-6">
                      <div className="text-center">
                        <p className="text-xs text-slate-500 mb-1">Bear Case (P5)</p>
                        <p className="text-lg font-bold text-red-400">{fmt(results.metrics.p5_final_value)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500 mb-1">Bull Case (P95)</p>
                        <p className="text-lg font-bold text-emerald-400">{fmt(results.metrics.p95_final_value ?? results.metrics.median_final_value * 1.6)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500 mb-1">Portfolio</p>
                        <p className="text-sm font-bold text-slate-300">{results.tickers.join(" · ")}</p>
                      </div>
                    </div>
                  </div>

                  {/* Distribution range bar */}
                  <div
                    className="rounded-2xl border p-5"
                    style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
                  >
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Outcome Distribution Range</p>
                    <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div
                        className="absolute top-0 h-full rounded-full"
                        style={{ background: "linear-gradient(90deg, #ef4444, #f59e0b, #10b981)", left: "5%", right: "5%" }}
                      />
                      {/* Median marker */}
                      <div className="absolute top-0 h-full w-0.5 bg-white/80" style={{ left: "50%" }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-2">
                      <span className="text-red-400">P5 · Bear</span>
                      <span className="text-white">Median</span>
                      <span className="text-emerald-400">P95 · Bull</span>
                    </div>
                  </div>

                  {/* Monte Carlo chart */}
                  <MonteCarloChart
                    paths={results.paths as any}
                    initialValue={initialValue}
                    days={days}
                    nSims={sims}
                    tickers={tickerList}
                  />

                  {/* Rolling metrics */}
                  <RollingMetrics medianPath={results.paths.median} days={days} />

                  {/* 8 Metric cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard
                      label="Expected Return" icon={<TrendUpIcon />} accent="#10b981"
                      value={`${results.metrics.expected_annual_return}%`}
                      sub="Annualised GBM drift"
                    />
                    <MetricCard
                      label="Annual Volatility" icon={<ActivityIcon />} accent="#f59e0b"
                      value={`${results.metrics.annual_volatility}%`}
                      sub="Historical σ · annualised"
                    />
                    <MetricCard
                      label="Sharpe Ratio" icon={<BarChartIcon />} accent="#3b82f6"
                      value={String(results.metrics.sharpe_ratio)}
                      sub="Risk-adjusted return"
                    />
                    <MetricCard
                      label="Max Drawdown" icon={<AlertIcon />} accent="#ef4444"
                      value={`${results.metrics.max_drawdown}%`}
                      sub="Peak-to-trough decline"
                    />
                    <TierGate requiredTier="pro" feature="VaR 95%">
                      <MetricCard
                        label="VaR 95%" icon={<ShieldIcon />} accent="#f97316"
                        value={fmt(Math.abs(results.metrics.var_95))}
                        sub="1-day 95% confidence loss"
                      />
                    </TierGate>
                    <TierGate requiredTier="pro" feature="CVaR 95%">
                      <MetricCard
                        label="CVaR 95%" icon={<AlertIcon />} accent="#ef4444"
                        value={fmt(Math.abs(results.metrics.cvar_95))}
                        sub="Expected shortfall tail"
                      />
                    </TierGate>
                    <MetricCard
                      label="Median Final" icon={<DollarIcon />} accent="#10b981"
                      value={fmt(results.metrics.median_final_value)}
                      sub="50th percentile outcome"
                    />
                    <MetricCard
                      label="Worst Case P5" icon={<TargetIcon />} accent="#94a3b8"
                      value={fmt(results.metrics.p5_final_value)}
                      sub="5th percentile outcome"
                    />
                  </div>

                  {/* Risk contribution */}
                  <div
                    className="rounded-3xl border p-6"
                    style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
                  >
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-5">Asset Risk Contribution</p>
                    <div className="flex flex-col gap-4">
                      {Object.entries(results.risk_contribution)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([ticker, pct]) => {
                          const p = pct as number;
                          const col = riskColour(p);
                          return (
                            <div key={ticker} className="flex items-center gap-4">
                              <span className="w-14 text-sm font-bold text-slate-300 shrink-0">{ticker}</span>
                              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${Math.min(p, 100)}%`, background: `linear-gradient(90deg, ${col}99, ${col})` }}
                                />
                              </div>
                              <span className="w-12 text-right text-sm font-semibold" style={{ color: col }}>{p}%</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* ── Return Distribution Histogram ── */}
                  <ReturnHistogram
                    paths={results.paths}
                    initialValue={initialValue}
                    varValue={results.metrics.var_95}
                    cvarValue={results.metrics.cvar_95}
                  />

                  {/* ── Correlation Heatmap ── */}
                  {results.correlation_matrix && Object.keys(results.correlation_matrix).length > 1 && (
                    <TierGate requiredTier="pro" feature="Correlation Heatmap">
                      <CorrelationHeatmap matrix={results.correlation_matrix as Record<string, Record<string, number>>} />
                    </TierGate>
                  )}

                  {/* ── Sector Exposure ── */}
                  <SectorExposure
                    tickers={results.tickers}
                    weights={results.weights ?? results.tickers.map(() => 1 / results.tickers.length)}
                  />

                  {/* ── Export ── */}
                  <TierGate requiredTier="pro" feature="PDF Export">
                    <div className="flex justify-end">
                      <ExportPanel results={results as any} days={days} sims={sims} model={model} />
                    </div>
                  </TierGate>

                  {/* ── Conversion CTA (demo only) ── */}
                  {isDemo && (
                    <div
                      className="rounded-3xl border p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"
                      style={{
                        background: "linear-gradient(135deg, rgba(6,182,212,0.06), rgba(139,92,246,0.06))",
                        borderColor: "rgba(6,182,212,0.2)",
                        boxShadow: "0 0 48px rgba(6,182,212,0.04), inset 0 1px 0 rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
                        >
                          <LockIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-white text-base">Unlock the Full Risk Report</p>
                          <p className="text-slate-400 text-sm mt-1 max-w-md">
                            VaR, CVaR, and stress-test metrics are gated in demo mode.
                            Sign up to run unlimited simulations on any portfolio.
                          </p>
                          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
                            {["Unlimited simulations", "VaR & CVaR unlocked", "AI Copilot full access", "PDF export"].map((f) => (
                              <div key={f} className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                                <span style={{ color: "#10b981" }}><CheckIcon /></span>
                                {f}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <a
                        href="#signup"
                        className="shrink-0 px-7 py-3.5 rounded-2xl font-bold text-sm text-white whitespace-nowrap transition-all duration-300 hover:scale-105 hover:shadow-lg"
                        style={{
                          background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
                          boxShadow: "0 0 30px rgba(6,182,212,0.25)",
                        }}
                      >
                        Unlock Full Report →
                      </a>
                    </div>
                  )}
                </div>
              )}
              </>}
            </div>
          </div>
        </main>
      </div>

      {/* ── AI Copilot ── */}
      <CopilotWidget
        simulationMetrics={results?.metrics ?? null}
        tickers={tickerList}
        apiBaseUrl="http://localhost:8000"
        externalOpen={copilotOpen}
        onOpenChange={setCopilotOpen}
      />
    </>
  );
}
