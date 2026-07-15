import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// /app, /research/[id], /login, and /components are private, session-specific, or internal —
// none belong in a crawl (SE1 finding).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/research", "/api", "/login", "/components", "/auth"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
