import Link from "next/link";
import { Verdict } from "@/components/verdict";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VerdictJson } from "@/components/research-types";

interface ReportCardProps {
  sessionId: string;
  query: string;
  verdictJson: VerdictJson;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

function formatDuration(createdAt: string, updatedAt: string): string {
  const ms = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function ReportCard({
  sessionId,
  query,
  verdictJson,
  sourceCount,
  createdAt,
  updatedAt,
}: ReportCardProps) {
  const dateLabel = new Date(createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-[600px]">
          <div className="font-mono text-[10.5px] font-bold tracking-wide text-primary/80">
            RESEARCH REPORT · {dateLabel.toUpperCase()} · {sourceCount} SOURCES ·{" "}
            {formatDuration(createdAt, updatedAt)}
          </div>
          <h1 className="mt-2 text-balance font-serif text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {query}
          </h1>
        </div>
        <div className="flex gap-2.5">
          <Link href="/app" className={buttonVariants({ variant: "outline" })}>
            + New research
          </Link>
          <button
            type="button"
            disabled
            title="Export is not available yet"
            className={cn(buttonVariants({ variant: "ghost" }), "cursor-not-allowed opacity-60")}
          >
            Export · coming soon
          </button>
        </div>
      </div>

      <Verdict sessionId={sessionId} verdict={verdictJson.verdict} options={verdictJson.options} />
    </div>
  );
}
