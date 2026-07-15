import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { MarketingFooter } from "@/components/footer";

export const metadata: Metadata = {
  title: "About",
  description: "Why The Verdict Room exists, and the pledge behind it: no affiliate links, ever.",
  alternates: { canonical: "/about" },
};

const PRINCIPLES = [
  {
    icon: "🧾",
    title: "Receipts, or it didn't happen",
    copy: "Every sentence in a verdict traces to a source you can open. No vibes, no “our testing shows”, no trust-me-bro.",
  },
  {
    icon: "🏷️",
    title: "Paid ≠ disqualified. Paid = labeled.",
    copy: "Censoring the sponsored web would hide the market. We keep it — in its own pile, wearing a name tag.",
  },
  {
    icon: "🎯",
    title: "Your question, answered",
    copy: "Not “the best headphones” — the best ones for a $300 budget and a long-haul flight. Constraints are the whole point.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[1128px] flex-1 px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-[720px]">
          <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
            ABOUT
          </div>
          <h1 className="mt-3.5 text-balance font-serif text-4xl font-extrabold leading-tight sm:text-[58px]">
            We read the comments so you don&apos;t have to.
          </h1>
          <p className="mt-6 text-pretty font-serif text-lg leading-relaxed text-[#5a4a32]">
            The Verdict Room started the way most tools do: with a Tuesday lost to forty tabs.
            Somewhere between the eleventh “BEST headphones 2026!!” video and a Reddit thread
            contradicting all of them, a thought landed — <em>the information is all here.
            Somebody just has to read it honestly.</em>
          </p>
          <p className="mt-4 text-pretty font-serif text-lg leading-relaxed text-[#5a4a32]">
            So that&apos;s the whole product. A researcher that watches the reviews, reads the
            threads, checks who got paid, and writes up what it found — with every claim linked,
            so you can call its bluff.
          </p>
        </div>

        <Reveal>
          <div className="mt-13 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="rounded-3xl bg-card px-7 py-7 shadow-[var(--shadow-raised)]">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-well text-lg shadow-[var(--shadow-well)]">
                  {p.icon}
                </div>
                <h3 className="mt-4 font-serif text-xl font-extrabold tracking-tight">
                  {p.title}
                </h3>
                <p className="mt-2.5 font-serif text-[14.5px] leading-relaxed text-muted-foreground">
                  {p.copy}
                </p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-13 grid grid-cols-1 items-center gap-7 rounded-[28px] bg-[linear-gradient(150deg,var(--ink-light),var(--ink))] px-8 py-9 shadow-[var(--shadow-ink)] sm:grid-cols-[1fr_auto] sm:px-10">
            <div>
              <div className="font-mono text-[10.5px] font-bold tracking-widest text-accent-light">
                THE PLEDGE
              </div>
              <p className="mt-2.5 max-w-[560px] text-pretty font-serif text-xl leading-relaxed text-ink-foreground">
                No affiliate links. No sponsored placements. No “partner picks”. If a verdict is
                wrong, it&apos;s because we misread the internet — never because someone paid us
                to.
              </p>
            </div>
            <span className="flex size-[130px] shrink-0 rotate-[-8deg] items-center justify-center rounded-full border-2 border-double border-accent-light/60 p-2.5 text-center font-mono text-[11px] font-bold tracking-wide text-accent-light">
              0 KICKBACKS
              <br />
              SINCE
              <br />
              DAY ONE
            </span>
          </div>
        </Reveal>
      </main>

      <MarketingFooter />
    </div>
  );
}
