"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (errorParam) {
      setError(errorDescription ?? errorParam);
      return;
    }

    if (!code) {
      router.replace("/");
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(async ({ data, error: exchangeError }) => {
      if (exchangeError) {
        setError(`Google sign-in failed: ${exchangeError.message}`);
        return;
      }

      if (data.user) {
        // Create profile row if it doesn't exist yet
        await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            email: data.user.email,
            full_name: data.user.user_metadata?.full_name ?? null,
            tier: "free",
          },
          { onConflict: "id", ignoreDuplicates: true }
        );
      }

      router.replace("/");
    });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#030712" }}>
        <div className="rounded-2xl border border-red-900/50 p-8 max-w-md w-full mx-4"
          style={{ background: "rgba(239,68,68,0.06)" }}>
          <p className="text-red-400 font-semibold mb-2">Sign-in failed</p>
          <p className="text-red-300/70 text-sm">{error}</p>
          <a href="/login" className="mt-4 inline-block text-cyan-400 text-sm hover:underline">
            ← Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#030712" }}>
      <div className="flex flex-col items-center gap-4">
        <svg className="w-8 h-8 animate-spin text-cyan-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-slate-400 text-sm">Completing sign-in…</p>
      </div>
    </div>
  );
}
