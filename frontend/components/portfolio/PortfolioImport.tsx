"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { parsePasteInput, parseCSV, toNormalisedWeights, type ParsedHolding, type ParseError } from "@/lib/parse-portfolio";
import type { Asset } from "@/components/WeightEditor";
import WeightEditor, { equalWeights, normalizeAssets } from "@/components/WeightEditor";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ValidationState = "idle" | "pending" | "valid" | "invalid";

interface RowValidation {
  ticker: string;
  state: ValidationState;
}

interface Props {
  assets: Asset[];
  onChange: (assets: Asset[]) => void;
  onAutoAnalyze?: () => void; // called after a confirmed import to trigger one-click analysis
  tickers: string;
  onTickersChange: (raw: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const PASTE_PLACEHOLDER = `AAPL 40
MSFT 30
NVDA 30

# One ticker per line.
# TICKER WEIGHT  or  TICKER, WEIGHT%
# Also supports:  TICKER 200 shares`;

async function batchValidate(tickers: string[]): Promise<{ valid: string[]; invalid: string[] }> {
  try {
    const res = await fetch("/backend/api/validate-tickers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers }),
    });
    if (!res.ok) throw new Error("validate endpoint error");
    return res.json();
  } catch {
    // Network error: treat all as valid so users aren't blocked
    return { valid: tickers, invalid: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation badge
// ─────────────────────────────────────────────────────────────────────────────
function Badge({ state }: { state: ValidationState }) {
  if (state === "pending" || state === "idle") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, borderRadius: "50%",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
      </span>
    );
  }
  if (state === "valid") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, borderRadius: "50%",
        background: "rgba(76,183,130,0.15)", border: "1px solid rgba(76,183,130,0.35)",
      }}>
        <svg viewBox="0 0 12 12" fill="none" stroke="#4CB782" strokeWidth={2} style={{ width: 8, height: 8 }}>
          <polyline points="1.5,6 4.5,9 10.5,3" />
        </svg>
      </span>
    );
  }
  // invalid
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, borderRadius: "50%",
      background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)",
    }}>
      <svg viewBox="0 0 12 12" fill="none" stroke="#F87171" strokeWidth={2} style={{ width: 8, height: 8 }}>
        <line x1={2} y1={2} x2={10} y2={10} /><line x1={10} y1={2} x2={2} y2={10} />
      </svg>
    </span>
  );
}

