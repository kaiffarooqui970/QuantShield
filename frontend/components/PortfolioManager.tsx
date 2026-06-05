"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { Asset } from "./WeightEditor";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SavedPortfolio {
  id: string;
  name: string;
  tickers: string[];
  weights: number[];
  model: string;
  savedAt: number;
}

export interface RunRecord {
  id: string;
  name: string;
  tickers: string[];
  weights: number[];
  model: string;
  days: number;
  initialValue: number;
  metrics: Record<string, number>;
  medianPath?: number[]; // downsampled to ≤50 pts for localStorage
  ranAt: number;
}

const PORTFOLIO_KEY = "qs_portfolios";
const HISTORY_KEY   = "qs_run_history";
const MAX_HISTORY   = 20;

// ─── localStorage helpers ─────────────────────────────────────────────────────
function loadPortfolios(): SavedPortfolio[] {
  try { return JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || "[]"); } catch { return []; }
}
function savePortfolios(ps: SavedPortfolio[]) {
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(ps));
}
function loadHistory(): RunRecord[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
export function saveRunToHistory(record: Omit<RunRecord, "id" | "ranAt">) {
  const history = loadHistory();
  const entry: RunRecord = { ...record, id: crypto.randomUUID(), ranAt: Date.now() };
  const next = [entry, ...history].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

// ─── Overlaid path chart ──────────────────────────────────────────────────────
const COMPARE_COLORS = ["#22d3ee", "#a78bfa", "#34d399"];
function PathOverlayChart({ runs }: { runs: RunRecord[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const filtered = runs.filter(r => r.medianPath && r.medianPath.length > 2);
    if (!filtered.length) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = wrap.clientWidth  * dpr;
    canvas.height = wrap.clientHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const PAD = { top: 8, right: 8, bottom: 20, left: 52 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    const maxLen = Math.max(...filtered.map(r => r.medianPath!.length));
    const allVals = filtered.flatMap(r => r.medianPath!);
    const minV = Math.min(...allVals) * 0.97, maxV = Math.max(...allVals) * 1.03;

    const sx = (i: number, n: number) => PAD.left + (i / (n - 1)) * cW;
    const sy = (v: number) => PAD.top + (1 - (v - minV) / (maxV - minV)) * cH;

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
    for (let r = 0; r <= 3; r++) {
      const y = PAD.top + (r / 3) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    }

    // Lines
    filtered.forEach((run, si) => {
      const path = run.medianPath!;
      const color = COMPARE_COLORS[si % COMPARE_COLORS.length];
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.strokeStyle = color; ctx.lineWidth = si === 0 ? 2.5 : 1.8;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      path.forEach((v, i) => {
        const x = sx(i, path.length), y = sy(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    });

    // Y labels
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.font = "9px monospace"; ctx.textAlign = "right";
    for (let r = 0; r <= 3; r++) {
      const v = minV + ((3 - r) / 3) * (maxV - minV);
      const k = v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;
      ctx.fillText(k, PAD.left - 4, PAD.top + (r / 3) * cH + 3);
    }
  }, [runs]);

  return (
    <div>
      <div className="flex gap-3 mb-2 flex-wrap">
        {runs.filter(r => r.medianPath?.length).map((r, i) => (
          <div key={r.id} className="flex items-center gap-1.5 text-[10px]">
            <div className="w-4 h-0.5 rounded" style={{ background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />
            <span className="text-slate-500">{r.name}</span>
          </div>
        ))}
      </div>
      <div ref={wrapRef} style={{ height: 130 }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>
    </div>
  );
}

// ─── Compare panel ────────────────────────────────────────────────────────────
function ComparePanel({ a, b, onClose }: { a: RunRecord; b: RunRecord; onClose: () => void }) {
  const keys: { key: keyof RunRecord["metrics"]; label: string; suffix: string; better: "higher" | "lower" }[] = [
    { key: "expected_annual_return", label: "Exp. Return",  suffix: "%",  better: "higher" },
    { key: "annual_volatility",      label: "Volatility",   suffix: "%",  better: "lower"  },
    { key: "sharpe_ratio",           label: "Sharpe",       suffix: "",   better: "higher" },
    { key: "sortino_ratio",          label: "Sortino",      suffix: "",   better: "higher" },
    { key: "max_drawdown",           label: "Max Drawdown", suffix: "%",  better: "lower"  },
    { key: "var_95",                 label: "VaR 95%",      suffix: "$",  better: "lower"  },
    { key: "cvar_95",                label: "CVaR 95%",     suffix: "$",  better: "lower"  },
    { key: "median_final_value",     label: "Median Final", suffix: "$",  better: "higher" },
  ];

  return (
    <div
      className="rounded-3xl border p-5 scale-enter"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(6,182,212,0.2)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Side-by-Side Comparison</p>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-400 text-xs">✕ Close</button>
      </div>

      {/* Overlaid median-path chart */}
      {(a.medianPath || b.medianPath) && (
        <div className="mb-4 rounded-2xl border p-3"
             style={{ background: "rgba(0,0,0,0.2)", borderColor: "rgba(255,255,255,0.06)" }}>
          <PathOverlayChart runs={[a, b]} />
        </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 px-2">
        <span>Metric</span>
        <span className="text-center text-cyan-500">{a.name}</span>
        <span className="text-center text-violet-400">{b.name}</span>
      </div>

      {keys.map(({ key, label, suffix, better }) => {
        const av = a.metrics[key] ?? 0;
        const bv = b.metrics[key] ?? 0;
        const aWins = better === "higher" ? av > bv : av < bv;
        const bWins = better === "higher" ? bv > av : bv < av;
        const fmt2 = (v: number) => suffix === "$" ? fmt(Math.abs(v)) : `${v.toFixed(2)}${suffix}`;
        return (
          <div key={key} className="grid grid-cols-3 py-2 px-2 text-xs border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <span className="text-slate-400">{label}</span>
            <span className={`text-center font-mono font-semibold ${aWins ? "text-emerald-400" : "text-slate-300"}`}>
              {aWins && "▲ "}{fmt2(av)}
            </span>
            <span className={`text-center font-mono font-semibold ${bWins ? "text-emerald-400" : "text-slate-300"}`}>
              {bWins && "▲ "}{fmt2(bv)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  currentAssets: Asset[];
  currentModel: string;
  onLoad: (p: SavedPortfolio) => void;
}

export default function PortfolioManager({ currentAssets, currentModel, onLoad }: Props) {
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>([]);
  const [history, setHistory]       = useState<RunRecord[]>([]);
  const [saveName, setSaveName]     = useState("");
  const [tab, setTab]               = useState<"saved" | "history">("saved");
  const [compareA, setCompareA]     = useState<RunRecord | null>(null);
  const [compareB, setCompareB]     = useState<RunRecord | null>(null);
  const [expanded, setExpanded]     = useState(false);

  const refresh = useCallback(() => {
    setPortfolios(loadPortfolios());
    setHistory(loadHistory());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSave = () => {
    const name = saveName.trim() || `Portfolio ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    const p: SavedPortfolio = {
      id: crypto.randomUUID(),
      name,
      tickers: currentAssets.map(a => a.ticker),
      weights: currentAssets.map(a => a.weight / 100),
      model: currentModel,
      savedAt: Date.now(),
    };
    const next = [p, ...portfolios].slice(0, 20);
    savePortfolios(next);
    setPortfolios(next);
    setSaveName("");
  };

  const handleDelete = (id: string) => {
    const next = portfolios.filter(p => p.id !== id);
    savePortfolios(next);
    setPortfolios(next);
  };

  const handleCompareSelect = (r: RunRecord) => {
    if (!compareA) { setCompareA(r); return; }
    if (!compareB && r.id !== compareA.id) { setCompareB(r); return; }
    setCompareA(r); setCompareB(null);
  };

  const clearCompare = () => { setCompareA(null); setCompareB(null); };

  return (
    <div className="flex flex-col gap-3">
      {/* Collapse toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center justify-between w-full py-2 px-1 text-left"
      >
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Portfolio Manager</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
             className={`w-3.5 h-3.5 text-slate-600 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 panel-enter">
          {/* Save row */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Portfolio name…"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="flex-1 rounded-xl px-3 py-2 text-xs text-white outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <button
              onClick={handleSave}
              disabled={!currentAssets.length}
              className="px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
              style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.25)", color: "#22d3ee" }}
            >
              Save
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["saved", "history"] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); refresh(); }}
                className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors"
                style={{
                  background: tab === t ? "rgba(255,255,255,0.06)" : "transparent",
                  color: tab === t ? "#e2e8f0" : "#475569",
                }}
              >
                {t === "saved" ? `💾 Saved (${portfolios.length})` : `📋 History (${history.length})`}
              </button>
            ))}
          </div>

          {/* Saved portfolios */}
          {tab === "saved" && (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
              {portfolios.length === 0 && (
                <p className="text-xs text-slate-600 text-center py-4">No saved portfolios yet</p>
              )}
              {portfolios.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl group"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-300 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-600">{p.tickers.join(", ")} · {fmtDate(p.savedAt)}</p>
                  </div>
                  <button
                    onClick={() => onLoad(p)}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                    style={{ background: "rgba(6,182,212,0.1)", color: "#22d3ee" }}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-slate-700 hover:text-red-400 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Run history */}
          {tab === "history" && (
            <div className="flex flex-col gap-1.5">
              {compareA && !compareB && (
                <p className="text-[10px] text-cyan-400 px-1">Select a second run to compare ↓</p>
              )}
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                {history.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-4">No runs yet — run a simulation to see history</p>
                )}
                {history.map(r => {
                  const isA = compareA?.id === r.id;
                  const isB = compareB?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleCompareSelect(r)}
                      className="text-left px-3 py-2 rounded-xl transition-all"
                      style={{
                        background: isA ? "rgba(6,182,212,0.08)" : isB ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isA ? "rgba(6,182,212,0.25)" : isB ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-300 truncate">{r.tickers.join(", ")}</span>
                        <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                          {r.metrics.expected_annual_return?.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-[10px] text-slate-600">{fmtDate(r.ranAt)}</span>
                        <span className="text-[10px] text-slate-600 uppercase">{r.model}</span>
                        {(isA || isB) && (
                          <span className="text-[10px] font-bold" style={{ color: isA ? "#22d3ee" : "#a78bfa" }}>
                            {isA ? "A" : "B"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {compareA && compareB && (
                <button
                  onClick={clearCompare}
                  className="text-[10px] text-slate-500 hover:text-slate-400 text-center mt-1"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compare panel — shown outside the collapse when two runs selected */}
      {compareA && compareB && (
        <ComparePanel a={compareA} b={compareB} onClose={clearCompare} />
      )}
    </div>
  );
}
