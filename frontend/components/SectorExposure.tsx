"use client";

import React from "react";

// ─── Static GICS sector map (200+ common tickers) ─────────────────────────────
const SECTOR_MAP: Record<string, string> = {
  // Technology
  AAPL:"Technology", MSFT:"Technology", NVDA:"Technology", GOOGL:"Technology",
  GOOG:"Technology", META:"Technology", AMD:"Technology",  INTC:"Technology",
  AVGO:"Technology", QCOM:"Technology", TXN:"Technology",  MU:"Technology",
  AMAT:"Technology", KLAC:"Technology", LRCX:"Technology", MRVL:"Technology",
  PLTR:"Technology", PANW:"Technology", CRWD:"Technology", ZS:"Technology",
  SNOW:"Technology", DDOG:"Technology", NET:"Technology",  FTNT:"Technology",
  ADBE:"Technology", CRM:"Technology",  ORCL:"Technology", SAP:"Technology",
  NOW:"Technology",  WDAY:"Technology", TEAM:"Technology", OKTA:"Technology",
  // Communication Services
  NFLX:"Communication", T:"Communication",   VZ:"Communication",
  DIS:"Communication",  CMCSA:"Communication", CHTR:"Communication",
  TMUS:"Communication", SPOT:"Communication", SNAP:"Communication",
  TWTR:"Communication", PINS:"Communication", RBLX:"Communication",
  // Consumer Discretionary
  AMZN:"Consumer Disc.", TSLA:"Consumer Disc.", NKE:"Consumer Disc.",
  MCD:"Consumer Disc.",  SBUX:"Consumer Disc.", HD:"Consumer Disc.",
  LOW:"Consumer Disc.",  TGT:"Consumer Disc.",  BKNG:"Consumer Disc.",
  ABNB:"Consumer Disc.", UBER:"Consumer Disc.", LYFT:"Consumer Disc.",
  ETSY:"Consumer Disc.", PTON:"Consumer Disc.", GM:"Consumer Disc.",
  F:"Consumer Disc.",    RIVN:"Consumer Disc.",
  // Consumer Staples
  WMT:"Consumer Stap.", PG:"Consumer Stap.",  KO:"Consumer Stap.",
  PEP:"Consumer Stap.", COST:"Consumer Stap.",MDLZ:"Consumer Stap.",
  CL:"Consumer Stap.",  EL:"Consumer Stap.",  PM:"Consumer Stap.",
  MO:"Consumer Stap.",  KHC:"Consumer Stap.", GIS:"Consumer Stap.",
  // Healthcare
  JNJ:"Healthcare", UNH:"Healthcare", PFE:"Healthcare", ABBV:"Healthcare",
  MRK:"Healthcare", TMO:"Healthcare", ABT:"Healthcare", DHR:"Healthcare",
  GILD:"Healthcare",BMY:"Healthcare", AMGN:"Healthcare",CVS:"Healthcare",
  LLY:"Healthcare", ISRG:"Healthcare",MRNA:"Healthcare",REGN:"Healthcare",
  BIIB:"Healthcare",VRTX:"Healthcare",CI:"Healthcare",  HUM:"Healthcare",
  // Financials
  JPM:"Financials", BAC:"Financials", WFC:"Financials", GS:"Financials",
  MS:"Financials",  C:"Financials",   AXP:"Financials", V:"Financials",
  MA:"Financials",  BX:"Financials",  KKR:"Financials", PYPL:"Financials",
  SQ:"Financials",  SCHW:"Financials",BLK:"Financials", CB:"Financials",
  // Industrials
  CAT:"Industrials", BA:"Industrials",  RTX:"Industrials", HON:"Industrials",
  LMT:"Industrials", GE:"Industrials",  UNP:"Industrials", UPS:"Industrials",
  FDX:"Industrials", DE:"Industrials",  MMM:"Industrials", EMR:"Industrials",
  // Energy
  XOM:"Energy", CVX:"Energy", COP:"Energy", SLB:"Energy",
  EOG:"Energy", PXD:"Energy", OXY:"Energy", MPC:"Energy",
  PSX:"Energy", VLO:"Energy",
  // Real Estate
  AMT:"Real Estate",  PLD:"Real Estate",  SPG:"Real Estate",
  CCI:"Real Estate",  EQIX:"Real Estate", VNQ:"Real Estate",
  PSA:"Real Estate",  DLR:"Real Estate",
  // Materials
  LIN:"Materials", APD:"Materials", SHW:"Materials",
  FCX:"Materials", NEM:"Materials",
  // Utilities
  NEE:"Utilities", DUK:"Utilities", SO:"Utilities",
  AEP:"Utilities", D:"Utilities",   EXC:"Utilities",
  // ETFs
  SPY:"ETF · Blend", QQQ:"ETF · Tech",   DIA:"ETF · Blend",
  IWM:"ETF · Small", AGG:"ETF · Bonds",  TLT:"ETF · Bonds",
  GLD:"Commodities", SLV:"Commodities",  USO:"Commodities",
  // Crypto
  "BTC-USD":"Crypto", "ETH-USD":"Crypto", "SOL-USD":"Crypto",
  "BNB-USD":"Crypto", "XRP-USD":"Crypto", "DOGE-USD":"Crypto",
};

const SECTOR_COLORS: Record<string, string> = {
  "Technology":     "#06b6d4",
  "Communication":  "#8b5cf6",
  "Consumer Disc.": "#f59e0b",
  "Consumer Stap.": "#10b981",
  "Healthcare":     "#3b82f6",
  "Financials":     "#f97316",
  "Industrials":    "#64748b",
  "Energy":         "#ef4444",
  "Real Estate":    "#84cc16",
  "Materials":      "#78716c",
  "Utilities":      "#a78bfa",
  "ETF · Blend":    "#22d3ee",
  "ETF · Tech":     "#0ea5e9",
  "ETF · Bonds":    "#94a3b8",
  "Commodities":    "#eab308",
  "Crypto":         "#f43f5e",
  "Unknown":        "#334155",
};

interface Props {
  tickers: string[];
  weights: number[];   // same length as tickers, 0–1 normalised
}

export default function SectorExposure({ tickers, weights }: Props) {
  // Group weights by sector
  const sectorMap: Record<string, number> = {};
  tickers.forEach((t, i) => {
    const sector = SECTOR_MAP[t.toUpperCase()] ?? "Unknown";
    sectorMap[sector] = (sectorMap[sector] ?? 0) + (weights[i] ?? 0);
  });

  const entries = Object.entries(sectorMap)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 0.001);

  if (!entries.length) return null;

  return (
    <div
      className="rounded-3xl border p-5"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
    >
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Sector / Asset Class Exposure</p>

      <div className="flex flex-col gap-2.5">
        {entries.map(([sector, weight]) => {
          const color = SECTOR_COLORS[sector] ?? SECTOR_COLORS["Unknown"];
          const pct   = weight * 100;
          return (
            <div key={sector} className="flex items-center gap-3">
              <span
                className="text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded"
                style={{ color, background: `${color}14`, minWidth: 96 }}
              >
                {sector}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
                />
              </div>
              <span className="tabnum text-xs font-mono font-semibold shrink-0 w-10 text-right" style={{ color }}>
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Tickers unrecognised */}
      {tickers.some(t => !SECTOR_MAP[t.toUpperCase()]) && (
        <p className="text-[10px] text-slate-600 mt-3">
          Unrecognised: {tickers.filter(t => !SECTOR_MAP[t.toUpperCase()]).join(", ")} → mapped to Unknown
        </p>
      )}
    </div>
  );
}
