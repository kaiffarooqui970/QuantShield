"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    color: "#94a3b8",
    features: ["3 simulations / day", "Risk Score + VaR", "Monte Carlo (30 days)", "S&P 500 benchmark only"],
    priceId: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/ month",
    color: "#06b6d4",
    features: [
      "Unlimited simulations",
      "All 6 risk metrics",
      "Full 252-day Monte Carlo",
      "All 6 benchmarks",
      "Correlation heatmap",
      "AI narrative (Claude)",
      "Behavioural Risk Gap quiz",
      "PDF export",
    ],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$99",
    period: "/ month",
    color: "#8b5cf6",
    features: [
      "Everything in Pro",
      "Advanced Analytics tab",
      "Crash Survival Probability",
      "Regime badge (VIX-based)",
      "REST API key",
      "White-label PDF export",
    ],
    priceId: process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID,
  },
];

// Show only prefix + suffix of a secret key. Never log or store the full key after init.
function maskKey(k: string): string {
  if (k.length <= 12) return k.slice(0, 4) + "…" + k.slice(-4);
  return k.slice(0, 6) + "…" + k.slice(-4);
}

function SettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, tier, loading, refreshTier, getToken } = useAuth();
  // maskedKey: what we persist in state (never the full secret after load)
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  // rawNewKey: full key shown ONCE immediately after generation, then cleared
  const [rawNewKey, setRawNewKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"success" | "cancel" | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading]);

  useEffect(() => {
    const status = searchParams.get("payment");
    if (status === "success") {
      setPaymentStatus("success");
      refreshTier();
    } else if (status === "cancel") {
      setPaymentStatus("cancel");
    }
  }, []);

  useEffect(() => {
    if (tier === "enterprise" && user) {
      supabase
        .from("profiles")
        .select("api_key")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          // Always mask the key when loading from DB — never expose the full secret again.
          if (data?.api_key) setMaskedKey(maskKey(data.api_key));
        });
    }
  }, [tier, user]);

  const handleUpgrade = async (priceId: string, planId: string) => {
    if (!user) return;
    setCheckoutLoading(planId);

    const token = await getToken();
    const res = await fetch("/backend/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ price_id: priceId }),
    });

    if (!res.ok) {
      setCheckoutLoading(null);
      return;
    }

    const { url } = await res.json();
    window.location.href = url;
  };

  const generateApiKey = async () => {
    const token = await getToken();
    const res = await fetch("/backend/api/settings/api-key", {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (res.ok) {
      const { api_key } = await res.json();
      // Show the full key ONCE in the one-time-reveal banner; store masked for display.
      setRawNewKey(api_key);
      setMaskedKey(maskKey(api_key));
      setKeyCopied(false);
    }
  };

  const handleCopyNewKey = () => {
    if (!rawNewKey) return;
    navigator.clipboard.writeText(rawNewKey);
    setKeyCopied(true);
    // Clear the raw key after copy — it won't be shown again.
    setTimeout(() => { setRawNewKey(null); setKeyCopied(false); }, 2000);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#030712" }}>
        <svg className="w-6 h-6 animate-spin text-cyan-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ background: "#030712" }}>
      <div className="max-w-4xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-bold text-white mb-1">Settings & Billing</h1>
        <p className="text-slate-500 text-sm mb-10">Manage your plan and account settings</p>

        {/* Payment status banner */}
        {paymentStatus === "success" && (
          <div className="mb-8 rounded-2xl border border-emerald-900/40 px-5 py-4 flex items-center gap-3"
            style={{ background: "rgba(16,185,129,0.06)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2.5} className="w-5 h-5 shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p className="text-emerald-400 text-sm font-medium">
              Payment successful! Your plan has been upgraded. It may take a few seconds to reflect.
            </p>
          </div>
        )}
        {paymentStatus === "cancel" && (
          <div className="mb-8 rounded-2xl border border-slate-700 px-5 py-4"
            style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-slate-400 text-sm">Checkout was cancelled. Your plan was not changed.</p>
          </div>
        )}

        {/* Current plan */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Current Plan</h2>
          <div className="rounded-2xl border p-5 flex items-center justify-between"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
            <div>
              <p className="font-bold text-white capitalize">{tier}</p>
              <p className="text-slate-500 text-sm">{user.email}</p>
            </div>
            <span
              className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
              style={{
                background: tier === "enterprise" ? "rgba(139,92,246,0.12)" : tier === "pro" ? "rgba(6,182,212,0.12)" : "rgba(148,163,184,0.1)",
                border: `1px solid ${tier === "enterprise" ? "rgba(139,92,246,0.3)" : tier === "pro" ? "rgba(6,182,212,0.3)" : "rgba(148,163,184,0.2)"}`,
                color: tier === "enterprise" ? "#a78bfa" : tier === "pro" ? "#22d3ee" : "#94a3b8",
              }}
            >
              {tier}
            </span>
          </div>
        </section>

        {/* Plans */}
        <section id="upgrade" className="mb-10">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = tier === plan.id;
              const isDowngrade = ["free", "pro", "enterprise"].indexOf(tier) > ["free", "pro", "enterprise"].indexOf(plan.id);
              return (
                <div
                  key={plan.id}
                  className="rounded-2xl border p-6 flex flex-col gap-4"
                  style={{
                    background: isCurrent ? `${plan.color}0a` : "rgba(255,255,255,0.02)",
                    borderColor: isCurrent ? `${plan.color}40` : "rgba(255,255,255,0.07)",
                  }}
                >
                  <div>
                    <p className="font-bold text-white">{plan.name}</p>
                    <p className="text-2xl font-extrabold mt-1" style={{ color: plan.color }}>
                      {plan.price}
                      <span className="text-sm font-normal text-slate-500 ml-1">{plan.period}</span>
                    </p>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-slate-400">
                        <svg viewBox="0 0 24 24" fill="none" stroke={plan.color} strokeWidth={2.5}
                          className="w-3.5 h-3.5 shrink-0 mt-0.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <div className="mt-auto py-2 rounded-xl text-center text-xs font-bold"
                      style={{ background: `${plan.color}15`, color: plan.color }}>
                      Current Plan
                    </div>
                  ) : plan.priceId && !isDowngrade ? (
                    <button
                      onClick={() => handleUpgrade(plan.priceId!, plan.id)}
                      disabled={!!checkoutLoading}
                      className="mt-auto py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
                      style={{ background: `linear-gradient(135deg, ${plan.color}cc, ${plan.color}88)` }}
                    >
                      {checkoutLoading === plan.id ? "Redirecting…" : `Upgrade to ${plan.name}`}
                    </button>
                  ) : (
                    <div className="mt-auto py-2 rounded-xl text-center text-xs text-slate-600">
                      {isDowngrade ? "Contact support to downgrade" : "Free forever"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Enterprise API Key */}
        {tier === "enterprise" && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">REST API Key</h2>
            <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(139,92,246,0.2)" }}>

              {/* One-time reveal banner — shown only immediately after generation */}
              {rawNewKey && (
                <div className="rounded-xl border p-4 flex flex-col gap-3"
                  style={{ background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.3)" }}>
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2} className="w-4 h-4 shrink-0">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <p className="text-xs font-semibold text-emerald-400">Your new API key — copy it now. It won't be shown again.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 rounded-lg px-3 py-2 text-sm font-mono text-emerald-300 break-all"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                      {rawNewKey}
                    </code>
                    <button
                      onClick={handleCopyNewKey}
                      className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all"
                      style={{ background: keyCopied ? "#10b981" : "linear-gradient(135deg, #10b981, #059669)" }}
                    >
                      {keyCopied ? "Copied!" : "Copy & Hide"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Treat this like a password. Store it in a secrets manager. We store only a masked version.
                  </p>
                </div>
              )}

              {/* Masked key (always shown when a key exists) */}
              {maskedKey ? (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Active API key</p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-500 tracking-widest"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {maskedKey}
                    </code>
                    <button
                      onClick={generateApiKey}
                      className="shrink-0 px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Rotate
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-2">
                    The full key is only visible once at generation time. Rotating creates a new key and invalidates the old one.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-slate-400">Generate your REST API key to integrate QuantShield into your systems.</p>
                  <button
                    onClick={generateApiKey}
                    className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02]"
                    style={{ background: "linear-gradient(135deg, #8b5cf6, #6d28d9)" }}
                  >
                    Generate Key
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#030712" }}>
        <svg className="w-6 h-6 animate-spin text-cyan-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    }>
      <SettingsInner />
    </Suspense>
  );
}
