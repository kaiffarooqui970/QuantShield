"use client";
import React, { useState } from "react";
import { useAuth } from "@/lib/auth-context";

const TIER_STYLES = {
  free:       { label: "Free",       color: "#94a3b8", bg: "rgba(148,163,184,0.1)",  border: "rgba(148,163,184,0.2)" },
  pro:        { label: "Pro",        color: "#06b6d4", bg: "rgba(6,182,212,0.1)",    border: "rgba(6,182,212,0.25)"  },
  enterprise: { label: "Enterprise", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.25)" },
};

export default function Navbar() {
  const { user, tier, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const tierStyle = TIER_STYLES[tier];

  return (
    <nav
      className="relative z-20 w-full border-b"
      style={{
        background: "rgba(3,7,18,0.85)",
        borderColor: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-4 h-4">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span
            className="text-lg font-extrabold hidden sm:block"
            style={{
              background: "linear-gradient(90deg, #e2e8f0, #94a3b8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            QuantShield<span style={{ WebkitTextFillColor: "#06b6d4" }}>AI</span>
          </span>
        </a>

        {/* Right side */}
        {loading ? (
          <div className="w-24 h-8 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
        ) : user ? (
          <div className="flex items-center gap-3 relative">
            {/* Tier badge */}
            <span
              className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
              style={{ background: tierStyle.bg, border: `1px solid ${tierStyle.border}`, color: tierStyle.color }}
            >
              {tierStyle.label}
            </span>

            {/* Avatar button */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
              >
                {user.email?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span className="text-sm text-slate-300 hidden md:block max-w-[140px] truncate">
                {user.email}
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2} className="w-3.5 h-3.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div
                className="absolute top-full right-0 mt-2 w-52 rounded-2xl border overflow-hidden"
                style={{ background: "rgba(10,15,30,0.98)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}
              >
                <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: tierStyle.color }}>
                    {tierStyle.label} Plan
                  </p>
                </div>
                <div className="py-1">
                  <a
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                    style={{  }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <circle cx={12} cy={12} r={3} /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                    </svg>
                    Settings & Billing
                  </a>
                  <button
                    onClick={() => { setMenuOpen(false); signOut(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 transition-all hover:text-white"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}
            >
              Login
            </a>
            <a
              href="/register"
              className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.03]"
              style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)", boxShadow: "0 0 18px rgba(6,182,212,0.25)" }}
            >
              Get Started
            </a>
          </div>
        )}
      </div>
    </nav>
  );
}
