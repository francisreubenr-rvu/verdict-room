"use client";

import { useState } from "react";
import { Globe, MessageSquare, SquarePlay } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AttemptStatus, Platform, ResearchAttempt } from "@/components/research-types";

const PLATFORM_ICONS: Record<Platform, typeof Globe> = {
  youtube: SquarePlay,
  reddit: MessageSquare,
  web: Globe,
};

const FAILURE_LABELS: Record<string, string> = {
  no_transcript: "no transcript available",
  fetch_failed: "couldn't load the page",
  blocked: "blocked by the site",
  extraction_error: "couldn't process the content",
  session_ended: "session ended before this finished",
};

function statusBadge(attempt: ResearchAttempt) {
  if (attempt.status === "succeeded") {
    return <Badge variant="organic">used in report</Badge>;
  }
  if (attempt.status === "failed") {
    const label = attempt.failureReason
      ? (FAILURE_LABELS[attempt.failureReason] ?? attempt.failureReason)
      : "excluded";
    return <Badge variant="destructive">excluded — {label}</Badge>;
  }
  if (attempt.status === "discovered") {
    return <Badge variant="outline">found, not needed</Badge>;
  }
  return <Badge variant="ghost">pending</Badge>;
}

type Filter = "all" | AttemptStatus;

interface AttemptListProps {
  attempts: ResearchAttempt[];
}

// The "every site we checked" transparency panel — distinct from SourceList, which only ever
// shows successes. This is the accountability trail: every URL discoverySources surfaced, what
// happened to it, and why it was excluded if it was.
export function AttemptList({ attempts }: AttemptListProps) {
  const [filter, setFilter] = useState<Filter>("all");

  if (attempts.length === 0) {
    return null;
  }

  const succeeded = attempts.filter((a) => a.status === "succeeded");
  const failed = attempts.filter((a) => a.status === "failed");
  const other = attempts.filter((a) => a.status === "discovered" || a.status === "dispatched");

  // The "discovered" tab represents the "not needed" bucket, which groups both statuses that
  // never resolved to a linked Source (discovered=overflow past the cap, dispatched=still
  // in flight on a stale/reaped session) — must match the `other` grouping above or the tab's
  // count and its filtered contents disagree.
  const visible = attempts.filter((a) => {
    if (filter === "all") return true;
    if (filter === "discovered") return a.status === "discovered" || a.status === "dispatched";
    return a.status === filter;
  });

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: `ALL · ${attempts.length}` },
    { key: "succeeded", label: `USED · ${succeeded.length}` },
    { key: "failed", label: `EXCLUDED · ${failed.length}` },
  ];
  if (other.length > 0) {
    tabs.push({ key: "discovered", label: `NOT NEEDED · ${other.length}` });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3.5">
        <span className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
          EVERY SITE WE CHECKED · {attempts.length}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                "rounded-xl bg-chip px-3.5 py-2 font-mono text-[10.5px] font-semibold text-muted-foreground shadow-[var(--shadow-chip)]",
                filter === tab.key && "text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 font-serif text-sm text-muted-foreground">
        Not just the sources that made the report — every URL we found and what happened to it.
      </p>

      <div className="flex flex-col gap-2">
        {visible.map((attempt) => {
          const Icon = PLATFORM_ICONS[attempt.platform];
          return (
            <div
              key={attempt.id}
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-chip px-4 py-2.5 shadow-[var(--shadow-chip)]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="size-3.5 shrink-0 text-primary" />
                <a
                  href={attempt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-mono text-xs text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 hover:text-foreground hover:decoration-foreground/50"
                >
                  {attempt.url}
                </a>
              </div>
              {statusBadge(attempt)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
