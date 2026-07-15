"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AppFooter } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import {
  isTerminalStatus,
  FAILURE_MESSAGES,
  type FailureReason,
  type ResearchSessionSummary,
} from "@/components/research-types";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  searching: "Searching",
  fetching: "Fetching",
  extracting: "Extracting",
  synthesizing: "Synthesizing",
  done: "Done",
  failed: "Failed",
};

const SUGGESTIONS = [
  "carry-on for budget airlines",
  "air purifier, dusty 1-bed",
  "quiet mechanical keyboard",
];

function statusBadgeVariant(status: string): "default" | "destructive" | "outline" {
  if (status === "failed") return "destructive";
  if (status === "done") return "outline";
  return "default";
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface RecentSessionsResponse {
  sessions: ResearchSessionSummary[];
  usage?: { plan: "free" | "pro"; used: number; limit: number | null };
}

// Sessions this user isn't signed in for (or any other fetch failure) resolve to an empty
// response rather than throwing — this page has no dedicated error UI for the recent-research
// section, it just falls back to the "no sessions yet" empty state either way.
async function fetchRecentSessions(): Promise<RecentSessionsResponse> {
  const res = await fetch("/api/research");
  if (!res.ok) {
    return { sessions: [] };
  }
  return res.json();
}

function RecentSessionRow({ session }: { session: ResearchSessionSummary }) {
  return (
    <Link
      href={`/research/${session.id}`}
      className="flex items-center gap-4 rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-raised)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised-hover)]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-well font-mono text-sm text-accent-foreground shadow-[var(--shadow-well)]">
        &gt;
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif text-base font-semibold text-foreground">
          {session.query}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {formatRelativeDate(session.createdAt)}
        </div>
      </div>
      <Badge
        variant={statusBadgeVariant(session.status)}
        className="shrink-0"
        title={
          session.status === "failed" && session.failureReason
            ? FAILURE_MESSAGES[session.failureReason as FailureReason]
            : undefined
        }
      >
        {STATUS_LABELS[session.status] ?? session.status}
        {!isTerminalStatus(session.status) ? "…" : ""}
      </Badge>
    </Link>
  );
}

export default function AppQueryHome() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending: sessionsPending } = useQuery({
    queryKey: ["research-sessions"],
    queryFn: fetchRecentSessions,
    // Keep polling while any listed session is still in progress, so a "Fetching…" badge
    // updates on its own instead of requiring a manual reload (E6 finding).
    refetchInterval: (query) => {
      const sessions = query.state.data?.sessions;
      const hasActive = sessions?.some((s) => !isTerminalStatus(s.status));
      return hasActive ? 4000 : false;
    },
  });

  async function submitQuery(q: string) {
    if (q.trim().length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      if (res.status === 401) {
        setError("Sign in to run a research session.");
        setIsSubmitting(false);
        return;
      }
      if (res.status === 402) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "You're out of free reports this month.");
        setIsSubmitting(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const body: { id: string } = await res.json();
      router.push(`/research/${body.id}`);
    } catch {
      setError("Something went wrong starting your research. Try again.");
      setIsSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitQuery(query);
  }

  const usage = data?.usage;

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
            RESEARCH DESK
          </div>
          <h1 className="mt-3.5 font-serif text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            What are you buying?
          </h1>
          <p className="mx-auto mt-4 max-w-[440px] font-serif text-base text-muted-foreground sm:text-lg">
            Ask like you&apos;d ask a friend who happens to have read everything.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-9 flex items-center gap-3 rounded-3xl bg-well px-3 py-2.5 pl-5 shadow-[var(--shadow-well-lg)] sm:px-3"
        >
          <span className="font-mono text-base font-bold text-primary">&gt;</span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Best carry-on under $250 that fits budget-airline sizers…"
            className="h-11 flex-1 text-base sm:text-[17.5px]"
          />
          <Button
            type="submit"
            size="lg"
            disabled={query.trim().length === 0 || isSubmitting}
          >
            {isSubmitting ? "Starting…" : "Research →"}
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuery(s)}
              className="rounded-xl bg-chip px-4 py-2 font-mono text-[11.5px] text-secondary-foreground shadow-[var(--shadow-chip)] transition-transform hover:-translate-y-0.5 active:translate-y-px"
            >
              {s}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-4 text-center font-mono text-sm text-destructive">{error}</p>
        ) : null}

        <Reveal className="mt-16">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
              RECENT RESEARCH
            </span>
            {usage ? (
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {usage.plan === "pro"
                  ? "UNLIMITED · PRO"
                  : `${Math.max(0, (usage.limit ?? 0) - usage.used)} OF ${usage.limit} FREE REPORTS LEFT THIS MONTH`}
              </span>
            ) : null}
          </div>

          {sessionsPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : data && data.sessions.length > 0 ? (
            <div className="flex flex-col gap-3">
              {data.sessions.map((session) => (
                <RecentSessionRow key={session.id} session={session} />
              ))}
            </div>
          ) : (
            <Card surface="well" className="items-center py-10 text-center shadow-none">
              <CardContent>
                <p className="font-serif text-muted-foreground">
                  No research sessions yet. Run one above to see it here.
                </p>
              </CardContent>
            </Card>
          )}
        </Reveal>
      </main>

      <AppFooter />
    </div>
  );
}
