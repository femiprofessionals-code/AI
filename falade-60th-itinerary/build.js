/**
 * Build the Berry Eurosummer itinerary site.
 *
 *   node build.js
 *
 * Reads  src/index.tpl.html  (markup + styles + data)
 *        src/bodoni.css      (Bodoni Moda woff2 faces, inlined as data URIs)
 *
 * Writes index.html    — standalone page. Open it directly or drop the file on
 *                        any static host (Vercel, Netlify, GitHub Pages). No
 *                        build step, no dependencies, no network requests.
 *        artifact.html  — the same page without the document wrapper, for hosts
 *                        that supply their own <head> (e.g. Claude Artifacts).
 */
const fs = require("fs");
const path = require("path");

const here = __dirname;
const read = p => fs.readFileSync(path.join(here, p), "utf8");

const page = read("src/index.tpl.html").replace("__FONTS__", read("src/bodoni.css"));

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Berry Eurosummer 2026 — two weeks across the Mediterranean: the Amalfi Coast, Lake Como, Monaco and a birthday finale in St Tropez.">
<meta name="theme-color" content="#0D4A58">
<meta property="og:title" content="Berry Eurosummer 2026">
<meta property="og:description" content="Two weeks across the Mediterranean — 7 to 21 August 2026.">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>%F0%9F%8D%8B</text></svg>">
</head>
<body>
${page}
</body>
</html>
`;

fs.writeFileSync(path.join(here, "index.html"), doc);
fs.writeFileSync(path.join(here, "artifact.html"), page);

const kb = n => (n / 1024).toFixed(0) + " KB";
console.log("index.html    " + kb(doc.length));
console.log("artifact.html " + kb(page.length));
