import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Globe,
  Inbox,
  MessageSquare,
  Scale,
  ScanSearch,
  Search,
  SquarePlay,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { FramedPhoto, PHOTOS } from "@/components/framed-photo";
import { MarketingFooter } from "@/components/footer";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Search, fetch, extract, and synthesize. How The Verdict Room turns a question into a sourced verdict.",
  alternates: { canonical: "/how-it-works" },
};

type Stage = {
  n: number;
  label: string;
  Icon: LucideIcon;
  copy: string;
  detail: React.ReactNode;
  dark?: boolean;
};

const STAGES: Stage[] = [
  {
    n: 1,
    label: "QUEUED",
    Icon: Inbox,
    copy: "Your question lands in line. We restate it back to ourselves (budget, constraints, the thing you actually care about) so the next four stages answer your question, not a generic one.",
    detail: (
      <div className="rounded-2xl bg-well px-4 py-3 font-mono text-[11.5px] leading-relaxed text-accent-foreground shadow-[var(--shadow-well)]">
        &gt; parsed: headphones
        <br />
        &gt; cap: $300 &nbsp;· use: travel
        <br />
        &gt; priority: cabin silence
      </div>
    ),
  },
  {
    n: 2,
    label: "SEARCHING",
    Icon: Search,
    copy: "Wide net across YouTube, Reddit and the open web. Review channels and listicles, sure, but also the six-month-later threads and warranty horror stories nobody sponsors.",
    detail: (
      <div className="flex gap-2">
        {[
          { Icon: SquarePlay, label: "YOUTUBE" },
          { Icon: MessageSquare, label: "REDDIT" },
          { Icon: Globe, label: "OPEN WEB" },
        ].map((p) => (
          <span
            key={p.label}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-well px-3.5 py-3 font-mono text-[9.5px] font-bold tracking-wide text-accent-foreground shadow-[var(--shadow-well)]"
          >
            <p.Icon className="size-4 text-primary" strokeWidth={1.75} />
            {p.label}
          </span>
        ))}
      </div>
    ),
  },
  {
    n: 3,
    label: "FETCHING",
    Icon: Globe,
    copy: "We open dozens of tabs so you don't have to (up to 50 on Pro), searched across the web, Reddit threads, and YouTube reviews, not just one search engine. Transcripts pulled, threads unrolled, paywalled fluff skipped. Every document gets a receipt: who wrote it, when, where, including the ones that didn't make the cut.",
    detail: (
      <div className="rounded-2xl bg-well px-5 py-3 text-center shadow-[var(--shadow-well)]">
        <div className="font-serif text-3xl font-extrabold">50</div>
        <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground">
          TABS, OPENED FOR YOU, MAX
        </div>
      </div>
    ),
  },
  {
    n: 4,
    label: "EXTRACTING",
    Icon: ScanSearch,
    copy: "The forensic bit. Claims get pulled out with their evidence; every voice gets a sponsorship check for coupon codes, “unit provided by”, affiliate URLs, brand-approved cuts. Paid isn't disqualified. Paid is labeled, with a confidence score.",
    detail: (
      <div className="flex flex-col items-end gap-2">
        <span className="rounded-lg bg-[#e9dcb4] px-2.5 py-1 font-mono text-[10px] font-semibold text-[#5a4a22]">
          ORGANIC · 96%
        </span>
        <span className="rounded-lg bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-2.5 py-1 font-mono text-[10px] font-semibold text-primary-foreground">
          SPONSORED · 88%
        </span>
        <span className="rounded-lg bg-[linear-gradient(145deg,var(--accent-light),var(--accent))] px-2.5 py-1 font-mono text-[10px] font-semibold text-accent-foreground">
          AFFILIATE · 99%
        </span>
      </div>
    ),
  },
  {
    n: 5,
    label: "SYNTHESIZING",
    Icon: Scale,
    copy: "Organic consensus gets weighed against paid enthusiasm, contradictions get argued out, and what's left standing becomes your verdict, every sentence of it linked back to a source you can click.",
    detail: (
      <div className="rounded-2xl bg-white/5 px-4 py-3 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold tracking-widest text-accent-light">
          <Scale className="size-3" strokeWidth={2} />
          VERDICT
        </div>
        <div className="mt-1 font-serif text-sm text-ink-foreground">
          One answer. Every receipt linked.
        </div>
      </div>
    ),
    dark: true,
  },
];

