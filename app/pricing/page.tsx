import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { MarketingFooter } from "@/components/footer";
import { PricingFaq } from "@/components/pricing-faq";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Two plans, no affiliate money. Free forever, or $12/month for unlimited reports.",
  alternates: { canonical: "/pricing" },
};

const FREE_FEATURES = [
  { included: true, text: "3 research reports a month" },
  { included: true, text: "Up to 12 sources read per query" },
  { included: true, text: "Every paid voice labeled, with confidence" },
  { included: true, text: "Full source list on every report" },
];

const PRO_FEATURES = ["Unlimited reports"];

const FAQS = [
  {
    q: "Why won't you just take affiliate money?",
    a: "Because the moment our rent depends on your click, our verdicts start drifting toward whatever pays best. $12 keeps us loyal to exactly one party: you.",
  },
  {
    q: "Do you delete sponsored reviews?",
    a: "Never. Sometimes the paid reviewer is right — you just deserve to know they were paid. Sponsored voices are shown separately, labeled with a confidence score, and weighed accordingly in the verdict.",
  },
  {
    q: "What counts as one “report”?",
    a: "One question, one full pipeline run. Re-running the same query within 24 hours is free — it returns your existing report instead of costing you another slot.",
  },
  {
    q: "Is my research history private?",
    a: "Yes. Your queries are yours — never sold, never used to target you with the very ads we exist to see through. See our privacy page for exactly what we store and which services help fulfill a search.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

export default function PricingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[1128px] flex-1 px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
            PRICING
          </div>
          <h1 className="mx-auto mt-3.5 max-w-[760px] text-balance font-serif text-4xl font-extrabold leading-tight sm:text-[58px]">
            Cheaper than one regretted purchase.
          </h1>
          <p className="mx-auto mt-4 max-w-[480px] font-serif text-lg leading-relaxed text-muted-foreground">
            Two plans. No “Contact sales”. And since we take zero affiliate money, the
            subscription <em>is</em> the business model.
          </p>
        </div>

        <Reveal>
          <div className="mt-13 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex flex-col rounded-[30px] bg-card px-9 py-9 shadow-[var(--shadow-raised-lg)]">
              <div className="font-mono text-[11.5px] font-bold tracking-widest text-muted-foreground">
                CURIOUS
              </div>
              <div className="mt-3.5 flex items-baseline gap-2">
                <span className="font-serif text-5xl font-extrabold tracking-tight">$0</span>
                <span className="font-mono text-xs text-muted-foreground">FOREVER</span>
              </div>
              <p className="mt-2.5 font-serif text-[15.5px] text-muted-foreground">
                Enough to never trust a listicle again.
              </p>
              <div className="my-6 flex flex-col gap-3">
                {FREE_FEATURES.map((f) => (
                  <div key={f.text} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#e9dcb4] text-[11px] text-[#5a4a22]">
                      ✓
                    </span>
                    <span className="font-serif text-[15px] leading-relaxed">{f.text}</span>
                  </div>
                ))}
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-well text-[11px] text-muted-foreground">
                    –
                  </span>
                  <span className="font-serif text-[15px] leading-relaxed text-muted-foreground">
                    Unlimited reports
                  </span>
                </div>
              </div>
              <Link href="/app" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-auto")}>
                Start free
              </Link>
            </div>

            <div className="relative flex flex-col rounded-[30px] bg-[linear-gradient(150deg,var(--ink-light),var(--ink))] px-9 py-9 shadow-[var(--shadow-ink)]">
              <span className="absolute top-[-14px] right-8 rotate-[3deg] rounded-xl bg-[linear-gradient(145deg,var(--accent-light),var(--accent))] px-3.5 py-1.5 font-mono text-[10px] font-bold tracking-wide text-accent-foreground">
                COMING SOON
              </span>
              <div className="font-mono text-[11.5px] font-bold tracking-widest text-accent-light">
                PRO
              </div>
              <div className="mt-3.5 flex items-baseline gap-2">
                <span className="font-serif text-5xl font-extrabold tracking-tight text-ink-foreground">
                  $12
                </span>
                <span className="font-mono text-xs text-[#a8987a]">/ MONTH</span>
              </div>
              <p className="mt-2.5 font-serif text-[15.5px] text-[#cbbf9e]">
                For the chronically curious. Billing isn&apos;t live yet — this is the plan, not
                yet a purchase.
              </p>
              <div className="my-6 flex flex-col gap-3">
                {PRO_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] text-[11px] text-primary-foreground">
                      ✓
                    </span>
                    <span className="font-serif text-[15px] leading-relaxed text-ink-foreground">
                      {f}
                    </span>
                  </div>
                ))}
                <p className="mt-1 font-serif text-[14px] leading-relaxed text-[#a8987a]">
                  Same pipeline, same source count, same paid-voice labeling as Curious — Pro
                  just removes the monthly cap. We&apos;d rather ship one honest perk than a list
                  of things we haven&apos;t built yet.
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Pro billing isn't live yet"
                className="mt-auto inline-flex h-12 cursor-not-allowed items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--accent-light)]/45 px-6 text-[0.95rem] font-medium text-[color:var(--accent-light)] font-mono"
              >
                Coming soon
              </button>
            </div>
          </div>
        </Reveal>

        <div className="mt-4 text-center font-mono text-[11px] tracking-wide text-muted-foreground">
          USD · PRO BILLING NOT LIVE YET · FREE TIER NEEDS NO CARD
        </div>

        <Reveal className="mx-auto mt-16 max-w-[760px]">
          <div className="mb-5 text-center font-mono text-[11px] font-bold tracking-widest text-primary/80">
            REASONABLE QUESTIONS
          </div>
          <PricingFaq faqs={FAQS} />
        </Reveal>
      </main>

      <MarketingFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
    </div>
  );
}
