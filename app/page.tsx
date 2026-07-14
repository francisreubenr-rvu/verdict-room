import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { HeroDemo } from "@/components/hero-demo";
import { MarketingFooter } from "@/components/footer";

const PROOF_STATS = [
  { value: "61", label: "SOURCES PER QUERY" },
  { value: "4 min", label: "TO A VERDICT" },
  { value: "14", label: "SHILLS FLAGGED / REPORT" },
  { value: "0", label: "AFFILIATE LINKS, EVER" },
];

const PROBLEM_CARDS = [
  {
    tag: "▶ YOUTUBE · 2.1M VIEWS",
    badge: "SPONSORED",
    quote: "“I've tested EVERY pair and this one genuinely shocked me. Use code HONEST15 —”",
    note: "The brand paid for this shock.",
  },
  {
    tag: "www · “BEST OF 2026” LISTICLE",
    badge: "AFFILIATE",
    quote: "“Our #1 pick balances premium sound with unbeatable value. Check today's price ↗”",
    note: "Every link pays their rent.",
  },
  {
    tag: "★★★★★ · MARKETPLACE REVIEW",
    badge: "“FREE UNIT”",
    quote: "“Amazing product!! Exceeded expectations!! Received product for honest review!!”",
    note: "Three exclamation marks. Zero purchases.",
  },
];

