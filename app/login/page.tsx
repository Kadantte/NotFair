"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Mail } from "lucide-react";
import { startGoogleConnect } from "@/lib/google-oauth";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#1A1917] text-[#E8E4DD] selection:bg-[#4CAF6E]/30 font-sans">
      <main className="flex-1 flex items-center justify-center px-4">
        <Suspense
          fallback={
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#3D3C36] border-t-[#4CAF6E]" />
          }
        >
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/campaigns";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(errorParam === "auth_failed" ? "Authentication failed. Please try again." : "");

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError("");
    try {
      await startGoogleConnect(next);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again.",
      );
      setGoogleLoading(false);
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for the login link!");
    }
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-[#E8E4DD]">Sign in to AdsAgent</h1>
        <p className="text-[#C4C0B6] text-sm">
          Manage your Google Ads with AI
        </p>
      </div>

      {error && (
        <div className="p-3 rounded border border-[#C45D4A]/40 bg-[#C45D4A]/10 text-[#C45D4A] text-sm text-center">
          {error}
        </div>
      )}

      {message && (
        <div className="p-3 rounded border border-[#5DBE82]/40 bg-[#5DBE82]/10 text-[#5DBE82] text-sm text-center">
          {message}
        </div>
      )}

      <Button
        onClick={signInWithGoogle}
        disabled={googleLoading}
        className="w-full h-12 bg-[#E8E4DD] text-[#1A1917] hover:bg-[#E8E4DD]/90 font-semibold rounded-md transition-colors"
      >
        {googleLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </>
        )}
      </Button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#3D3C36]" />
        <span className="text-[#C4C0B6] text-xs uppercase">or</span>
        <div className="flex-1 h-px bg-[#3D3C36]" />
      </div>

      <form onSubmit={signInWithEmail} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full h-12 px-4 rounded-md bg-[#24231F] border border-[#3D3C36] text-[#E8E4DD] placeholder:text-[#C4C0B6] focus:outline-none focus:border-[#4CAF6E] transition-colors"
        />
        <Button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full h-12 bg-[#24231F] border border-[#3D3C36] text-[#E8E4DD] hover:bg-[#2E2D28] font-semibold rounded-md transition-colors"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Mail className="w-4 h-4 mr-2" />
              Send magic link
            </>
          )}
        </Button>
      </form>

      <p className="text-[#C4C0B6] text-xs text-center">
        We'll send a sign-in link to your email. No password needed.
      </p>
    </div>
  );
}
