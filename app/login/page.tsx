"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AppFooter } from "@/components/footer";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
    }
    // On success, Supabase redirects the browser to Google — no further
    // action needed here.
  }

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-[440px] rounded-[30px] bg-card px-9 py-9 shadow-[var(--shadow-raised-lg)] sm:px-10 sm:pt-10 sm:pb-8">
          <span className="flex size-13 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] pb-0.5 font-serif text-2xl font-extrabold text-primary-foreground shadow-[var(--shadow-btn-primary)]">
            V
          </span>
          <h1 className="mt-5 font-serif text-3xl font-extrabold tracking-tight">
            Back to the desk.
          </h1>
          <p className="mt-2.5 font-serif text-[15px] leading-relaxed text-muted-foreground">
            Sign in with Google — one account, no password to research.
          </p>

          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="mt-7 w-full"
            size="lg"
          >
            {isLoading ? "Redirecting…" : "Continue with Google"}
          </Button>

          {error ? (
            <p className="mt-4 font-mono text-xs text-destructive">{error}</p>
          ) : null}

          <div className="mt-6 text-center font-mono text-[10.5px] tracking-wide text-muted-foreground">
            NEW HERE? THE FREE PLAN NEEDS NO CARD.
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
