// Free-tier source composition (user request 2026-07-24). Instead of a flat "first N after
// interleave" slice, the free plan's source budget is shaped into a deliberate mix:
//   3 YouTube · 6 review blogs · 1 official/manufacturer page · 5 "other" (community/retail/Q&A).
// The YouTube sub-cap of 3 is the load-bearing part. A YouTube transcript is by far the most
// token-expensive source to extract (a full video transcript vs. a truncated 8K-char web page), so
// holding YouTube to 3 is what actually cuts Groq token spend — the point of this change. Before,
// web/youtube interleaving in the dispatch cap let YouTube take ~7-8 of the 15 slots.
//
// Blog/company/other is a SOFT target: if a category underfills (e.g. no manufacturer page turned
// up), the leftover budget backfills from the remaining web pool so the session still lands at the
// full cap rather than wasting slots. YouTube is the one HARD cap — backfill never pushes it past 3.
//
// Kept in its own module (no Prisma/Stagehand/LLM deps) so it stays a pure, unit-testable classifier.

import { detectPlatform } from "@/lib/research/extract";

export type FreeCategory = "youtube" | "blog" | "company" | "other";

// Official manufacturer / brand domains → the single "company website" slot. Consumer-tech heavy
// (this tool's dominant query shape) but extend freely; a miss just lands the URL in "blog", the
// safe catch-all. Matched dot-anchored (see hostEndsWithAny) so "apple.com" won't hit "notapple.com".
export const MANUFACTURER_HOSTS = [
  "apple.com", "samsung.com", "google.com", "oneplus.com", "xiaomi.com", "mi.com",
  "motorola.com", "nothing.tech", "sony.com", "oppo.com", "vivo.com", "realme.com",
  "asus.com", "nokia.com", "honor.com", "lg.com", "dell.com", "hp.com", "lenovo.com",
  "microsoft.com", "bose.com", "jbl.com", "sennheiser.com", "anker.com", "dyson.com",
];

// Community / social / retail / Q&A aggregators → the "other" bucket. Reddit is folded in here as a
// community source (it's classified by this list, not its own platform enum).
export const OTHER_HOSTS = [
  "reddit.com", "quora.com", "xda-developers.com", "stackexchange.com", "stackoverflow.com",
  "x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com",
  "amazon.com", "amazon.in", "amazon.co.uk", "amazon.de", "amazon.ca",
  "bestbuy.com", "walmart.com", "target.com", "ebay.com", "flipkart.com", "newegg.com",
];

export const FREE_CATEGORY_QUOTAS: Record<FreeCategory, number> = {
  youtube: 3,
  blog: 6,
  company: 1,
  other: 5,
};

function hostEndsWithAny(hostname: string, domains: string[]): boolean {
  return domains.some((d) => hostname === d || hostname.endsWith("." + d));
}

export function categorizeFreeSource(url: string): FreeCategory {
  if (detectPlatform(url) === "youtube") return "youtube";
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "blog";
  }
  // Reddit (its own platform) and the aggregator list both count as "other".
  if (detectPlatform(url) === "reddit" || hostEndsWithAny(hostname, OTHER_HOSTS)) return "other";
  if (hostEndsWithAny(hostname, MANUFACTURER_HOSTS)) return "company";
  return "blog";
}

export function composeFreeTierSources(sortedUrls: string[], cap: number): string[] {
  const buckets: Record<FreeCategory, string[]> = { youtube: [], blog: [], company: [], other: [] };
  for (const url of sortedUrls) buckets[categorizeFreeSource(url)].push(url);

  const picked: string[] = [];
  const pickedSet = new Set<string>();
  // Pass 1: honor each category's target quota (stable order — YouTube first so its 3 are secured).
  for (const cat of ["youtube", "blog", "company", "other"] as FreeCategory[]) {
    const quota = FREE_CATEGORY_QUOTAS[cat];
    let taken = 0;
    for (const url of buckets[cat]) {
      if (taken >= quota || picked.length >= cap) break;
      picked.push(url);
      pickedSet.add(url);
      taken++;
    }
  }
  // Pass 2: backfill to the cap from any leftover URLs (discovery/sort order preserved) so an
  // underfilled category doesn't waste its slots — but never dispatch a 4th YouTube transcript.
  if (picked.length < cap) {
    for (const url of sortedUrls) {
      if (picked.length >= cap) break;
      if (pickedSet.has(url) || categorizeFreeSource(url) === "youtube") continue;
      picked.push(url);
      pickedSet.add(url);
    }
  }
  return picked;
}
