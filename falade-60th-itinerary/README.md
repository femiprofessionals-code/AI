# Ukeme Falade 60th — itinerary site

A single-page itinerary for a seventeen-day round-the-world trip, 14–30 August 2026:
**Washington → Jakarta → Surabaya → Sydney → Bali → Guangzhou → Hong Kong → Seoul → home.**

Two groups travel out separately and meet in Bali on 22–23 August.

Mobile first. One HTML file, no dependencies, no network requests at runtime.

## Files

| Path                 | What it is                                                                 |
| -------------------- | -------------------------------------------------------------------------- |
| `index.html`         | **The site.** Standalone document — open it, or drop it on any static host. |
| `artifact.html`      | Same page without the `<head>`/`<body>` wrapper, for hosts that supply one.  |
| `src/index.tpl.html` | Source template: markup, styles, and the itinerary data.                     |
| `src/bodoni.css`     | Bodoni Moda (roman + italic), inlined as base64 `woff2` data URIs.            |
| `build.js`           | Inlines the fonts into the template and writes the two outputs.               |

## Build

```bash
node build.js      # no npm install, no dependencies
```

Edit the itinerary in the `LEGS` array at the bottom of `src/index.tpl.html`, then
re-run. Each leg takes a `stay` (name, address, check-in, check-out) and a list of
`days`; each day takes a date label, an emoji, a title, a description, and an
optional `chip` of `confirmed` / `tbc`. Set `star: true` on a day to highlight it.

## Deploy

It is one static file, so anything works:

```bash
npx vercel deploy --prod      # or: netlify deploy --prod --dir .
```

GitHub Pages: push this folder and point Pages at it. No build step needed —
`index.html` is already the finished artifact.

## Design notes

- **Type.** Bodoni Moda for display, set against a humanist sans for running text
  and a mono for chart labels, times and dates. The font is embedded rather than
  linked, so the page renders identically on every device and works offline — no
  CDN, no flash of fallback type.
- **Colour.** A chart at dusk: deep petrol ground (`#0D4A58`), warm chart-paper
  cream (`#F4E4CB`) for the cards, brass (`#E9A23B`) for the stops. Single
  committed palette — every colour is painted explicitly rather than inherited, so
  the page holds up on a light or dark host.
- **The chart.** The route is drawn as a circle, because the trip is literally a
  circumnavigation: it leaves Washington at the top and comes back round to it.
  Solid is the main route; the dashed chord across the middle is the second
  departure via Taipei, cutting the corner to meet everyone in Bali. Numbered
  nodes are the five stays; small ticks are airports passed through (AUH, SIN,
  TPE, HKG, ICN). Tapping a city opens its leg.
- **Motion.** The route draws itself on load, the second departure fades in after
  it, the active city pulses, and day rows stagger in on leg change. All of it
  collapses under `prefers-reduced-motion`.
- **Accessibility.** Cities and pills are real buttons with labels, arrow keys move
  between legs, focus rings are visible, and nothing scrolls sideways.

## Source and open questions

Everything on the page is transcribed from the supplied PDF itinerary
(`Edited_travelitinerary1.pdf`) — all dates, flight numbers of hours, airport codes,
hotel names, addresses and check-in times. Every date from 14 to 30 August appears
in order. Transfer days deliberately appear in both the leg that ends and the leg
that begins, which is why some dates show twice.

Four things to confirm:

1. **Bali accommodation** is listed in the PDF as "Accommodation to be confirmed",
   so the page says the same. It is the only stay without a hotel.
2. **Guangzhou vs Hong Kong.** The PDF's day-by-day says "land 5:55 AM · transfer
   to Hong Kong" on Aug 27, but also has you at the Rosewood Guangzhou on the 28th
   and 29th, departing from HKG at 12:45 AM on the 30th. The page reads that as
   three nights in Guangzhou with the ground transfer to Hong Kong on departure
   day. Worth confirming which it is.
3. **A date typo in the PDF.** The second departure's Washington → Taipei leg is
   listed as "arrives Mon, Aug 23". 23 August 2026 is a Sunday, and the next leg
   is correctly dated "SUN · AUG 23", so the page says Sunday.
4. **No birthday day is marked.** The PDF does not say which day the 60th is being
   celebrated, so nothing is invented — the page highlights 23 August instead, the
   day both groups are finally together. Say the word and it moves.
