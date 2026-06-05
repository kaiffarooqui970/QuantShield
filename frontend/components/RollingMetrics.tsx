"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";

interface Props {
  medianPath: number[];
  days: number;
  window?: number; // rolling window in path-steps (default 21)
}

interface Point { x: number; y: number }

const RF_DAILY = Math.log(1.0525) / 252;

function compute(path: number[], win: number): { vol: Point[]; sharpe: Point[] } {
  if (path.length < win + 2) return { vol: [], sharpe: [] };
  const rets = path.slice(1).map((v, i) => Math.log(v / path[i]));
  const vol: Point[] = [], sharpe: Point[] = [];
  for (let i = win; i < rets.length; i++) {
    const w = rets.slice(i - win, i);
    const mean = w.reduce((a, b) => a + b, 0) / win;
    const variance = w.reduce((a, b) => a + (b - mean) ** 2, 0) / win;
    const sd = Math.sqrt(variance);
    vol.push({ x: i, y: sd * Math.sqrt(252) * 100 });
    sharpe.push({ x: i, y: sd > 0 ? ((mean - RF_DAILY) / sd) * Math.sqrt(252) : 0 });
  }
  return { vol, sharpe };
}

// ─── Single mini-chart ────────────────────────────────────────────────────────
function MiniChart({
  points, color, yLabel, hoverFmt, zeroLine = false, height = 110,
}: {
  points: Point[];
  color: string;
  yLabel: string;
  hoverFmt: (v: number) => string;
  zeroLine?: boolean;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; val: number } | null>(null);

  const draw = useCallback((hov: Point | null = null) => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap || !points.length) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = wrap.clientWidth  * dpr;
    canvas.height = wrap.clientHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const PAD = { top: 8, right: 12, bottom: 24, left: 44 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;

    const ys = points.map(p => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const range = Math.max(maxY - minY, 0.01);
    const padY = range * 0.12;
    const lo = minY - padY, hi = maxY + padY;
    const n = points.length;

    const sx = (i: number) => PAD.left + (i / (n - 1)) * cW;
    const sy = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * cH;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
    for (let r = 0; r <= 3; r++) {
      const y = PAD.top + (r / 3) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    }

    // Zero line
    if (zeroLine && lo < 0 && hi > 0) {
      const z = sy(0);
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(PAD.left, z); ctx.lineTo(PAD.left + cW, z); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }

    // Area fill
    ctx.save();
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = sx(i), y = sy(p.y);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(sx(n - 1), PAD.top + cH);
    ctx.lineTo(PAD.left, PAD.top + cH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
    grad.addColorStop(0, `${color}28`);
    grad.addColorStop(1, `${color}04`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Line
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.strokeStyle = color; ctx.lineWidth = 1.8;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = sx(i), y = sy(p.y);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // Y labels
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "9px 'IBM Plex Mono',monospace";
    ctx.textAlign = "right";
    for (let r = 0; r <= 3; r++) {
      const v = lo + ((3 - r) / 3) * (hi - lo);
      ctx.fillText(v.toFixed(1), PAD.left - 5, PAD.top + (r / 3) * cH + 3);
    }

    // Hover crosshair
    if (hov) {
      const hx = sx(hov.x);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, PAD.top + cH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(hx, sy(hov.y), 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }, [points, color, zeroLine]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || !points.length) return;
    const PAD_L = 44, PAD_R = 12;
    const cW = r.width - PAD_L - PAD_R;
    const idx = Math.round(((e.clientX - r.left - PAD_L) / cW) * (points.length - 1));
    if (idx >= 0 && idx < points.length) {
      const pt = points[idx];
      setHover({ x: idx, y: pt.y, val: pt.y });
      draw(pt);
    }
  };
  const handleLeave = () => { setHover(null); draw(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-1 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{yLabel}</p>
        {hover && (
          <p className="text-[10px] font-mono font-bold tabnum" style={{ color }}>
            {hoverFmt(hover.val)}
          </p>
        )}
      </div>
      <div ref={wrapRef} style={{ height }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RollingMetrics({ medianPath, days, window: win = 21 }: Props) {
  const { vol, sharpe } = compute(medianPath, win);
  if (!vol.length) return null;

  return (
    <div
      className="rounded-3xl border p-5 flex flex-col gap-4"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Rolling Metrics · {win}-step window
        </p>
        <p className="text-[10px] text-slate-600">Computed from median simulation path</p>
      </div>

      <MiniChart
        points={vol}
        color="#f59e0b"
        yLabel="Annualised Volatility (%)"
        hoverFmt={v => `${v.toFixed(1)}%`}
        height={100}
      />
      <MiniChart
        points={sharpe}
        color="#06b6d4"
        yLabel="Rolling Sharpe Ratio"
        hoverFmt={v => v.toFixed(3)}
        zeroLine
        height={100}
      />
    </div>
  );
}
