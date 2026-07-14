"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STAGES = ["QUEUE", "SEARCH", "FETCH", "EXTRACT", "VERDICT"] as const;

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Purely decorative marketing illustration on the landing page — a looping
// preview of what the pipeline looks like mid-run. Not wired to any real
// session; the actual live pipeline lives at /research/[id]. Freezes on the
// final frame under prefers-reduced-motion instead of looping forever.
export function HeroDemo() {
  const [stage, setStage] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false
  );

  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setStage((s) => (s + 1) % STAGES.length);
    }, 2200);
    return () => clearInterval(id);
  }, [reducedMotion]);

  const activeStage = reducedMotion ? STAGES.length - 1 : stage;

  return (
    <div className="animate-[ppBob_7s_ease-in-out_infinite] motion-reduce:animate-none">
      <div className="rounded-[26px] bg-card px-6 py-5 shadow-[var(--shadow-raised-lg)]">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="font-mono text-[10.5px] font-bold tracking-widest text-muted-foreground">
            LIVE RESEARCH · PREVIEW
          </span>
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-accent-light" />
            <span className="size-2.5 rounded-full bg-accent" />
            <span className="size-2.5 rounded-full bg-primary" />
          </span>
        </div>

        <div className="flex items-center gap-2.5 rounded-2xl bg-well px-4 py-3 shadow-[var(--shadow-well)]">
          <span className="font-mono text-xs font-bold text-primary">&gt;</span>
          <span className="truncate font-serif text-sm italic text-muted-foreground">
            noise-cancelling headphones, under $300
          </span>
        </div>

        <div className="mt-5 flex items-start justify-between gap-1">
          {STAGES.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={
                  "flex size-8 items-center justify-center rounded-full font-mono text-[11px] font-bold transition-colors duration-500 " +
                  (i < activeStage
                    ? "bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] text-primary-foreground"
                    : i === activeStage
                      ? "bg-[linear-gradient(145deg,var(--accent-light),var(--accent))] text-accent-foreground"
                      : "bg-well text-muted-foreground shadow-[var(--shadow-well)]")
                }
              >
                {i < activeStage ? "✓" : i + 1}
              </span>
              <span className="font-mono text-[8.5px] tracking-wide text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-well shadow-[var(--shadow-well)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] transition-[width] duration-700 ease-out"
            style={{ width: `${((activeStage + 1) / STAGES.length) * 100}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-card px-3 py-2.5 shadow-[var(--shadow-raised)]">
            <div className="font-mono text-[9px] font-bold tracking-wide text-muted-foreground">
              r/ HEADPHONES · 212 💬
            </div>
            <p className="mt-1 font-serif text-xs leading-snug text-foreground">
              &ldquo;Flew 61 legs with these. Buy them.&rdquo;
            </p>
            <span className="mt-1.5 inline-block rounded-md bg-[#e9dcb4] px-1.5 py-0.5 font-mono text-[8px] font-semibold text-[#5a4a22]">
              ORGANIC · 96%
            </span>
          </div>
          <div className="relative rounded-xl bg-card px-3 py-2.5 shadow-[var(--shadow-raised)]">
            <span className="absolute -top-1.5 -right-1 rotate-[-8deg] rounded-md bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-1.5 py-0.5 font-mono text-[8px] font-bold text-primary-foreground">
              SPONSORED
            </span>
            <div className="font-mono text-[9px] font-bold tracking-wide text-muted-foreground">
              ▶ TECHDAD REVIEWS
            </div>
            <p className="mt-1 font-serif text-xs leading-snug text-foreground">
              &ldquo;Honestly? 9/10. Link below!&rdquo;
            </p>
          </div>
        </div>

        <div className="mt-3.5 rounded-2xl bg-[linear-gradient(150deg,var(--ink-light),var(--ink))] px-4 py-3 shadow-[var(--shadow-ink)]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9.5px] font-bold tracking-widest text-accent-light">
              VERDICT · 61 SOURCES
            </span>
            <span className="rounded-md bg-[linear-gradient(145deg,var(--accent-light),var(--accent))] px-2 py-0.5 font-mono text-[11px] font-bold text-accent-foreground">
              9.1
            </span>
          </div>
          <p className="mt-1.5 font-serif text-sm text-ink-foreground">
            Sony WH-1000XM6 — the only pair that wins at 38,000 feet.
          </p>
        </div>
      </div>
    </div>
  );
}