const PIPELINE_STEPS = [
  { n: 1, label: "QUEUED", copy: "Accepts the mission. Stretches." },
  { n: 2, label: "SEARCHING", copy: "Casts a wide net across YouTube, Reddit, the open web." },
  { n: 3, label: "FETCHING", copy: "Opens the 61 tabs so you don't have to." },
  { n: 4, label: "EXTRACTING", copy: "Finds the sentences that matter. Flags the paid ones." },
  { n: 5, label: "SYNTHESIZING", copy: "Argues with itself until one verdict wins." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1">
        {/* HERO */}
        <div className="mx-auto grid max-w-[1128px] grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-2xl bg-well px-3.5 py-2 font-mono text-[11px] font-semibold tracking-widest text-accent-foreground shadow-[var(--shadow-well)]">
              <span className="size-2 rounded-full bg-accent" />
              PURCHASE RESEARCH, WITH RECEIPTS
            </div>
            <h1 className="text-balance font-serif text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
              Skip the forty tabs.
            </h1>
            <p className="mt-6 max-w-[490px] text-pretty font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Tell it what you&apos;re buying. It watches the reviews, reads the threads, flags
              who got paid to say what — and squeezes the whole mess into one honest, sourced
              verdict.
            </p>

            <div className="mt-8 flex flex-col items-stretch gap-3 rounded-[22px] bg-chip p-2.5 pl-5 shadow-[var(--shadow-well)] sm:flex-row sm:items-center">
              <div className="flex-1 overflow-hidden whitespace-nowrap font-serif text-base italic text-muted-foreground">
                Best noise-cancelling headphones under $300…
              </div>
              <Link
                href="/app"
                className={buttonVariants({ size: "lg", className: "whitespace-nowrap" })}
              >
                Research it →
              </Link>
            </div>
            <div className="mt-3.5 font-mono text-[11.5px] tracking-wide text-muted-foreground">
              3 free reports a month · no card · no affiliate kickbacks, ever
            </div>
          </div>

          <HeroDemo />
        </div>

        {/* PROOF STRIP */}
        <Reveal>
          <div className="mx-auto max-w-[1128px] px-4 pb-16 sm:px-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {PROOF_STATS.map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl bg-card px-5 py-5 text-center shadow-[var(--shadow-raised)]"
                >
                  <div className="font-serif text-3xl font-extrabold tracking-tight">
                    {s.value}
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] tracking-wide text-muted-foreground">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* THE PROBLEM */}
        <Reveal>
          <div className="mx-auto max-w-[1128px] px-4 pb-20 sm:px-6">
            <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
              THE PROBLEM
            </div>
            <h2 className="mt-3.5 max-w-[640px] text-balance font-serif text-3xl font-extrabold leading-tight sm:text-[44px]">
              The internet has opinions. Most of them are paid.
            </h2>
            <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-3">
              {PROBLEM_CARDS.map((card) => (
                <div
                  key={card.tag}
                  className="relative rounded-3xl bg-card px-6 py-6 shadow-[var(--shadow-raised)]"
                >
                  <div className="font-mono text-[10.5px] font-semibold tracking-wide text-muted-foreground">
                    {card.tag}
                  </div>
                  <p className="mt-3 font-serif text-base leading-snug">{card.quote}</p>
                  <span className="absolute -top-3 right-4 rotate-[-6deg] rounded-xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-3 py-1.5 font-mono text-[10px] font-bold tracking-wide text-primary-foreground">
                    {card.badge}
                  </span>
                  <div className="mt-3.5 font-mono text-[10.5px] text-primary">{card.note}</div>
                </div>
              ))}
            </div>
            <p className="mt-8 max-w-[560px] text-pretty font-serif text-lg leading-relaxed text-muted-foreground">
              The Verdict Room reads all of it anyway — then labels who got paid, weighs it
              accordingly, and never lets a coupon code write your verdict.
            </p>
          </div>
        </Reveal>

        {/* HOW TEASER */}
        <Reveal>
          <div className="mx-auto max-w-[1128px] px-4 pb-20 sm:px-6">
            <div className="rounded-[30px] bg-card px-6 py-9 shadow-[var(--shadow-raised-lg)] sm:px-11">
              <div className="flex flex-wrap items-baseline justify-between gap-5">
                <h2 className="text-balance font-serif text-3xl font-extrabold tracking-tight sm:text-[40px]">
                  One query in. Five stages. One verdict out.
                </h2>
                <Link
                  href="/how-it-works"
                  className="font-mono text-[12.5px] font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  See the whole pipeline →
                </Link>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-5">
                {PIPELINE_STEPS.map((step) => (
                  <div key={step.n} className="flex flex-col gap-2.5">
                    <span
                      className={
                        "flex size-11 items-center justify-center rounded-2xl font-mono text-[15px] font-bold " +
                        (step.n === 5
                          ? "bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] text-primary-foreground shadow-[var(--shadow-btn-primary)]"
                          : "bg-well text-accent-foreground shadow-[var(--shadow-well)]")
                      }
                    >
                      {step.n}
                    </span>
                    <div
                      className={
                        "font-mono text-[11px] font-bold tracking-wide " +
                        (step.n === 5 ? "text-primary" : "text-foreground")
                      }
                    >
                      {step.label}
                    </div>
                    <p className="font-serif text-[13.5px] leading-snug text-muted-foreground">
                      {step.copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        {/* REPORT PREVIEW */}
        <Reveal>
          <div className="mx-auto max-w-[1128px] px-4 pb-20 sm:px-6">
            <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
              WHAT YOU GET
            </div>
            <h2 className="mt-3.5 max-w-[700px] text-balance font-serif text-3xl font-extrabold leading-tight sm:text-[44px]">
              A verdict you can check, not a vibe you must trust.
            </h2>

            <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="flex flex-col gap-4.5">
                <div className="rounded-3xl bg-[linear-gradient(150deg,var(--ink-light),var(--ink))] px-7 py-7 shadow-[var(--shadow-ink)]">
                  <div className="font-mono text-[10px] font-bold tracking-widest text-accent-light">
                    THE VERDICT
                  </div>
                  <p className="mt-3 text-pretty font-serif text-lg leading-relaxed text-ink-foreground">
                    Buy the Sony WH-1000XM6. It&apos;s the only pair here that wins on the thing
                    you actually asked for: silence at 38,000 feet. Ignore the &ldquo;$120
                    flagship killer&rdquo; — every source pushing it had a coupon code.
                  </p>
                </div>
                <div className="flex items-center gap-4 rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-raised)]">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-well font-mono text-[15px] font-bold text-accent-foreground shadow-[var(--shadow-well)]">
                    1
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-base font-bold">Sony WH-1000XM6</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                      + CLASS-LEADING ANC &nbsp; − STRETCHES THE BUDGET
                    </div>
                  </div>
                  <span className="rounded-xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-3 py-1.5 font-mono text-[13px] font-bold text-primary-foreground">
                    9.1
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3.5">
                <div className="rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-raised)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10.5px] font-semibold tracking-wide text-muted-foreground">
                      r/ REDDIT · u/cabin_crew_kate
                    </span>
                    <span className="rounded-md bg-[#e9dcb4] px-2 py-1 font-mono text-[9.5px] font-semibold text-[#5a4a22]">
                      ORGANIC · 96%
                    </span>
                  </div>
                  <p className="mt-2 font-serif text-sm leading-relaxed">
                    &ldquo;Flew 61 legs last year with the XM6. The hum just… leaves. Worth every
                    dollar.&rdquo;
                  </p>
                </div>
                <div className="rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-raised)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10.5px] font-semibold tracking-wide text-muted-foreground">
                      ▶ YOUTUBE · TechDad Reviews
                    </span>
                    <span className="rounded-md bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-2 py-1 font-mono text-[9.5px] font-semibold text-primary-foreground">
                      SPONSORED · 88%
                    </span>
                  </div>
                  <p className="mt-2 font-serif text-sm leading-relaxed">
                    Glowing 9/10 — but the unit was free and the brand approved the cut before
                    upload.
                  </p>
                </div>
                <div className="flex items-center gap-2 px-1">
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#e9dcb4] text-[10px] text-[#5a4a22]">
                    ✦
                  </span>
                  <span className="font-mono text-[11px] tracking-wide text-accent-foreground">
                    Sponsored voices: shown separately, never excluded. Weigh accordingly.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* PRICING TEASER */}
        <Reveal>
          <div className="mx-auto max-w-[1128px] px-4 pb-20 sm:px-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-[26px] bg-card px-8 py-8 shadow-[var(--shadow-raised-lg)]">
                <div className="font-mono text-[11px] font-bold tracking-widest text-muted-foreground">
                  CURIOUS — $0
                </div>
                <div className="mt-2 font-serif text-2xl font-extrabold tracking-tight">
                  Kick the tires.
                </div>
                <p className="mt-2 font-serif text-[15px] leading-relaxed text-muted-foreground">
                  3 reports a month, full source lists, every paid voice labeled. Enough to never
                  trust a listicle again.
                </p>
              </div>
              <div className="relative rounded-[26px] bg-[linear-gradient(150deg,var(--ink-light),var(--ink))] px-8 py-8 shadow-[var(--shadow-ink)]">
                <div className="font-mono text-[11px] font-bold tracking-widest text-accent-light">
                  PRO — $12/MO
                </div>
                <div className="mt-2 font-serif text-2xl font-extrabold tracking-tight text-ink-foreground">
                  For the chronically curious.
                </div>
                <p className="mt-2 font-serif text-[15px] leading-relaxed text-[#cbbf9e]">
                  Unlimited reports. Cheaper than one bad purchase.
                </p>
                <Link
                  href="/pricing"
                  className="absolute top-8 right-8 font-mono text-xs font-semibold text-accent-light hover:text-ink-foreground"
                >
                  Compare →
                </Link>
              </div>
            </div>
          </div>
        </Reveal>

        {/* FINAL CTA */}
        <Reveal>
          <div className="mx-auto max-w-[1128px] px-4 pb-20 sm:px-6">
            <div className="rounded-[34px] bg-card px-8 py-16 text-center shadow-[var(--shadow-raised-lg)] sm:px-10">
              <h2 className="mx-auto max-w-2xl text-balance font-serif text-4xl font-extrabold leading-tight sm:text-5xl">
                Stop reading ads dressed as advice.
              </h2>
              <p className="mx-auto mt-4 max-w-[460px] font-serif text-lg leading-relaxed text-muted-foreground">
                Your next purchase deserves a researcher, not an algorithm with a coupon code.
              </p>
              <Link href="/app" className={buttonVariants({ size: "lg", className: "mt-8" })}>
                Run your first research — free →
              </Link>
              <div className="mt-4 font-mono text-[11px] tracking-wide text-muted-foreground">
                NO CARD · NO SPAM · NO &ldquo;PARTNER PICKS&rdquo;
              </div>
            </div>
          </div>
        </Reveal>
      </main>

      <MarketingFooter />
    </div>
  );
}
