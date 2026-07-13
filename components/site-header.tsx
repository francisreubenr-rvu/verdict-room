"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Shared header for the landing page and results dashboard. Tracks Supabase
// auth state client-side so it can render "Sign out" (and clear the recent-
// sessions list on sign out) instead of always showing "Sign in" regardless
// of whether anyone is actually logged in.
export function SiteHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    // createClient() throws if Supabase env vars aren't set (e.g. no
    // .env.local yet, pre-M6). Treat that the same as "signed out" rather
    // than crashing the header — matches fetchRecentSessions()'s fallback.
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      queryClient.invalidateQueries({ queryKey: ["research-sessions"] });
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsSigningOut(false);
  }

  return (
    <header className="flex items-center justify-between border-b-2 border-foreground px-4 py-4 sm:px-6">
      <Link
        href="/"
        className="font-serif text-lg font-semibold tracking-tight"
      >
        PurchasePilot
      </Link>
      {user ? (
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="font-mono text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      ) : (
        <Link
          href="/login"
          className="font-mono text-sm text-muted-foreground hover:text-foreground"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
