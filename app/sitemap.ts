import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const MARKETING_ROUTES = ["", "/about", "/pricing", "/how-it-works", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
