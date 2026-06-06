"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const REDIRECT_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback`
    : `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert(
        { id: data.user.id, email, full_name: fullName, tier: "free" },
        { onConflict: "id", ignoreDuplicates: true }
      );

      if (data.session) {
        router.replace("/");
      } else {
        setSuccess(true);
      }
    }

    setLoading(false);
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: REDIRECT_URL },
    });
    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#030712" }}>
        <div className="rounded-3xl border p-10 max-w-md w-full text-center" style={{
          background: "rgba(255,255,255,0.03)", borderColor: "rgba(16,185,129,0.25)",
        }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2.5} className="w-7 h-7">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
          <p className="text-slate-400 text-sm">
            We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
            Click it to activate your account.
          </p>
          <a href="/login" className="mt-6 inline-block text-cyan-400 text-sm hover:underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#030712" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[120px] opacity-15"
          style={{ width: 500, height: 500, top: -150, left: -100, background: "radial-gradient(circle, #06b6d4, transparent)" }} />
        <div className="absolute rounded-full blur-[120px] opacity-10"
          style={{ width: 400, height: 400, bottom: -100, right: -100, background: "radial-gradient(circle, #8b5cf6, transparent)" }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-5 h-5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span className="text-2xl font-extrabold" style={{
            background: "linear-gradient(90deg, #e2e8f0, #94a3b8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            QuantShield<span style={{ WebkitTextFillColor: "#06b6d4" }}>AI</span>
          </span>
        </div>

        <div className="rounded-3xl border p-8" style={{
          background: "rgba(255,255,255,0.03)",
          borderColor: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(16px)",
        }}>
          <h1 className="text-xl font-bold text-white mb-1">Create your account</h1>
          <p className="text-slate-500 text-sm mb-7">Free forever · No card required</p>

          {/* Google */}
          <button
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-medium text-sm transition-all hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed mb-6"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          >
            {googleLoading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
            <span className="text-slate-600 text-xs font-medium">or</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>

          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                onFocus={(e) => (e.target.style.borderColor = "#06b6d4")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                onFocus={(e) => (e.target.style.borderColor = "#06b6d4")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                minLength={8}
                required
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                onFocus={(e) => (e.target.style.borderColor = "#06b6d4")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs rounded-lg px-3 py-2"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)", boxShadow: "0 0 24px rgba(6,182,212,0.3)" }}
            >
              {loading ? "Creating account…" : "Create Free Account"}
            </button>
          </form>

          {/* Feature bullets */}
          <div className="mt-6 pt-6 border-t flex flex-col gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {["3 simulations/day free", "Monte Carlo risk engine", "AI Copilot access"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs text-slate-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2.5} className="w-3.5 h-3.5 shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {f}
              </div>
            ))}
          </div>

          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <a href="/login" className="text-cyan-400 font-medium hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
