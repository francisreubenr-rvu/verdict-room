import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/reveal";
import { MarketingFooter } from "@/components/footer";

// Internal design-system gallery, not a product page — kept out of nav (site-header.tsx,
// footer.tsx) and out of the crawl (robots.ts disallows /components too), noindex here as well
// in case the URL is shared or linked externally (SE4 finding).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const SWATCHES = [
  { name: "PAPER F2E8D5", className: "bg-background shadow-[var(--shadow-raised)]" },
  { name: "CARD F8F0DD", className: "bg-card shadow-[var(--shadow-raised)]" },
  { name: "WELL EFE3C8", className: "bg-well shadow-[var(--shadow-well)]" },
  {
    name: "OCHRE C9A558",
    className:
      "bg-[linear-gradient(145deg,var(--accent-light),var(--accent))] shadow-[var(--shadow-raised)]",
  },
  {
    name: "TERRA A84A28",
    className:
      "bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] shadow-[var(--shadow-raised)]",
  },
  {
    name: "RUST 8F3325",
    className:
      "bg-[linear-gradient(145deg,var(--destructive-light),var(--destructive))] shadow-[var(--shadow-raised)]",
  },
  {
    name: "INK 2B2116",
    className: "bg-[linear-gradient(150deg,var(--ink-light),var(--ink))] shadow-[var(--shadow-ink)]",
  },
];

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal className="mt-11">
      <div className="mb-3.5 font-mono text-[10.5px] font-bold tracking-widest text-muted-foreground">
        {n} · {title}
      </div>
      {children}
    </Reveal>
  );
}

