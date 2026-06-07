// Portfolio import parsing — pure TypeScript, no I/O.
// Handles paste input and CSV files. No network calls here.

export interface ParsedHolding {
  ticker: string;
  rawValue: number;
  mode: "weight" | "shares";
  rawLine: string;
}

export interface ParseError {
  lineNumber: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  holdings: ParsedHolding[];
  errors: ParseError[];
}

// Lines that look like column headers — skip silently
const HEADER_RE = /^(ticker|symbol|stock|asset|name|weight|allocation|shares?|qty|quantity|percent)/i;
// Comment lines — skip silently
const COMMENT_RE = /^\s*[#/]/;

/**
 * Parse free-form paste input.
 *
 * Accepted formats (delimiter: comma, space, or tab):
 *   AAPL 40          → weight 40  (normalised to 100% later)
 *   AAPL, 40%        → weight 40
 *   MSFT 30.5        → weight 30.5
 *   BTC-USD 100      → weight 100
 *   NVDA 200 shares  → shares 200
 *   TSLA	15.0       → tab-separated weight
 */
export function parsePasteInput(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const holdings: ParsedHolding[] = [];
  const errors: ParseError[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || COMMENT_RE.test(raw) || HEADER_RE.test(raw)) continue;

    // Ticker: 1–4 letters, optionally followed by . or - and more chars (e.g. BRK.B, BTC-USD)
    const m = raw.match(
      /^([A-Za-z][A-Za-z0-9.\-]{0,11})[,\s\t]+([0-9]+(?:\.[0-9]+)?)([%]?)([\s,]*(shares?|units?))?/i
    );

    if (!m) {
      errors.push({ lineNumber: i + 1, raw, reason: "Expected: TICKER WEIGHT  or  TICKER, WEIGHT%" });
      continue;
    }

    const ticker = m[1].toUpperCase();
    const value  = parseFloat(m[2]);
    const isShares = /shares?|units?/i.test(m[5] ?? "");

    if (isNaN(value) || value < 0) {
      errors.push({ lineNumber: i + 1, raw, reason: "Invalid number" });
      continue;
    }

    if (seen.has(ticker)) {
      errors.push({ lineNumber: i + 1, raw, reason: `Duplicate ticker ${ticker} — only the first occurrence is used` });
      continue;
    }
    seen.add(ticker);

    holdings.push({ ticker, rawValue: value, mode: isShares ? "shares" : "weight", rawLine: raw });
  }

  return { holdings, errors };
}

/**
 * Parse a CSV string.
 *
 * Recognised column names (case-insensitive):
 *   Ticker columns : ticker, symbol, stock, asset, name
 *   Weight columns : weight, allocation, percent, percentage, %
 *   Shares columns : shares, quantity, qty, units
 *
 * If no recognisable headers are found, falls back to positional parsing
 * (col 0 = ticker, col 1 = value).
 */
export function parseCSV(content: string): ParseResult {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { holdings: [], errors: [] };

  // Detect delimiter: comma or tab
  const delim = lines[0].includes("\t") ? "\t" : ",";

  const rawHeaders = lines[0].split(delim).map(h => h.replace(/["']/g, "").trim().toLowerCase());

  const tickerCol  = rawHeaders.findIndex(h => /ticker|symbol|stock|asset|^name$/.test(h));
  const weightCol  = rawHeaders.findIndex(h => /weight|allocation|percent(age)?|^%$/.test(h));
  const sharesCol  = rawHeaders.findIndex(h => /shares?|quantity|qty|units?/.test(h));

  // If no headers found, attempt positional paste-style parse on all rows
  if (tickerCol < 0) {
    return parsePasteInput(lines.join("\n"));
  }

  const valueCol = weightCol >= 0 ? weightCol : sharesCol >= 0 ? sharesCol : -1;
  if (valueCol < 0) {
    return {
      holdings: [],
      errors: [{ lineNumber: 1, raw: lines[0], reason: "No weight/shares column found. Add a 'Weight' or 'Shares' column." }],
    };
  }

  const mode: "weight" | "shares" = weightCol >= 0 ? "weight" : "shares";
  const holdings: ParsedHolding[] = [];
  const errors: ParseError[]      = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols   = lines[i].split(delim).map(c => c.replace(/["']/g, "").trim());
    const ticker = cols[tickerCol]?.toUpperCase();
    const rawVal = cols[valueCol]?.replace(/[%,\s]/g, "");
    const value  = parseFloat(rawVal ?? "");

    if (!ticker) continue;
    if (isNaN(value)) {
      errors.push({ lineNumber: i + 1, raw: lines[i], reason: `Cannot parse value "${cols[valueCol]}"` });
      continue;
    }
    if (seen.has(ticker)) {
      errors.push({ lineNumber: i + 1, raw: lines[i], reason: `Duplicate ticker ${ticker}` });
      continue;
    }
    seen.add(ticker);
    holdings.push({ ticker, rawValue: value, mode, rawLine: lines[i] });
  }

  return { holdings, errors };
}

/**
 * Convert parsed holdings (weight mode) to normalised 0–100 weights.
 * Shares mode is left for the caller to handle after price data is available.
 */
export function toNormalisedWeights(
  holdings: ParsedHolding[]
): { ticker: string; weight: number }[] {
  const ws = holdings.filter(h => h.mode === "weight");
  const total = ws.reduce((s, h) => s + h.rawValue, 0);
  if (total === 0) return ws.map(h => ({ ticker: h.ticker, weight: 100 / ws.length }));
  return ws.map(h => ({
    ticker: h.ticker,
    weight: Math.round((h.rawValue / total) * 1000) / 10, // 1 decimal, 0–100 scale
  }));
}
