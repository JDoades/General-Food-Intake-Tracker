import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreList, computeVersion } from '../tools/stamp-sw.mjs';

const app = fileURLToPath(new URL('../app', import.meta.url));
const sw = readFileSync(join(app, 'sw.js'), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(app, p).split('\\').join('/')];
  });
}

// Served but deliberately not cached up front: the photo download (fetched on demand) and notices
const NOT_PRECACHED = (p) => p === 'sw.js' || p.startsWith('model/') || p.endsWith('.wasm') || /LICENSE/.test(p);

test('every app file is cached for offline use, and every cached file exists', () => {
  const core = new Set(coreList(sw));
  for (const p of walk(app)) {
    if (NOT_PRECACHED(p)) continue;
    assert.ok(core.has(p), `${p} is missing from CORE in sw.js`);
  }
  for (const p of core) {
    if (p === './') continue;
    assert.ok(existsSync(join(app, p)), `${p} is listed in sw.js but does not exist`);
  }
});

test('service worker version is stamped and current (run `npm run stamp` if this fails)', () => {
  const m = sw.match(/const VERSION = '([^']*)';/);
  assert.equal(m[1], computeVersion(sw));
});
