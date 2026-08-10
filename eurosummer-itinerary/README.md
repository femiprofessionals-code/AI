# Berry Eurosummer 2026 — itinerary site

A single-page itinerary for a two-week Mediterranean trip, 7–21 August 2026:
**Amalfi Coast → Lake Como → Monaco → St Tropez.**

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

Edit the itinerary in the `LEGS` array at the bottom of `src/index.tpl.html`,
then re-run. Each leg takes a list of `days`; each day takes a date label, an
emoji, a title, a description, and an optional `chip` of
`confirmed` / `reserved` / `tbc`.

## Deploy

It is one static file, so anything works:

```bash
npx vercel deploy --prod      # or: netlify deploy --prod --dir .
```

GitHub Pages: push this folder and point Pages at it. No build step needed —
`index.html` is already the finished artifact.

## Design notes

- **Type.** Bodoni Moda for display, set against a humanist sans for running text
  and a mono for chart labels and dates. The font is embedded rather than linked,
  so the page renders identically on every device and works offline — no CDN, no
  flash of fallback type.
- **Colour.** A sea chart at dusk: deep petrol ground (`#0D4A58`), warm chart-paper
  cream (`#F4E4CB`) for the cards, brass (`#E9A23B`) for the ports, coral
  (`#E0654C`) reserved for the birthday. Single committed palette in both light
  and dark hosts — every colour is painted explicitly rather than inherited.
- **The chart.** Hand-drawn SVG. Solid lines are flights, dashed is the drive down
  to St Tropez; the numbers encode leg order, which is real information rather than
  decoration. Tapping a port opens its leg.
- **Motion.** Route lines draw on load, the active port pulses, day rows stagger in
  on leg change. All of it collapses under `prefers-reduced-motion`.
- **Accessibility.** Ports and pills are real buttons with labels, arrow-key
  navigation across legs, visible focus rings.

## Where the itinerary came from

Everything was transcribed from the source video frame by frame. The video shows the
top of each leg card but never scrolls to the bottom, so some days were visible and
some were not.

**Taken directly from the video** — dates, nights, locations, hotels, flight times,
transfer times, leg summaries, and these days:

- Amalfi Coast — Fri 7 Aug (arrival, with flight and pickup times)
- Lake Como — Thu 13 Aug, Fri 14 Aug
- Monaco — Sat 15 Aug, Sun 16 Aug, Mon 17 Aug
- St Tropez — Mon 17 Aug (birthday, Zuma 7:00pm), Tue 18 Aug

**Reconstructed** — the days the video never scrolled to, written to match the trip
summaries shown on screen ("beach clubs, boat lunches, and a yacht to Capri";
"a full yacht day, and Pampelonne beaches") and the footage in the video itself
(Arienzo Beach Club appears on screen). These are marked **To confirm** on the page:

- Amalfi Coast — Sat 8 through Wed 12 Aug
- Lake Como — Sat 15 Aug (the transfer out)
- St Tropez — Wed 19, Thu 20, Fri 21 Aug

**Not in the video at all** — the hotels for Amalfi Coast and St Tropez are blurred
out in the source, so both show *Not yet confirmed*. Lake Como (The EDITION) and
Monaco (Hôtel Métropole) were named on screen and are in.

Replace any of the above in the `LEGS` array once you have the real details.
