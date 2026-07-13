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
import { SiteHeader } from "@/components/site-header";
import { isTerminalStatus, type ResearchSessionSummary } from "@/components/research-types";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  searching: "Searching",
  fetching: "Fetching",
  extracting: "Extracting",
  synthesizing: "Synthesizing",
  done: "Done",
  failed: "Failed",
};

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

// Sessions this user isn't signed in for (or any other fetch failure) resolve to an empty list
// rather than throwing — the landing page has no dedicated error UI for this section, it just
// falls back to the "no sessions yet" empty state, which reads correctly either way.
async function fetchRecentSessions(): Promise<ResearchSessionSummary[]> {
  const res = await fetch("/api/research");
  if (!res.ok) {
    return [];
  }
  const data: { sessions: ResearchSessionSummary[] } = await res.json();
  return data.sessions;
}

function RecentSessionRow({ session }: { session: ResearchSessionSummary }) {
  return (
    <Link
      href={`/research/${session.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border-2 border-foreground bg-card px-4 py-3 shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)]"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-serif text-sm text-foreground">
          {session.query}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {formatRelativeDate(session.createdAt)}
        </span>
      </div>
      <Badge variant={statusBadgeVariant(session.status)} className="shrink-0 font-mono">
        {STATUS_LABELS[session.status] ?? session.status}
        {!isTerminalStatus(session.status) ? "…" : ""}
      </Badge>
    </Link>
  );
}

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sessions, isPending: sessionsPending } = useQuery({
    queryKey: ["research-sessions"],
    queryFn: fetchRecentSessions,
  });

  // Kicks off a research session: POST /api/research, then navigate to the results dashboard to
  // poll for progress.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data: { id: string } = await res.json();
      router.push(`/research/${data.id}`);
    } catch {
      setError("Something went wrong starting your research. Try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-4 py-14 sm:px-6 sm:py-20">
        <div className="w-full max-w-2xl text-center">
          <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground sm:text-5xl">
            One input in. A verdict you can trust.
          </h1>
          <p className="mx-auto mt-4 max-w-lg font-serif text-base text-muted-foreground sm:text-lg">
            Tell us what you&apos;re buying. We watch the reviews, read the
            threads, and separate sponsored opinion from organic — so you
            don&apos;t have to.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-10 rounded-lg border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)] sm:flex sm:items-center sm:gap-2 sm:p-2"
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Best noise-cancelling headphones under $300 for travel, I have an iPhone"
              className="h-12 flex-1 border-0 bg-transparent font-serif text-base shadow-none focus-visible:ring-0"
            />
            <Button
              type="submit"
              size="lg"
              disabled={query.trim().length === 0 || isSubmitting}
              className="mt-2 h-12 w-full sm:mt-0 sm:w-auto"
            >
              {isSubmitting ? "Starting research…" : "Research"}
            </Button>
          </form>

          {error ? (
            <p className="mt-4 font-mono text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <section className="mt-16 w-full max-w-2xl sm:mt-24">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Recent research
          </h2>

          {sessionsPending ? (
            <div className="mt-3 flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : sessions && sessions.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-3">
              {sessions.map((session) => (
                <li key={session.id}>
                  <RecentSessionRow session={session} />
                </li>
              ))}
            </ul>
          ) : (
            <Card className="mt-3 border-2 border-dashed border-border bg-transparent shadow-none">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <p className="font-serif text-muted-foreground">
                  No research sessions yet. Run one above to see it here.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