// Spinner for in-progress validation
function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid rgba(255,255,255,0.1)",
      borderTopColor: "#818CF8", borderRadius: "50%",
      animation: "qs-spin 0.7s linear infinite",
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview table row
// ─────────────────────────────────────────────────────────────────────────────
function PreviewRow({
  holding, displayWeight, validation, validating, onRemove,
}: {
  holding: ParsedHolding;
  displayWeight: number;
  validation: ValidationState;
  validating: boolean;
  onRemove: () => void;
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "28px 1fr 60px 28px",
      alignItems: "center", gap: 8,
      padding: "6px 10px", borderRadius: 7,
      background: validation === "invalid"
        ? "rgba(248,113,113,0.05)"
        : "rgba(255,255,255,0.03)",
      border: "1px solid " + (
        validation === "invalid" ? "rgba(248,113,113,0.18)" :
        validation === "valid"   ? "rgba(76,183,130,0.15)"  :
        "rgba(255,255,255,0.06)"
      ),
    }}>
      {/* Validation badge */}
      {validating ? <Spinner /> : <Badge state={validation} />}

      {/* Ticker + mode */}
      <div>
        <span style={{
          fontSize: 11, fontWeight: 700, fontFamily: "monospace",
          color: holding.mode === "shares" ? "#FBBF24" : "#22d3ee",
          background: holding.mode === "shares" ? "rgba(251,191,36,0.08)" : "rgba(6,182,212,0.08)",
          border: "1px solid " + (holding.mode === "shares" ? "rgba(251,191,36,0.2)" : "rgba(6,182,212,0.2)"),
          borderRadius: 4, padding: "1px 6px", marginRight: 6,
        }}>
          {holding.ticker}
        </span>
        {holding.mode === "shares" && (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
            {holding.rawValue.toFixed(0)} shares
          </span>
        )}
        {validation === "invalid" && (
          <span style={{ fontSize: 9, color: "#F87171" }}> Unknown symbol</span>
        )}
      </div>

      {/* Weight */}
      <span style={{
        fontSize: 11, fontWeight: 600, fontFamily: "monospace",
        color: validation === "invalid" ? "#F87171" : "rgba(255,255,255,0.55)",
        textAlign: "right",
      }}>
        {holding.mode === "weight" ? `${displayWeight.toFixed(1)}%` : "—"}
      </span>

      {/* Remove */}
      <button onClick={onRemove} style={{
        width: 22, height: 22, borderRadius: 5, border: "none",
        background: "transparent", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.2)",
      }}
        onMouseEnter={e => (e.currentTarget.style.color = "#F87171")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 9, height: 9 }}>
          <line x1={1} y1={1} x2={11} y2={11} /><line x1={11} y1={1} x2={1} y2={11} />
        </svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function PortfolioImport({ assets, onChange, onAutoAnalyze, tickers, onTickersChange }: Props) {
  const [tab, setTab] = useState<"paste" | "csv" | "manual">("paste");

  // Paste tab state
  const [pasteText, setPasteText]     = useState("");
  const [holdings, setHoldings]       = useState<ParsedHolding[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [validations, setValidations] = useState<RowValidation[]>([]);
  const [validating, setValidating]   = useState(false);
  const [loadSuccess, setLoadSuccess] = useState(false);
  const parseDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CSV tab state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Parse + validate whenever pasteText changes (debounced) ────────────────
  const runParseAndValidate = useCallback(async (text: string) => {
    const result = parsePasteInput(text);
    setHoldings(result.holdings);
    setParseErrors(result.errors);
    setLoadSuccess(false);

    if (!result.holdings.length) {
      setValidations([]);
      return;
    }

    // Seed all rows as pending
    setValidations(result.holdings.map(h => ({ ticker: h.ticker, state: "pending" })));
    setValidating(true);

    const allTickers = result.holdings.map(h => h.ticker);
    const { valid, invalid } = await batchValidate(allTickers);
    const validSet   = new Set(valid);
    const invalidSet = new Set(invalid);

    setValidations(result.holdings.map(h => ({
      ticker: h.ticker,
      state: validSet.has(h.ticker) ? "valid" : invalidSet.has(h.ticker) ? "invalid" : "idle",
    })));
    setValidating(false);
  }, []);

  const scheduleParse = useCallback((text: string) => {
    setPasteText(text);
    if (parseDebounce.current) clearTimeout(parseDebounce.current);
    if (!text.trim()) { setHoldings([]); setParseErrors([]); setValidations([]); return; }
    parseDebounce.current = setTimeout(() => runParseAndValidate(text), 600);
  }, [runParseAndValidate]);

  useEffect(() => () => { if (parseDebounce.current) clearTimeout(parseDebounce.current); }, []);

  // ── Load CSV file ───────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const result = parseCSV(text);
    setHoldings(result.holdings);
    setParseErrors(result.errors);
    setLoadSuccess(false);
    setPasteText(""); // clear paste field
    setTab("csv");

    if (!result.holdings.length) { setValidations([]); return; }
    setValidations(result.holdings.map(h => ({ ticker: h.ticker, state: "pending" })));
    setValidating(true);

    const { valid, invalid } = await batchValidate(result.holdings.map(h => h.ticker));
    const vs = new Set(valid), is = new Set(invalid);
    setValidations(result.holdings.map(h => ({
      ticker: h.ticker,
      state: vs.has(h.ticker) ? "valid" : is.has(h.ticker) ? "invalid" : "idle",
    })));
    setValidating(false);
  }, []);

  // ── Remove a row from the preview ───────────────────────────────────────────
  const removeRow = useCallback((ticker: string) => {
    setHoldings(prev => prev.filter(h => h.ticker !== ticker));
    setValidations(prev => prev.filter(v => v.ticker !== ticker));
  }, []);

  // Remove all invalid tickers
  const removeInvalid = useCallback(() => {
    const invalidSet = new Set(validations.filter(v => v.state === "invalid").map(v => v.ticker));
    setHoldings(prev => prev.filter(h => !invalidSet.has(h.ticker)));
    setValidations(prev => prev.filter(v => !invalidSet.has(v.ticker)));
  }, [validations]);

  // ── Load confirmed portfolio into the app ────────────────────────────────────
  const handleLoad = useCallback(() => {
    if (!holdings.length) return;

    // Shares mode: warn (can't normalise without prices) and treat values as weights
    const normalised = toNormalisedWeights(
      holdings.map(h => h.mode === "shares" ? { ...h, mode: "weight" as const } : h)
    );

    const newAssets: Asset[] = normalised.map(({ ticker, weight }) => ({
      ticker, weight, locked: false,
    }));

    // Normalise so weights sum exactly to 100
    const adjusted = normalizeAssets(newAssets);
    onChange(adjusted);
    onTickersChange(adjusted.map(a => a.ticker).join(", "));
    setLoadSuccess(true);

    // Trigger one-click analysis after a brief tick so state has settled
    if (onAutoAnalyze) setTimeout(onAutoAnalyze, 80);
  }, [holdings, onChange, onTickersChange, onAutoAnalyze]);

  // ── Computed values ──────────────────────────────────────────────────────────
  const validationMap = Object.fromEntries(validations.map(v => [v.ticker, v.state]));
  const normalised    = toNormalisedWeights(holdings.filter(h => h.mode === "weight"));
  const weightMap     = Object.fromEntries(normalised.map(w => [w.ticker, w.weight]));

  const anyInvalid = validations.some(v => v.state === "invalid");
  const allChecked = !validating && validations.length > 0 && validations.every(v => v.state !== "pending");
  const canLoad    = allChecked && !anyInvalid && holdings.length > 0;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
    cursor: "pointer", border: "none",
    background: active ? "rgba(94,106,210,0.18)" : "transparent",
    color: active ? "#9DA5E8" : "rgba(255,255,255,0.3)",
    borderBottom: active ? "2px solid #5E6AD2" : "2px solid transparent",
    transition: "all 0.15s",
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      <style>{`@keyframes qs-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 12 }}>
        {(["paste", "csv", "manual"] as const).map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === "paste" ? "Paste" : t === "csv" ? "CSV" : "Manual"}
          </button>
        ))}
      </div>

      {/* ── PASTE TAB ─────────────────────────────────────────────────────── */}
      {tab === "paste" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            value={pasteText}
            onChange={e => scheduleParse(e.target.value)}
            placeholder={PASTE_PLACEHOLDER}
            rows={6}
            style={{
              width: "100%", resize: "vertical", padding: "10px 12px",
              borderRadius: 8, fontSize: 12, fontFamily: "monospace",
              background: "rgba(255,255,255,0.04)", color: "#F2F2F7",
              border: "1px solid rgba(255,255,255,0.1)", outline: "none",
              lineHeight: 1.65, boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = "rgba(94,106,210,0.5)")}
            onBlur={e  => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div style={{
              padding: "8px 10px", borderRadius: 7, fontSize: 11,
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
              color: "rgba(255,255,255,0.5)", lineHeight: 1.6,
            }}>
              {parseErrors.map(e => (
                <div key={e.lineNumber}>
                  <span style={{ color: "#F87171", fontWeight: 600 }}>Line {e.lineNumber}:</span>{" "}
                  {e.reason} <span style={{ fontFamily: "monospace", opacity: 0.6 }}>({e.raw})</span>
                </div>
              ))}
            </div>
          )}

          {/* Preview rows */}
          {holdings.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "28px 1fr 60px 28px",
                gap: 8, padding: "2px 10px",
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.07em", color: "rgba(255,255,255,0.25)",
              }}>
                <span/>
                <span>Ticker</span>
                <span style={{ textAlign: "right" }}>Alloc.</span>
                <span/>
              </div>

              {holdings.map(h => (
                <PreviewRow
                  key={h.ticker}
                  holding={h}
                  displayWeight={weightMap[h.ticker] ?? 0}
                  validation={validationMap[h.ticker] ?? "idle"}
                  validating={validating && (validationMap[h.ticker] === "pending" || !(h.ticker in validationMap))}
                  onRemove={() => removeRow(h.ticker)}
                />
              ))}

              {/* Weight total indicator */}
              {normalised.length > 0 && (
                <div style={{
                  display: "flex", justifyContent: "flex-end",
                  padding: "3px 10px", fontSize: 10,
                  color: "rgba(255,255,255,0.25)",
                }}>
                  Total: {normalised.reduce((s, w) => s + w.weight, 0).toFixed(1)}%
                  {" "}<span style={{ opacity: 0.5 }}>(will be normalised to 100%)</span>
                </div>
              )}
            </div>
          )}

          {/* Action row */}
          {holdings.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
              {anyInvalid && allChecked && (
                <button onClick={removeInvalid} style={{
                  fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 7,
                  background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
                  color: "#F87171", cursor: "pointer",
                }}>
                  Remove invalid
                </button>
              )}
              <button
                onClick={handleLoad}
                disabled={!canLoad}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12,
                  fontWeight: 700, cursor: canLoad ? "pointer" : "not-allowed",
                  border: "1px solid rgba(94,106,210,0.4)",
                  background: canLoad ? "rgba(94,106,210,0.18)" : "rgba(255,255,255,0.04)",
                  color: canLoad ? "#9DA5E8" : "rgba(255,255,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => canLoad && (e.currentTarget.style.background = "rgba(94,106,210,0.28)")}
                onMouseLeave={e => canLoad && (e.currentTarget.style.background = "rgba(94,106,210,0.18)")}
              >
                {loadSuccess ? (
                  <>
                    <svg viewBox="0 0 16 16" fill="none" stroke="#4CB782" strokeWidth={2} style={{ width: 12, height: 12 }}>
                      <polyline points="2,8 6,12 14,4" />
                    </svg>
                    Loaded — analysing…
                  </>
                ) : validating ? (
                  <><Spinner /> Validating tickers…</>
                ) : (
                  <>Analyze portfolio →</>
                )}
              </button>
            </div>
          )}

          {/* Format hint */}
          {!holdings.length && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", lineHeight: 1.6, margin: 0 }}>
              Formats: <code style={{ fontFamily: "monospace" }}>AAPL 40</code>,{" "}
              <code style={{ fontFamily: "monospace" }}>MSFT, 30%</code>,{" "}
              <code style={{ fontFamily: "monospace" }}>NVDA 200 shares</code>
            </p>
          )}
        </div>
      )}

      {/* ── CSV TAB ───────────────────────────────────────────────────────── */}
      {tab === "csv" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault(); setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "28px 16px", borderRadius: 10, cursor: "pointer",
              textAlign: "center", transition: "all 0.15s",
              background: isDragging ? "rgba(94,106,210,0.12)" : "rgba(255,255,255,0.025)",
              border: `2px dashed ${isDragging ? "rgba(94,106,210,0.5)" : "rgba(255,255,255,0.1)"}`,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5}
                 style={{ width: 28, height: 28, margin: "0 auto 8px", display: "block" }}>
              <polyline points="16 16 12 12 8 16" />
              <line x1={12} y1={12} x2={12} y2={21} />
              <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
            </svg>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: "0 0 4px" }}>
              Drop CSV here or click to browse
            </p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", margin: 0 }}>
              Columns: Ticker + Weight  or  Ticker + Shares
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file" accept=".csv,.tsv,.txt" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {/* Re-use the same preview if holdings exist (populated by handleFile) */}
          {holdings.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "28px 1fr 60px 28px",
                gap: 8, padding: "2px 10px",
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.07em", color: "rgba(255,255,255,0.25)",
              }}>
                <span/><span>Ticker</span><span style={{ textAlign: "right" }}>Alloc.</span><span/>
              </div>
              {holdings.map(h => (
                <PreviewRow
                  key={h.ticker}
                  holding={h}
                  displayWeight={weightMap[h.ticker] ?? 0}
                  validation={validationMap[h.ticker] ?? "idle"}
                  validating={validating && (validationMap[h.ticker] === "pending")}
                  onRemove={() => removeRow(h.ticker)}
                />
              ))}
            </div>
          )}

          {holdings.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {anyInvalid && allChecked && (
                <button onClick={removeInvalid} style={{
                  fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 7,
                  background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
                  color: "#F87171", cursor: "pointer",
                }}>Remove invalid</button>
              )}
              <button
                onClick={handleLoad} disabled={!canLoad}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12,
                  fontWeight: 700, cursor: canLoad ? "pointer" : "not-allowed",
                  border: "1px solid rgba(94,106,210,0.4)",
                  background: canLoad ? "rgba(94,106,210,0.18)" : "rgba(255,255,255,0.04)",
                  color: canLoad ? "#9DA5E8" : "rgba(255,255,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {loadSuccess ? "Loaded — analysing…" : validating ? <><Spinner /> Validating…</> : "Analyze portfolio →"}
              </button>
            </div>
          )}

          {/* Example CSV download */}
          <a
            href="data:text/csv;charset=utf-8,Ticker,Weight%0AAPL,40%0AMSFT,30%0ANVDA,30"
            download="example-portfolio.csv"
            style={{ fontSize: 10, color: "rgba(94,106,210,0.6)", textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#818CF8")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(94,106,210,0.6)")}
          >
            ↓ Download example CSV
          </a>
        </div>
      )}

      {/* ── MANUAL TAB ────────────────────────────────────────────────────── */}
      {tab === "manual" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Ticker text input (comma-separated) */}
          <div>
            <label style={{
              display: "block", fontSize: 11, fontWeight: 600,
              color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: 5,
            }}>
              Asset Tickers
            </label>
            <input
              type="text" value={tickers}
              onChange={e => onTickersChange(e.target.value)}
              placeholder="AAPL, MSFT, NVDA, BTC-USD"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                fontSize: 12, background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)", color: "#F2F2F7",
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => (e.target.style.borderColor = "rgba(94,106,210,0.5)")}
              onBlur={e  => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
              NYSE / NASDAQ / Crypto (BTC-USD, ETH-USD)
            </p>
          </div>

          {/* Weight editor */}
          <WeightEditor assets={assets} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
