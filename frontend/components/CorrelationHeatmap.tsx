"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";

interface Props {
  matrix: Record<string, Record<string, number>>;
}

// ─── Color interpolation: -1=blue, 0=dark, +1=red ────────────────────────────
function corrColor(v: number): string {
  const t = (v + 1) / 2; // 0…1
  if (t < 0.5) {
    // blue → dark
    const s = t * 2;
    const r = Math.round(30 * s);
    const g = Math.round(50 * s);
    const b = Math.round(200 - 80 * s);
    return `rgb(${r},${g},${b})`;
  } else {
    // dark → red
    const s = (t - 0.5) * 2;
    const r = Math.round(200 * s);
    const g = Math.round(20 * (1 - s));
    const b = Math.round(50 * (1 - s));
    return `rgb(${r},${g},${b})`;
  }
}

export default function CorrelationHeatmap({ matrix }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; j: number; val: number; x: number; y: number } | null>(null);

  const tickers = Object.keys(matrix);
  const n = tickers.length;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap || !n) return;

    const dpr  = window.devicePixelRatio || 1;
    const size = Math.min(wrap.clientWidth, wrap.clientHeight);
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const LABEL_W = Math.max(36, size * 0.12);
    const cellSize = (size - LABEL_W) / n;

    ctx.clearRect(0, 0, size, size);

    // Cells
    tickers.forEach((ti, i) => {
      tickers.forEach((tj, j) => {
        const v = matrix[ti]?.[tj] ?? 0;
        ctx.fillStyle = corrColor(v);
        ctx.fillRect(LABEL_W + j * cellSize, LABEL_W + i * cellSize, cellSize - 1, cellSize - 1);

        // Value text
        if (cellSize > 28) {
          ctx.fillStyle = Math.abs(v) > 0.5 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)";
          ctx.font = `${Math.max(8, cellSize * 0.28)}px 'IBM Plex Mono', monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(v.toFixed(2), LABEL_W + j * cellSize + cellSize / 2, LABEL_W + i * cellSize + cellSize / 2);
        }
      });
    });

    // X labels (top)
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `bold ${Math.max(9, cellSize * 0.3)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    tickers.forEach((t, j) => {
      ctx.fillText(t, LABEL_W + j * cellSize + cellSize / 2, LABEL_W / 2);
    });

    // Y labels (left)
    ctx.textAlign = "right";
    tickers.forEach((t, i) => {
      ctx.fillText(t, LABEL_W - 6, LABEL_W + i * cellSize + cellSize / 2);
    });
  }, [matrix, n, tickers]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !n) return;
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    const LABEL_W = Math.max(36, size * 0.12);
    const cellSize = (size - LABEL_W) / n;
    const mx = e.clientX - rect.left - LABEL_W;
    const my = e.clientY - rect.top  - LABEL_W;
    const j = Math.floor(mx / cellSize);
    const i = Math.floor(my / cellSize);
    if (i >= 0 && i < n && j >= 0 && j < n) {
      setHover({ i, j, val: matrix[tickers[i]]?.[tickers[j]] ?? 0, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setHover(null);
    }
  };

  if (!n) return null;

  return (
    <div
      className="rounded-3xl border p-5"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
    >
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Correlation Matrix</p>

      {/* Legend bar */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[10px] text-slate-600">-1.0</span>
        <div
          className="flex-1 h-2 rounded-full"
          style={{ background: "linear-gradient(90deg, rgb(30,50,200), #0c1828, rgb(200,20,50))" }}
        />
        <span className="text-[10px] text-slate-600">+1.0</span>
        <div className="flex gap-3 ml-2">
          {[{ c: "rgb(30,50,200)", l: "Neg" }, { c: "rgb(200,20,50)", l: "Pos" }].map(({ c, l }) => (
            <div key={l} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
              <span className="text-[10px] text-slate-500">{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative w-full" style={{ aspectRatio: "1/1", maxWidth: 400, margin: "0 auto" }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        />
        {hover && (
          <div
            className="absolute pointer-events-none rounded-xl px-3 py-2 text-xs"
            style={{
              left: Math.min(hover.x + 10, 999),
              top: Math.max(hover.y - 50, 0),
              background: "rgba(2,8,23,0.92)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)",
            }}
          >
            <p className="font-bold text-white">{tickers[hover.i]} × {tickers[hover.j]}</p>
            <p className="tabnum" style={{ color: hover.val > 0 ? "#f87171" : "#60a5fa" }}>
              ρ = {hover.val.toFixed(4)}
            </p>
            <p className="text-slate-500">
              {Math.abs(hover.val) > 0.7 ? "Strong" : Math.abs(hover.val) > 0.4 ? "Moderate" : "Weak"}
              {hover.val > 0 ? " positive" : " negative"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
