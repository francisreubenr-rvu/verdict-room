import { Badge } from "@/components/ui/badge";
import type { ResearchOption } from "@/components/research-types";

interface VerdictProps {
  verdict: string;
  options: ResearchOption[];
}

export function Verdict({ verdict, options }: VerdictProps) {
  const ranked = [...options].sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Verdict
        </h2>
        <p className="mt-2 font-serif text-xl leading-snug text-foreground sm:text-2xl">
          {verdict}
        </p>
      </div>

      {ranked.length > 0 ? (
        <ol className="flex flex-col gap-4">
          {ranked.map((option) => (
            <li
              key={option.name}
              className="rounded-lg border-2 border-foreground bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-secondary font-mono text-xs font-semibold">
                    {option.rank}
                  </span>
                  <span className="font-serif text-lg font-semibold text-foreground">
                    {option.name}
                  </span>
                </div>
                <Badge variant="secondary" className="font-mono">
                  score {option.score.toFixed(1)}
                </Badge>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Pros
                  </h3>
                  {option.pros.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 font-serif text-sm text-foreground">
                      {option.pros.map((pro, i) => (
                        <li key={i}>{pro}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 font-serif text-sm text-muted-foreground">
                      None noted.
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Cons
                  </h3>
                  {option.cons.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 font-serif text-sm text-foreground">
                      {option.cons.map((con, i) => (
                        <li key={i}>{con}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 font-serif text-sm text-muted-foreground">
                      None noted.
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
