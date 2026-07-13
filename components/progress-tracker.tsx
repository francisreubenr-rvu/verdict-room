import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { PIPELINE_STEPS, type PipelineStep } from "@/components/research-types";

const STEP_LABELS: Record<PipelineStep, string> = {
  queued: "Queued",
  searching: "Searching",
  fetching: "Fetching",
  extracting: "Extracting",
  synthesizing: "Synthesizing",
};

interface ProgressTrackerProps {
  status: string;
  sourcesCount: number;
  expectedSources: number;
}

export function ProgressTracker({
  status,
  sourcesCount,
  expectedSources,
}: ProgressTrackerProps) {
  const currentIndex = PIPELINE_STEPS.indexOf(status as PipelineStep);
  const showSourceCount = expectedSources > 0 && currentIndex >= PIPELINE_STEPS.indexOf("fetching");

  return (
    <div className="rounded-lg border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Research in progress
      </h2>

      <ol className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        {PIPELINE_STEPS.map((step, index) => {
          const isComplete = currentIndex > index;
          const isActive = currentIndex === index;

          return (
            <li key={step} className="flex flex-1 items-center gap-2 sm:flex-col sm:items-start">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground font-mono text-xs",
                  isComplete && "bg-primary text-primary-foreground",
                  isActive && "bg-accent text-accent-foreground",
                  !isComplete && !isActive && "bg-transparent text-muted-foreground"
                )}
              >
                {isComplete ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "font-mono text-sm",
                  isActive && "font-semibold text-foreground",
                  isComplete && "text-foreground",
                  !isComplete && !isActive && "text-muted-foreground"
                )}
              >
                {STEP_LABELS[step]}
                {isActive ? "…" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {showSourceCount ? (
        <div className="mt-6">
          <Progress
            value={Math.min(sourcesCount, expectedSources)}
            max={expectedSources}
            className="flex-col items-stretch gap-1.5"
          >
            <span className="font-mono text-xs text-muted-foreground">
              {sourcesCount} / {expectedSources} sources processed
            </span>
          </Progress>
        </div>
      ) : null}
    </div>
  );
}
