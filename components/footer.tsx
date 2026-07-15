import Link from "next/link";

const FOOTER_LINKS = {
  product: [
    { href: "/how-it-works", label: "How it works" },
    { href: "/pricing", label: "Pricing" },
    { href: "/app", label: "Run a research" },
  ],
  company: [
    { href: "/about", label: "About" },
    { href: "/privacy", label: "Privacy" },
    { href: "/login", label: "Sign in" },
  ],
} as const;

// Full 4-column footer for marketing pages, per the design's "isMarketing" split.
export function MarketingFooter() {
  return (
    <footer className="mx-auto mb-8 w-[calc(100%-24px)] max-w-[1128px] sm:w-[calc(100%-48px)]">
      <div className="rounded-[28px] bg-card px-6 py-8 shadow-[var(--shadow-raised-lg)] sm:px-11 sm:pt-10 sm:pb-7">
        <div className="grid grid-cols-2 gap-7 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] pb-px font-serif text-base font-extrabold text-primary-foreground shadow-[var(--shadow-btn-primary)]">
                V
              </span>
              <span className="font-serif text-base font-bold">The Verdict Room</span>
            </div>
            <p className="mt-3.5 max-w-[250px] font-serif text-sm leading-relaxed text-muted-foreground">
              Hours of review-watching and thread-reading, distilled into a verdict you can check.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              PRODUCT
            </span>
            {FOOTER_LINKS.product.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-mono text-[12.5px] text-muted-foreground hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              COMPANY
            </span>
            {FOOTER_LINKS.company.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-mono text-[12.5px] text-muted-foreground hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="col-span-2 flex flex-col items-start gap-3 sm:col-span-1">
            <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              THE PLEDGE
            </span>
            <span className="inline-block -rotate-2 rounded-xl border-2 border-double border-primary/55 px-3 py-2 font-mono text-[10.5px] font-bold tracking-wide text-primary">
              0 AFFILIATE LINKS
              <br />
              SINCE DAY ONE
            </span>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3.5 border-t border-border/60 pt-4">
          <span className="font-mono text-[11px] text-muted-foreground">
            © 2026 The Verdict Room. Made by people who read the comments.
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            Opinions were harmed in the making of every verdict.
          </span>
        </div>
      </div>
    </footer>
  );
}

// Compact one-line footer for app screens, per the design's "isAppFoot" split.
export function AppFooter() {
  return (
    <footer className="mx-auto mb-6 flex w-[calc(100%-24px)] max-w-[1128px] flex-wrap justify-between gap-3 sm:w-[calc(100%-48px)]">
      <span className="font-mono text-[10.5px] text-muted-foreground">
        © 2026 THE VERDICT ROOM
      </span>
      <span className="font-mono text-[10.5px] text-muted-foreground">
        SPONSORED ≠ ORGANIC · WEIGH ACCORDINGLY
      </span>
    </footer>
  );
}
