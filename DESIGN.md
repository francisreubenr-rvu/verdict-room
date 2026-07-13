# DESIGN.md — PurchasePilot

Design language: warm paperback surface, subtle grid, serif + mono type pairing, retro/tactile
buttons. Tokens below are wired as real Tailwind CSS variables in `app/globals.css` (`:root` /
`.dark`), not aspirational — read that file for the source of truth if these drift.

## Color tokens (light — default)

| Token | Value | Usage |
|---|---|---|
| `--background` | `#f4eee0` | Page surface — warm paper cream |
| `--foreground` | `#2b2116` | Body text — dark ink brown |
| `--card` | `#fbf7ec` | Card/panel surface — lighter than page bg |
| `--primary` | `#b14a2b` | Terracotta/rust — primary buttons, links, focus |
| `--primary-foreground` | `#fbf7ec` | Text on primary |
| `--secondary` | `#e4d9be` | Warm tan — secondary buttons |
| `--muted` | `#eae1cb` | Muted panels, disabled states |
| `--muted-foreground` | `#6b5d45` | Secondary text |
| `--accent` | `#d8cba0` | Highlight/accent fills |
| `--destructive` | `#a23325` | Errors |
| `--border` / `--input` | `#c7b896` | Dividers, input borders |
| `--ring` | `#b14a2b` | Focus ring |

Dark mode exists (`.dark` class) with the same warm family shifted dark (`#1e1810` background,
`#f0e6d2` foreground, `#d97052` primary) but is **not** the default route per house design rules —
light is what ships unless the OS/user explicitly opts into dark.

## Typography

| Role | Font | Tailwind token |
|---|---|---|
| Body / headings / display | Source Serif 4 | `font-sans` (aliased), `font-serif` |
| Accents — buttons, labels, metadata, code-like bits | Geist Mono | `font-mono` |

Loaded via `next/font/google` in `app/layout.tsx` (`sourceSerif`, `geistMono`), exposed as CSS
variables (`--font-source-serif`, `--font-geist-mono`) and mapped into the Tailwind `@theme` block
in `app/globals.css`. The serif carries the product's editorial voice (it's a research report,
not a dashboard); mono marks anything mechanical or actionable.

## Surface — subtle grid

`body` in `app/globals.css` paints a 32px grid using `--grid-line`, a low-alpha mix of
`--foreground` into `--background` (`color-mix(in oklch, var(--foreground), transparent 92%)`).
Reads as paper graph-ruling, not a design-tool artifact — deliberately faint.

## Buttons — retro/tactile

`components/ui/button.tsx` variants (`default`, `outline`, `secondary`) share:
- `border-2 border-foreground` — visible ink-colored border, not a flat modern button.
- `shadow-[3px_3px_0_0_var(--color-foreground)]` — hard offset shadow, no blur (screen-printed /
  stamped look).
- Hover lifts the shadow to `4px 4px` with a slight `-translate-y-0.5`.
- Active/press collapses the offset to `0` and translates the button `3px, 3px` into the shadow's
  former position — a physical "pressed button" motion.
- `rounded-md` (small radius, not the default `rounded-lg`) and `font-mono` — mechanical, not soft.

`ghost` and `link` variants stay borderless/shadowless by design — they're meant to read as quiet,
not tactile.

## Radius

`--radius: 0.375rem` (down from shadcn's default `0.625rem`) — smaller corners read more retro/
stamped than the rounded-corner default.

## Spacing / layout

M5 revisit, decided: the results dashboard uses two densities, not one uniform scale.

| Area | Spacing | Why |
|---|---|---|
| `SourceCard` (`source-list.tsx`) | `Card size="sm"` (`--card-spacing: 0.75rem`/12px, vs. the 1rem/16px default) | Each card packs platform, author, sponsorship badge, summary, and URL — the default padding read as too loose for that much metadata per row. |
| Cards within one source-list section | `gap-3` (12px) | Tight, scannable — same-group items. |
| Between source-list sections (organic / sponsored / unclassified) | `gap-8` (32px) | Deliberately looser than within-section — keeps the sponsored-vs-organic split, the product's core differentiator, visually distinct rather than blurring into one long list. |
| Verdict ranked-option cards (`verdict.tsx`) | Default `p-4` card padding, `gap-4` between options | Fewer, denser blocks (name/score/pros/cons) than the source list — the looser default reads better here than the source-list's tight scale would. |
| Verdict pros/cons grid | `gap-3` between columns (`sm:grid-cols-2`, single column below `sm`) | Matches the source-list's tight scale since it's the same kind of short scannable list. |

No new Tailwind spacing tokens were added — `gap-3`/`gap-4`/`gap-8` and the existing `size="sm"`
card variant already cover the dashboard's density needs.
