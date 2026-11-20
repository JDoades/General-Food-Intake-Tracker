// Stamps app/sw.js with a version made from the contents of every cached app file, so phones
// always pick up a new release and never mix old and new files. Run with: npm run stamp
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const app = join(dirname(fileURLToPath(import.meta.url)), '../app');

export function coreList(swText) {
  const m = swText.match(/const CORE = \[([\s\S]*?)\];/);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

export function computeVersion(swText) {
  const hash = createHash('sha256');
  // Include sw.js itself, minus its own version line
  hash.update(swText.replace(/const VERSION = '[^']*';/, ''));
  for (const p of coreList(swText)) {
    if (p === './') continue;
    hash.update(p);
    hash.update(readFileSync(join(app, p)));
  }
  return `ish-core-${hash.digest('hex').slice(0, 10)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = join(app, 'sw.js');
  const text = readFileSync(path, 'utf8');
  const version = computeVersion(text);
  writeFileSync(path, text.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`));
  console.log('sw.js version', version);
}
