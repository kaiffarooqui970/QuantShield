"use client";
import React from "react";
import { useAuth, type Tier } from "@/lib/auth-context";

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, enterprise: 2 };

const PLAN_LABELS: Record<Tier, { label: string; price: string; color: string; bg: string; border: string }> = {
  free:       { label: "Free",       price: "$0/mo",   color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)" },
  pro:        { label: "Pro",        price: "$29/mo",  color: "#06b6d4", bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.25)"  },
  enterprise: { label: "Enterprise", price: "$99/mo",  color: "#8b5cf6", bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.25)" },
};

interface TierGateProps {
  requiredTier: "pro" | "enterprise";
  feature?: string;
  children: React.ReactNode;
}

export default function TierGate({ requiredTier, feature, children }: TierGateProps) {
  const { tier } = useAuth();

  if (TIER_RANK[tier] >= TIER_RANK[requiredTier]) {
    return <>{children}</>;
  }

  const plan = PLAN_LABELS[requiredTier];

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Blurred content — pointer-events off so it can't be interacted with */}
      <div style={{ filter: "blur(5px)", userSelect: "none", pointerEvents: "none" }}>
        {children}
      </div>

      {/* Upgrade overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ background: "rgba(3,7,18,0.72)", backdropFilter: "blur(2px)" }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: plan.bg, border: `1px solid ${plan.border}` }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke={plan.color} strokeWidth={2} className="w-4 h-4">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        {feature && (
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{feature}</p>
        )}

        <div>
          <p className="text-sm font-bold text-white">
            Requires{" "}
            <span style={{ color: plan.color }}>{plan.label}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{plan.price}</p>
        </div>

        <a
          href="/settings#upgrade"
          className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
          style={{ background: `linear-gradient(135deg, ${plan.color}cc, ${plan.color}88)`, border: `1px solid ${plan.border}` }}
        >
          Upgrade to {plan.label} →
        </a>
      </div>
    </div>
  );
}
