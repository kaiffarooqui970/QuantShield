"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";

interface Paths {
  p5: number[];
  median: number[];
  p95: number[];
}

interface Props {
  paths: Paths;
  initialValue: number;
  days: number;
  nSims: number;
  tickers: string[];
}

export default function MonteCarloChart({ paths, initialValue, days, nSims, tickers }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const animRef     = useRef<number>(0);
  const progressRef = useRef(0);
  const pathsRef    = useRef(paths);
  const [hoverDay, setHoverDay]   = useState<number | null>(null);
  const [hoverPos, setHoverPos]   = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverVals, setHoverVals] = useState<{ p5: number; med: number; p95: number } | null>(null);

  pathsRef.current = paths;

  // ─── Core render ──────────────────────────────────────────────────────────
  const render = useCallback((progress: number, hover: number | null = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W  = canvas.width;
    const H  = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    const wPx = W / dpr;
    const hPx = H / dpr;

    const PAD = { top: 32, right: 90, bottom: 44, left: 72 };
    const chartW = wPx - PAD.left - PAD.right;
    const chartH = hPx - PAD.top  - PAD.bottom;

    const { p5, median, p95 } = pathsRef.current;
    const n = p5.length;
    const vis = Math.max(2, Math.floor(n * progress));

    const allVals = [...p5, ...p95];
    const minV = Math.min(...allVals) * 0.96;
    const maxV = Math.max(...allVals) * 1.04;

    const sx = (i: number) => PAD.left + (i / (n - 1)) * chartW;
    const sy = (v: number) => PAD.top + chartH - ((v - minV) / (maxV - minV)) * chartH;

    // ── Clear ──────────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, wPx, hPx);

    // ── Subtle grid ────────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 5; i++) {
      const y = PAD.top + (i / 5) * chartH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const x = PAD.left + (i / 6) * chartW;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + chartH); ctx.stroke();
    }
    ctx.restore();

    // ── X-axis baseline ────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top + chartH); ctx.lineTo(PAD.left + chartW, PAD.top + chartH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + chartH); ctx.stroke();
    ctx.restore();

    // ── Initial value dashed line ──────────────────────────────────────────
    const baseY = sy(initialValue);
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, baseY); ctx.lineTo(PAD.left + chartW, baseY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── P5–P95 band fill ──────────────────────────────────────────────────
    if (vis > 1) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < vis; i++) {
        const x = sx(i), y = sy(p95[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      for (let i = vis - 1; i >= 0; i--) {
        ctx.lineTo(sx(i), sy(p5[i]));
      }
      ctx.closePath();
      const bandGrad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
      bandGrad.addColorStop(0,   "rgba(52,211,153,0.12)");
      bandGrad.addColorStop(0.5, "rgba(6,182,212,0.06)");
      bandGrad.addColorStop(1,   "rgba(248,113,113,0.12)");
      ctx.fillStyle = bandGrad;
      ctx.fill();
      ctx.restore();
    }

    // ── Line helper ────────────────────────────────────────────────────────
    const drawLine = (data: number[], color: string, width: number, glow: string, glowBlur: number) => {
      if (vis < 2) return;
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur  = glowBlur;
      ctx.strokeStyle = color;
      ctx.lineWidth   = width;
      ctx.lineJoin    = "round";
      ctx.lineCap     = "round";
      ctx.beginPath();
      for (let i = 0; i < vis; i++) {
        const x = sx(i), y = sy(data[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    drawLine(p5,     "#f87171", 1.5, "#ef4444", 6);
    drawLine(p95,    "#34d399", 1.5, "#10b981", 6);
    drawLine(median, "#22d3ee", 2.5, "#06b6d4", 18);

    // ── Animated scan line ────────────────────────────────────────────────
    if (progress < 1 && vis > 1) {
      const scanX = sx(vis - 1);
      const scanGrad = ctx.createLinearGradient(scanX - 30, 0, scanX + 4, 0);
      scanGrad.addColorStop(0, "transparent");
      scanGrad.addColorStop(1, "rgba(6,182,212,0.25)");
      ctx.save();
      ctx.fillStyle = scanGrad;
      ctx.fillRect(scanX - 30, PAD.top, 34, chartH);
      ctx.strokeStyle = "rgba(6,182,212,0.7)";
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = "#06b6d4";
      ctx.shadowBlur  = 10;
      ctx.beginPath(); ctx.moveTo(scanX, PAD.top - 4); ctx.lineTo(scanX, PAD.top + chartH + 4); ctx.stroke();
      ctx.restore();
    }

    // ── End-point dots ─────────────────────────────────────────────────────
    if (vis === n) {
      [[p5, "#f87171", "#ef4444"], [median, "#22d3ee", "#06b6d4"], [p95, "#34d399", "#10b981"]].forEach(
        ([data, fill, glow]) => {
          const arr = data as number[];
          const x = sx(n - 1), y = sy(arr[n - 1]);
          ctx.save();
          ctx.shadowColor = glow as string;
          ctx.shadowBlur  = 16;
          ctx.fillStyle   = fill as string;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      );

      // Right-side labels
      ctx.font      = "bold 11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "left";
      const labelX = PAD.left + chartW + 8;
      const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
      [
        [p95,    "#34d399", "P95"],
        [median, "#22d3ee", "Med"],
        [p5,     "#f87171", "P5 "],
      ].forEach(([data, color, label]) => {
        const arr = data as number[];
        ctx.fillStyle = color as string;
        ctx.fillText(`${label} ${fmt(arr[n - 1])}`, labelX, sy(arr[n - 1]) + 4);
      });
    }

    // ── Y-axis labels ──────────────────────────────────────────────────────
    ctx.font      = "11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const v = minV + ((5 - i) / 5) * (maxV - minV);
      const y = PAD.top + (i / 5) * chartH;
      const label = v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;
      ctx.fillText(label, PAD.left - 8, y + 4);
    }

    // ── X-axis labels ──────────────────────────────────────────────────────
    ctx.textAlign  = "center";
    ctx.fillStyle  = "rgba(255,255,255,0.3)";
    const xTicks   = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
    xTicks.forEach((i) => {
      const tradingDays = Math.round((i / (n - 1)) * days);
      ctx.fillText(`D${tradingDays}`, sx(i), PAD.top + chartH + 20);
    });

    // ── Hover crosshair & tooltip ──────────────────────────────────────────
    if (hover !== null && hover >= 0 && hover < n) {
      const hx = sx(hover);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, PAD.top + chartH); ctx.stroke();
      ctx.setLineDash([]);
      // dots on each line
      [[p5, "#f87171"], [median, "#22d3ee"], [p95, "#34d399"]].forEach(([data, col]) => {
        const arr = data as number[];
        const y = sy(arr[hover]);
        ctx.fillStyle   = col as string;
        ctx.shadowColor = col as string;
        ctx.shadowBlur  = 10;
        ctx.beginPath(); ctx.arc(hx, y, 4, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }
  }, [initialValue, days]);

  // ─── Animate on new data ──────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    progressRef.current = 0;

    const animate = () => {
      progressRef.current = Math.min(progressRef.current + 0.018, 1);
      render(progressRef.current, null);
      if (progressRef.current < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [paths, render]);

  // ─── HiDPI resize ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w   = wrap.clientWidth;
      const h   = wrap.clientHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.getContext("2d")?.scale(dpr, dpr);
      render(progressRef.current, hoverDay);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    return () => ro.disconnect();
  }, [paths, render, hoverDay]);

  // ─── Mouse hover ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || progressRef.current < 1) return;
      const rect  = canvas.getBoundingClientRect();
      const wPx   = rect.width;
      const PAD   = { left: 72, right: 90 };
      const chartW = wPx - PAD.left - PAD.right;
      const mx    = e.clientX - rect.left - PAD.left;
      const n     = pathsRef.current.p5.length;
      const idx   = Math.round((mx / chartW) * (n - 1));
      if (idx < 0 || idx >= n) { setHoverDay(null); setHoverVals(null); return; }

      setHoverDay(idx);
      setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setHoverVals({
        p5:  pathsRef.current.p5[idx],
        med: pathsRef.current.median[idx],
        p95: pathsRef.current.p95[idx],
      });
      render(1, idx);
    },
    [render]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverDay(null);
    setHoverVals(null);
    render(1, null);
  }, [render]);

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const tradingDay = hoverDay !== null ? Math.round((hoverDay / (paths.p5.length - 1)) * days) : null;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 24,
        padding: "20px 16px 16px",
        position: "relative",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingLeft: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.02em" }}>
            Monte Carlo Simulation
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#475569", marginTop: 2 }}>
            {nSims.toLocaleString()} paths · {tickers.join(" / ")} · {days} trading days
          </p>
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "Bear P5",  color: "#f87171" },
            { label: "Median",   color: "#22d3ee" },
            { label: "Bull P95", color: "#34d399" },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 20, height: 2, background: color, borderRadius: 2, boxShadow: `0 0 6px ${color}` }} />
              <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} style={{ width: "100%", height: 280, position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />

        {/* Hover tooltip */}
        {hoverVals && hoverDay !== null && (
          <div
            style={{
              position: "absolute",
              left: Math.min(hoverPos.x + 14, 999),
              top: Math.max(hoverPos.y - 60, 0),
              background: "rgba(2,8,23,0.92)",
              border: "1px solid rgba(6,182,212,0.3)",
              borderRadius: 10,
              padding: "8px 12px",
              pointerEvents: "none",
              backdropFilter: "blur(12px)",
              minWidth: 140,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(6,182,212,0.1)",
            }}
          >
            <p style={{ margin: "0 0 6px", fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.08em" }}>
              DAY {tradingDay}
            </p>
            {[
              { label: "Bull P95", value: hoverVals.p95, color: "#34d399" },
              { label: "Median",   value: hoverVals.med, color: "#22d3ee" },
              { label: "Bear P5",  value: hoverVals.p5,  color: "#f87171" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
