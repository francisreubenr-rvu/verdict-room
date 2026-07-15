import type { Metadata } from "next";
import { MarketingFooter } from "@/components/footer";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What The Verdict Room stores, who processes it on our behalf, and what we never do with it.",
};

const PROCESSORS = [
  {
    name: "Groq",
    role: "Reads your query and the full text of every source we fetch to extract findings, classify sponsorship, and write the verdict.",
  },
  {
    name: "Google Custom Search",
    role: "Receives search queries generated from your question to find candidate sources.",
  },
  {
    name: "Jina Reader",
    role: "Fetches the readable text of non-YouTube, non-Reddit source URLs on our behalf.",
  },
  {
    name: "Supabase",
    role: "Hosts our database and handles Google Sign-In — your account and research history live here.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-16 sm:px-6 sm:py-20">
        <div className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
          PRIVACY
        </div>
        <h1 className="mt-3.5 text-balance font-serif text-4xl font-extrabold leading-tight sm:text-5xl">
          What we store, and who sees it.
        </h1>
        <p className="mt-6 text-pretty font-serif text-lg leading-relaxed text-[#5a4a32]">
          Your queries and reports are yours: scoped to your account, never sold, never used to
          target you with ads. Running a research session does mean sending data to a small set
          of services that do the actual work — here they are, in plain terms.
        </p>

        <h2 className="mt-11 font-serif text-2xl font-extrabold">What we store</h2>
        <p className="mt-3 text-pretty font-serif text-base leading-relaxed text-[#5a4a32]">
          Your query text, the parsed product/use case/budget, the sources and findings gathered
          for it, and the resulting verdict — tied to your account, visible only to you.
        </p>

        <h2 className="mt-9 font-serif text-2xl font-extrabold">Who else touches it</h2>
        <p className="mt-3 text-pretty font-serif text-base leading-relaxed text-[#5a4a32]">
          Fulfilling a research session means these services process parts of your query or the
          public content we gather:
        </p>
        <ul className="mt-4 flex flex-col gap-3.5">
          {PROCESSORS.map((p) => (
            <li key={p.name} className="rounded-2xl bg-card px-5 py-4 shadow-[var(--shadow-raised)]">
              <div className="font-serif text-base font-bold">{p.name}</div>
              <div className="mt-1 font-serif text-sm leading-relaxed text-muted-foreground">
                {p.role}
              </div>
            </li>
          ))}
        </ul>

        <h2 className="mt-9 font-serif text-2xl font-extrabold">Shared source cache</h2>
        <p className="mt-3 text-pretty font-serif text-base leading-relaxed text-[#5a4a32]">
          Fetched source content (a YouTube transcript, a Reddit thread, a review page) is cached
          and reused across sessions and users to avoid re-fetching public web content — this
          cache holds public content only, never your query text or verdict.
        </p>

        <h2 className="mt-9 font-serif text-2xl font-extrabold">What we never do</h2>
        <p className="mt-3 text-pretty font-serif text-base leading-relaxed text-[#5a4a32]">
          We don&apos;t sell your data, run ad targeting, or share your query history with anyone
          outside the processors listed above.
        </p>
      </main>

      <MarketingFooter />
    </div>
  );
}
