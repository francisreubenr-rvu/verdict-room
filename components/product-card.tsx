"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { ResearchOption } from "@/components/research-types";

interface ProductCardProps {
  sessionId: string;
  option: ResearchOption | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function fetchProductImage(
  sessionId: string,
  optionId: string
): Promise<{ imageUrl: string | null }> {
  const res = await fetch(`/api/research/${sessionId}/product-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch product image (${res.status})`);
  }
  return res.json();
}

function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProductCard({ sessionId, option, open, onOpenChange }: ProductCardProps) {
  // Backward compat: old sessions' verdictJson predates overBudget/priceNote/sourceUrls/imageUrl/
  // id — every read below is undefined-safe rather than trusting ResearchOption's declared types.
  const overBudget = option?.overBudget === true;
  const priceNote = option?.priceNote ?? null;
  const sourceUrls = option?.sourceUrls ?? [];
  const cachedImageUrl = option?.imageUrl ?? null;
  const optionId = option?.id ?? null;

  // Only fetch when the card is open, no cached image exists yet, and the option actually has a
  // row id to look up (an old pre-migration session has id: null — nothing to fetch or persist).
  const shouldFetchImage = open && !cachedImageUrl && Boolean(optionId);
  const { data: fetchedImage, isLoading: imageLoading } = useQuery({
    queryKey: ["product-image", sessionId, optionId],
    queryFn: () => fetchProductImage(sessionId, optionId as string),
    enabled: shouldFetchImage,
    staleTime: Infinity,
    retry: false,
  });

  const imageUrl = cachedImageUrl ?? fetchedImage?.imageUrl ?? null;

  if (!option) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-well font-mono text-[15px] font-bold text-accent-foreground shadow-[var(--shadow-well)]">
                {option.rank}
              </span>
              <DialogTitle className="text-balance font-serif text-xl font-bold leading-tight">
                {option.name}
              </DialogTitle>
            </div>
            <span className="shrink-0 rounded-xl bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] px-3 py-1.5 font-mono text-[13px] font-bold text-primary-foreground">
              {option.score.toFixed(1)}
            </span>
          </div>
        </DialogHeader>

        {imageLoading ? (
          <div className="flex h-[240px] w-full animate-pulse items-center justify-center rounded-2xl bg-well">
            <span className="font-mono text-[10.5px] font-bold tracking-wide text-muted-foreground">
              LOOKING FOR AN IMAGE…
            </span>
          </div>
        ) : imageUrl ? (
          <div className="flex max-h-[240px] w-full items-center justify-center overflow-hidden rounded-2xl bg-well shadow-[var(--shadow-well)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- external, unpredictable
                third-party host (Bing image search results) — next/image's remote-pattern
                allowlist can't be pinned to an open-ended set of source domains. */}
            <img
              src={imageUrl}
              alt={option.name}
              className="max-h-[240px] w-full object-contain"
            />
          </div>
        ) : null}

        {overBudget || priceNote ? (
          <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-well px-4 py-3 shadow-[var(--shadow-well)]">
            {overBudget ? <Badge variant="destructive">OVER BUDGET</Badge> : null}
            {priceNote ? (
              <span className="font-mono text-[12.5px] font-semibold text-muted-foreground">
                {priceNote}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10.5px] font-bold tracking-wide text-[#7a6a2b]">
              PROS
            </div>
            {option.pros.map((pro, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-[#7a6a2b]">+</span>
                <span className="font-serif text-sm leading-relaxed">{pro}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10.5px] font-bold tracking-wide text-primary">
              CONS
            </div>
            {option.cons.map((con, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-primary">−</span>
                <span className="font-serif text-sm leading-relaxed text-muted-foreground">{con}</span>
              </div>
            ))}
          </div>
        </div>

        {sourceUrls.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10.5px] font-bold tracking-wide text-primary/80">
              SOURCES FOR THIS OPTION
            </div>
            <div className="flex flex-wrap gap-2">
              {sourceUrls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-chip px-3 py-1.5 font-mono text-[11.5px] font-semibold text-foreground shadow-[var(--shadow-chip)] hover:translate-y-px"
                >
                  {hostnameLabel(url)} ↗
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
