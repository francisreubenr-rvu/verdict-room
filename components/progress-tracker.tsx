import { cn } from "@/lib/utils";
import { PIPELINE_STEPS, type PipelineStep, type ResearchSource } from "@/components/research-types";

const STEP_LABELS: Record<PipelineStep, string> = {
  queued: "Queued",
  searching: "Searching",
  fetching: "Fetching",
  extracting: "Extracting",
  synthesizing: "Synthesizing",
};

// Live status line shown under the pipeline steps — matters more now that a session can take a
// while (up to 50 staggered sources for Pro, see app/api/research/route.ts's DISPATCH_STAGGER_MS)
// than it did at the old flat 12-source cap. Distinct copy per step so a long wait still reads as
// "working," not "stuck."
const STEP_MESSAGES: Record<PipelineStep, string> = {
  queued: "Lining up the research…",
  searching: "Searching the web, Reddit threads, and YouTube reviews…",
  fetching: "Opening every source we found…",
  extracting: "Reading claims and checking who got paid…",
  synthesizing: "Weighing the evidence into a verdict…",
};

interface ProgressTrackerProps {
  query: string;
  status: string;
  sources: ResearchSource[];
  expectedSources: number;
}

export function ProgressTracker({
  query,
  status,
  sources,
  expectedSources,
}: ProgressTrackerProps) {
  const currentIndex = PIPELINE_STEPS.indexOf(status as PipelineStep);
  const currentStep = PIPELINE_STEPS[currentIndex] as PipelineStep | undefined;
  const flaggedCount = sources.filter(
    (s) => s.sponsorship === "sponsored" || s.sponsorship === "affiliate"
  ).length;
  const pct =
    expectedSources > 0
      ? Math.round((Math.min(sources.length, expectedSources) / expectedSources) * 100)
      : Math.round(((currentIndex + 1) / PIPELINE_STEPS.length) * 100);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-2xl bg-well px-5 py-3.5 shadow-[var(--shadow-well)]">
        <span className="font-mono text-sm font-bold text-primary">&gt;</span>
        <span className="flex-1 truncate font-serif text-base italic text-[#5a4a32]">
          {query}
        </span>
      </div>

      <div className="rounded-[28px] bg-card px-7 py-7 shadow-[var(--shadow-raised-lg)] sm:px-8">
        <div className="flex items-baseline justify-between gap-3.5">
          <span className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
            PIPELINE
          </span>
          <span className="font-serif text-4xl font-extrabold tracking-tight">
            {pct}
            <span className="text-xl">%</span>
          </span>
        </div>

        <div className="mt-3.5 h-4 overflow-hidden rounded-full bg-well shadow-[var(--shadow-well)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-6 flex items-start justify-between">
          {PIPELINE_STEPS.map((step, index) => {
            const isComplete = currentIndex > index;
            const isActive = currentIndex === index;
            return (
              <div key={step} className="flex flex-1 flex-col items-center gap-2">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full font-mono text-[11px] font-bold transition-colors",
                    isComplete &&
                      "bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] text-primary-foreground",
                    isActive &&
                      "animate-pulse bg-[linear-gradient(145deg,var(--accent-light),var(--accent))] text-accent-foreground",
                    !isComplete && !isActive && "bg-well text-muted-foreground shadow-[var(--shadow-well)]"
                  )}
                >
                  {isComplete ? "✓" : index + 1}
                </span>
                <span
                  className={cn(
                    "font-mono text-[9px] tracking-wide",
                    isActive || isComplete ? "font-bold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {STEP_LABELS[step].toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>

        {currentStep ? (
          <div className="mt-6 flex items-center justify-center gap-2.5 rounded-2xl bg-well px-4 py-3 text-center shadow-[var(--shadow-well)]">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
            <span className="font-mono text-[11px] tracking-wide text-accent-foreground">
              {STEP_MESSAGES[currentStep]}
            </span>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3.5">
          <div className="rounded-2xl bg-well px-4 py-3.5 text-center shadow-[var(--shadow-well)]">
            <div className="font-serif text-2xl font-extrabold">
              {sources.length}
              {expectedSources > 0 ? (
                <span className="text-base font-semibold text-muted-foreground">
                  {" "}
                  / {expectedSources}
                </span>
              ) : null}
            </div>
            <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground">
              SOURCES FOUND
            </div>
          </div>
          <div className="rounded-2xl bg-well px-4 py-3.5 text-center shadow-[var(--shadow-well)]">
            <div className="font-serif text-2xl font-extrabold text-primary">{flaggedCount}</div>
            <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground">
              PAID VOICES FLAGGED
            </div>
          </div>
        </div>
      </div>

      <div className="text-center font-mono text-[10.5px] tracking-wide text-muted-foreground">
        YOU CAN LEAVE — WE&apos;LL KEEP READING. THE REPORT SAVES TO YOUR DESK.
      </div>
    </div>
  );
}