export default function HowItWorksPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[1128px] flex-1 px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
              THE PIPELINE
            </div>
            <h1 className="mt-3.5 max-w-[720px] text-balance font-serif text-4xl font-extrabold leading-tight sm:text-[58px]">
              What happens in the four minutes.
            </h1>
            <p className="mt-5 max-w-[540px] text-pretty font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
              No magic, no “proprietary AI scoring”. A pipeline with five stages, each one
              auditable, each one visible while it runs.
            </p>
          </div>
          <FramedPhoto
            src={PHOTOS.headphones}
            alt="Headphones under research, the running example for the pipeline"
            className="aspect-[5/4] w-full"
            sizes="(max-width: 1024px) 100vw, 420px"
            priority
          />
        </div>

        <div className="mt-12 flex flex-col gap-5">
          {STAGES.map((stage) => (
            <Reveal key={stage.n}>
              <div
                className={
                  "grid grid-cols-1 items-center gap-6 rounded-[26px] px-6 py-6 sm:grid-cols-[96px_1fr_auto] sm:px-8 " +
                  (stage.dark
                    ? "bg-[linear-gradient(150deg,var(--ink-light),var(--ink))] shadow-[var(--shadow-ink)]"
                    : "bg-card shadow-[var(--shadow-raised)]")
                }
              >
                <div
                  className={
                    "relative flex size-16 items-center justify-center rounded-3xl font-serif text-3xl font-extrabold " +
                    (stage.dark
                      ? "bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] text-primary-foreground"
                      : "bg-well text-accent-foreground shadow-[var(--shadow-well)]")
                  }
                >
                  {stage.n}
                  <span
                    className={
                      "absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-xl " +
                      (stage.dark
                        ? "bg-ink text-accent-light shadow-[var(--shadow-ink)]"
                        : "bg-card text-primary shadow-[var(--shadow-raised)]")
                    }
                  >
                    <stage.Icon className="size-3.5" strokeWidth={2} />
                  </span>
                </div>
                <div>
                  <div
                    className={
                      "font-mono text-[11.5px] font-bold tracking-wide " +
                      (stage.dark ? "text-accent-light" : "")
                    }
                  >
                    {stage.label}
                  </div>
                  <p
                    className={
                      "mt-2 font-serif text-base leading-relaxed " +
                      (stage.dark ? "text-[#d8cba0]" : "text-muted-foreground")
                    }
                  >
                    {stage.copy}
                  </p>
                </div>
                <div className="justify-self-start sm:justify-self-end">{stage.detail}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[26px] bg-card px-8 py-8 shadow-[var(--shadow-raised)]">
              <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
                THE HONESTY RULE
              </div>
              <h3 className="mt-3 font-serif text-2xl font-extrabold tracking-tight">
                Shown separately. Never excluded.
              </h3>
              <p className="mt-3 text-pretty font-serif text-base leading-relaxed text-muted-foreground">
                Deleting paid reviews would just hide the market. Instead, every sponsored,
                affiliate and freebie voice sits in its own clearly-marked pile, so you can see
                what the money is saying, and weigh it accordingly.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 rounded-[26px] bg-card px-8 py-8 shadow-[var(--shadow-raised)]">
              <p className="font-serif text-lg italic leading-relaxed text-[#5a4a32]">
                &ldquo;Watch it run, poke the sources, disagree with the verdict. It&apos;s your
                research. We just did the reading.&rdquo;
              </p>
              <Link href="/app" className={buttonVariants({ size: "lg", className: "self-start" })}>
                Run one now
                <ArrowRight />
              </Link>
            </div>
          </div>
        </Reveal>
      </main>

      <MarketingFooter />
    </div>
  );
}
