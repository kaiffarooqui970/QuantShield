"use client";
import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!code) {
      router.replace("/");
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) {
        router.replace(`/login?error=${encodeURIComponent(exchangeError.message)}`);
        return;
      }
      router.replace("/");
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#030712" }}>
      <p className="text-slate-400 text-sm">Completing sign-in…</p>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "#030712" }} />}>
      <CallbackHandler />
    </Suspense>
  );
}
