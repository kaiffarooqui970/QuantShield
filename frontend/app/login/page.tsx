"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const getRedirectUrl = () => `${window.location.origin}/auth/callback`;

// ══════════════════════════════════════════════════════════════════
// PREMIUM ICON SYSTEM
// Gradient-backed icon tiles with pulse glow — each feature has
// its own color identity, consistent stroke-based SVG inside.
// ══════════════════════════════════════════════════════════════════

type IconTileProps = { bg: string; border: string; glow: string; size?: number; children: React.ReactNode; animate?: string };
function IconTile({ bg, border, glow, size = 44, children, animate }: IconTileProps) {
  return (
    <div className={animate ?? "ico-float"} style={{
      width: size, height: size, borderRadius: Math.round(size * 0.26), flexShrink: 0,
      background: bg, border: `1px solid ${border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 20px ${glow}, 0 4px 12px rgba(0,0,0,0.3)`,
    }}>
      {children}
    </div>
  );
}

function IcoMonteCarlo({ sz = 22 }: { sz?: number }) {
  return (
    <IconTile bg="linear-gradient(135deg,rgba(94,106,210,0.25),rgba(124,58,237,0.25))" border="rgba(94,106,210,0.4)" glow="rgba(94,106,210,0.2)" size={sz === 22 ? 44 : 56} animate="ico-pulse-indigo">
      <svg viewBox="0 0 36 36" fill="none" style={{ width: sz, height: sz }}>
        <path d="M3,18 C10,16 20,8 33,4"  stroke="#818CF8" strokeWidth="1.6" strokeLinecap="round" className="mc-p mc-p1"/>
        <path d="M3,18 C10,17 20,12 33,11" stroke="#A78BFA" strokeWidth="1.6" strokeLinecap="round" className="mc-p mc-p2"/>
        <path d="M3,18 C10,18 20,17 33,19" stroke="#F0F0FF" strokeWidth="2.2" strokeLinecap="round" className="mc-p mc-p3"/>
        <path d="M3,18 C10,19 20,23 33,27" stroke="#A78BFA" strokeWidth="1.6" strokeLinecap="round" className="mc-p mc-p4"/>
        <path d="M3,18 C10,20 20,28 33,33" stroke="#F87171" strokeWidth="1.6" strokeLinecap="round" className="mc-p mc-p5"/>
        <circle cx="3" cy="18" r="2.8" fill="#5E6AD2"/>
        <circle cx="3" cy="18" r="5" fill="rgba(94,106,210,0)" className="mc-ring"/>
      </svg>
    </IconTile>
  );
}

function IcoVaR({ sz = 22 }: { sz?: number }) {
  return (
    <IconTile bg="linear-gradient(135deg,rgba(248,113,113,0.2),rgba(251,146,60,0.2))" border="rgba(248,113,113,0.35)" glow="rgba(248,113,113,0.15)" size={sz === 22 ? 44 : 56} animate="ico-pulse-red">
      <svg viewBox="0 0 36 36" fill="none" style={{ width: sz, height: sz }}>
        <path d="M2,28 C5,28 8,22 10,16 C12,10 14,8 18,8 C22,8 24,10 26,16 C28,22 31,28 34,28" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M2,28 C4,28 6,24 8,18 L2,28Z" fill="rgba(248,113,113,0.4)" className="var-tail"/>
        <line x1="8" y1="18" x2="8" y2="29" stroke="#F87171" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="8" cy="17" r="2.2" fill="#F87171"/>
        <text x="10.5" y="14.5" fill="#FBBF24" fontSize="6.5" fontWeight="800" fontFamily="system-ui">95%</text>
      </svg>
    </IconTile>
  );
}

function IcoStress({ sz = 22 }: { sz?: number }) {
  return (
    <IconTile bg="linear-gradient(135deg,rgba(251,146,60,0.2),rgba(251,191,36,0.2))" border="rgba(251,146,60,0.35)" glow="rgba(251,146,60,0.15)" size={sz === 22 ? 44 : 56} animate="ico-pulse-orange">
      <svg viewBox="0 0 36 36" fill="none" style={{ width: sz, height: sz }}>
        <path d="M5,26 A13,13 0 1,1 31,26" stroke="rgba(255,255,255,0.15)" strokeWidth="3.5" strokeLinecap="round"/>
        <path d="M5,26 A13,13 0 0,1 18,13" stroke="url(#sGrad)" strokeWidth="3.5" strokeLinecap="round" className="stress-arc"/>
        <line x1="18" y1="26" x2="10" y2="15" stroke="#F87171" strokeWidth="2" strokeLinecap="round" className="stress-needle"/>
        <circle cx="18" cy="26" r="2.5" fill="#F87171"/>
        <circle cx="18" cy="26" r="4.5" fill="rgba(248,113,113,0.2)" className="stress-ring"/>
        <defs>
          <linearGradient id="sGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FBBF24"/>
            <stop offset="100%" stopColor="#F87171"/>
          </linearGradient>
        </defs>
      </svg>
    </IconTile>
  );
}

