import Image from "next/image";

// Marketing photography, framed to sit inside the Warm Clay system. Raw stock photos clash on the
// warm-paper surface, so every photo goes through this: a clay frame (raised shadow, soft radius)
// plus a warm multiply scrim that pulls disparate shots (cool product greys, saturated product
// backdrops) toward the palette's ochre/terracotta so they read as native material, not pasted-in
// stock. Server component — no interactivity, optimized via next/image.

// Verified free-license Unsplash CDN sources (hotlink-permitted). Centralized so every reference is
// a stable name, not a loose URL copied around the pages.
const U = (id: string, w: number) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=72`;

export const PHOTOS = {
  headphones: U("photo-1484704849700-f032a568e944", 1000), // silver/tan pair on warm wood
  laptop: U("photo-1541807084-5c52b6b3adef", 640), // macbook on warm desk
  speaker: U("photo-1608043152269-423dbba4e7e1", 640), // portable speaker on light wood
  camera: U("photo-1526170375885-4d8ecf77b99f", 640), // instant camera, clean studio
  sneaker: U("photo-1542291026-7eec264c27ff", 640), // running shoe on red
} as const;

export function FramedPhoto({
  src,
  alt,
  className = "",
  sizes = "(max-width: 768px) 100vw, 480px",
  priority = false,
  rounded = "rounded-3xl",
  scrim = "default",
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  rounded?: string;
  /** `strong` unifies mixed-tone product shots (categories grid); `default` for warm hero shots. */
  scrim?: "default" | "strong";
}) {
  return (
    <div
      className={`relative overflow-hidden ${rounded} bg-well shadow-[var(--shadow-raised)] ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover saturate-[1.02] contrast-[1.02]"
      />
      {/* Warm multiply scrim — the unifier. Ochre-to-terracotta so cool product greys warm up. */}
      <div
        aria-hidden
        className={
          "pointer-events-none absolute inset-0 mix-blend-multiply " +
          (scrim === "strong"
            ? "bg-[linear-gradient(155deg,rgba(226,201,143,0.42),rgba(168,74,40,0.40))]"
            : "bg-[linear-gradient(160deg,rgba(242,232,213,0.10),rgba(168,74,40,0.24))]")
        }
      />
      {/* Paper-toned top highlight + inner hairline for the clay-edge read. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,246,232,0.28),inset_0_0_0_1px_rgba(43,33,22,0.06)]"
      />
    </div>
  );
}
