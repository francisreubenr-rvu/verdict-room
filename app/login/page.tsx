"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-lg border-2 border-foreground bg-card p-8 text-center shadow-[4px_4px_0_0_var(--color-foreground)]">
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          PurchasePilot
        </h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          Sign in to research your next purchase.
        </p>

        <Button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="mt-8 w-full"
          size="lg"
        >
          {isLoading ? "Redirecting..." : "Sign in with Google"}
        </Button>

        {error ? (
          <p className="mt-4 font-mono text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    </main>
  );
}
