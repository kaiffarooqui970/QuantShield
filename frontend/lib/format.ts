// Centralised number / currency / percent formatting for QuantShield.
// All display-facing number rendering should go through these helpers so
// locale, precision, and sign conventions stay consistent across the app.

export const fmtUSD = (n: number, decimals = 0): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);

export const fmtPct = (n: number, decimals = 2, forceSign = true): string => {
  const sign = forceSign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
};

export const fmtNum = (n: number, decimals = 2): string => n.toFixed(decimals);

export const fmtCompact = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

// Returns a CSS colour string for a delta value.
// higherIsBetter=true  → positive = green, negative = red  (return, Sharpe…)
// higherIsBetter=false → negative = green, positive = red  (drawdown, VaR…)
export const deltaColor = (n: number, higherIsBetter = true): string => {
  const good = higherIsBetter ? n >= 0 : n <= 0;
  return good ? "#4CB782" : "#F87171";
};
