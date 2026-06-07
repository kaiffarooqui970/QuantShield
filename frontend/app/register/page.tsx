"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const getRedirectUrl = () => `${window.location.origin}/auth/callback`;

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
    const { data, error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    if (err) { setError(err.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from("profiles").upsert(
        { id: data.user.id, email, full_name: fullName, tier: "free" },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (data.session) router.replace("/");
      else setSuccess(true);
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getRedirectUrl() },
    });
    if (err) { setError(err.message); setGoogleLoading(false); }
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0D10", padding: 24 }}>
        <div style={{
          maxWidth: 400, width: "100%", padding: "40px 32px",
          background: "var(--qs-surface)", border: "1px solid rgba(76,183,130,0.25)",
          borderRadius: 12, textAlign: "center",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px",
            background: "var(--qs-green-bg)", border: "1px solid rgba(76,183,130,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--qs-green)" strokeWidth={2.5} style={{ width: 22, height: 22 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--qs-text)", margin: "0 0 8px" }}>Check your email</h2>
          <p style={{ fontSize: 13, color: "var(--qs-text-2)", margin: "0 0 20px", lineHeight: 1.6 }}>
            We sent a confirmation link to <strong style={{ color: "var(--qs-text)" }}>{email}</strong>. Click it to activate your account.
          </p>
          <a href="/login" style={{ fontSize: 13, color: "var(--qs-accent)", textDecoration: "none" }}>
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 7,
    background: "rgba(255,255,255,0.04)", border: "1px solid var(--qs-border-md)",
    color: "var(--qs-text)", fontSize: 13, outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0D10", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, justifyContent: "center" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "linear-gradient(135deg, #5E6AD2, #8B5CF6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} style={{ width: 14, height: 14 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--qs-text)" }}>QuantShield AI</span>
        </div>

        <div style={{
          background: "var(--qs-surface)", border: "1px solid var(--qs-border)",
          borderRadius: 12, padding: "28px 28px 24px",
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--qs-text)", margin: "0 0 4px" }}>Create account</h1>
          <p style={{ fontSize: 13, color: "var(--qs-text-2)", margin: "0 0 24px" }}>Free forever · No card required</p>

          {/* Google */}
          <button
            onClick={handleGoogle} disabled={googleLoading}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              width: "100%", padding: "10px 16px", borderRadius: 7, marginBottom: 18,
              background: "rgba(255,255,255,0.05)", border: "1px solid var(--qs-border-md)",
              color: "var(--qs-text)", fontSize: 13, fontWeight: 500, cursor: "pointer",
              opacity: googleLoading ? 0.6 : 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          >
            {googleLoading ? (
              <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none">
                <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} style={{ opacity: 0.25 }} />
                <path fill="currentColor" style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }} fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: "var(--qs-border)" }} />
            <span style={{ fontSize: 11, color: "var(--qs-text-3)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--qs-border)" }} />
          </div>

          <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Full Name",  type: "text",     val: fullName,  set: setFullName,  placeholder: "Jane Smith",        minLen: undefined },
              { label: "Email",      type: "email",    val: email,     set: setEmail,     placeholder: "you@example.com",   minLen: undefined },
              { label: "Password",   type: "password", val: password,  set: setPassword,  placeholder: "Min 8 characters",  minLen: 8 },
            ].map(f => (
              <div key={f.label}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--qs-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                  {f.label}
                </label>
                <input
                  type={f.type} value={f.val} required
                  minLength={f.minLen}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = "var(--qs-accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--qs-border-md)")}
                />
              </div>
            ))}

            {error && (
              <div style={{ padding: "9px 12px", borderRadius: 6, fontSize: 12, color: "#F87171", background: "var(--qs-red-bg)", border: "1px solid rgba(229,72,77,0.2)" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              padding: "10px 16px", borderRadius: 7, fontWeight: 600,
              fontSize: 13, color: "white", cursor: "pointer",
              background: "var(--qs-accent)", border: "1px solid rgba(94,106,210,0.6)",
              opacity: loading ? 0.7 : 1,
              boxShadow: "0 1px 8px rgba(94,106,210,0.25)",
            }}>
              {loading ? "Creating account…" : "Create Free Account"}
            </button>
          </form>

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--qs-border)" }}>
            {["3 simulations/day free", "Monte Carlo risk engine", "AI Copilot access"].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--qs-green)" strokeWidth={2.5} style={{ width: 12, height: 12, flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ fontSize: 12, color: "var(--qs-text-3)" }}>{f}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: "var(--qs-text-3)", marginTop: 16, textAlign: "center" }}>
            Already have an account?{" "}
            <a href="/login" style={{ color: "var(--qs-accent)", textDecoration: "none", fontWeight: 500 }}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
