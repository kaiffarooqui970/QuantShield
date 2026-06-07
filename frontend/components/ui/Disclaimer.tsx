// Non-advice disclaimer — must appear anywhere output could be interpreted as
// a portfolio recommendation.

interface DisclaimerProps {
  compact?: boolean;
}

export default function Disclaimer({ compact = false }: DisclaimerProps) {
  if (compact) {
    return (
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", lineHeight: 1.5, margin: 0 }}>
        For educational &amp; analytical purposes only — not investment advice.
      </p>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "9px 12px", borderRadius: 7,
      background: "rgba(245,158,11,0.07)",
      border: "1px solid rgba(245,158,11,0.18)",
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={1.8}
           style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1={12} y1={9} x2={12} y2={13}/><line x1={12} y1={17} x2="12.01" y2={17}/>
      </svg>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.55, margin: 0 }}>
        <strong style={{ color: "rgba(245,158,11,0.7)", fontWeight: 600 }}>Disclaimer: </strong>
        All outputs are for educational and analytical purposes only.
        Nothing here constitutes investment advice, a solicitation, or a recommendation
        to buy, sell, or hold any security. Past performance and simulated results
        do not guarantee future returns. Consult a licensed financial adviser before
        making investment decisions.
      </p>
    </div>
  );
}
