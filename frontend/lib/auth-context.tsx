"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

export type Tier = "free" | "pro" | "enterprise";

// Always enterprise — no payment required. ID is more reliable than email across OAuth providers.
const ADMIN_EMAILS   = new Set(["kaif.farooqui10@gmail.com", "kaif.is.master@gmail.com"]);
const ADMIN_USER_IDS = new Set(["8b9a9543-138a-4686-9fab-2a266d6a4a06"]);

interface AuthContextType {
  user: User | null;
  tier: Tier;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshTier: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  tier: "free",
  loading: true,
  signOut: async () => {},
  refreshTier: async () => {},
  getToken: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tier, setTier] = useState<Tier>("free");
  const [loading, setLoading] = useState(true);

  const fetchTier = async (userId: string, email?: string) => {
    if (ADMIN_USER_IDS.has(userId) || (email && ADMIN_EMAILS.has(email))) {
      setTier("enterprise");
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("tier")
      .eq("id", userId)
      .single();
    setTier((data?.tier as Tier) ?? "free");
  };

  const refreshTier = async () => {
    if (user) await fetchTier(user.id);
  };

  const getToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  useEffect(() => {
    // Use async callback so we can await fetchTier before clearing the loading flag.
    // Without await, the page renders with tier="free" while fetchTier is still in flight,
    // causing paid users to briefly see gated/free-tier views.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) await fetchTier(session.user.id, session.user.email);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchTier(session.user.id, session.user.email);
        } else {
          setTier("free");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setTier("free");
  };

  return (
    <AuthContext.Provider value={{ user, tier, loading, signOut, refreshTier, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
