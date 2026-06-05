"use client";

import React, { useCallback } from "react";

export interface Asset {
  ticker: string;
  weight: number;   // 0–100
  locked: boolean;
}

interface Props {
  assets: Asset[];
  onChange: (assets: Asset[]) => void;
}

// ─── Normalize: distribute remainder across unlocked assets ──────────────────
export function normalizeAssets(assets: Asset[]): Asset[] {
  const locked = assets.filter(a => a.locked);
  const free   = assets.filter(a => !a.locked);
  if (!free.length) return assets;

  const lockedSum = locked.reduce((s, a) => s + a.weight, 0);
  const freeTarget = Math.max(100 - lockedSum, 0);

  const freeSum = free.reduce((s, a) => s + a.weight, 0);
  return assets.map(a => {
    if (a.locked) return a;
    const scaled = freeSum > 0 ? (a.weight / freeSum) * freeTarget : freeTarget / free.length;
    return { ...a, weight: Math.round(scaled * 10) / 10 };
  });
}

export function equalWeights(tickers: string[]): Asset[] {
  const n = tickers.length;
  if (!n) return [];
  const w = Math.floor((100 / n) * 10) / 10;
  return tickers.map((ticker, i) => ({
    ticker,
    weight: i === n - 1 ? Math.round((100 - w * (n - 1)) * 10) / 10 : w,
    locked: false,
  }));
}

// ─── Individual row ───────────────────────────────────────────────────────────
function AssetRow({ asset, onChange, onRemove }: {
  asset: Asset;
  onChange: (a: Asset) => void;
  onRemove: () => void;
}) {
  const isCrypto = asset.ticker.includes("-");
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Ticker chip */}
      <span
        className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md shrink-0"
        style={{
          background: isCrypto ? "rgba(244,63,94,0.12)" : "rgba(6,182,212,0.10)",
          border:     isCrypto ? "1px solid rgba(244,63,94,0.2)" : "1px solid rgba(6,182,212,0.2)",
          color:      isCrypto ? "#fb7185" : "#22d3ee",
          minWidth: 52, textAlign: "center",
        }}
      >
        {asset.ticker}
      </span>

      {/* Slider */}
      <input
        type="range"
        className="w-slider flex-1"
        min={0} max={100} step={0.5}
        value={asset.weight}
        disabled={asset.locked}
        onChange={e => onChange({ ...asset, weight: parseFloat(e.target.value) })}
      />

      {/* % input */}
      <input
        type="number"
        min={0} max={100} step={0.1}
        value={asset.weight.toFixed(1)}
        disabled={asset.locked}
        onChange={e => {
          const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
          onChange({ ...asset, weight: v });
        }}
        className="tabnum text-right text-xs font-mono font-semibold rounded-lg px-2 py-1 outline-none w-14 shrink-0"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: asset.locked ? "#475569" : "#e2e8f0",
        }}
      />
      <span className="text-slate-600 text-xs shrink-0">%</span>

      {/* Lock toggle */}
      <button
        onClick={() => onChange({ ...asset, locked: !asset.locked })}
        title={asset.locked ? "Unlock" : "Lock"}
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors"
        style={{
          background: asset.locked ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
          border: "1px solid " + (asset.locked ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.08)"),
          color: asset.locked ? "#f59e0b" : "#475569",
        }}
      >
        {asset.locked ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
          </svg>
        )}
      </button>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:text-red-400"
        style={{ color: "#334155" }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WeightEditor({ assets, onChange }: Props) {
  const total = assets.reduce((s, a) => s + a.weight, 0);
  const balanced = Math.abs(total - 100) < 0.15;

  const update = useCallback((i: number, a: Asset) => {
    const next = [...assets]; next[i] = a; onChange(next);
  }, [assets, onChange]);

  const remove = useCallback((i: number) => {
    const next = assets.filter((_, j) => j !== i);
    onChange(equalWeights(next.map(a => a.ticker)));
  }, [assets, onChange]);

  const equalize = () => onChange(equalWeights(assets.map(a => a.ticker)));
  const normalize = () => onChange(normalizeAssets(assets));

  return (
    <div className="flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Asset Weights</p>
        <div className="flex gap-1.5">
          <button
            onClick={equalize}
            className="px-2 py-1 rounded-md text-[10px] font-bold transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b" }}
          >
            Equal
          </button>
          <button
            onClick={normalize}
            className="px-2 py-1 rounded-md text-[10px] font-bold transition-colors"
            style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)", color: "#22d3ee" }}
          >
            Normalize
          </button>
        </div>
      </div>

      {/* Asset rows */}
      {assets.length === 0 ? (
        <p className="text-xs text-slate-600 text-center py-3">Enter tickers above to configure weights</p>
      ) : (
        assets.map((a, i) => (
          <AssetRow key={a.ticker} asset={a} onChange={v => update(i, v)} onRemove={() => remove(i)} />
        ))
      )}

      {/* Total indicator */}
      {assets.length > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono font-semibold mt-1"
          style={{
            background: balanced ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)",
            border: "1px solid " + (balanced ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"),
            color: balanced ? "#10b981" : "#ef4444",
          }}
        >
          {balanced ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3 shrink-0">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3 shrink-0">
              <line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
          )}
          <span>Total: {total.toFixed(1)}%</span>
          {!balanced && <span className="text-slate-500"> — click Normalize to fix</span>}
        </div>
      )}
    </div>
  );
}
