// Smoke test: open the built single-file desk (sample data, no keys), visit every page and add every widget,
// and fail if anything throws. Runs in GitHub Actions on each push; free and private (no live site, no keys).
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = pathToFileURL(resolve('dist-single/index.html')).href;
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`); });
await page.goto(file);
await page.waitForTimeout(1200);
for (const key of ['e', 'd', 'x', 'o', 's', 'm', 'g', 'u', 'i', 'y', 'c', 'J', 'h']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
}
// add every widget from the library
const items = page.locator('.lib .lib-add');
const n = await items.count();
for (let i = 0; i < n; i++) { await items.nth(i).click(); await page.waitForTimeout(150); }
await page.waitForTimeout(1500);
const widgets = await page.locator('.home-grid .hw').count();
await browser.close();
console.log(`pages visited, ${widgets} widgets rendered`);
if (errors.length || widgets < n) {
  console.error(errors.join('\n') || `only ${widgets}/${n} widgets rendered`);
  process.exit(1);
}
