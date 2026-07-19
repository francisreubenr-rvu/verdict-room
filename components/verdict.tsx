"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/product-card";
import type { ResearchOption } from "@/components/research-types";

interface VerdictProps {
  sessionId: string;
  verdict: string;
  options: ResearchOption[];
}

export function Verdict({ sessionId, verdict, options }: VerdictProps) {
  const ranked = [...options].sort((a, b) => a.rank - b.rank);
  const topScore = ranked[0]?.score;
  const [selectedOption, setSelectedOption] = useState<ResearchOption | null>(null);

  return (
    <div className="flex flex-col gap-9">
      <div className="rounded-[28px] bg-[linear-gradient(150deg,var(--ink-light),var(--ink))] px-7 py-7 shadow-[var(--shadow-ink)] sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10.5px] font-bold tracking-widest text-accent-light">
            THE VERDICT
          </span>
          {topScore !== undefined ? (
            <span className="rounded-xl bg-[linear-gradient(145deg,var(--accent-light),var(--accent))] px-3 py-1.5 font-mono text-[13px] font-bold text-accent-foreground">
              {topScore.toFixed(1)} / 10
            </span>
          ) : null}
        </div>
        <p className="mt-3.5 text-pretty font-serif text-lg leading-relaxed text-ink-foreground sm:text-xl">
          {verdict}
        </p>
      </div>

      {ranked.length > 0 ? (
        <div>
          <div className="mb-4 font-mono text-[11px] font-bold tracking-widest text-primary/80">
            THE FIELD · RANKED
          </div>
          <ol className="flex flex-col gap-3.5">
            {ranked.map((option) => {
              // Backward compat: sessions synthesized before the 2026-07-19 budget-flagging brief
              // have verdictJson.options without these fields — undefined-safe on purpose, not
              // trusting ResearchOption's declared (non-optional) types at runtime.
              const overBudget = option.overBudget === true;
              const priceNote = option.priceNote ?? null;

              return (
                <li
                  key={option.name}
                  className="rounded-3xl bg-card shadow-[var(--shadow-raised)]"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedOption(option)}
                    className="w-full rounded-3xl px-6 py-6 text-left outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px sm:px-7"
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-well font-mono text-[15px] font-bold text-accent-foreground shadow-[var(--shadow-well)]">
                        {option.rank}
                      </span>
                      <span className="flex-1 font-serif text-xl font-bold">{option.name}</span>
                      <span className="rounded-xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-3 py-1.5 font-mono text-[13px] font-bold text-primary-foreground">
                        {option.score.toFixed(1)}
                      </span>
                    </div>

                    {overBudget || priceNote ? (
                      <div className="mt-3.5 flex flex-wrap items-center gap-2">
                        {overBudget ? <Badge variant="destructive">OVER BUDGET</Badge> : null}
                        {priceNote ? (
                          <span className="font-mono text-[11.5px] font-semibold text-muted-foreground">
                            {priceNote}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        {option.pros.map((pro, i) => (
                          <div key={i} className="flex gap-2.5">
                            <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-[#7a6a2b]">
                              +
                            </span>
                            <span className="font-serif text-sm leading-relaxed">{pro}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2">
                        {option.cons.map((con, i) => (
                          <div key={i} className="flex gap-2.5">
                            <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-primary">
                              −
                            </span>
                            <span className="font-serif text-sm leading-relaxed text-muted-foreground">
                              {con}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <ProductCard
        sessionId={sessionId}
        option={selectedOption}
        open={selectedOption !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOption(null);
        }}
      />
    </div>
  );
}
