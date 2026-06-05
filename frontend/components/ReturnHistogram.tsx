"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";

interface Props {
  paths: { p5: number[]; median: number[]; p95: number[] };
  initialValue: number;
  varValue: number;   // negative number ($ loss at 95%)
  cvarValue: number;  // negative number
}

// ─── Approximate final-value distribution from percentile paths ───────────────
// Uses a log-normal parameterisation fitted to p5/median/p95 endpoints.
function buildHistogram(
  p5End: number,
  medEnd: number,
  p95End: number,
  initVal: number,
  bins = 40,
): { center: number; count: number; pct: number; isTail: boolean }[] {
  // Fit log-normal: mu = log(median), sigma from 90% interval
  const mu    = Math.log(medEnd);
  const sigma = (Math.log(p95End) - Math.log(p5End)) / (2 * 1.645);
  const clampSigma = Math.max(sigma, 0.01);

  // Generate N samples using Box-Muller
  const N = 2000;
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const u1 = Math.random(), u2 = Math.random();
    const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
    samples.push(Math.exp(mu + clampSigma * z));
  }

  const lo = Math.min(...samples), hi = Math.max(...samples);
  const w  = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  samples.forEach(v => {
    const i = Math.min(Math.floor((v - lo) / w), bins - 1);
    counts[i]++;
  });

  const varLine = initVal + (p5End - initVal) * 0.15; // rough VaR visual position

  return counts.map((c, i) => ({
    center:  lo + (i + 0.5) * w,
    count:   c,
    pct:     c / N,
    isTail:  lo + (i + 1) * w < varLine,
  }));
}

export default function ReturnHistogram({ paths, initialValue, varValue, cvarValue }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [hoverBin, setHoverBin] = useState<{ center: number; count: number; x: number } | null>(null);

  const p5End  = paths.p5[paths.p5.length - 1];
  const medEnd = paths.median[paths.median.length - 1];
  const p95End = paths.p95[paths.p95.length - 1];

  const bins = buildHistogram(p5End, medEnd, p95End, initialValue);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = wrap.clientWidth  * dpr;
    canvas.height = wrap.clientHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const W = wrap.clientWidth, H = wrap.clientHeight;
    const PAD = { top: 16, right: 16, bottom: 32, left: 8 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top  - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    if (!bins.length) return;

    const maxCount = Math.max(...bins.map(b => b.count));
    const minX = bins[0].center, maxX = bins[bins.length - 1].center;
    const barW = cW / bins.length;

    const sx = (v: number) => PAD.left + ((v - minX) / (maxX - minX)) * cW;
    const barH = (c: number) => (c / maxCount) * cH;

    // Bars
    bins.forEach((b, i) => {
      const x = PAD.left + i * barW;
      const h = barH(b.count);
      const y = PAD.top + cH - h;

      ctx.fillStyle = b.isTail
        ? "rgba(239,68,68,0.55)"
        : "rgba(6,182,212,0.45)";
      ctx.fillRect(x + 1, y, barW - 2, h);
    });

    // Initial value line
    const initX = sx(initialValue);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(initX, PAD.top); ctx.lineTo(initX, PAD.top + cH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "9px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Initial", initX, PAD.top + 10);
    ctx.restore();

    // VaR line
    const varX = sx(initialValue + varValue); // varValue is negative
    if (varX > PAD.left && varX < PAD.left + cW) {
      ctx.save();
      ctx.strokeStyle = "rgba(239,68,68,0.7)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(varX, PAD.top); ctx.lineTo(varX, PAD.top + cH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(239,68,68,0.7)";
      ctx.font = "9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("VaR 95%", varX, PAD.top + 10);
      ctx.restore();
    }

    // X-axis: show 5 labels
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const v = minX + f * (maxX - minX);
      const x = PAD.left + f * cW;
      const k = v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v.toFixed(0)}`;
      ctx.fillText(k, x, PAD.top + cH + 18);
    });
  }, [bins, initialValue, varValue]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !bins.length) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const PAD = 8;
    const cW = rect.width - PAD - 16;
    const barW = cW / bins.length;
    const i = Math.floor((mx - PAD) / barW);
    if (i >= 0 && i < bins.length) {
      setHoverBin({ center: bins[i].center, count: bins[i].count, x: mx });
    } else {
      setHoverBin(null);
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  return (
    <div
      className="rounded-3xl border p-5"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Return Distribution</p>
        <div className="flex gap-4 text-[10px]">
          {[
            { color: "#ef4444", label: "Tail loss (VaR region)" },
            { color: "#06b6d4", label: "Gain region" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
              <span className="text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative" style={{ height: 160 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverBin(null)}
        />
        {hoverBin && (
          <div
            className="absolute pointer-events-none rounded-lg px-2.5 py-1.5 text-xs"
            style={{
              left: Math.min(hoverBin.x + 8, 9999),
              top: 8,
              background: "rgba(2,8,23,0.92)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <p className="font-bold text-white">{fmt(hoverBin.center)}</p>
            <p className="text-slate-500">{hoverBin.count} paths</p>
          </div>
        )}
      </div>

      <div className="flex gap-6 mt-3 justify-center text-xs">
        {[
          { label: "VaR 95%", val: varValue,  color: "#ef4444" },
          { label: "CVaR 95%", val: cvarValue, color: "#f97316" },
          { label: "Median", val: medEnd - initialValue, color: "#10b981" },
        ].map(({ label, val, color }) => (
          <div key={label} className="text-center">
            <p className="text-slate-600 text-[10px] mb-0.5">{label}</p>
            <p className="font-mono font-bold tabnum" style={{ color }}>{fmt(val)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
