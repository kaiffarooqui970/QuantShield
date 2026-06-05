"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FrontierPoint {
  volatility_pct: number;
  return_pct: number;
  sharpe_ratio: number;
  weights: Record<string, number>;
  is_min_vol?: boolean;
  is_max_sharpe?: boolean;
}

interface FrontierResult {
  tickers: string[];
  n_portfolios: number;
  frontier: FrontierPoint[];
  min_volatility: { weights: Record<string, number>; return_pct: number; volatility_pct: number; sharpe_ratio: number };
  max_sharpe:     { weights: Record<string, number>; return_pct: number; volatility_pct: number; sharpe_ratio: number };
}

interface Props {
  tickers: string[];
  apiBaseUrl?: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EfficientFrontier({ tickers, apiBaseUrl = "http://localhost:8000" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  const [result, setResult]   = useState<FrontierResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [hover, setHover]     = useState<FrontierPoint | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const draw = useCallback((pts: FrontierPoint[], hov: FrontierPoint | null) => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap || !pts.length) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = wrap.clientWidth  * dpr;
    canvas.height = wrap.clientHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const PAD = { top: 24, right: 24, bottom: 44, left: 56 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top  - PAD.bottom;

    const vols = pts.map(p => p.volatility_pct);
    const rets = pts.map(p => p.return_pct);
    const sharpes = pts.map(p => p.sharpe_ratio);
    const minV = Math.min(...vols) * 0.92, maxV = Math.max(...vols) * 1.08;
    const minR = Math.min(...rets) - 2,    maxR = Math.max(...rets) + 2;
    const minS = Math.min(...sharpes),     maxS = Math.max(...sharpes);

    const sx = (v: number) => PAD.left + ((v - minV) / (maxV - minV)) * cW;
    const sy = (r: number) => PAD.top  + (1 - (r - minR) / (maxR - minR)) * cH;

    // Background clear
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (i / 4) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
      const x = PAD.left + (i / 4) * cW;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + cH); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top + cH); ctx.lineTo(PAD.left + cW, PAD.top + cH); ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = minR + ((4 - i) / 4) * (maxR - minR);
      ctx.fillText(`${v.toFixed(1)}%`, PAD.left - 6, PAD.top + (i / 4) * cH + 4);
    }