function IcoAI({ sz = 22 }: { sz?: number }) {
  return (
    <IconTile bg="linear-gradient(135deg,rgba(124,58,237,0.25),rgba(192,38,211,0.25))" border="rgba(139,92,246,0.4)" glow="rgba(139,92,246,0.2)" size={sz === 22 ? 44 : 56} animate="ico-pulse-violet">
      <svg viewBox="0 0 36 36" fill="none" style={{ width: sz, height: sz }}>
        {/* Neural net connections */}
        {([[7,10],[7,18],[7,26]] as [number,number][]).map(([x,y]) =>
          ([[18,8],[18,16],[18,24],[18,32]] as [number,number][]).map(([x2,y2]) => (
            <line key={`${x}-${y}-${x2}-${y2}`} x1={x} y1={y} x2={x2} y2={y2} stroke="rgba(139,92,246,0.2)" strokeWidth="0.8"/>
          ))
        )}
        {([[18,8],[18,16],[18,24],[18,32]] as [number,number][]).map(([x,y]) =>
          ([[29,14],[29,26]] as [number,number][]).map(([x2,y2]) => (
            <line key={`h-${x}-${y}-${x2}-${y2}`} x1={x} y1={y} x2={x2} y2={y2} stroke="rgba(192,38,211,0.2)" strokeWidth="0.8"/>
          ))
        )}
        {/* Input nodes */}
        {([[7,10],[7,18],[7,26]] as [number,number][]).map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="2.8" fill="#5E6AD2" className={`ai-n ai-n${i}`}/>
        ))}
        {/* Hidden nodes */}
        {([[18,8],[18,16],[18,24],[18,32]] as [number,number][]).map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="2.8" fill="#7C3AED" className={`ai-h ai-h${i}`}/>
        ))}
        {/* Output nodes */}
        {([[29,14],[29,26]] as [number,number][]).map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="2.8" fill="#C026D3" className={`ai-o ai-o${i}`}/>
        ))}
        {/* Active signal */}
        <line x1="7" y1="18" x2="18" y2="16" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" className="ai-sig ai-sig1"/>
        <line x1="18" y1="16" x2="29" y2="14" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" className="ai-sig ai-sig2"/>
      </svg>
    </IconTile>
  );
}

function IcoCorrelation({ sz = 22 }: { sz?: number }) {
  const cells = [
    ["#5E6AD2","#818CF8","#4CB782"],
    ["#818CF8","#5E6AD2","#818CF8"],
    ["#4CB782","#818CF8","#5E6AD2"],
  ];
  return (
    <IconTile bg="linear-gradient(135deg,rgba(6,182,212,0.2),rgba(59,130,246,0.2))" border="rgba(6,182,212,0.35)" glow="rgba(6,182,212,0.15)" size={sz === 22 ? 44 : 56} animate="ico-pulse-cyan">
      <svg viewBox="0 0 36 36" fill="none" style={{ width: sz, height: sz }}>
        {cells.map((row, r) => row.map((color, c) => (
          <rect key={`${r}-${c}`} x={3 + c * 10} y={3 + r * 10} width={9} height={9} rx={2}
            fill={color} opacity={r === c ? 0.9 : 0.45}
            className={`hm-cell hm-c${(r + c) % 3}`}/>
        )))}
        {/* Diagonal highlight ring */}
        {[0,1,2].map(i => (
          <rect key={i} x={3 + i * 10} y={3 + i * 10} width={9} height={9} rx={2}
            stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" fill="none"/>
        ))}
      </svg>
    </IconTile>
  );
}

function IcoFrontier({ sz = 22 }: { sz?: number }) {
  return (
    <IconTile bg="linear-gradient(135deg,rgba(76,183,130,0.2),rgba(20,184,166,0.2))" border="rgba(76,183,130,0.35)" glow="rgba(76,183,130,0.15)" size={sz === 22 ? 44 : 56} animate="ico-pulse-green">
      <svg viewBox="0 0 36 36" fill="none" style={{ width: sz, height: sz }}>
        <line x1="4" y1="32" x2="4" y2="4"  stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="4" y1="32" x2="32" y2="32" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/>
        {[[8,30],[12,24],[17,18],[22,13],[26,11],[30,10]] .map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="1.5" fill="rgba(255,255,255,0.25)"/>
        ))}
        <path className="ef-curve" d="M7,31 C10,26 14,18 22,12 C27,8 30,7 32,7" stroke="url(#efGrad)" strokeWidth="2" strokeLinecap="round" fill="none"/>
        <circle cx="22" cy="12" r="3.5" fill="#4CB782" className="ef-dot"/>
        <circle cx="22" cy="12" r="2" fill="white"/>
        <defs>
          <linearGradient id="efGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4CB782"/><stop offset="100%" stopColor="#5E6AD2"/>
          </linearGradient>
        </defs>
      </svg>
    </IconTile>
  );
}

function IcoBacktest({ sz = 22 }: { sz?: number }) {
  return (
    <IconTile bg="linear-gradient(135deg,rgba(59,130,246,0.2),rgba(94,106,210,0.2))" border="rgba(59,130,246,0.35)" glow="rgba(59,130,246,0.15)" size={sz === 22 ? 44 : 56} animate="ico-pulse-blue">
      <svg viewBox="0 0 36 36" fill="none" style={{ width: sz, height: sz }}>
        {[[5,28],[11,22],[17,26],[23,17],[29,19]].map(([x,y], i) => (
          <rect key={i} x={x} y={y} width={5} height={33 - y} rx={1.5}
            fill={i === 3 ? "#3B82F6" : "rgba(255,255,255,0.18)"}/>
        ))}
        <path d="M7,28 L13,22 L19,26 L25,17 L31,19" stroke="#4CB782" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" className="bt-line"/>
        <path d="M29,6 L33,10 L29,10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <line x1="29" y1="10" x2="22" y2="10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </IconTile>
  );
}

function IcoPDF({ sz = 22 }: { sz?: number }) {
  return (
    <IconTile bg="linear-gradient(135deg,rgba(100,116,139,0.2),rgba(94,106,210,0.2))" border="rgba(100,116,139,0.35)" glow="rgba(100,116,139,0.12)" size={sz === 22 ? 44 : 56} animate="ico-pulse-slate">
      <svg viewBox="0 0 36 36" fill="none" style={{ width: sz, height: sz }}>
        <path d="M7,3 L23,3 L29,9 L29,33 L7,33 Z" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.04)"/>
        <path d="M23,3 L23,9 L29,9" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
        {[16,20,24,28].map((y, i) => (
          <line key={i} x1="11" y1={y} x2={i === 0 ? 25 : 22} y2={y} stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeLinecap="round"/>
        ))}
        <line x1="18" y1="9" x2="18" y2="15" stroke="#5E6AD2" strokeWidth="2" strokeLinecap="round" className="pdf-arr"/>
        <path d="M15,13 L18,16 L21,13" stroke="#5E6AD2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" className="pdf-arr"/>
      </svg>
    </IconTile>
  );
}

