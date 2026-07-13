import { ExternalLink, Globe, MessageSquare, SquarePlay } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

function SponsorshipBadge({
  sponsorship,
  sponsorConfidence,
}: {
  sponsorship: Sponsorship | null;
  sponsorConfidence: number | null;
}) {
  if (!sponsorship) {
    return (
      <Badge variant="outline" className="font-mono">
        Unclassified
      </Badge>
    );
  }

  const confidenceLabel =
    sponsorConfidence !== null ? ` · ${Math.round(sponsorConfidence * 100)}%` : "";

  return (
    <Badge
      variant={sponsorship === "organic" ? "outline" : "default"}
      className="font-mono capitalize"
    >
      {sponsorship}
      {confidenceLabel}
    </Badge>
  );
}

function SourceCard({ source }: { source: ResearchSource }) {
  const Icon = PLATFORM_ICONS[source.platform];

  return (
    <Card size="sm" className="border-2 border-foreground shadow-none">
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">
            <Icon className="size-3.5" />
            {PLATFORM_LABELS[source.platform]}
            {source.author ? (
              <span className="normal-case text-muted-foreground/80">
                · {source.author}
              </span>
            ) : null}
          </div>
          <SponsorshipBadge
            sponsorship={source.sponsorship}
            sponsorConfidence={source.sponsorConfidence}
          />
        </div>

        {source.summary ? (
          <p className="font-serif text-sm text-foreground">{source.summary}</p>
        ) : null}

        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 self-start break-all font-mono text-xs text-primary underline-offset-4 hover:underline"
        >
          {source.url}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      </CardContent>
    </Card>
  );
}

interface SourceListProps {
  sources: ResearchSource[];
}

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) {
    return null;
  }

  const organic = sources.filter((s) => s.sponsorship === "organic");
  const sponsoredOrAffiliate = sources.filter(
    (s) => s.sponsorship === "sponsored" || s.sponsorship === "affiliate"
  );
  const unclassified = sources.filter((s) => s.sponsorship === null);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Organic sources ({organic.length})
        </h2>
        {organic.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {organic.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        ) : (
          <p className="mt-3 font-serif text-sm text-muted-foreground">
            No organic sources yet.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Sponsored &amp; affiliate sources ({sponsoredOrAffiliate.length})
        </h2>
        <p className="mt-1 font-serif text-sm text-muted-foreground">
          Shown separately, never excluded — weigh accordingly.
        </p>
        {sponsoredOrAffiliate.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {sponsoredOrAffiliate.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        ) : (
          <p className="mt-3 font-serif text-sm text-muted-foreground">
            No sponsored or affiliate sources found.
          </p>
        )}
      </section>

      {unclassified.length > 0 ? (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Unclassified sources ({unclassified.length})
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {unclassified.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
