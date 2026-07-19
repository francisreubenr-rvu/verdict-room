import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

// POST /api/research/[id]/product-image — lazily fetches a product image for an Option, cached
// on Option.imageUrl so it's a one-time fetch per option across every user who opens that card
// (2026-07-19 brief, deliverable 4). Body: { optionId: string }.
//
// FRAGILITY WARNING: this scrapes Bing's public image-search results page rather than calling a
// real image-search API (no free/keyless one exists at the scale this needs). Bing embeds a JSON
// blob (murl = full-size image url, turl = thumbnail) inside an `m="{...}"` attribute on every
// result anchor — this is undocumented markup that Bing can and will change without notice. When
// it breaks, the fix is re-deriving the current markup shape from a live response, not patching
// the regex blindly. Every failure mode below (network error, non-200, no matches, no valid URL)
// degrades to `{ imageUrl: null }` with a 200 status — the product card renders imageless rather
// than erroring, per the "no fake placeholder art" rule. Confirmed live against real Bing
// responses for two product names during development; not covered by automated tests since it
// depends on a third party's unstable HTML.
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isValidHttpUrl(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || !candidate) return false;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function scrapeFirstBingImage(query: string): Promise<string | null> {
  const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2`;

  let html: string;
  try {
    const response = await fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    html = await response.text();
  } catch {
    // Network error, timeout, or abort — no image, not an error the client should see.
    return null;
  }

  // Each result anchor carries m="{"murl":"...","turl":"...", ...}" (HTML-entity-escaped JSON).
  // Only scan the first handful of matches — this needs one usable image, not an exhaustive list.
  const matches = html.matchAll(/m="([^"]+)"/g);
  let count = 0;
  for (const match of matches) {
    if (count++ >= 10) break;
    let parsed: { murl?: unknown; turl?: unknown };
    try {
      parsed = JSON.parse(decodeHtmlEntities(match[1]));
    } catch {
      continue;
    }
    const candidate = isValidHttpUrl(parsed.murl) ? parsed.murl : parsed.turl;
    if (isValidHttpUrl(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let optionId: unknown;
  try {
    ({ optionId } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (typeof optionId !== "string" || !optionId) {
    return NextResponse.json({ error: "optionId is required" }, { status: 400 });
  }

  // Ownership check goes through the session, same pattern as GET /api/research/[id] — an
  // option's cuid entropy is not access control, and Prisma connects via a role that bypasses
  // RLS (see DEPLOY.md §g), so this route is where the check has to live.
  const option = await prisma.option.findFirst({
    where: { id: optionId, sessionId, session: { userId: user.id } },
  });

  if (!option) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (option.imageUrl) {
    return NextResponse.json({ imageUrl: option.imageUrl });
  }

  const imageUrl = await scrapeFirstBingImage(option.name);

  if (imageUrl) {
    await prisma.option.update({
      where: { id: option.id },
      data: { imageUrl },
    });
  }

  // Graceful in both directions: a miss is a normal 200 { imageUrl: null }, not a 500 — the
  // product card's job is to render without an image, never a broken-image icon or fake art.
  return NextResponse.json({ imageUrl });
}