// ══════════════════════════════════════════════════════════════════
// FLOATING RISK CARDS (dashboard preview in left panel hero)
// ══════════════════════════════════════════════════════════════════
function DashboardPreview() {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 460 }}>
      {/* Main card */}
      <div className="preview-a" style={{
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 14, padding: "16px 18px",
        backdropFilter: "blur(24px)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Portfolio Risk</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)", margin: "3px 0 0" }}>AAPL · MSFT · NVDA · SPY</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "rgba(76,183,130,0.15)", color: "#4CB782", border: "1px solid rgba(76,183,130,0.2)" }}>
            ● Live
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Expected Return", value: "+18.4%", color: "#4CB782" },
            { label: "Sharpe Ratio",    value: "1.24",   color: "#9DA5E8" },
            { label: "Max Drawdown",    value: "–22.1%", color: "#F87171" },
            { label: "CVaR 95%",        value: "–$447",  color: "#FBBF24" },
          ].map(m => (
            <div key={m.label} style={{ padding: "9px 11px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: m.color, margin: 0, fontVariantNumeric: "tabular-nums" }}>{m.value}</p>
            </div>
          ))}
        </div>
        {[{ t: "NVDA", pct: 36, c: "#818CF8" }, { t: "AAPL", pct: 35, c: "#5E6AD2" }, { t: "MSFT", pct: 29, c: "#A78BFA" }].map(r => (
          <div key={r.t} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", width: 32 }}>{r.t}</span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
              <div style={{ height: "100%", width: `${r.pct}%`, background: r.c, borderRadius: 2 }}/>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: r.c, width: 28, textAlign: "right" }}>{r.pct}%</span>
          </div>
        ))}
      </div>

      {/* Monte Carlo mini card */}
      <div className="preview-b" style={{
        position: "absolute", right: -20, bottom: -36, width: 196,
        background: "rgba(10,10,24,0.9)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12, padding: "12px 14px",
        backdropFilter: "blur(20px)", boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: 0 }}>Monte Carlo</p>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#4CB782" }}>+15.2%</span>
        </div>
        <svg viewBox="0 0 180 52" style={{ width: "100%", height: 44, display: "block", marginBottom: 8 }}>
          {[
            { d: "M0,26 C45,24 90,14 180,8",  c: "#4CB782", o: 0.3 },
            { d: "M0,26 C45,25 90,18 180,13",  c: "#818CF8", o: 0.4 },
            { d: "M0,26 C45,26 90,24 180,22",  c: "#FFFFFF",  o: 0.8, w: 1.5 },
            { d: "M0,26 C45,27 90,30 180,34",  c: "#818CF8", o: 0.3 },
            { d: "M0,26 C45,28 90,36 180,46",  c: "#F87171", o: 0.25 },
          ].map((p, i) => <path key={i} d={p.d} stroke={p.c} strokeWidth={p.w ?? 1} fill="none" opacity={p.o} strokeLinecap="round"/>)}
          <line x1="0" y1="26" x2="180" y2="26" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4,4"/>
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div><p style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", margin: "0 0 2px", textTransform: "uppercase" }}>P5</p><p style={{ fontSize: 11, fontWeight: 700, color: "#F87171", margin: 0 }}>$8,240</p></div>
          <div style={{ textAlign: "right" }}><p style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", margin: "0 0 2px", textTransform: "uppercase" }}>P95</p><p style={{ fontSize: 11, fontWeight: 700, color: "#4CB782", margin: 0 }}>$18,940</p></div>
        </div>
      </div>

      {/* AI badge */}
      <div className="preview-c" style={{
        position: "absolute", left: -16, top: -18,
        background: "linear-gradient(135deg,rgba(94,106,210,0.2),rgba(124,58,237,0.2))",
        border: "1px solid rgba(94,106,210,0.35)", borderRadius: 10,
        padding: "8px 12px", backdropFilter: "blur(16px)",
        boxShadow: "0 8px 24px rgba(94,106,210,0.2)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#5E6AD2,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 14px rgba(94,106,210,0.4)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} style={{ width: 13, height: 13 }}>
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#C4B5FD", margin: 0 }}>AI Copilot</p>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: 0 }}>Llama 3.3 · Streaming</p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// FLOATING TICKER CANVAS — right panel background
// ══════════════════════════════════════════════════════════════════
function TickerCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cvs = ref.current; if (!cvs) return;
    const resize = () => { cvs.width = cvs.offsetWidth; cvs.height = cvs.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const ctx = cvs.getContext("2d")!;
    const items = ["AAPL","MSFT","NVDA","TSLA","SPY","QQQ","+2.4%","–1.2%","β: 1.12","σ: 18.4%","VaR: 2.1%","Sharpe 1.3","CVaR 3.8%","ρ: 0.72","P95","E[r]","Δ 0.48","γ: 0.12"];
    const particles = Array.from({ length: 24 }, () => ({
      x: Math.random() * cvs.width, y: Math.random() * cvs.height,
      text: items[Math.floor(Math.random() * items.length)],
      speed: 0.18 + Math.random() * 0.32,
      opacity: 0.03 + Math.random() * 0.055,
      fontSize: 10 + Math.floor(Math.random() * 4),
    }));
    let raf: number;
    const tick = () => {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      for (const p of particles) {
        ctx.font = `${p.fontSize}px 'SF Mono', monospace`;
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = "#818CF8";
        ctx.fillText(p.text, p.x, p.y);
        p.y -= p.speed;
        if (p.y < -16) { p.y = cvs.height + 10; p.x = Math.random() * cvs.width; p.text = items[Math.floor(Math.random() * items.length)]; }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}/>;
}

// ══════════════════════════════════════════════════════════════════
// FEATURES DATA — used in scrollable sections
// ══════════════════════════════════════════════════════════════════
const FEATURES = [
  {
    Icon: IcoMonteCarlo,
    name: "Monte Carlo Engine",
    tagline: "20,000 correlated paths in <500ms",
    detail: "Powered by Geometric Brownian Motion with Student-t distribution tails for realistic fat-tail behavior. Cholesky decomposition ensures mathematically correct cross-asset correlation across your entire portfolio. GPU-accelerated computation returns full path distributions in under 500ms.",
    stat: "20K paths",
    color: "#818CF8",
  },
  {
    Icon: IcoVaR,
    name: "VaR & CVaR Analytics",
    tagline: "95% & 99% confidence tail-risk",
    detail: "Value-at-Risk and Conditional Value-at-Risk computed using all three industry-standard methods: historical simulation, parametric (delta-normal), and Monte Carlo. CVaR goes beyond VaR by quantifying the expected loss in the worst-case tail — the metric regulators actually care about.",
    stat: "4 methods",
    color: "#F87171",
  },
  {
    Icon: IcoStress,
    name: "Stress Testing",
    tagline: "7 historical crisis scenarios",
    detail: "Replay your portfolio through every major market dislocation: the 2008 Financial Crisis, COVID-19 crash, Dot-com bust, Black Monday 1987, 2022 rate shock, China devaluation, and the 2020 oil crash. See exact P&L impact per scenario, not just vague risk scores.",
    stat: "7 crises",
    color: "#FBBF24",
  },
  {
    Icon: IcoAI,
    name: "AI Risk Copilot",
    tagline: "Llama 3.3 70B · streaming analysis",
    detail: "Context-aware AI advisor powered by Meta's Llama 3.3 70B model with full streaming output. The copilot understands your portfolio composition, live risk metrics, and simulation results — providing plain-English explanations of why your risk profile looks the way it does, and what to do about it.",
    stat: "Llama 3.3",
    color: "#C084FC",
  },
  {
    Icon: IcoCorrelation,
    name: "Correlation Heatmap",
    tagline: "Cholesky cross-asset co-movement",
    detail: "Visualize the full correlation matrix across every asset in your portfolio. Identify hidden concentration risks when assets you thought were uncorrelated begin moving together. The Cholesky decomposition guarantees positive semi-definiteness — no phantom diversification.",
    stat: "Full matrix",
    color: "#06B6D4",
  },
  {
    Icon: IcoFrontier,
    name: "Efficient Frontier",
    tagline: "Markowitz mean-variance optimization",
    detail: "Compute the complete efficient frontier for your asset universe in real-time. Interactive optimizer shows you the maximum Sharpe ratio portfolio, minimum-variance portfolio, and every point in between. Instantly see how rebalancing changes your risk-return profile.",
    stat: "Optimal weights",
    color: "#4CB782",
  },
  {
    Icon: IcoBacktest,
    name: "Historical Backtesting",
    tagline: "Walk-forward against real price data",
    detail: "Validate your risk models against decades of actual market data using walk-forward backtesting. Compare model-predicted VaR exceedances against realized losses — Kupiec POF test and Christoffersen interval test built in. Know if your model is telling the truth.",
    stat: "20yr history",
    color: "#3B82F6",
  },
  {
    Icon: IcoPDF,
    name: "PDF Risk Reports",
    tagline: "White-label professional output",
    detail: "Generate publication-quality PDF risk reports containing every metric, chart, and AI narrative from your analysis session. Fully white-labeled and formatted for client presentations, internal risk committees, or regulatory submissions. One click, instant download.",
    stat: "White-label",
    color: "#94A3B8",
  },
];

const WHY = [
  { num: "20,000", unit: "Simulations", sub: "per run, with full Cholesky-correlated GBM path generation and fat-tail Student-t returns — not simplified random walks." },
  { num: "<500ms", unit: "Compute time", sub: "Full Monte Carlo engine, correlation matrix, VaR, CVaR, and AI streaming response — faster than refreshing a spreadsheet." },
  { num: "$0",     unit: "To start",    sub: "Free tier includes Monte Carlo, VaR, and stress testing. No credit card required. Upgrade to Pro for unlimited runs and AI copilot." },
];

// ══════════════════════════════════════════════════════════════════
// MAIN FORM COMPONENT
// ══════════════════════════════════════════════════════════════════
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [focus,    setFocus]    = useState<string | null>(null);

  useEffect(() => {
    const e = searchParams.get("error");
    if (e) setError(decodeURIComponent(e));
  }, [searchParams]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); }
    else router.replace("/");
  };

  const handleGoogle = async () => {
    setGLoading(true); setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google", options: { redirectTo: getRedirectUrl() },
    });
    if (err) { setError(err.message); setGLoading(false); }
  };

  return (
    <>
      {/* ════ PAGE WRAPPER — left scrolls, right sticks ════ */}
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-geist-sans),-apple-system,system-ui,sans-serif" }}>

        {/* ════════════ LEFT — scrollable content ════════════ */}
        <div className="lp-left" style={{ flex: "0 0 58%", background: "#08090F", overflowY: "auto", position: "relative" }}>

          {/* ── mesh gradient bg ── */}
          <div aria-hidden style={{ position: "sticky", top: 0, height: 0, overflow: "visible", zIndex: 0 }}>
            <div className="orb orb1"/><div className="orb orb2"/>
            <div className="orb orb3"/><div className="orb orb4"/>
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              backgroundImage: "radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage: "radial-gradient(ellipse 85% 85% at 50% 40%, black 40%, transparent 100%)",
            }}/>
          </div>

          {/* ─────── SECTION 1: HERO ─────── */}
          <section style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: "40px 52px 56px", display: "flex", flexDirection: "column" }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#5E6AD2,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(94,106,210,0.4)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} style={{ width: 16, height: 16 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#F2F2F7", letterSpacing: "-0.01em" }}>QuantShield AI</span>
            </div>

            {/* Headline */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 20, marginBottom: 18, background: "rgba(94,106,210,0.14)", border: "1px solid rgba(94,106,210,0.28)" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#5E6AD2", display: "inline-block" }}/>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#9DA5E8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Institutional Risk Analytics</span>
              </div>
              <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.034em", color: "#F2F2F7", margin: "0 0 16px", maxWidth: 480 }}>
                Simulate every future your{" "}
                <span style={{ background: "linear-gradient(90deg,#818CF8,#A78BFA,#C084FC)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  portfolio
                </span>{" "}
                might face.
              </h1>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.42)", lineHeight: 1.65, margin: 0, maxWidth: 400 }}>
                Monte Carlo engine running 20,000 correlated paths — with institutional VaR, stress testing, and AI-powered risk analysis.
              </p>
            </div>

            {/* Feature quick-list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 36 }}>
              {FEATURES.slice(0, 5).map(f => (
                <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <f.Icon sz={20}/>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>{f.name}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0 }}>{f.tagline}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Dashboard preview */}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", paddingBottom: 20 }}>
              <DashboardPreview/>
            </div>

            {/* Stats bar */}
            <div style={{ display: "flex", paddingTop: 28, marginTop: 60, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              {[
                { v: "20,000+", l: "Simulated paths" },
                { v: "8+",      l: "Risk metrics"    },
                { v: "<500ms",  l: "Compute time"    },
                { v: "Free",    l: "To start"        },
              ].map((s, i) => (
                <div key={s.l} style={{ flex: 1, paddingLeft: i > 0 ? 18 : 0, marginLeft: i > 0 ? 18 : 0, borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "#F2F2F7", margin: "0 0 2px", letterSpacing: "-0.02em" }}>{s.v}</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0 }}>{s.l}</p>
                </div>
              ))}
            </div>

            {/* Scroll hint */}
            <div style={{ textAlign: "center", marginTop: 28 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", margin: 0, letterSpacing: "0.04em" }}>↓ Scroll to explore all features</p>
            </div>
          </section>

          {/* ─────── SECTION 2: FULL FEATURE GRID ─────── */}
          <section style={{ position: "relative", zIndex: 1, padding: "72px 52px 80px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ marginBottom: 48 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9DA5E8", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Risk Intelligence Suite</p>
              <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.028em", color: "#F2F2F7", margin: "0 0 12px" }}>
                Every tool a professional needs.<br/>
                <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>Nothing you don't.</span>
              </h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0, maxWidth: 400, lineHeight: 1.6 }}>
                Built from the ground up for portfolio managers, quants, and risk analysts who need answers fast and trust their tools completely.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {FEATURES.map(f => (
                <div key={f.name} className="feat-card" style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "20px 20px 18px",
                  transition: "border-color 0.2s, background 0.2s",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                    <f.Icon sz={22}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#F2F2F7", margin: 0 }}>{f.name}</p>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: `${f.color}20`, color: f.color, border: `1px solid ${f.color}35`, flexShrink: 0 }}>
                          {f.stat}
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>{f.tagline}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.65, margin: 0 }}>{f.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ─────── SECTION 3: WHY QUANTSHIELD ─────── */}
          <section style={{ position: "relative", zIndex: 1, padding: "72px 52px 96px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ marginBottom: 52 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9DA5E8", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Why QuantShield</p>
              <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.028em", color: "#F2F2F7", margin: "0 0 12px" }}>
                The professional's choice<br/>
                <span style={{ background: "linear-gradient(90deg,#4CB782,#5E6AD2)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  for portfolio risk management.
                </span>
              </h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0, maxWidth: 420, lineHeight: 1.6 }}>
                Traditional tools make you choose between power and speed. QuantShield doesn't.
              </p>
            </div>

            {/* Big stat columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 52 }}>
              {WHY.map(w => (
                <div key={w.unit} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "24px 20px" }}>
                  <p style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.04em", color: "#F2F2F7", margin: "0 0 2px", lineHeight: 1 }}>{w.num}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#818CF8", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{w.unit}</p>
                  <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.38)", margin: 0, lineHeight: 1.6 }}>{w.sub}</p>
                </div>
              ))}
            </div>

            {/* Comparison table */}
            <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {["Feature", "Excel", "Bloomberg", "QuantShield AI"].map((h, i) => (
                  <div key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: i === 3 ? "#818CF8" : "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>
                ))}
              </div>
              {[
                ["Monte Carlo",        "❌ Manual",   "✓ Limited",   "✓ 20K paths"],
                ["AI Copilot",         "❌ None",     "❌ None",     "✓ Llama 3.3"],
                ["VaR & CVaR",         "❌ Formula",  "✓ Yes",       "✓ 4 methods"],
                ["Stress Testing",     "❌ Manual",   "✓ Basic",     "✓ 7 scenarios"],
                ["Efficient Frontier", "❌ Plugin",   "✓ Yes",       "✓ Real-time"],
                ["Speed",              "⚠ Hours",    "⚠ Minutes",   "✓ <500ms"],
                ["Cost",               "✓ Included", "✗ $24K/yr",   "✓ Free / $29/mo"],
              ].map(([feat, excel, bb, qs]) => (
                <div key={feat} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ padding: "11px 16px", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>{feat}</div>
                  <div style={{ padding: "11px 16px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{excel}</div>
                  <div style={{ padding: "11px 16px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{bb}</div>
                  <div style={{ padding: "11px 16px", fontSize: 12, color: "#4CB782", fontWeight: 600 }}>{qs}</div>
                </div>
              ))}
            </div>

            {/* Bottom CTA */}
            <div style={{ marginTop: 48, textAlign: "center" }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: "#F2F2F7", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Ready to see your portfolio risk clearly?</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: "0 0 20px" }}>Free forever for 3 simulations/day. No credit card required.</p>
              <a href="/register" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 24px", borderRadius: 9, fontWeight: 700,
                fontSize: 14, color: "white", textDecoration: "none",
                background: "linear-gradient(135deg,#5E6AD2,#7C3AED)",
                boxShadow: "0 0 32px rgba(94,106,210,0.35)",
              }}>
                Start free — no card needed →
              </a>
            </div>
          </section>
        </div>

        {/* ════════════ RIGHT — sticky form panel ════════════ */}
        <div className="lp-right" style={{
          flex: "0 0 42%", position: "sticky", top: 0, height: "100vh", overflowY: "auto",
          background: "#060817",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "40px 44px",
        }}>
          {/* Animated background orbs */}
          <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}>
            <div className="rorb rorb1"/>
            <div className="rorb rorb2"/>
            <div className="rorb rorb3"/>
          </div>
          {/* Floating tickers */}
          <TickerCanvas/>

          {/* Form card */}
          <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 340 }}>

            {/* Glowing card wrapper */}
            <div className="form-glow" style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 18, padding: "32px 28px",
              backdropFilter: "blur(32px)",
            }}>
              {/* Logo mobile */}
              <div className="mobile-logo" style={{ display: "none", alignItems: "center", gap: 8, marginBottom: 24 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#5E6AD2,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} style={{ width: 13, height: 13 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#F2F2F7" }}>QuantShield AI</span>
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#F2F2F7", margin: "0 0 4px", letterSpacing: "-0.025em" }}>Welcome back</h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", margin: "0 0 24px" }}>
                New here?{" "}
                <a href="/register" style={{ color: "#818CF8", fontWeight: 600, textDecoration: "none" }}>Create free account</a>
              </p>

              {/* Google */}
              <button onClick={handleGoogle} disabled={gLoading} className="google-btn" style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                width: "100%", padding: "11px 16px", borderRadius: 9, marginBottom: 16,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#F2F2F7", fontSize: 13, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s", opacity: gLoading ? 0.6 : 1,
              }}>
                {gLoading
                  ? <svg style={{ width: 15, height: 15, animation: "spin 0.8s linear infinite" }} viewBox="0 0 24 24" fill="none"><circle cx={12} cy={12} r={10} stroke="rgba(255,255,255,0.2)" strokeWidth={3}/><path fill="#818CF8" d="M4 12a8 8 0 018-8v8z"/></svg>
                  : <svg viewBox="0 0 24 24" style={{ width: 17, height: 17 }} fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                }
                Continue with Google
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }}/>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>or</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }}/>
              </div>

              {/* Form */}
              <form onSubmit={handleEmail} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { id: "email",    label: "Email",    type: "email",    val: email,    set: setEmail,    ph: "you@company.com" },
                  { id: "password", label: "Password", type: "password", val: password, set: setPassword, ph: "••••••••" },
                ].map(f => (
                  <div key={f.id}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 5 }}>
                      {f.label}
                    </label>
                    <input
                      type={f.type} value={f.val} required
                      onChange={e => f.set(e.target.value)}
                      placeholder={f.ph}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 8,
                        border: `1.5px solid ${focus === f.id ? "rgba(94,106,210,0.6)" : "rgba(255,255,255,0.1)"}`,
                        background: focus === f.id ? "rgba(94,106,210,0.07)" : "rgba(255,255,255,0.04)",
                        color: "#F2F2F7", fontSize: 13, outline: "none",
                        transition: "all 0.15s",
                        boxShadow: focus === f.id ? "0 0 0 3px rgba(94,106,210,0.15)" : "none",
                        boxSizing: "border-box",
                      }}
                      onFocus={() => setFocus(f.id)}
                      onBlur={() => setFocus(null)}
                    />
                  </div>
                ))}

                {error && (
                  <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 12, color: "#FCA5A5", background: "rgba(248,113,113,0.1)", border: "1.5px solid rgba(248,113,113,0.2)" }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="signin-btn" style={{
                  padding: "11px 16px", borderRadius: 9, fontWeight: 700, fontSize: 14,
                  color: "white", cursor: loading ? "not-allowed" : "pointer",
                  background: loading ? "rgba(94,106,210,0.5)" : "linear-gradient(135deg,#5E6AD2,#7C3AED)",
                  border: "none", marginTop: 4,
                  boxShadow: loading ? "none" : "0 0 28px rgba(94,106,210,0.35)",
                  transition: "all 0.15s",
                }}>
                  {loading ? "Signing in…" : "Sign in →"}
                </button>
              </form>
            </div>

            {/* Trust badges */}
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {[
                  { icon: "🔒", label: "256-bit TLS" },
                  { icon: "🛡", label: "SOC2 Ready" },
                  { icon: "⚡", label: "99.9% uptime" },
                ].map(b => (
                  <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 12 }}>{b.icon}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>{b.label}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", margin: 0 }}>
                By signing in you agree to our{" "}
                <a href="#" style={{ color: "rgba(129,140,248,0.6)", textDecoration: "none" }}>Terms</a>
                {" & "}
                <a href="#" style={{ color: "rgba(129,140,248,0.6)", textDecoration: "none" }}>Privacy</a>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          GLOBAL STYLES
      ══════════════════════════════════════════════════════ */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Left panel mesh orbs ── */
        @keyframes drift1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(8%,12%) scale(1.14)} 66%{transform:translate(-5%,6%) scale(0.92)} }
        @keyframes drift2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-10%,-9%) scale(1.1)} 66%{transform:translate(7%,-11%) scale(0.96)} }
        @keyframes drift3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(11%,-9%) scale(1.12)} }
        @keyframes drift4 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-8%,13%) scale(1.08)} }
        .orb { position:absolute; border-radius:50%; filter:blur(90px); pointer-events:none; }
        .orb1 { width:600px;height:600px;top:-200px;left:-150px; background:radial-gradient(circle,rgba(60,75,200,0.32) 0%,transparent 70%); animation:drift1 22s ease-in-out infinite; }
        .orb2 { width:500px;height:500px;top:35%;right:-80px;  background:radial-gradient(circle,rgba(120,60,220,0.26) 0%,transparent 70%); animation:drift2 26s ease-in-out infinite; }
        .orb3 { width:400px;height:400px;bottom:-80px;left:25%;  background:radial-gradient(circle,rgba(30,100,200,0.2) 0%,transparent 70%); animation:drift3 19s ease-in-out infinite; }
        .orb4 { width:300px;height:300px;top:55%;right:22%;     background:radial-gradient(circle,rgba(180,60,200,0.16) 0%,transparent 70%); animation:drift4 24s ease-in-out infinite; }

        /* ── Right panel orbs ── */
        @keyframes rdrift1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(5%,8%) scale(1.1)} }
        @keyframes rdrift2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-6%,-6%) scale(1.08)} }
        @keyframes rdrift3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(8%,-10%) scale(0.92)} }
        .rorb { position:absolute; border-radius:50%; filter:blur(80px); pointer-events:none; }
        .rorb1 { width:380px;height:380px;top:-80px;left:-60px;  background:radial-gradient(circle,rgba(94,106,210,0.28) 0%,transparent 70%); animation:rdrift1 18s ease-in-out infinite; }
        .rorb2 { width:320px;height:320px;bottom:-60px;right:-40px; background:radial-gradient(circle,rgba(124,58,237,0.24) 0%,transparent 70%); animation:rdrift2 22s ease-in-out infinite; }
        .rorb3 { width:260px;height:260px;top:45%;left:30%;     background:radial-gradient(circle,rgba(192,38,211,0.16) 0%,transparent 70%); animation:rdrift3 16s ease-in-out infinite; }

        /* ── Icon pulse glows ── */
        @keyframes pulseIndigo { 0%,100%{box-shadow:0 0 20px rgba(94,106,210,0.2),0 4px 12px rgba(0,0,0,0.3)} 50%{box-shadow:0 0 32px rgba(94,106,210,0.4),0 4px 12px rgba(0,0,0,0.3)} }
        @keyframes pulseRed    { 0%,100%{box-shadow:0 0 20px rgba(248,113,113,0.15),0 4px 12px rgba(0,0,0,0.3)} 50%{box-shadow:0 0 30px rgba(248,113,113,0.35),0 4px 12px rgba(0,0,0,0.3)} }
        @keyframes pulseOrange { 0%,100%{box-shadow:0 0 20px rgba(251,146,60,0.15),0 4px 12px rgba(0,0,0,0.3)} 50%{box-shadow:0 0 30px rgba(251,146,60,0.3),0 4px 12px rgba(0,0,0,0.3)} }
        @keyframes pulseViolet { 0%,100%{box-shadow:0 0 20px rgba(139,92,246,0.2),0 4px 12px rgba(0,0,0,0.3)} 50%{box-shadow:0 0 32px rgba(139,92,246,0.4),0 4px 12px rgba(0,0,0,0.3)} }
        @keyframes pulseCyan   { 0%,100%{box-shadow:0 0 20px rgba(6,182,212,0.15),0 4px 12px rgba(0,0,0,0.3)} 50%{box-shadow:0 0 30px rgba(6,182,212,0.32),0 4px 12px rgba(0,0,0,0.3)} }
        @keyframes pulseGreen  { 0%,100%{box-shadow:0 0 20px rgba(76,183,130,0.15),0 4px 12px rgba(0,0,0,0.3)} 50%{box-shadow:0 0 30px rgba(76,183,130,0.32),0 4px 12px rgba(0,0,0,0.3)} }
        @keyframes pulseBlue   { 0%,100%{box-shadow:0 0 20px rgba(59,130,246,0.15),0 4px 12px rgba(0,0,0,0.3)} 50%{box-shadow:0 0 30px rgba(59,130,246,0.3),0 4px 12px rgba(0,0,0,0.3)} }
        @keyframes pulseSlate  { 0%,100%{box-shadow:0 0 16px rgba(100,116,139,0.12),0 4px 12px rgba(0,0,0,0.3)} 50%{box-shadow:0 0 24px rgba(100,116,139,0.25),0 4px 12px rgba(0,0,0,0.3)} }
        .ico-pulse-indigo { animation:pulseIndigo 3s ease-in-out infinite; }
        .ico-pulse-red    { animation:pulseRed    3.2s ease-in-out infinite 0.3s; }
        .ico-pulse-orange { animation:pulseOrange 3.5s ease-in-out infinite 0.6s; }
        .ico-pulse-violet { animation:pulseViolet 3s ease-in-out infinite 0.9s; }
        .ico-pulse-cyan   { animation:pulseCyan   3.3s ease-in-out infinite 0.2s; }
        .ico-pulse-green  { animation:pulseGreen  3.4s ease-in-out infinite 0.5s; }
        .ico-pulse-blue   { animation:pulseBlue   3.1s ease-in-out infinite 0.7s; }
        .ico-pulse-slate  { animation:pulseSlate  3.6s ease-in-out infinite 0.4s; }

        /* ── Monte Carlo path draw ── */
        @keyframes drawMC { from{stroke-dashoffset:60} to{stroke-dashoffset:0} }
        .mc-p { stroke-dasharray:60; animation:drawMC 1.4s ease forwards; }
        .mc-p1{animation-delay:0s}.mc-p2{animation-delay:0.08s}.mc-p3{animation-delay:0.16s}.mc-p4{animation-delay:0.08s}.mc-p5{animation-delay:0s}
        @keyframes mcRing { 0%{r:5;opacity:0.4} 100%{r:10;opacity:0} }
        .mc-ring { animation:mcRing 2s ease-out infinite; }

        /* ── VaR tail pulse ── */
        @keyframes varPulse { 0%,100%{opacity:0.35} 50%{opacity:0.65} }
        .var-tail { animation:varPulse 2.5s ease-in-out infinite; }

        /* ── Stress gauge ── */
        @keyframes needleSwing { 0%{transform:rotate(-40deg);transform-origin:18px 26px} 60%{transform:rotate(0deg);transform-origin:18px 26px} 100%{transform:rotate(-5deg);transform-origin:18px 26px} }
        .stress-needle { animation:needleSwing 2s ease-out forwards; }
        @keyframes stressRing { 0%{r:4.5;opacity:0.3} 100%{r:9;opacity:0} }
        .stress-ring { animation:stressRing 2s ease-out infinite 0.5s; }
        @keyframes arcGrow { from{stroke-dashoffset:30} to{stroke-dashoffset:0} }
        .stress-arc { stroke-dasharray:30; animation:arcGrow 1.2s ease forwards; }

        /* ── AI node pulse ── */
        @keyframes aiPulse0 { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes aiPulse1 { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes aiPulse2 { 0%,100%{opacity:0.7} 50%{opacity:0.3} }
        .ai-n0,.ai-h0,.ai-o0{animation:aiPulse0 1.8s ease-in-out infinite}
        .ai-n1,.ai-h1,.ai-o1{animation:aiPulse1 1.8s ease-in-out infinite 0.3s}
        .ai-n2,.ai-h2{animation:aiPulse2 1.8s ease-in-out infinite 0.6s}
        .ai-h3{animation:aiPulse0 1.8s ease-in-out infinite 0.9s}
        @keyframes sigTravel { 0%{stroke-dashoffset:20;opacity:0} 30%{opacity:1} 100%{stroke-dashoffset:0;opacity:1} }
        .ai-sig { stroke-dasharray:20; animation:sigTravel 1.5s ease forwards; }
        .ai-sig2 { animation-delay:0.4s; }

        /* ── Heatmap cells ── */
        @keyframes hmPulse0 { 0%,100%{opacity:0.6} 50%{opacity:0.95} }
        @keyframes hmPulse1 { 0%,100%{opacity:0.45} 50%{opacity:0.75} }
        @keyframes hmPulse2 { 0%,100%{opacity:0.7} 50%{opacity:0.45} }
        .hm-c0{animation:hmPulse0 2.5s ease-in-out infinite}
        .hm-c1{animation:hmPulse1 2.5s ease-in-out infinite 0.5s}
        .hm-c2{animation:hmPulse2 2.5s ease-in-out infinite 1s}

        /* ── Efficient frontier ── */
        @keyframes efDraw { from{stroke-dashoffset:80} to{stroke-dashoffset:0} }
        .ef-curve { stroke-dasharray:80; animation:efDraw 1.6s ease forwards 0.3s; stroke-dashoffset:80; }
        @keyframes efDot { 0%,100%{r:3.5} 50%{r:5} }
        .ef-dot { animation:efDot 2s ease-in-out infinite; }

        /* ── Backtest line ── */
        @keyframes btDraw { from{stroke-dashoffset:100} to{stroke-dashoffset:0} }
        .bt-line { stroke-dasharray:100; animation:btDraw 1.4s ease forwards; }

        /* ── PDF arrow ── */
        @keyframes arrBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(3px)} }
        .pdf-arr { animation:arrBounce 1.8s ease-in-out infinite; }

        /* ── Dashboard cards ── */
        @keyframes floatA { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes floatB { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-8px) translateX(3px)} }
        @keyframes floatC { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-6px) rotate(-1deg)} }
        .preview-a { animation:floatA 5.5s ease-in-out infinite; }
        .preview-b { animation:floatB 6.5s ease-in-out infinite 0.6s; }
        .preview-c { animation:floatC 4.5s ease-in-out infinite 1.2s; }

        /* ── Form glow ── */
        @keyframes formGlow {
          0%,100%{box-shadow:0 0 0 1px rgba(94,106,210,0.2),0 24px 64px rgba(0,0,0,0.5),0 0 40px rgba(94,106,210,0.06)}
          50%    {box-shadow:0 0 0 1px rgba(139,92,246,0.35),0 24px 64px rgba(0,0,0,0.5),0 0 60px rgba(139,92,246,0.12)}
        }
        .form-glow { animation:formGlow 4s ease-in-out infinite; }

        /* ── Interactive hovers ── */
        .feat-card:hover { background:rgba(255,255,255,0.05) !important; border-color:rgba(255,255,255,0.12) !important; }
        .google-btn:hover { background:rgba(255,255,255,0.11) !important; border-color:rgba(255,255,255,0.2) !important; }
        .signin-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 0 40px rgba(94,106,210,0.5) !important; }

        /* ── Responsive ── */
        @media (max-width:960px) {
          .lp-left  { display:none !important; }
          .lp-right { flex:1 !important; position:relative !important; height:auto !important; min-height:100vh !important; }
          .mobile-logo { display:flex !important; }
        }
      `}</style>
    </>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm/></Suspense>;
}
