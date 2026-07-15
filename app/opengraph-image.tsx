import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated at request time via next/og rather than a static asset — the project ships no
// branded image otherwise (public/ only has the Next.js starter SVGs), and this stays in sync
// with the actual design tokens (DESIGN.md) instead of drifting from a hand-exported PNG.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#f2e8d5",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "linear-gradient(145deg, #c96a45, #a84a28)",
              color: "#fff6e8",
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            V
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: "#2b2116" }}>
            The Verdict Room
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.15,
            color: "#2b2116",
            maxWidth: 920,
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size }
  );
}