export default function ComponentsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[1128px] flex-1 px-4 py-16 sm:px-6 sm:py-20">
        <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
          DESIGN SYSTEM
        </div>
        <h1 className="mt-3.5 font-serif text-4xl font-extrabold leading-tight sm:text-[58px]">
          Warm Clay — the parts bin.
        </h1>
        <p className="mt-5 max-w-[560px] font-serif text-lg leading-relaxed text-muted-foreground">
          Every piece of the interface, pressed from the same clay: raised things you can push,
          carved wells you type into, and one dark slab reserved for verdicts.
        </p>

        <Section n="01" title="CLAY PALETTE">
          <div className="flex flex-wrap gap-4">
            {SWATCHES.map((s) => (
              <div key={s.name} className="flex flex-col items-center gap-2">
                <span className={`size-[74px] rounded-3xl ${s.className}`} />
                <span className="font-mono text-[9.5px] text-muted-foreground">{s.name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section n="02" title="TYPE — SERIF SPEAKS, MONO OPERATES">
          <div className="flex flex-col gap-4.5 rounded-3xl bg-card px-8 py-7 shadow-[var(--shadow-raised)]">
            <div className="flex flex-wrap items-baseline gap-5">
              <span className="font-serif text-4xl font-extrabold tracking-tight">
                Display — verdicts &amp; headlines
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                SOURCE SERIF 4 · 800
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-5">
              <span className="max-w-[560px] font-serif text-base leading-relaxed">
                Body — the evidence reads like a well-edited magazine, because research is
                reading.
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                SOURCE SERIF 4 · 400
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-5">
              <span className="font-mono text-xs font-semibold tracking-wide">
                MONO — LABELS, BADGES, BUTTONS, MACHINE OUTPUT
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                GEIST MONO · 600
              </span>
            </div>
          </div>
        </Section>

        <Section n="03" title="BUTTONS — PRESS THEM, THEY SQUISH">
          <div className="flex flex-wrap items-center gap-4 rounded-3xl bg-card px-8 py-7 shadow-[var(--shadow-raised)]">
            <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-6 font-mono text-sm font-semibold text-primary-foreground shadow-[var(--shadow-btn-primary)] transition-transform hover:translate-y-px active:translate-y-[3px] active:scale-[0.97]">
              Primary — run it
            </button>
            <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-chip px-6 font-mono text-sm font-semibold shadow-[var(--shadow-btn-secondary)] transition-transform hover:translate-y-px active:translate-y-[2px]">
              Secondary
            </button>
            <button className="inline-flex h-11 items-center justify-center rounded-2xl border-2 border-dashed border-primary/45 px-5 font-mono text-sm font-semibold text-accent-foreground hover:border-primary/85 hover:text-primary">
              Quiet / locked
            </button>
            <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,var(--destructive-light),var(--destructive))] px-6 font-mono text-sm font-semibold text-primary-foreground shadow-[var(--shadow-btn-primary)]">
              Destructive
            </button>
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
              HOVER SETTLES 1PX · PRESS SINKS 3PX &amp; INVERTS THE SHADOW
            </span>
          </div>
        </Section>

        <div className="mt-11 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Section n="04" title="SPONSORSHIP BADGES">
            <div className="flex flex-col items-start gap-3 rounded-3xl bg-card px-7 py-7 shadow-[var(--shadow-raised)]">
              <Badge variant="organic">ORGANIC · 96%</Badge>
              <Badge variant="sponsored">SPONSORED · 88%</Badge>
              <Badge variant="affiliate">AFFILIATE · 99%</Badge>
              <Badge variant="unclassified">UNCLASSIFIED</Badge>
              <Badge variant="default">9.1</Badge>
            </div>
          </Section>

          <Section n="05" title="INPUTS — CARVED, NOT DRAWN">
            <div className="flex flex-col gap-4 rounded-3xl bg-card px-7 py-7 shadow-[var(--shadow-raised)]">
              <div className="flex items-center gap-2.5 rounded-2xl bg-well px-4 py-1 shadow-[var(--shadow-well)]">
                <span className="font-mono text-[13px] font-bold text-primary">&gt;</span>
                <input
                  placeholder="Type a purchase question…"
                  className="h-11 flex-1 border-none bg-transparent font-serif text-sm outline-none placeholder:font-serif placeholder:text-muted-foreground placeholder:italic"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-xl bg-chip px-3.5 py-2 font-mono text-[11px] shadow-[var(--shadow-chip)]">
                  suggestion chip
                </span>
                <span className="rounded-xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-3.5 py-2 font-mono text-[11px] font-semibold text-primary-foreground">
                  selected chip
                </span>
              </div>
            </div>
          </Section>
        </div>

        <Section n="06" title="SURFACES — RAISED, CARVED, INK">
          <div className="flex flex-col gap-3.5">
            <Card surface="raised" size="sm">
              <CardContent>
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
                  RAISED CARD
                </span>
                <div className="mt-1 font-serif text-[15.5px]">
                  Pushable, hoverable, holds evidence.
                </div>
              </CardContent>
            </Card>
            <Card surface="well" size="sm">
              <CardContent>
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
                  CARVED WELL
                </span>
                <div className="mt-1 font-serif text-[15.5px] text-[#5a4a32]">
                  Receives input. Never floats.
                </div>
              </CardContent>
            </Card>
            <Card surface="ink" size="sm">
              <CardContent>
                <span className="font-mono text-[10px] tracking-wide text-accent-light">
                  INK SLAB
                </span>
                <div className="mt-1 font-serif text-[15.5px]">Reserved for verdicts only.</div>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section n="07" title="MOTION RULES">
          <div className="grid grid-cols-1 gap-5 rounded-3xl bg-card px-8 py-7 shadow-[var(--shadow-raised)] sm:grid-cols-3">
            <div>
              <div className="font-mono text-[11px] font-bold tracking-wide text-primary">
                PRESS = SINK
              </div>
              <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
                Everything clickable presses 3px into the clay. Nothing “glows”.
              </p>
            </div>
            <div>
              <div className="font-mono text-[11px] font-bold tracking-wide text-primary">
                REVEAL = RISE
              </div>
              <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
                Sections rise 30px as you scroll to them, once, then stay put.
              </p>
            </div>
            <div>
              <div className="font-mono text-[11px] font-bold tracking-wide text-primary">
                PIPELINE = PULSE
              </div>
              <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
                Only the active stage breathes. Done stages sit still, like finished work.
              </p>
            </div>
          </div>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  );
}
