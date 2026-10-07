# Visual system

Matches chatwoot.com as redesigned in 2026 (checked 2026-10-04). If the site changes, re-sample it and update `templates/cards/base.css`.

## Type
- Headlines: **Haskoy** SemiBold, tight (letter-spacing -0.035em). `assets/fonts/Haskoy-variable.ttf` (from Sojan's pack).
- Body and labels: **Inter** (Inter Display from this repo's `app/javascript/shared/assets/fonts`).
- Small labels: uppercase, 0.14em tracking, muted grey.

## Colour (sampled from the live site)
| Accent | Deep | Mid | Soft | Used for |
|---|---|---|---|---|
| blue | `#1875ee` | `#5e9ff3` | `#ccdcf8` | hero, omnichannel, inbox, default |
| purple | `#7e5bdc` | `#9478e2` | `#cbb8ff` | Captain / AI |
| green | `#12946a` | `#7ce3b1` | `#dcf4e8` | Voice |
| amber | `#c98a1b` | `#efcb8d` | `#ffe6a8` | Help Center |
| yellow | `#1b1206` | `#f7c445` | `#ffe6a8` | open source / self-hosting |
Ink `#18181b`, muted `#52525b`, hairline `#e4e4e7`, page white.

## Elements
- **Stage**: white page, accent pixel mosaic hugging the edges (square cells, denser at the edge, seeded so it never flickers).
- **Section badge**: white tag, 3px ink outline, arrow end, hard 5px ink offset shadow, accent icon tile. Same as the site's "Voice · New" / "Captain" tags.
- **Product window**: real app frame in a white rounded card (18px radius at 1080p), hairline border, soft shadow. No browser chrome, no macOS dots.
- **Scene cards**: floating white UI cards with hairline borders and soft shadows, like the site's illustrations.

## Motion
- Section cards: badge, then headline, then subline rise in (about 0.6s each, staggered); about 3s total, music only.
- Focus moves: ease in over 0.9s, hold, ease out over 0.9s. One per beat.
- Cursor: native macOS cursor art, eased travel, short pressed state on click, I-beam while typing.
