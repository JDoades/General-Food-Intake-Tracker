// End-to-end check of Ish in a real browser (Chromium via Playwright).
//   npm run e2e
// Optional: ISH_TEST_PHOTO=path/to/food.jpg to use a real photo for the photo-guess step.
// Screenshots go to test-results/ (not committed).
//
// Uses the Playwright that comes with the development environment rather than a project dependency.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'test-results');
mkdirSync(shots, { recursive: true });

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '-d', join(root, 'app')]);
    const onData = (buf) => {
      const m = String(buf).match(/port (\d+)/);
      if (m) resolve({ proc, port: Number(m[1]) });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    setTimeout(() => reject(new Error('server did not start')), 10000);
  });
}

const expectedPct = (kcal, target) => (kcal <= 0 ? 0 : Math.max(5, Math.round((kcal / target) * 100 / 5) * 5));

let step = 0;
function log(msg) {
  step++;
  console.log(`  ${String(step).padStart(2)}. ${msg}`);
}

const { proc, port } = await startServer();
const base = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch();
const errors = [];
const requests = [];

try {
  const context = await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'light' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  context.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  const ring = () => page.locator('.ring-pct').innerText().then((t) => Number(t.replace('%', '')));
  const sheet = () => page.locator('dialog[open]').last();
  const goto = async (route) => {
    await page.goto(`${base}#/${route}`);
    await page.waitForTimeout(150);
  };
  const logFromSearch = async (query, portion) => {
    await page.getByRole('button', { name: 'Log food' }).first().click();
    await sheet().getByLabel('Search foods').fill(query);
    await sheet().locator('.list .row').first().click();
    if (portion) await sheet().getByRole('button', { name: new RegExp(`^${portion}`) }).click();
    await sheet().getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForSelector('dialog[open]', { state: 'detached' });
  };

  console.log('Ish end-to-end check');
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await ring(), 0);
  log('first run shows 0%');
  await page.screenshot({ path: join(shots, 'today-empty.png'), fullPage: true });

  await logFromSearch('spag bol');
  assert.ok(await page.locator('.toast', { hasText: 'Added Spaghetti bolognese' }).isVisible(), 'Undo toast shows after adding');
  let kcal = 650;
  assert.equal(await ring(), expectedPct(kcal, 2000));
  log(`searched "spag bol", logged a normal portion: ring shows ${await ring()}%`);

  await page.getByRole('button', { name: /^Light meal/ }).click();
  assert.equal(await ring(), expectedPct(kcal + 400, 2000));
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  assert.equal(await ring(), expectedPct(kcal, 2000));
  log('quick add then Undo puts it back');

  await page.locator('.list .row', { hasText: 'Spaghetti bolognese' }).click();
  await sheet().getByRole('button', { name: /^Large/ }).click();
  await sheet().getByRole('button', { name: 'Done' }).click();
  kcal = 910;
  assert.equal(await ring(), expectedPct(kcal, 2000));
  log(`changed the portion to large: ${await ring()}%`);

  await page.getByRole('button', { name: /^Feast or takeaway/ }).click();
  kcal += 1300;
  assert.equal(await ring(), expectedPct(kcal, 2000));
  assert.ok(await page.locator('.over-note').isVisible(), 'calm over-100 note shows');
  assert.equal(await page.locator('.ring .r-over').count(), 1, 'soft overflow ring drawn');
  log(`went over 100% (${await ring()}%): calm note and soft overflow ring, no warnings`);
  await page.waitForTimeout(5200); // let the toast go
  await page.screenshot({ path: join(shots, 'today-over.png'), fullPage: true });

  // Your own dish
  await page.getByRole('button', { name: 'Log food' }).first().click();
  await sheet().getByLabel('Search foods').fill("Nan's lasagne");
  await sheet().getByRole('button', { name: /as your own dish/ }).click();
  await sheet().getByRole('button', { name: /^Normal meal/ }).click();
  await sheet().getByRole('button', { name: 'Save and choose portion' }).click();
  await sheet().getByRole('button', { name: /^Small/ }).click();
  await sheet().getByRole('button', { name: 'Add to favourites' }).click();
  await page.screenshot({ path: join(shots, 'add-pick.png') });
  await sheet().getByRole('button', { name: 'Add', exact: true }).click();
  kcal += Math.round(650 * 0.7);
  assert.equal(await ring(), expectedPct(kcal, 2000));
  assert.ok(await page.locator('.chip', { hasText: "Nan's lasagne" }).isVisible(), 'favourite shows under Your usual');
  log('added "Nan\'s lasagne" as your own dish, starred it, and it shows under Your usual');

  await page.getByRole('button', { name: 'Log food' }).first().click();
  await sheet().getByLabel('Search foods').fill('lasagne');
  assert.equal(await sheet().locator('.list .row').first().innerText().then((t) => t.includes("Nan's lasagne")), true);
  await page.screenshot({ path: join(shots, 'add-results.png') });
  await sheet().getByRole('button', { name: 'Close' }).click();
  log('your own dish comes top when searching');

  await goto('week');
  assert.ok(await page.locator('.day-cell.is-today .day-pct').innerText().then((t) => t === `${expectedPct(kcal, 2000)}%`));
  await page.screenshot({ path: join(shots, 'week.png'), fullPage: true });
  log('week view shows today\'s rounded %');

  await goto('settings');
  await page.getByLabel(/Very active or physical job/).check();
  await goto('today');
  assert.equal(await ring(), expectedPct(kcal, 2800));
  log(`changed the daily amount to "very active": ${await ring()}%`);

  await goto('settings');
  await page.getByLabel(/My own number/).check();
  const custom = page.getByLabel('Your own daily amount in kcal');
  await custom.fill('800');
  await custom.press('Enter');
  await custom.blur();
  await page.waitForTimeout(200);
  assert.equal(await page.getByLabel('Your own daily amount in kcal').inputValue(), '1200');
  assert.ok(await page.locator('.toast').innerText().then((t) => t.includes('lowest daily amount')));
  log('a custom amount of 800 is raised to 1,200 with a short note');
  await page.getByLabel(/^Average/).check();

  // Backup, delete everything, restore
  await page.getByRole('button', { name: 'Copy backup code' }).click();
  await page.waitForTimeout(300);
  const code = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(code.startsWith('ISH1:') || code.startsWith('ISH0:'), 'backup code copied');
  log(`copied a backup code (${code.length} characters)`);

  await page.getByRole('button', { name: 'Delete everything' }).click();
  await sheet().getByRole('button', { name: 'Yes, delete everything' }).click();
  await sheet().getByRole('button', { name: 'Delete it all' }).click();
  await goto('today');
  assert.equal(await ring(), 0);
  assert.equal(await page.locator('.list .row').count(), 0);
  log('deleted everything (two confirmations): back to 0%');

  await goto('settings');
  await page.getByRole('button', { name: 'Restore from a code' }).click();
  await sheet().getByLabel('Backup code').fill(code);
  await sheet().getByRole('button', { name: 'Continue' }).click();
  await sheet().getByRole('button', { name: "Replace what's here" }).click();
  await goto('today');
  assert.equal(await page.locator('.list .row').count(), 3);
  assert.equal(await ring(), expectedPct(kcal, 2000));
  log('restored from the code: all 3 entries and the custom dish are back');

  // Photo guessing
  await goto('settings');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, 'settings.png'), fullPage: true });
  await page.locator('section', { hasText: 'Not downloaded' }).getByRole('button', { name: 'Download' }).click();
  await sheet().getByRole('button', { name: /^Download/ }).click();
  await page.waitForSelector('.toast:has-text("Photo guessing is ready")', { timeout: 120000 });
  log('downloaded photo guessing from the app\'s own site');

  let photo;
  if (process.env.ISH_TEST_PHOTO) {
    photo = { name: 'food.jpg', mimeType: 'image/jpeg', buffer: readFileSync(process.env.ISH_TEST_PHOTO) };
  } else {
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const x = c.getContext('2d');
      x.fillStyle = '#f4f1ea';
      x.fillRect(0, 0, 640, 480);
      x.fillStyle = '#e8b04a';
      x.beginPath();
      x.arc(320, 240, 160, 0, Math.PI * 2);
      x.fill();
      return c.toDataURL('image/png');
    });
    photo = { name: 'food.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
  }

  const runPhoto = async () => {
    await goto('today');
    await page.getByRole('button', { name: 'Guess from a photo' }).click();
    await sheet().getByRole('button', { name: 'Choose from your photos' }).waitFor();
    const input = sheet().locator('input[type="file"]:not([capture])');
    await input.setInputFiles(photo);
    await sheet().locator('.guess-top').waitFor({ timeout: 60000 });
    const top = await sheet().locator('.guess-top .row-title').innerText();
    const others = await sheet().locator('.list .row-title').allInnerTexts();
    return { top, others };
  };
  const first = await runPhoto();
  await page.screenshot({ path: join(shots, 'photo-results.png') });
  log(`photo guess suggested: ${first.others.join(', ')}`);
  await sheet().locator('.guess-top').click();
  await sheet().getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  assert.equal(await page.locator('.list .row').count(), 4);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ish.v1')).entries.at(-1).via);
  assert.equal(saved, 'photo');
  log(`logged "${first.top}" from the photo`);

  // Offline
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.ring-pct');
  assert.equal(await page.locator('.list .row').count(), 4);
  const offlineGuess = await runPhoto();
  assert.equal(offlineGuess.top, first.top);
  await sheet().getByRole('button', { name: 'Close' }).click();
  log('works fully offline after a reload, including photo guessing');
  await context.setOffline(false);

  // Privacy checks
  const cookies = await context.cookies();
  assert.equal(cookies.length, 0, 'no cookies');
  assert.equal(await page.evaluate(() => document.cookie), '');
  const foreign = requests.filter((r) => !r.url.startsWith(base) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
  assert.deepEqual(foreign, [], 'no requests to any other site');
  const nonGet = requests.filter((r) => r.method !== 'GET');
  assert.deepEqual(nonGet, [], 'only plain GET requests for static files');
  const withData = requests.filter((r) => r.url.startsWith(base) && /\?(?!v=[0-9a-f]{12}$)/.test(r.url));
  assert.deepEqual(withData, [], 'no data in any request URL');
  log(`privacy: no cookies, ${requests.length} requests, all plain GETs for the app's own files`);

  // Dark mode screenshots
  const dark = await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'dark' });
  const dp = await dark.newPage();
  await dp.goto(base, { waitUntil: 'networkidle' });
  await dp.evaluate((data) => localStorage.setItem('ish.v1', data), await page.evaluate(() => localStorage.getItem('ish.v1')));
  await dp.reload({ waitUntil: 'networkidle' });
  await dp.screenshot({ path: join(shots, 'today-dark.png'), fullPage: true });
  await dp.getByRole('button', { name: 'Log food' }).first().click();
  await dp.locator('dialog[open]').getByLabel('Search foods').fill('curry');
  await dp.screenshot({ path: join(shots, 'add-dark.png') });
  await dp.goto(`${base}#/week`);
  await dp.waitForTimeout(200);
  await dp.screenshot({ path: join(shots, 'week-dark.png'), fullPage: true });
  await dark.close();
  log('took light and dark screenshots');

  assert.deepEqual(errors, [], `no console errors:\n${errors.join('\n')}`);
  console.log(`\nAll good. Screenshots in ${shots}`);
} catch (err) {
  console.error('\nFAILED:', err.message);
  if (errors.length) console.error('Console errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  proc.kill();
}
