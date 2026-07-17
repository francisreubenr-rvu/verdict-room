"use client";

import { useState } from "react";
import { ExternalLink, Globe, MessageSquare, SquarePlay } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Platform, ResearchSource, Sponsorship } from "@/components/research-types";

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  reddit: "Reddit",
  web: "Web",
};

const PLATFORM_ICONS: Record<Platform, typeof Globe> = {
  youtube: SquarePlay,
  reddit: MessageSquare,
  web: Globe,
};

function badgeVariantFor(sponsorship: Sponsorship | null): "organic" | "sponsored" | "affiliate" | "unclassified" {
  if (sponsorship === "organic") return "organic";
  if (sponsorship === "sponsored") return "sponsored";
  if (sponsorship === "affiliate") return "affiliate";
  return "unclassified";
}

function SponsorshipBadge({
  sponsorship,
  sponsorConfidence,
}: {
  sponsorship: Sponsorship | null;
  sponsorConfidence: number | null;
}) {
  const confidenceLabel =
    sponsorConfidence !== null ? ` · ${Math.round(sponsorConfidence * 100)}%` : "";

  return (
    <Badge variant={badgeVariantFor(sponsorship)}>
      {sponsorship ?? "unclassified"}
      {confidenceLabel}
    </Badge>
  );
}

function SourceCard({
  source,
  tinted,
  dashed,
}: {
  source: ResearchSource;
  tinted?: boolean;
  dashed?: boolean;
}) {
  const Icon = PLATFORM_ICONS[source.platform];

  return (
    <div
      className={cn(
        "rounded-2xl px-5 py-4 transition-transform hover:-translate-y-0.5",
        dashed
          ? "border border-dashed border-muted-foreground/40 bg-card shadow-[0_4px_16px_rgba(43,33,22,0.08)]"
          : "shadow-[var(--shadow-raised)]",
        !dashed && (tinted ? "bg-chip" : "bg-card")
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wide text-muted-foreground">
          <Icon className="size-3.5 text-primary" />
          {PLATFORM_LABELS[source.platform]}
          {source.author ? <span className="text-muted-foreground/80"> · {source.author}</span> : null}
        </div>
        <SponsorshipBadge
          sponsorship={source.sponsorship}
          sponsorConfidence={source.sponsorConfidence}
        />
      </div>

      {source.platform === "youtube" && source.reviewDraft ? (
        <>
          <p className="mt-2.5 font-serif text-sm leading-relaxed text-foreground">
            {source.reviewDraft}
          </p>
          {source.groundednessConfidence !== null && source.groundednessConfidence < 0.6 ? (
            <p className="mt-1.5 font-mono text-[10px] tracking-wide text-muted-foreground">
              ⚠ low confidence — this video&apos;s transcript was thin or unclear (
              {Math.round(source.groundednessConfidence * 100)}% grounded)
            </p>
          ) : null}
        </>
      ) : source.summary ? (
        <p className="mt-2.5 font-serif text-sm leading-relaxed text-foreground">
          {source.summary}
        </p>
      ) : null}

      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
      >
        {source.url}
        <ExternalLink className="size-3 shrink-0" />
      </a>
    </div>
  );
}

type Filter = "all" | "organic" | "paid" | "unclassified";

interface SourceListProps {
  sources: ResearchSource[];
}

export function SourceList({ sources }: SourceListProps) {
  const [filter, setFilter] = useState<Filter>("all");

  if (sources.length === 0) {
    return null;
  }

  const organic = sources.filter((s) => s.sponsorship === "organic");
  const paid = sources.filter((s) => s.sponsorship === "sponsored" || s.sponsorship === "affiliate");
  const unclassified = sources.filter((s) => s.sponsorship === null);

  const showOrg = filter === "all" || filter === "organic";
  const showPaid = filter === "all" || filter === "paid";
  const showUnc = filter === "all" || filter === "unclassified";

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "ALL" },
    { key: "organic", label: `ORGANIC · ${organic.length}` },
    { key: "paid", label: `PAID · ${paid.length}` },
  ];
  if (unclassified.length > 0) {
    tabs.push({ key: "unclassified", label: `UNCLASSIFIED · ${unclassified.length}` });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3.5">
        <span className="font-mono text-[11px] font-bold tracking-widest text-primary/80">
          THE EVIDENCE · {sources.length} SOURCES
        </span>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                "rounded-xl bg-chip px-3.5 py-2 font-mono text-[10.5px] font-semibold text-muted-foreground shadow-[var(--shadow-chip)]",
                filter === tab.key && "text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {showOrg ? (
          <section>
            <div className="mb-2.5 font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
              ORGANIC — NOBODY PAID FOR THESE
            </div>
            {organic.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {organic.map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
              </div>
            ) : (
              <p className="font-serif text-sm text-muted-foreground">No organic sources yet.</p>
            )}
          </section>
        ) : null}

        {showPaid ? (
          <section>
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="font-mono text-[10px] font-bold tracking-wide text-primary">
                SPONSORED &amp; AFFILIATE — THE MONEY&apos;S OPINION
              </span>
              <span className="h-px flex-1 bg-primary/20" />
            </div>
            {paid.length > 0 ? (
              <>
                <div className="flex flex-col gap-2.5">
                  {paid.map((source) => (
                    <SourceCard key={source.id} source={source} tinted />
                  ))}
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#e9dcb4] text-[10px] text-[#5a4a22]">
                    ✦
                  </span>
                  <span className="font-mono text-[10.5px] tracking-wide text-accent-foreground">
                    Shown separately, never excluded — weigh accordingly.
                  </span>
                </div>
              </>
            ) : (
              <p className="font-serif text-sm text-muted-foreground">
                No sponsored or affiliate sources found.
              </p>
            )}
          </section>
        ) : null}

        {showUnc && unclassified.length > 0 ? (
          <section>
            <div className="mb-2.5 font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
              UNCLASSIFIED — WE COULDN&apos;T TELL, SO WE SAY SO
            </div>
            <div className="flex flex-col gap-2.5">
              {unclassified.map((source) => (
                <SourceCard key={source.id} source={source} dashed />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
