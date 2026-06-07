"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CopilotWidget from "@/components/CopilotWidget";
import MonteCarloChart from "@/components/MonteCarloChart";
import StressTester from "@/components/StressTester";
import EfficientFrontier from "@/components/EfficientFrontier";
import Backtester from "@/components/Backtester";
import WeightEditor, { equalWeights, normalizeAssets, type Asset } from "@/components/WeightEditor";
import PortfolioImport from "@/components/portfolio/PortfolioImport";
import Disclaimer from "@/components/ui/Disclaimer";
import PortfolioManager, { saveRunToHistory, type SavedPortfolio } from "@/components/PortfolioManager";
import CorrelationHeatmap from "@/components/CorrelationHeatmap";
import ReturnHistogram from "@/components/ReturnHistogram";
import SectorExposure from "@/components/SectorExposure";
import ExportPanel from "@/components/ExportPanel";
import RollingMetrics from "@/components/RollingMetrics";
import TierGate from "@/components/TierGate";
import { useAuth } from "@/lib/auth-context";

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 800): number {
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

// ─── Metric tooltips ──────────────────────────────────────────────────────────
const METRIC_TIPS: Record<string, string> = {
  "Expected Return":   "Annualised return predicted by GBM drift, based on 2 years of daily price history.",
  "Annual Volatility": "Annualised standard deviation of daily returns. Higher = more price uncertainty.",
  "Sharpe Ratio":      "Return earned per unit of risk (vs 5.25% risk-free rate). >1 is good; >2 is excellent.",
  "Max Drawdown":      "Largest peak-to-trough decline across all simulated paths. Worst-case loss scenario.",
  "VaR 95%":           "Value-at-Risk: the dollar loss you'd expect not to exceed on 95% of trading days.",
  "CVaR 95%":          "Conditional VaR (Expected Shortfall): the average loss in the worst 5% of scenarios.",
  "Median Final":      "The 50th-percentile portfolio value at the end of the simulation horizon.",
  "Worst Case P5":     "The 5th-percentile final value — what your portfolio looks like in a bad scenario.",
};

function Tip({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  const text = METRIC_TIPS[label];
  if (!text) return null;
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          width: 14, height: 14, borderRadius: "50%", fontSize: 9, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.07)", color: "var(--qs-text-3)",
          border: "none", cursor: "default",
        }}
        aria-label={`Explain ${label}`}
      >?</button>
      {show && (
        <div style={{
          position: "absolute", zIndex: 50, bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)",
          padding: "8px 10px", borderRadius: 6, fontSize: 11, color: "#C8CAD0", lineHeight: 1.5,
          background: "#1C1C21", border: "1px solid var(--qs-border-md)", width: 200,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Inline icons ─────────────────────────────────────────────────────────────
const TrendUpIcon  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
const ShieldIcon   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const ZapIcon      = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const AlertIcon    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1={12} y1={9} x2={12} y2={13}/><line x1={12} y1={17} x2="12.01" y2={17}/></svg>;
const BarChartIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><line x1={18} y1={20} x2={18} y2={10}/><line x1={12} y1={20} x2={12} y2={4}/><line x1={6} y1={20} x2={6} y2={14}/></svg>;
const ActivityIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const DollarIcon   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><line x1={12} y1={1} x2={12} y2={23}/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
const TargetIcon   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><circle cx={12} cy={12} r={10}/><circle cx={12} cy={12} r={6}/><circle cx={12} cy={12} r={2}/></svg>;
const LockIcon     = ({ size = 14 }: { size?: number }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: size, height: size }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>;

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

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

// ─── Demo data ────────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let s = seed;
  return (): number => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function buildDemoPaths() {
  const N = 101, S0 = 10000, DT = 1 / 100, N_PATHS = 500;
  const rand = mulberry32(42);
  const mu = 0.22, sigma = 0.26;
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
    expected_annual_return: 18.4, annual_volatility: 24.7, sharpe_ratio: 0.71,
    sortino_ratio: 1.02, max_drawdown: -27.3, var_95: -312, var_99: -441,
    cvar_95: -447, cvar_99: -623,
    median_final_value: Math.round(DEMO_PATHS.median[100]),
    p5_final_value: Math.round(DEMO_PATHS.p5[100]),
    p95_final_value: Math.round(DEMO_PATHS.p95[100]),
  },
  risk_contribution: { AAPL: 35.2, MSFT: 28.7, NVDA: 36.1 },
  weights: [0.40, 0.30, 0.30],
  paths: DEMO_PATHS,
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function LockedCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 8 }}>
      <div style={{ filter: "blur(5px)", userSelect: "none", pointerEvents: "none" }}>{children}</div>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 6,
        background: "rgba(17,17,19,0.6)", backdropFilter: "blur(2px)",
      }}>
        <span style={{ color: "var(--qs-violet)" }}><LockIcon size={16} /></span>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: 0 }}>
          Subscribe to unlock
        </p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 8,
      border: "1px solid var(--qs-border)", padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 10,
      background: "rgba(255,255,255,0.025)",
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--qs-border)")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--qs-text-3)", margin: 0 }}>
            {label}
          </p>
          <Tip label={label} />
        </div>
        <span style={{ color: accent, opacity: 0.7 }}>{icon}</span>
      </div>
      <p className="tabnum" style={{ fontSize: 20, fontWeight: 700, color: "var(--qs-text)", margin: 0, lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: "var(--qs-text-3)", margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ─── Section tab labels ───────────────────────────────────────────────────────
const TAB_LABELS: Record<string, string> = {
  simulate: "Simulate",
  stress:   "Stress Test",
  frontier: "Efficient Frontier",
  backtest: "Backtest",
  advanced: "Advanced Analytics",
};

// ─── Main app ─────────────────────────────────────────────────────────────────
function AppContent() {
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") ?? "simulate") as keyof typeof TAB_LABELS;
  const { user, tier, loading: authLoading, getToken } = useAuth();

  const [tickers, setTickers]           = useState("AAPL, MSFT, NVDA");
  const [assets, setAssets]             = useState<Asset[]>(equalWeights(["AAPL", "MSFT", "NVDA"]));
  const [model, setModel]               = useState<"gbm" | "student_t">("gbm");
  const [days, setDays]                 = useState(252);
  const [sims, setSims]                 = useState(20000);
  const [initialValue, setInitialValue] = useState(10000);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [results, setResults]           = useState<SimResult | null>(null);
  const [progress, setProgress]         = useState(0);
  const [copilotOpen, setCopilotOpen]   = useState(false);
  const [isDemo, setIsDemo]             = useState(false);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const handleTickerChange = useCallback((raw: string) => {
    setTickers(raw);
    const parsed = raw.split(",").map(t => t.trim().toUpperCase()).filter(Boolean);
    setAssets(prev => {
      const map = Object.fromEntries(prev.map(a => [a.ticker, a]));
      const next = parsed.map(t => map[t] ?? { ticker: t, weight: 0, locked: false });
      return normalizeAssets(next.length ? next : [{ ticker: "AAPL", weight: 100, locked: false }]);
    });
  }, []);

  const handleLoadPortfolio = useCallback((p: SavedPortfolio) => {
    setTickers(p.tickers.join(", "));
    setModel(p.model as "gbm" | "student_t");
    setAssets(p.tickers.map((t, i) => ({ ticker: t, weight: (p.weights[i] ?? 0) * 100, locked: false })));
  }, []);

  const handleTryDemo = () => {
    setTickers("AAPL, MSFT, NVDA");
    setAssets([{ ticker: "AAPL", weight: 40, locked: false }, { ticker: "MSFT", weight: 30, locked: false }, { ticker: "NVDA", weight: 30, locked: false }]);
    setDays(252); setSims(10000); setInitialValue(10000); setModel("gbm");
    setResults(DEMO_RESULT as SimResult); setIsDemo(true); setError(null);
  };

  const handleExitDemo = () => { setIsDemo(false); setResults(null); };

  useEffect(() => {
    if (isLoading) {
      setProgress(5);
      progressRef.current = setInterval(() => setProgress(p => p < 88 ? p + (88 - p) * 0.08 : p), 250);
    } else {
      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(results ? 100 : 0);
    }
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [isLoading, results]);

  const ANON_KEY = "qs_anon_used";

  // Ref so triggerAnalyze always calls the latest handleRunSimulation
  const runSimRef = useRef<((e: React.FormEvent) => Promise<void>) | null>(null);

  const triggerAnalyze = useCallback(() => {
    runSimRef.current?.({ preventDefault: () => {} } as React.FormEvent);
  }, []);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    runSimRef.current = handleRunSimulation;
    if (authLoading) return;

    // Anonymous users get one free baseline run tracked in localStorage
    if (!user) {
      const used = typeof window !== "undefined" && localStorage.getItem(ANON_KEY);
      if (used) {
        setError("__auth__"); // sentinel — renders sign-up CTA
        return;
      }
      // First anonymous run — proceed, mark after success below
    }
    setIsLoading(true); setError(null); setResults(null); setIsDemo(false);
    const normalised = normalizeAssets(assets);
    const cleanTickers = normalised.map(a => a.ticker);
    const cleanWeights = normalised.map(a => a.weight / 100);
    const payload = {
      tickers: cleanTickers, weights: cleanWeights,
      simulation_days: Number(days), n_simulations: Number(sims),
      initial_portfolio_value: Number(initialValue), model, student_t_df: 5,
    };
    try {
      const res = await apiFetch("/backend/api/simulate", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const txt = await res.text();
        let msg = `Server error ${res.status}`;
        try { const j = JSON.parse(txt); msg = (typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)) || msg; } catch { msg = txt || msg; }
        throw new Error(msg);
      }
      const data: SimResult = await res.json();
      setResults(data);
      // Mark anonymous run so subsequent attempts show the sign-up CTA
      if (!user) localStorage.setItem(ANON_KEY, "1");
      const step = Math.max(1, Math.floor(data.paths.median.length / 50));
      saveRunToHistory({
        name: cleanTickers.join(", "), tickers: cleanTickers, weights: cleanWeights, model,
        days: Number(days), initialValue: Number(initialValue),
        metrics: data.metrics as unknown as Record<string, number>,
        medianPath: data.paths.median.filter((_, i) => i % step === 0),
      });
    } catch (err: any) {
      setError(err.message || "Unexpected error.");
    } finally {
      setIsLoading(false);
    }
  };

  const tickerList = tickers.split(",").map(t => t.trim()).filter(Boolean);
  const riskColour = (pct: number) => pct > 40 ? "var(--qs-red)" : pct > 25 ? "var(--qs-amber)" : "var(--qs-green)";

  // ─── Shared input style ──────────────────────────────────────────────────────
  const inputCls = "qs-input";
  const inputFocus = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = "var(--qs-accent)");
  const inputBlur  = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = "var(--qs-border-md)");

  return (
    <>
      <div style={{ minHeight: "100vh", background: "var(--qs-bg)", color: "var(--qs-text)" }}>

        {/* ── Page header ── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 20,
          borderBottom: "1px solid var(--qs-border)",
          background: "rgba(17,17,19,0.92)", backdropFilter: "blur(12px)",
          padding: "0 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 44,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--qs-text-3)" }}>QuantShield</span>
            <span style={{ fontSize: 12, color: "var(--qs-text-3)" }}>/</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--qs-text)" }}>
              {TAB_LABELS[activeTab] ?? "Simulate"}
            </span>
            {isDemo && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                background: "var(--qs-violet-bg)", color: "var(--qs-violet)",
                border: "1px solid rgba(139,92,246,0.25)", textTransform: "uppercase",
                letterSpacing: "0.05em", marginLeft: 4,
              }}>
                Demo
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--qs-green)", padding: "3px 8px", borderRadius: 4, background: "var(--qs-green-bg)" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--qs-green)", display: "inline-block" }} />
              Engine Online
            </div>
            <button
              onClick={() => tier === "free" ? window.location.href = "/settings" : setCopilotOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
                borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: "var(--qs-accent-bg)", border: "1px solid var(--qs-accent-bd)",
                color: "#9DA5E8", cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(94,106,210,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--qs-accent-bg)")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 13, height: 13 }}>
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              Ask AI
            </button>
          </div>
        </header>

        {/* ── Body ── */}
        <main style={{ padding: "20px 24px 48px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, maxWidth: 1400 }}>

            {/* ── Left: Config ── */}
            <div style={{
              borderRadius: 10, border: "1px solid var(--qs-border)",
              padding: "20px", display: "flex", flexDirection: "column", gap: 18,
              background: "rgba(255,255,255,0.02)", height: "fit-content",
              position: "sticky", top: 60,
            }}>
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--qs-text)", margin: "0 0 2px" }}>Parameters</h2>
                <p style={{ fontSize: 12, color: "var(--qs-text-3)", margin: 0 }}>Configure your portfolio</p>
              </div>

              {/* Portfolio import — Paste / CSV / Manual */}
              <div style={{ marginBottom: 4 }}>
                <PortfolioImport
                  assets={assets}
                  onChange={setAssets}
                  tickers={tickers}
                  onTickersChange={handleTickerChange}
                  onAutoAnalyze={triggerAnalyze}
                />
              </div>

              <form onSubmit={handleRunSimulation} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Days + Sims */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Trading Days", val: days,  set: setDays,  min: 30,  max: 1260 },
                    { label: "MC Paths",     val: sims,  set: setSims,  min: 100, max: 20000 },
                  ].map(f => (
                    <div key={f.label}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--qs-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                        {f.label}
                      </label>
                      <input
                        type="number" value={f.val} min={f.min} max={f.max} required
                        onChange={e => f.set(Number(e.target.value))}
                        className={inputCls} onFocus={inputFocus} onBlur={inputBlur}
                      />
                    </div>
                  ))}
                </div>

                {/* Initial capital */}
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--qs-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                    Initial Capital
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--qs-text-3)" }}>$</span>
                    <input
                      type="number" value={initialValue} min={100} required
                      onChange={e => setInitialValue(Number(e.target.value))}
                      className={inputCls} style={{ paddingLeft: 22 }}
                      onFocus={inputFocus} onBlur={inputBlur}
                    />
                  </div>
                </div>

                {/* Model */}
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--qs-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                    Model
                  </label>
                  <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--qs-border-md)" }}>
                    {([["gbm", "GBM", "Normal"], ["student_t", "Student-t", "Fat tails"]] as const).map(([id, label, sub]) => (
                      <button key={id} type="button" onClick={() => setModel(id)} style={{
                        flex: 1, padding: "7px 10px", fontSize: 12, textAlign: "left", cursor: "pointer",
                        background: model === id ? "var(--qs-accent-bg)" : "rgba(255,255,255,0.02)",
                        borderRight: id === "gbm" ? "1px solid var(--qs-border-md)" : "none",
                        border: "none",
                        color: model === id ? "#9DA5E8" : "var(--qs-text-3)",
                      }}>
                        <span style={{ display: "block", fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 10, opacity: 0.7 }}>{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit" disabled={isLoading || authLoading}
                  style={{
                    padding: "9px 16px", borderRadius: 7, fontWeight: 600, fontSize: 13,
                    color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: isLoading ? "rgba(94,106,210,0.4)" : "var(--qs-accent)",
                    border: "1px solid rgba(94,106,210,0.5)",
                    boxShadow: isLoading ? "none" : "0 1px 8px rgba(94,106,210,0.2)",
                    opacity: isLoading ? 0.8 : 1,
                  }}
                >
                  {isLoading ? (
                    <>
                      <svg style={{ width: 13, height: 13, animation: "spin 0.8s linear infinite" }} viewBox="0 0 24 24" fill="none">
                        <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} style={{ opacity: 0.25 }} />
                        <path fill="currentColor" style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Running {sims.toLocaleString()} paths…
                    </>
                  ) : (
                    <><ZapIcon /> Run Simulation</>
                  )}
                </button>

                {isLoading && (
                  <div style={{ height: 2, borderRadius: 1, background: "var(--qs-border-md)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "var(--qs-accent)", transition: "width 0.3s", borderRadius: 1 }} />
                  </div>
                )}
              </form>

              {/* Presets */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--qs-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                  Quick Presets
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    { label: "Tech Giants", val: "AAPL, MSFT, NVDA, GOOGL" },
                    { label: "Mag 7",       val: "AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA" },
                    { label: "Diversified", val: "SPY, QQQ, GLD, TLT, VNQ" },
                    { label: "Growth",      val: "NVDA, AMD, TSLA, PLTR" },
                  ].map(p => (
                    <button key={p.label} onClick={() => handleTickerChange(p.val)} style={{
                      padding: "4px 9px", borderRadius: 5, fontSize: 11, fontWeight: 500,
                      background: "rgba(255,255,255,0.04)", border: "1px solid var(--qs-border)",
                      color: "var(--qs-text-2)", cursor: "pointer", transition: "border-color 0.1s",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--qs-border-md)")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--qs-border)")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Portfolio manager */}
              <div style={{ borderRadius: 8, border: "1px solid var(--qs-border)", padding: 12, background: "rgba(255,255,255,0.015)" }}>
                <PortfolioManager currentAssets={assets} currentModel={model} onLoad={handleLoadPortfolio} />
              </div>
            </div>

            {/* ── Right: Results ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Non-simulate tabs */}
              {activeTab === "stress" && (
                <StressTester tickers={tickerList} weights={results?.weights ?? []} initialValue={initialValue} apiBaseUrl="/backend" />
              )}
              {activeTab === "frontier" && (
                <EfficientFrontier tickers={tickerList} apiBaseUrl="/backend" />
              )}
              {activeTab === "backtest" && (
                <Backtester tickers={tickerList} weights={results?.weights ?? []} initialValue={initialValue} apiBaseUrl="/backend" />
              )}
              {activeTab === "advanced" && (
                <TierGate requiredTier="enterprise" feature="Advanced Analytics">
                  <div style={{
                    borderRadius: 10, border: "1px solid rgba(139,92,246,0.2)", padding: "40px 24px",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    minHeight: 280, gap: 10, background: "rgba(139,92,246,0.04)",
                  }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-text)", margin: 0 }}>Advanced Analytics</p>
                    <p style={{ fontSize: 13, color: "var(--qs-text-2)", textAlign: "center", maxWidth: 360, margin: 0 }}>
                      Alpha, Treynor Ratio, Rolling Sharpe, Position VaR, Crash Survival Probability, Regime Badge
                    </p>
                  </div>
                </TierGate>
              )}

              {activeTab === "simulate" && (
                <>
                  {/* Error / Auth gate */}
                  {error === "__auth__" ? (
                    <div style={{
                      borderRadius: 10, border: "1px solid var(--qs-accent-bd)", padding: "20px 22px",
                      background: "var(--qs-accent-bg)",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                    }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-text)", margin: "0 0 4px" }}>
                          You&apos;ve used your free analysis
                        </p>
                        <p style={{ fontSize: 12, color: "var(--qs-text-2)", margin: 0 }}>
                          Create a free account to run up to 3 simulations per day, save portfolios, and track history. No credit card required.
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <a href="/login" style={{
                          padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500,
                          color: "var(--qs-text-2)", border: "1px solid var(--qs-border-md)",
                          textDecoration: "none", background: "transparent",
                        }}>
                          Sign in
                        </a>
                        <a href="/register" style={{
                          padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                          color: "white", background: "var(--qs-accent)", textDecoration: "none",
                          boxShadow: "0 1px 8px rgba(94,106,210,0.3)",
                        }}>
                          Get started free →
                        </a>
                      </div>
                    </div>
                  ) : error ? (
                    <div style={{ borderRadius: 8, border: "1px solid rgba(229,72,77,0.25)", padding: "14px 16px", background: "var(--qs-red-bg)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--qs-red)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                        <AlertIcon /> Simulation Failed
                      </div>
                      <pre style={{ fontSize: 11, color: "rgba(248,113,113,0.8)", whiteSpace: "pre-wrap", fontFamily: "monospace", margin: 0 }}>{error}</pre>
                    </div>
                  ) : null}

                  {/* Empty state */}
                  {!results && !error && !isLoading && (
                    <div style={{
                      borderRadius: 10, border: "1px solid var(--qs-border)", borderStyle: "dashed",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      minHeight: 400, gap: 16, padding: "32px 24px",
                      background: "rgba(255,255,255,0.01)",
                    }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 10,
                        background: "var(--qs-accent-bg)", border: "1px solid var(--qs-accent-bd)",
                        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--qs-accent)",
                      }}>
                        <ActivityIcon />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-text)", margin: "0 0 4px" }}>Ready to Simulate</p>
                        <p style={{ fontSize: 12, color: "var(--qs-text-3)", margin: 0 }}>Configure your portfolio and hit Run Simulation</p>
                      </div>
                      <div style={{ display: "flex", gap: 20 }}>
                        {["Monte Carlo GBM", "Cholesky Correlation", "CVaR / VaR"].map(f => (
                          <div key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--qs-text-3)" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--qs-accent)", display: "inline-block" }} />{f}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%", maxWidth: 320, paddingTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                          <div style={{ flex: 1, height: 1, background: "var(--qs-border)" }} />
                          <span style={{ fontSize: 11, color: "var(--qs-text-3)" }}>or try a live demo</span>
                          <div style={{ flex: 1, height: 1, background: "var(--qs-border)" }} />
                        </div>
                        <button onClick={handleTryDemo} style={{
                          width: "100%", padding: "10px 16px", borderRadius: 7, fontWeight: 600, fontSize: 13,
                          background: "var(--qs-violet-bg)", border: "1px solid rgba(139,92,246,0.3)",
                          color: "#C4B5FD", cursor: "pointer",
                        }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,0.18)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "var(--qs-violet-bg)")}
                        >
                          <ZapIcon /> Try Demo — No sign up required
                        </button>
                        <p style={{ fontSize: 11, color: "var(--qs-text-3)", textAlign: "center", margin: 0 }}>
                          AAPL 40% · MSFT 30% · NVDA 30% · $10,000 · 252 days
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Loading */}
                  {isLoading && (
                    <div style={{
                      borderRadius: 10, border: "1px solid var(--qs-border)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      minHeight: 400, gap: 20, padding: 32,
                      background: "rgba(255,255,255,0.01)",
                    }}>
                      <svg style={{ width: 56, height: 56, animation: "spin 1s linear infinite" }} viewBox="0 0 56 56" fill="none">
                        <circle cx={28} cy={28} r={24} stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
                        <path d="M28 4A24 24 0 0 1 52 28" stroke="var(--qs-accent)" strokeWidth={4} strokeLinecap="round" />
                      </svg>
                      <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-text)", margin: "0 0 4px" }}>Computing Paths</p>
                        <p style={{ fontSize: 12, color: "var(--qs-text-3)", margin: 0 }}>{sims.toLocaleString()} Monte Carlo simulations in progress…</p>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, width: "100%" }}>
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="skeleton" style={{ height: 64, borderRadius: 8 }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Results */}
                  {results && !isLoading && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                      {/* Anonymous post-run upsell banner */}
                      {!user && !isDemo && (
                        <div style={{
                          borderRadius: 9, border: "1px solid rgba(94,106,210,0.3)", padding: "12px 16px",
                          background: "rgba(94,106,210,0.08)",
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                        }}>
                          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0 }}>
                            <strong style={{ color: "rgba(255,255,255,0.85)" }}>Free analysis used.</strong>{" "}
                            Sign up to save this portfolio, run unlimited analyses, and unlock CVaR, Sortino &amp; AI Copilot.
                          </p>
                          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                            <a href="/login" style={{
                              padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                              color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.12)",
                              textDecoration: "none",
                            }}>Sign in</a>
                            <a href="/register" style={{
                              padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                              color: "white", background: "var(--qs-accent)", textDecoration: "none",
                            }}>Create free account →</a>
                          </div>
                        </div>
                      )}

                      {/* Non-advice disclaimer */}
                      <Disclaimer compact />

                      {/* Demo banner */}
                      {isDemo && (
                        <div style={{
                          borderRadius: 8, border: "1px solid rgba(139,92,246,0.2)", padding: "10px 14px",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          background: "var(--qs-violet-bg)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ color: "var(--qs-violet)", display: "flex" }}><ZapIcon /></span>
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--qs-text)", margin: 0 }}>Demo Portfolio</p>
                              <p style={{ fontSize: 11, color: "var(--qs-text-3)", margin: 0 }}>AAPL 40% · MSFT 30% · NVDA 30% · $10,000 · 252 days</p>
                            </div>
                          </div>
                          <button onClick={handleExitDemo} style={{ fontSize: 11, color: "var(--qs-text-3)", background: "none", border: "none", cursor: "pointer" }}>
                            Exit demo ×
                          </button>
                        </div>
                      )}

                      {/* Hero strip */}
                      <div style={{
                        borderRadius: 10, border: "1px solid var(--qs-accent-bd)", padding: "18px 20px",
                        display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16,
                        background: "var(--qs-accent-bg)",
                      }}>
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--qs-accent)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 4px" }}>
                            Median Portfolio Value
                          </p>
                          <p className="tabnum" style={{ fontSize: 32, fontWeight: 700, color: "var(--qs-text)", margin: 0, lineHeight: 1 }}>
                            {fmt(results.metrics.median_final_value)}
                          </p>
                          <p style={{ fontSize: 11, color: "var(--qs-text-3)", margin: "4px 0 0" }}>
                            After {days} trading days · {sims.toLocaleString()} paths
                          </p>
                        </div>
                        <div style={{ display: "flex", gap: 24 }}>
                          <div>
                            <p style={{ fontSize: 10, color: "var(--qs-text-3)", margin: "0 0 3px" }}>Bear (P5)</p>
                            <p className="tabnum" style={{ fontSize: 16, fontWeight: 700, color: "var(--qs-red)", margin: 0 }}>
                              {fmt(results.metrics.p5_final_value)}
                            </p>
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: "var(--qs-text-3)", margin: "0 0 3px" }}>Bull (P95)</p>
                            <p className="tabnum" style={{ fontSize: 16, fontWeight: 700, color: "var(--qs-green)", margin: 0 }}>
                              {fmt(results.metrics.p95_final_value ?? results.metrics.median_final_value * 1.6)}
                            </p>
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: "var(--qs-text-3)", margin: "0 0 3px" }}>Tickers</p>
                            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--qs-text-2)", margin: 0 }}>
                              {results.tickers.join(" · ")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Outcome bar */}
                      <div style={{ borderRadius: 8, border: "1px solid var(--qs-border)", padding: "14px 16px", background: "rgba(255,255,255,0.02)" }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: "var(--qs-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>
                          Outcome Distribution
                        </p>
                        <div style={{ position: "relative", height: 8, borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
                          <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 4, left: "5%", right: "5%", background: "linear-gradient(90deg, var(--qs-red), var(--qs-amber), var(--qs-green))" }} />
                          <div style={{ position: "absolute", top: 0, height: "100%", width: 2, background: "rgba(255,255,255,0.7)", left: "50%" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--qs-text-3)" }}>
                          <span style={{ color: "var(--qs-red)" }}>P5 · Bear</span>
                          <span style={{ color: "var(--qs-text)" }}>Median</span>
                          <span style={{ color: "var(--qs-green)" }}>P95 · Bull</span>
                        </div>
                      </div>

                      <MonteCarloChart paths={results.paths as any} initialValue={initialValue} days={days} nSims={sims} tickers={tickerList} />
                      <RollingMetrics medianPath={results.paths.median} days={days} />

                      {/* 8 metric cards */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                        <MetricCard label="Expected Return" icon={<TrendUpIcon />} accent="var(--qs-green)"
                          value={`${results.metrics.expected_annual_return}%`} sub="Annualised GBM drift" />
                        <MetricCard label="Annual Volatility" icon={<ActivityIcon />} accent="var(--qs-amber)"
                          value={`${results.metrics.annual_volatility}%`} sub="Historical σ" />
                        <MetricCard label="Sharpe Ratio" icon={<BarChartIcon />} accent="var(--qs-accent)"
                          value={String(results.metrics.sharpe_ratio)} sub="Risk-adjusted return" />
                        <MetricCard label="Max Drawdown" icon={<AlertIcon />} accent="var(--qs-red)"
                          value={`${results.metrics.max_drawdown}%`} sub="Peak-to-trough" />
                        <TierGate requiredTier="pro" feature="VaR 95%">
                          <MetricCard label="VaR 95%" icon={<ShieldIcon />} accent="var(--qs-amber)"
                            value={fmt(Math.abs(results.metrics.var_95))} sub="1-day 95% loss" />
                        </TierGate>
                        <TierGate requiredTier="pro" feature="CVaR 95%">
                          <MetricCard label="CVaR 95%" icon={<AlertIcon />} accent="var(--qs-red)"
                            value={fmt(Math.abs(results.metrics.cvar_95))} sub="Expected shortfall" />
                        </TierGate>
                        <MetricCard label="Median Final" icon={<DollarIcon />} accent="var(--qs-green)"
                          value={fmt(results.metrics.median_final_value)} sub="50th percentile" />
                        <MetricCard label="Worst Case P5" icon={<TargetIcon />} accent="var(--qs-text-2)"
                          value={fmt(results.metrics.p5_final_value)} sub="5th percentile" />
                      </div>

                      {/* Risk contribution */}
                      <div style={{ borderRadius: 10, border: "1px solid var(--qs-border)", padding: "16px 18px", background: "rgba(255,255,255,0.02)" }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: "var(--qs-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 14px" }}>
                          Asset Risk Contribution
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {Object.entries(results.risk_contribution)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([ticker, pct]) => {
                              const p = pct as number;
                              const col = riskColour(p);
                              return (
                                <div key={ticker} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <span style={{ width: 44, fontSize: 12, fontWeight: 600, color: "var(--qs-text-2)", flexShrink: 0 }}>{ticker}</span>
                                  <div style={{ flex: 1, height: 5, borderRadius: 2, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
                                    <div style={{ height: "100%", width: `${Math.min(p, 100)}%`, background: col, borderRadius: 2, transition: "width 0.6s" }} />
                                  </div>
                                  <span style={{ width: 38, textAlign: "right", fontSize: 12, fontWeight: 600, color: col, flexShrink: 0 }}>{p}%</span>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      <ReturnHistogram paths={results.paths} initialValue={initialValue} varValue={results.metrics.var_95} cvarValue={results.metrics.cvar_95} />

                      {results.correlation_matrix && Object.keys(results.correlation_matrix).length > 1 && (
                        <TierGate requiredTier="pro" feature="Correlation Heatmap">
                          <CorrelationHeatmap matrix={results.correlation_matrix as Record<string, Record<string, number>>} />
                        </TierGate>
                      )}

                      <SectorExposure tickers={results.tickers} weights={results.weights ?? results.tickers.map(() => 1 / results.tickers.length)} />

                      <TierGate requiredTier="pro" feature="PDF Export">
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <ExportPanel results={results as any} days={days} sims={sims} model={model} />
                        </div>
                      </TierGate>

                      {isDemo && (
                        <div style={{
                          borderRadius: 10, border: "1px solid var(--qs-accent-bd)", padding: "18px 20px",
                          display: "flex", flexDirection: "column", gap: 14,
                          background: "var(--qs-accent-bg)",
                        }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--qs-text)", margin: "0 0 4px" }}>Unlock the Full Risk Report</p>
                            <p style={{ fontSize: 12, color: "var(--qs-text-2)", margin: "0 0 10px" }}>
                              VaR, CVaR, and stress-test metrics are gated in demo mode.
                            </p>
                            {["Unlimited simulations", "VaR & CVaR unlocked", "AI Copilot full access", "PDF export"].map(f => (
                              <div key={f} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--qs-green)" strokeWidth={2.5} style={{ width: 11, height: 11, flexShrink: 0 }}>
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span style={{ fontSize: 12, color: "var(--qs-text-2)" }}>{f}</span>
                              </div>
                            ))}
                          </div>
                          <a href="/register" style={{
                            display: "inline-block", padding: "9px 20px", borderRadius: 7, fontWeight: 600,
                            fontSize: 13, color: "white", background: "var(--qs-accent)",
                            textDecoration: "none", alignSelf: "flex-start",
                          }}>
                            Unlock Full Report →
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      <CopilotWidget
        simulationMetrics={results?.metrics ?? null}
        tickers={tickerList}
        apiBaseUrl="/backend"
        externalOpen={copilotOpen}
        onOpenChange={setCopilotOpen}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AppContent />
    </Suspense>
  );
}
