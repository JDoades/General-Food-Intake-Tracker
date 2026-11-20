// Draws Ish's icon and renders the PNG sizes phones need. Run with: npm run icons
// Uses the Playwright + Chromium that is already installed (not a project dependency).
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(dirname(fileURLToPath(import.meta.url)), '../app/icons');
mkdirSync(out, { recursive: true });

const BG = '#4d7a63';
const FG = '#f5f2ec';

/** The mark: a soft ring about 60% full, like the one on the Today screen. */
function svg({ rounded, scale = 1 }) {
  const r = 150 * scale;
  const sw = 46 * scale;
  const c = 2 * Math.PI * r;
  const pct = 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${BG}"/>
  <g transform="rotate(-90 256 256)" fill="none" stroke-width="${sw}">
    <circle cx="256" cy="256" r="${r}" stroke="${FG}" stroke-opacity="0.25"/>
    <circle cx="256" cy="256" r="${r}" stroke="${FG}" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}"/>
  </g>
</svg>
`;
}

writeFileSync(join(out, 'icon.svg'), svg({ rounded: true }));

const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: join(out, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', file);
}
await render(svg({ rounded: true }), 192, 'icon-192.png');
await render(svg({ rounded: true }), 512, 'icon-512.png');
// Maskable and Apple icons: full bleed (the phone rounds the corners), mark kept inside the safe zone
await render(svg({ rounded: false, scale: 0.82 }), 512, 'icon-maskable-512.png');
await render(svg({ rounded: false, scale: 0.9 }), 180, 'apple-touch-icon.png');
await browser.close();
