import type { ResearchOption } from "@/components/research-types";

interface VerdictProps {
  verdict: string;
  options: ResearchOption[];
}

export function Verdict({ verdict, options }: VerdictProps) {
  const ranked = [...options].sort((a, b) => a.rank - b.rank);
  const topScore = ranked[0]?.score;

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
            {ranked.map((option) => (
              <li
                key={option.name}
                className="rounded-3xl bg-card px-6 py-6 shadow-[var(--shadow-raised)] sm:px-7"
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
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
