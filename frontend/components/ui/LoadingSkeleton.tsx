"use client";

// Animated shimmer skeleton for loading states.
// Usage: <LoadingSkeleton lines={3} /> or <LoadingSkeleton width="60%" height={20} />

interface SkeletonProps {
  width?: string | number;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export function Skeleton({ width = "100%", height = 14, borderRadius = 4, className }: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
        backgroundSize: "200% 100%",
        animation: "qs-shimmer 1.6s ease-in-out infinite",
      }}
    />
  );
}

interface LoadingSkeletonProps {
  lines?: number;
  gap?: number;
}

export default function LoadingSkeleton({ lines = 3, gap = 8 }: LoadingSkeletonProps) {
  const widths = ["100%", "85%", "70%", "90%", "60%"];
  return (
    <>
      <style>{`
        @keyframes qs-shimmer {
          0%   { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} width={widths[i % widths.length]} />
        ))}
      </div>
    </>
  );
}
