const { chromium } = require('playwright');
const INK = '#2B2A4C';
const bibi = `
<path d="M74 58 q18 -10 22 -24 q-4 20 -18 30z" fill="#FFA94D" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
<ellipse cx="50" cy="58" rx="28" ry="27" fill="#FFC83D" stroke="${INK}" stroke-width="3"/>
<ellipse cx="46" cy="68" rx="15" ry="12" fill="#FFF3CC"/>
<path d="M52 56 q16 -4 20 10 q-12 8 -22 0z" fill="#FFA94D" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
<circle cx="40" cy="47" r="7" fill="#fff" stroke="${INK}" stroke-width="2"/>
<circle cx="38.5" cy="48" r="3.5" fill="${INK}"/>
<path d="M27 52 l-15 4 l15 5 z" fill="#FF6F61" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
<circle cx="36" cy="60" r="3.5" fill="#FF8FA3" opacity="0.7"/>
<path d="M46 32 q-2 -12 6 -14 M52 31 q4 -10 12 -8" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<path d="M42 84 v8 M56 84 v8" stroke="#FF6F61" stroke-width="3" stroke-linecap="round"/>`;
const svg = (bg, scale, mono) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}
<g transform="translate(${50 - 50 * scale} ${52 - 50 * scale}) scale(${scale})" ${mono ? 'filter="url(#m)"' : ''}>${bibi}</g>
${mono ? '<defs><filter id="m"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter></defs>' : ''}
</svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  const shot = async (s, file, transparent) => {
    await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await p.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  };
  await shot(svg('#FFF8EC', 0.95), 'assets/icon.png');
  await shot(svg(null, 0.62), 'assets/android-icon-foreground.png', true);
  await shot(svg('#FFF3CC', 0.01), 'assets/android-icon-background.png');
  await shot(svg(null, 0.62, true), 'assets/android-icon-monochrome.png', true);
  await shot(svg(null, 0.9), 'assets/splash-icon.png', true);
  await b.close();
})();
