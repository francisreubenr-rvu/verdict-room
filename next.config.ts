import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stagehand crashes at init in production with "unable to determine transport target for
  // 'pino-pretty'" — webpack bundles Stagehand's pino logger, and the bundled copy can't resolve
  // the pino-pretty transport at runtime the way a native `require` from node_modules can. This
  // kills both lib/research/fetch/youtube-browserbase.ts and reddit-browserbase.ts (same
  // Stagehand path). Listing these here opts them out of Server Components bundling so Next uses
  // native Node `require` instead, letting pino resolve its transport normally. `pino` and
  // `pino-pretty` are already in Next's own built-in opt-out list (server-external-packages.jsonc)
  // as of this Next version, but `@browserbasehq/stagehand` is not, so it's listed explicitly
  // here (with the other two repeated for clarity, not because they're strictly required).
  // Verified key name: `serverExternalPackages` (top-level, stable since Next 15.0.0, renamed
  // from the old experimental `experimental.serverComponentsExternalPackages`) — confirmed
  // against this project's installed Next 16 type defs, node_modules/next/dist/server/config-shared.d.ts.
  serverExternalPackages: ["@browserbasehq/stagehand", "pino", "pino-pretty"],
  // Marketing imagery is served from Unsplash's CDN (free license, hotlink-permitted). Allow
  // next/image to optimize it. Only the marketing pages use remote images; product images in
  // reports come through the app's own product-image route, not next/image.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
