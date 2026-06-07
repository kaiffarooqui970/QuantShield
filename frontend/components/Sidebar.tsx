"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  Shield:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Simulate: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Stress:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  Frontier: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Backtest: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Advanced: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>,
  Settings: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  Chevron:  () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>,
  SignOut:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  Copilot:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
};

const NAV = [
  { id: "simulate",  label: "Simulate",          Icon: I.Simulate,  shortcut: "S" },
  { id: "stress",    label: "Stress Test",        Icon: I.Stress,    shortcut: "T" },
  { id: "frontier",  label: "Efficient Frontier", Icon: I.Frontier,  shortcut: "F" },
  { id: "backtest",  label: "Backtest",            Icon: I.Backtest,  shortcut: "B" },
  { id: "advanced",  label: "Advanced Analytics", Icon: I.Advanced,  shortcut: "A" },
];

const TIER_META = {
  free:       { label: "Free",       color: "#8B8D97", bg: "rgba(139,141,151,0.12)" },
  pro:        { label: "Pro",        color: "#5E6AD2", bg: "rgba(94,106,210,0.15)"  },
  enterprise: { label: "Ent",        color: "#8B5CF6", bg: "rgba(139,92,246,0.15)"  },
};

function NavItem({
  id, label, Icon, shortcut, active, onClick,
}: { id: string; label: string; Icon: () => React.ReactElement; shortcut: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="qs-nav-item"
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "5px 8px", borderRadius: 5, marginBottom: 1,
        background: active ? "rgba(255,255,255,0.07)" : "transparent",
        border: "none", cursor: "pointer", transition: "background 0.1s",
        textDecoration: "none",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.035)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ color: active ? "#F2F2F7" : "#8B8D97", display: "flex", flexShrink: 0 }}>
        <Icon />
      </span>
      <span style={{ fontSize: 13, fontWeight: active ? 500 : 400, color: active ? "#F2F2F7" : "#8B8D97", flex: 1, textAlign: "left" }}>
        {label}
      </span>
      <kbd className="qs-shortcut" style={{ fontSize: 11, color: "#4E515C", background: "none", border: "none", fontFamily: "inherit" }}>
        {shortcut}
      </kbd>
    </button>
  );
}

function SidebarBody() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user, tier, loading, signOut } = useAuth();
  const [userOpen, setUserOpen] = useState(false);

  const isAuth = pathname === "/login" || pathname === "/register" || pathname?.startsWith("/auth");
  if (isAuth) return null;

  const activeTab = pathname === "/settings"
    ? "settings"
    : (searchParams.get("tab") ?? "simulate");

  const tm = TIER_META[(tier as keyof typeof TIER_META)] ?? TIER_META.free;

  return (
    <aside style={{
      width: 220, minWidth: 220,
      background: "var(--qs-sidebar)",
      borderRight: "1px solid var(--qs-border)",
      display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0,
      userSelect: "none",
    }}>
      {/* ── Workspace ── */}
      <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid var(--qs-border)" }}>
        <button
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            padding: "5px 8px", borderRadius: 6, background: "transparent",
            border: "none", cursor: "pointer", transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 5, flexShrink: 0,
            background: "linear-gradient(135deg, #5E6AD2, #8B5CF6)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "white",
          }}>
            <I.Shield />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--qs-text)", flex: 1, textAlign: "left" }}>
            QuantShield
          </span>
          <span style={{ color: "var(--qs-text-3)" }}><I.Chevron /></span>
        </button>
      </div>

      {/* ── Nav ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px 8px" }}>
        <p style={{
          fontSize: 11, fontWeight: 600, color: "var(--qs-text-3)",
          textTransform: "uppercase", letterSpacing: "0.065em",
          padding: "6px 8px 4px", margin: 0,
        }}>
          Analysis
        </p>
        {NAV.map(item => (
          <NavItem
            key={item.id}
            id={item.id}
            label={item.label}
            Icon={item.Icon}
            shortcut={item.shortcut}
            active={activeTab === item.id}
            onClick={() => router.push(`/?tab=${item.id}`)}
          />
        ))}

        <p style={{
          fontSize: 11, fontWeight: 600, color: "var(--qs-text-3)",
          textTransform: "uppercase", letterSpacing: "0.065em",
          padding: "14px 8px 4px", margin: 0,
        }}>
          Account
        </p>
        <NavItem
          id="settings"
          label="Settings & Billing"
          Icon={I.Settings}
          shortcut=","
          active={activeTab === "settings"}
          onClick={() => router.push("/settings")}
        />
      </div>

      {/* ── User footer ── */}
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--qs-border)", position: "relative" }}>
        {loading ? (
          <div className="skeleton" style={{ height: 34 }} />
        ) : user ? (
          <>
            <button
              onClick={() => setUserOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 8px", borderRadius: 6, background: "transparent",
                border: "none", cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, #5E6AD2, #8B5CF6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "white",
              }}>
                {user.email?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span style={{
                fontSize: 12, color: "var(--qs-text-2)", flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left",
              }}>
                {user.email}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                background: tm.bg, color: tm.color,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {tm.label}
              </span>
            </button>

            {userOpen && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 4px)", left: 10, right: 10,
                background: "#1C1C21", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, overflow: "hidden",
                boxShadow: "0 8px 32px rgba(0,0,0,0.7)", zIndex: 50,
              }}>
                <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--qs-border)" }}>
                  <p style={{ fontSize: 12, color: "var(--qs-text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.email}
                  </p>
                  <p style={{ fontSize: 11, color: tm.color, fontWeight: 600, margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {tm.label} Plan
                  </p>
                </div>
                {[
                  { label: "Settings & Billing", icon: <I.Settings />, onClick: () => { setUserOpen(false); router.push("/settings"); }, danger: false },
                  { label: "Sign out", icon: <I.SignOut />, onClick: () => { setUserOpen(false); signOut(); }, danger: true },
                ].map(item => (
                  <button key={item.label}
                    onClick={item.onClick}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "8px 12px", background: "transparent", border: "none",
                      cursor: "pointer", color: "var(--qs-text-2)", fontSize: 13, transition: "all 0.1s",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      e.currentTarget.style.color = item.danger ? "#E5484D" : "var(--qs-text)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--qs-text-2)";
                    }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <a href="/login" style={{
              flex: 1, padding: "6px 8px", borderRadius: 5, textAlign: "center",
              fontSize: 12, fontWeight: 500, color: "var(--qs-text-2)",
              border: "1px solid var(--qs-border-md)", textDecoration: "none",
            }}>
              Login
            </a>
            <a href="/register" style={{
              flex: 1, padding: "6px 8px", borderRadius: 5, textAlign: "center",
              fontSize: 12, fontWeight: 600, color: "white",
              background: "var(--qs-accent)", textDecoration: "none",
              border: "1px solid transparent",
            }}>
              Sign up
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function Sidebar() {
  return (
    <Suspense fallback={
      <div style={{
        width: 220, minWidth: 220, background: "var(--qs-sidebar)",
        borderRight: "1px solid var(--qs-border)", height: "100vh",
      }} />
    }>
      <SidebarBody />
    </Suspense>
  );
}