    // X-axis labels
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const v = minV + (i / 4) * (maxV - minV);
      ctx.fillText(`${v.toFixed(1)}%`, PAD.left + (i / 4) * cW, PAD.top + cH + 18);
    }

    // Axis titles
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Volatility →", PAD.left + cW / 2, H - 4);
    ctx.save(); ctx.translate(12, PAD.top + cH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("Return →", 0, 0); ctx.restore();

    // Scatter points — colour by Sharpe (red=low, yellow=mid, green=high)
    const normalPts = pts.filter(p => !p.is_min_vol && !p.is_max_sharpe);
    for (const pt of normalPts) {
      const t = (pt.sharpe_ratio - minS) / Math.max(maxS - minS, 0.001);
      const r = Math.round(255 * (1 - t));
      const g = Math.round(200 * t);
      ctx.fillStyle = `rgba(${r},${g},80,0.55)`;
      ctx.beginPath();
      ctx.arc(sx(pt.volatility_pct), sy(pt.return_pct), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Min-vol point (cyan)
    const mvPt = pts.find(p => p.is_min_vol);
    if (mvPt) {
      const x = sx(mvPt.volatility_pct), y = sy(mvPt.return_pct);
      ctx.shadowColor = "#06b6d4"; ctx.shadowBlur = 16;
      ctx.fillStyle = "#06b6d4";
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("MinV", x, y - 12);
    }

    // Max-Sharpe point (gold star)
    const msPt = pts.find(p => p.is_max_sharpe);
    if (msPt) {
      const x = sx(msPt.volatility_pct), y = sy(msPt.return_pct);
      ctx.shadowColor = "#f59e0b"; ctx.shadowBlur = 20;
      ctx.fillStyle = "#f59e0b";
      // Draw star
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? 10 : 4;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("MaxS", x, y - 14);
    }

    // Hover highlight
    if (hov && !hov.is_min_vol && !hov.is_max_sharpe) {
      ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 16;
      ctx.fillStyle = "#a78bfa";
      ctx.beginPath();
      ctx.arc(sx(hov.volatility_pct), sy(hov.return_pct), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, []);

  useEffect(() => {
    if (result) draw(result.frontier, hover);
  }, [result, hover, draw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => { if (result) draw(result.frontier, hover); });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [result, hover, draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!result) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const PAD = { top: 24, right: 24, bottom: 44, left: 56 };
    const cW = rect.width  - PAD.left - PAD.right;
    const cH = rect.height - PAD.top  - PAD.bottom;

    const vols = result.frontier.map(p => p.volatility_pct);
    const rets = result.frontier.map(p => p.return_pct);
    const minV = Math.min(...vols) * 0.92, maxV = Math.max(...vols) * 1.08;
    const minR = Math.min(...rets) - 2,    maxR = Math.max(...rets) + 2;
    const sx = (v: number) => PAD.left + ((v - minV) / (maxV - minV)) * cW;
    const sy = (r: number) => PAD.top  + (1 - (r - minR) / (maxR - minR)) * cH;

    let closest: FrontierPoint | null = null;
    let minDist = 20;
    for (const pt of result.frontier) {
      const d = Math.hypot(sx(pt.volatility_pct) - mx, sy(pt.return_pct) - my);
      if (d < minDist) { minDist = d; closest = pt; }
    }
    setHover(closest);
    setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleRun = async () => {
    if (tickers.length < 2) { setError("Need at least 2 tickers to generate a frontier."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const resp = await fetch(`${apiBaseUrl}/api/frontier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, n_portfolios: 500 }),
      });
      if (!resp.ok) throw new Error((await resp.json()).detail || "Frontier failed");
      const data: FrontierResult = await resp.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        className="rounded-3xl border p-6 flex flex-col gap-4"
        style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Efficient Frontier</h2>
            <p className="text-slate-500 text-sm">500 random portfolios + optimal min-volatility and max-Sharpe allocations.</p>
          </div>
          <button
            onClick={handleRun}
            disabled={loading || tickers.length < 2}
            className="px-5 py-2.5 rounded-2xl font-bold text-sm transition-all duration-300 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)", color: "#fff", boxShadow: "0 0 20px rgba(6,182,212,0.3)" }}
          >
            {loading ? "Computing…" : "Generate Frontier"}
          </button>
        </div>

        {error && (
          <div className="rounded-xl p-3 text-red-400 text-sm border border-red-900/40"
               style={{ background: "rgba(239,68,68,0.06)" }}>{error}</div>
        )}

        {/* Canvas */}
        <div ref={wrapRef} className="relative rounded-2xl overflow-hidden" style={{ height: 360, background: "rgba(0,0,0,0.2)" }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHover(null)}
          />
          {!result && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <p className="text-slate-600 text-sm">Click "Generate Frontier" to map the risk/return space</p>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <svg className="w-10 h-10 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx={12} cy={12} r={10} stroke="rgba(6,182,212,0.2)" strokeWidth={3} />
                <path d="M12 2 a10 10 0 0 1 10 10" stroke="#06b6d4" strokeWidth={3} strokeLinecap="round" />
              </svg>
              <p className="text-slate-500 text-sm">Sampling 500 portfolios…</p>
            </div>
          )}
          {/* Legend */}
          {result && (
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 text-xs">
              {[
                { color: "#06b6d4", label: "Min Volatility" },
                { color: "#f59e0b", label: "Max Sharpe" },
                { color: "rgba(100,200,100,0.7)", label: "High Sharpe" },
                { color: "rgba(255,80,80,0.7)",  label: "Low Sharpe" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: l.color }} />
                  <span className="text-slate-500">{l.label}</span>
                </div>
              ))}
            </div>
          )}
          {/* Hover tooltip */}
          {hover && (
            <div
              className="absolute pointer-events-none rounded-xl p-3"
              style={{
                left: Math.min(hoverPos.x + 12, 9999),
                top: Math.max(hoverPos.y - 80, 0),
                background: "rgba(2,8,23,0.92)",
                border: "1px solid rgba(139,92,246,0.3)",
                backdropFilter: "blur(12px)",
                minWidth: 160,
              }}
            >
              <p className="text-xs text-slate-500 mb-2 font-semibold tracking-widest uppercase">Portfolio</p>
              {[
                { label: "Return",     val: `${hover.return_pct.toFixed(2)}%`,     color: "#10b981" },
                { label: "Volatility", val: `${hover.volatility_pct.toFixed(2)}%`, color: "#f59e0b" },
                { label: "Sharpe",     val: hover.sharpe_ratio.toFixed(3),         color: "#06b6d4" },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex justify-between gap-4 mb-1">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-xs font-bold font-mono" style={{ color }}>{val}</span>
                </div>
              ))}
              {Object.entries(hover.weights).map(([t, w]) => (
                <div key={t} className="flex justify-between gap-4">
                  <span className="text-xs text-slate-600">{t}</span>
                  <span className="text-xs font-mono text-slate-400">{(w * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Optimal portfolio cards */}
      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { title: "Min Volatility Portfolio", data: result.min_volatility, accent: "#06b6d4", icon: "🛡️" },
            { title: "Max Sharpe Portfolio",     data: result.max_sharpe,     accent: "#f59e0b", icon: "⭐" },
          ].map(({ title, data, accent, icon }) => (
            <div
              key={title}
              className="rounded-2xl border p-5"
              style={{ background: `${accent}08`, borderColor: `${accent}30` }}
            >
              <p className="text-sm font-bold mb-3" style={{ color: accent }}>
                {icon} {title}
              </p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Return",     val: `${data.return_pct.toFixed(1)}%`,     color: "#10b981" },
                  { label: "Volatility", val: `${data.volatility_pct.toFixed(1)}%`, color: "#f59e0b" },
                  { label: "Sharpe",     val: data.sharpe_ratio.toFixed(3),          color: "#06b6d4" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center">
                    <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-0.5">{label}</p>
                    <p className="text-sm font-bold font-mono" style={{ color }}>{val}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(data.weights)
                  .sort(([, a], [, b]) => b - a)
                  .map(([t, w]) => (
                    <div key={t} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-12 shrink-0">{t}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${w * 100}%`, background: accent }} />
                      </div>
                      <span className="text-xs font-mono text-slate-400 w-10 text-right">{(w * 100).toFixed(1)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
