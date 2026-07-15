"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
] as const;

// Floating pill nav, persistent across every route (marketing + app) per the
// design. Tracks Supabase auth state client-side so it can render "Sign out"
// (and clear the recent-sessions list on sign out) instead of always showing
// "Sign in" regardless of whether anyone is actually logged in.
export function SiteHeader() {
  const pathname = usePathname();
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
    <header className="sticky top-3.5 z-50 mx-auto w-[calc(100%-24px)] max-w-[1128px] px-0 sm:top-4 sm:w-[calc(100%-48px)]">
      <div className="flex items-center justify-between gap-2 rounded-[26px] bg-card/90 py-2 pr-2 pl-3 shadow-[var(--shadow-nav)] backdrop-blur-sm sm:pl-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] pb-0.5 font-serif text-lg font-extrabold text-primary-foreground shadow-[var(--shadow-btn-primary)] sm:size-9">
            V
          </span>
          <span className="hidden font-serif text-lg font-bold tracking-tight sm:inline">
            The Verdict Room
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 font-mono text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground hover:shadow-[var(--shadow-well)]",
                  active && "bg-card text-foreground shadow-[var(--shadow-well)]"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="rounded-2xl px-2.5 py-2.5 font-mono text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-60 sm:px-3.5"
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <Link
              href="/login"
              className={cn(
                "rounded-2xl px-2.5 py-2.5 font-mono text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:px-3.5",
                pathname === "/login" && "bg-card text-foreground shadow-[var(--shadow-well)]"
              )}
            >
              Sign in
            </Link>
          )}
          <Link
            href="/app"
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-4 font-mono text-[13px] font-semibold text-primary-foreground shadow-[var(--shadow-btn-primary)] transition-transform hover:translate-y-px active:translate-y-[3px] active:scale-[0.97] sm:px-5"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
