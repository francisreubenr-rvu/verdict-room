# DESIGN.md — PurchasePilot

Design language: **Warm Clay** — claymorphic pillows on a warm paper surface, serif + mono type
pairing kept from the original system. Supersedes the earlier flat neobrutalist system (2px ink
borders, hard offset shadows) per the "Purchase Pilot Website Design" Claude Design project
(`SITE-REDESIGN-PLAN.md` tracks the implementation). Tokens below are wired as real Tailwind CSS
variables in `app/globals.css` (`:root` / `.dark`), not aspirational — read that file for the
source of truth if these drift.

## Color tokens (light — default)

| Token | Value | Usage |
|---|---|---|
| `--background` | `#f2e8d5` | Page surface — warm paper |
| `--foreground` / `--ink` | `#2b2116` | Body text — dark ink brown |
| `--card` | `#f8f0dd` | Raised card/panel surface |
| `--well` / `--muted` | `#efe3c8` | Carved-in surfaces — inputs, stat tiles, progress tracks |
| `--chip` / `--secondary` | `#f4ecd8` | Chips, secondary buttons |
| `--primary` / `--primary-light` | `#a84a28` / `#c96a45` | Terracotta gradient — primary buttons, sponsored badges, links |
| `--primary-foreground` | `#fff6e8` | Text on primary/ink surfaces |
| `--accent` / `--accent-light` | `#c9a558` / `#e2c98f` | Ochre gradient — affiliate badges, "Pro"/highlight chips |
| `--destructive` / `--destructive-light` | `#8f3325` / `#b5533f` | Rust gradient — errors, destructive actions |
| `--muted-foreground` | `#6b5d45` | Secondary text |
| `--border` / `--input` | `#c7b896` | Rarely visible — claymorphism reads via shadow, not border |
| `--ink-light` | `#3a2d1d` | Ink slab gradient (verdict panels) — pairs with `--ink`/`--ink-foreground` |
| `--ring` | `#a84a28` | Focus ring |

Dark mode exists (`.dark` class), proportionally remapped (dark surfaces, same shadow *structure*
with black-based shadows instead of warm-brown ones) but is **not** the default route per house
design rules — light is what ships unless the OS/user explicitly opts into dark.

## Typography

| Role | Font | Tailwind token |
|---|---|---|
| Body / headings / display | Source Serif 4 | `font-sans` (aliased), `font-serif` |
| Accents — buttons, labels, metadata, code-like bits | Geist Mono | `font-mono` |

Unchanged from the prior system. Loaded via `next/font/google` in `app/layout.tsx` (`sourceSerif`,
`geistMono`), exposed as CSS variables and mapped into the Tailwind `@theme` block.

## Surface — subtle grid

`body` still paints the 32px paper grid via `--grid-line`. Unchanged.

## Shadows — the core of claymorphism

Every clay surface is a **layered box-shadow recipe**, not a border. Recipes live as CSS custom
properties in `app/globals.css` and get referenced via Tailwind arbitrary values
(`shadow-[var(--shadow-raised)]`) rather than repeating literal rgba strings at every call site:

| Token | Reads as | Used by |
|---|---|---|
| `--shadow-raised` / `--shadow-raised-lg` | Pillow lifted off the page (outset shadow + inset highlight/groove) | `Card` (`surface="raised"`, the default) |
| `--shadow-well` / `--shadow-well-lg` | Carved into the page (inset only, no outset) | `Card` (`surface="well"`), inputs' wrapper containers, progress tracks |
| `--shadow-chip` | Small raised pill | suggestion chips, filter pills |
| `--shadow-btn-primary` / `-active` | Gradient button raised / pressed | `Button` `default`/`destructive` variants |
| `--shadow-btn-secondary` / `-active` | Flat chip button raised / pressed | `Button` `outline`/`secondary` variants |
| `--shadow-ink` | Dark slab lift | `Card` (`surface="ink"`) — verdict panels only |
| `--shadow-nav` | Floating pill nav lift | `SiteHeader` |

## Buttons — clay, not brutalist

`components/ui/button.tsx` variants:
- `default` / `destructive` — gradient fill (`--primary-light`→`--primary` or
  `--destructive-light`→`--destructive`), `shadow-btn-primary`. Hover settles `translate-y-px`;
  active sinks `translate-y-[3px] scale-[0.97]` and swaps to the `-active` shadow (inset only —
  the button looks pressed into the clay).
- `outline` / `secondary` — flat chip fill (`--chip`), `shadow-btn-secondary`, same press motion at
  a smaller sink (`translate-y-[2px]`).
- `ghost` — "quiet/locked": dashed 2px border, no shadow, no fill. Deliberately underplayed —
  matches the design's "Secondary/quiet" button which never competes with a primary action.
- `link` — borderless, unchanged from the prior system.

Radius is `rounded-2xl` (buttons), `rounded-3xl` (cards) — soft and pillowy, not the old `rounded-md`
stamped look. Global `--radius: 0.9rem` (up from `0.375rem`).

## Badges — sponsorship classification gets first-class variants

`components/ui/badge.tsx` adds `organic` / `sponsored` / `affiliate` / `unclassified` variants
(alongside the generic shadcn set) so `source-list.tsx` and `verdict.tsx` render sponsorship pills
without ad-hoc classNames:
- `organic` — flat `#e9dcb4` chip, dark-ochre text.
- `sponsored` — terracotta gradient, same as primary buttons (money = the primary-attention color).
- `affiliate` — ochre gradient, distinct from sponsored so the two paid categories don't blur.
- `unclassified` — dashed border, no fill — visually "we're not claiming to know."

## Inputs — carved, not drawn

`components/ui/input.tsx` is borderless/transparent by default (`border-transparent bg-transparent`,
no default focus ring) — it's meant to sit inside a **well** container
(`bg-well shadow-[var(--shadow-well-lg)]`) that the consuming page provides, exactly like the
query composer on `/app` and the landing hero demo. Never draw an input's own border or shadow at
the primitive level; the well wrapper is the visual language.

## Motion

- **Press = sink.** Everything clickable presses 3px (buttons) or 2px (chips/inputs) into the
  clay on `:active`. Nothing glows.
- **Reveal = rise, once.** `components/reveal.tsx` fades+rises sections 30px as they scroll into
  view, then stays — an IntersectionObserver wrapper that starts visible and only hides once IO is
  confirmed alive (never traps content invisible if IO silently fails), respects
  `prefers-reduced-motion`.
- **Pipeline = pulse.** Only the active pipeline stage breathes (`animate-pulse`-style); done
  stages sit still.

## Layout — persistent nav, two footer variants

`SiteHeader` (floating pill, sticky top) renders on every route — marketing and app alike — per
the design. Footer varies by route group: `MarketingFooter` (full 4-column, `components/footer.tsx`)
on marketing pages, `AppFooter` (compact one-liner) on `/app`, `/research/[id]`, `/login`.

## Spacing / layout — source list and verdict density

Carried over from the M5 revisit, unchanged by this redesign: `SourceCard` uses `Card size="sm"`
(tighter `--card-spacing`), `gap-3` within a source-list section, `gap-8` between sections
(organic/sponsored/unclassified), verdict option cards use the default `gap-4`/`p-4` density.
