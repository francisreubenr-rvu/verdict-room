"use client";

import { useState } from "react";

export interface Faq {
  q: string;
  a: string;
}

// Split out of app/pricing/page.tsx so the page itself can be a server component with its own
// `metadata` export — the FAQ toggle was the only reason the whole page needed "use client"
// (E5 finding).
export function PricingFaq({ faqs }: { faqs: Faq[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3.5">
      {faqs.map((faq, i) => {
        const open = openFaq === i;
        return (
          <div key={faq.q} className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-raised)]">
            <button
              type="button"
              onClick={() => setOpenFaq(open ? null : i)}
              className="flex w-full items-center justify-between gap-3.5 px-6 py-4.5 text-left hover:bg-well/40"
            >
              <span className="font-serif text-lg font-bold">{faq.q}</span>
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-well font-mono font-bold text-accent-foreground shadow-[var(--shadow-well)]">
                {open ? "−" : "+"}
              </span>
            </button>
            {open ? (
              <p className="px-6 pb-5 font-serif text-[15.5px] leading-relaxed text-muted-foreground">
                {faq.a}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
