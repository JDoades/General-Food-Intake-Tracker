// Checks how well photo guessing does on a folder of your own test photos.
// Name each photo after the dish id you expect, e.g. fish-and-chips__1.jpg
//
//   node tools/eval-photo.mjs path/to/photos            (uses the model the app ships)
//   node tools/eval-photo.mjs path/to/photos --compare  (also compares with full precision)
//
// Photos are only read locally. Nothing is uploaded.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from '@huggingface/transformers';
import { rankDishes, l2normalise, confidence } from '../app/js/photo-rank.js';
import { FOODS } from '../app/js/foods.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const info = JSON.parse(readFileSync(join(root, 'app/model/model-info.json'), 'utf8'));
const ids = JSON.parse(readFileSync(join(root, 'app/model/dish-ids.json'), 'utf8'));
const buf = readFileSync(join(root, 'app/model/dish-embeddings.bin'));
const dishEmbs = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const nameOf = Object.fromEntries(FOODS.map((f) => [f.id, f.name]));

const dir = process.argv[2];
const compare = process.argv.includes('--compare');
if (!dir) {
  console.error('Usage: node tools/eval-photo.mjs <photo folder> [--compare]');
  process.exit(1);
}

// Dishes that count as a correct guess for a test label, because they look the same.
const ALSO_OK = {
  'pizza-medium': ['pizza-slice', 'pizza-large', 'pizza-frozen', 'restaurant-pizza'],
  'burger-meal': ['big-burger', 'cheeseburger', 'pub-burger', 'homemade-burger'],
  'fish-and-chips': ['fish-chips-peas'],
  'roast-beef-dinner': ['pub-roast', 'carvery', 'roast-chicken-dinner', 'roast-pork-dinner', 'roast-lamb-dinner'],
  'tikka-masala': ['butter-chicken', 'korma', 'home-curry', 'madras', 'jalfrezi', 'rogan-josh'],
  'sushi-platter': ['sushi-pack'],
  'pint-lager': ['pint-ale', 'pint-cider', 'pint-ipa'],
  pasty: ['cheese-onion-pasty', 'steak-bake'],
  'doner-kebab': ['shish-kebab', 'doner-chips'],
  'crisps': ['crisps-sharing'],
  'full-english': ['veggie-breakfast'],
  'spaghetti-bolognese': ['meatballs-spaghetti'],
  'sausage-roll': ['veggie-sausage-roll'],
  'caesar-salad': ['chicken-salad'],
  'shepherds-pie': ['fish-pie'],
};

async function embedAll(files, dtype) {
  const processor = await AutoProcessor.from_pretrained(info.model, { revision: info.revision });
  const model = await CLIPVisionModelWithProjection.from_pretrained(info.model, { revision: info.revision, dtype });
  const out = [];
  for (const f of files) {
    const image = await RawImage.read(join(dir, f));
    const { image_embeds } = await model(await processor(image));
    out.push(l2normalise(Float32Array.from(image_embeds.data)));
  }
  return out;
}

const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const shipped = /fp16/.test(info.visionFile) ? 'fp16' : /int8|quantized|uint8/.test(info.visionFile) ? 'int8' : 'fp32';
const main = await embedAll(files, shipped);
const ref = compare && shipped !== 'fp32' ? await embedAll(files, 'fp32') : null;

let top1 = 0;
let top4 = 0;
let agree = 0;
const sureRight = [];
const sureWrong = [];
files.forEach((f, i) => {
  const expected = basename(f).split('__')[0];
  const ok = new Set([expected, ...(ALSO_OK[expected] || [])]);
  const res = rankDishes(main[i], dishEmbs, ids, { logitScale: info.logitScale, topK: 4 });
  const hit1 = ok.has(res[0].id);
  const hit4 = res.some((r) => ok.has(r.id));
  top1 += hit1;
  top4 += hit4;
  (hit1 ? sureRight : sureWrong).push(res[0].prob);
  let line = `${hit1 ? 'OK ' : hit4 ? 'ok4' : '-- '} ${f.padEnd(28)} ${confidence(res).padEnd(6)} ` +
    res.map((r) => `${nameOf[r.id]} ${(r.prob * 100).toFixed(0)}%`).join(' | ');
  if (ref) {
    const r2 = rankDishes(ref[i], dishEmbs, ids, { logitScale: info.logitScale, topK: 1 });
    let cos = 0;
    for (let k = 0; k < main[i].length; k++) cos += main[i][k] * ref[i][k];
    agree += r2[0].id === res[0].id;
    line += `   [fp32 top1: ${nameOf[r2[0].id]}, cos ${cos.toFixed(3)}]`;
  }
  console.log(line);
});
const n = files.length;
console.log(`\n${shipped}: top-1 ${top1}/${n} (${Math.round((top1 / n) * 100)}%), in top 4: ${top4}/${n} (${Math.round((top4 / n) * 100)}%)`);
if (ref) console.log(`${shipped} and fp32 agree on the top pick for ${agree}/${n}`);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
console.log(`Average top probability when right: ${(avg(sureRight) * 100).toFixed(0)}%, when wrong: ${(avg(sureWrong) * 100).toFixed(0)}%`);
