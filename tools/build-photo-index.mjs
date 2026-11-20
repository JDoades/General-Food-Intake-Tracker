// Builds the files photo guessing needs, in app/model/:
//   vision_model.onnx       MobileCLIP-S0 image encoder (downloaded from Hugging Face)
//   dish-embeddings.bin     one 512-number "fingerprint" per dish in foods.js (Float32, little endian)
//   dish-ids.json           which dish each row belongs to
//   LICENSE-MobileCLIP.txt  Apple's licence notice, which must ship with the model
//
// The text half of the model runs here, once, and is never shipped to phones.
// Run with: npm run photo-index      (re-run whenever foods.js changes)

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers';
import { FOODS } from '../app/js/foods.js';
import { writePhotoManifest } from './photo-manifest.mjs';

const MODEL_ID = 'Xenova/mobileclip_s0';
const REVISION = '757d59c9c6870a76a4b0306f05f5061bca15c39f';
// fp16 halves the download and gives the same fingerprints as full precision. The 8-bit
// versions on Hugging Face give broken fingerprints for this model, so don't use them.
// Check any change with: node tools/eval-photo.mjs <photo folder> --compare
const VISION_FILE = process.env.ISH_VISION_FILE || 'onnx/vision_model_fp16.onnx';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'app/model');
mkdirSync(out, { recursive: true });

const DRINK_CATS = new Set(['hotdrinks', 'softdrinks', 'alcohol']);

/** Text prompts describing a dish. Their fingerprints are averaged into one per dish. */
export function promptsFor(food) {
  const clean = food.name.replace(/\s*\([^)]*\)/g, '').trim();
  const lower = clean.charAt(0).toLowerCase() + clean.slice(1);
  const kind = DRINK_CATS.has(food.cat) ? 'drink' : 'food';
  const prompts = [
    `a photo of ${lower}, a type of ${kind}.`,
    `a photo of ${lower}.`,
    DRINK_CATS.has(food.cat) ? `a glass or cup of ${lower}.` : `a plate of ${lower}.`,
  ];
  if (clean !== food.name) prompts.push(`a photo of ${food.name.charAt(0).toLowerCase() + food.name.slice(1)}.`);
  return prompts;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function normalise(v) {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

export async function embedTexts(texts, { batch = 48 } = {}) {
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { revision: REVISION });
  const model = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { revision: REVISION, dtype: 'fp32' });
  const all = [];
  for (let i = 0; i < texts.length; i += batch) {
    const chunk = texts.slice(i, i + batch);
    const inputs = tokenizer(chunk, { padding: 'max_length', truncation: true });
    const { text_embeds } = await model(inputs);
    const rows = text_embeds.tolist();
    for (const r of rows) all.push(normalise(r));
    process.stdout.write(`\r  text fingerprints ${Math.min(i + batch, texts.length)}/${texts.length}`);
  }
  process.stdout.write('\n');
  return all;
}

async function main() {
  const base = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}`;
  const visionDest = join(out, 'vision_model.onnx');
  console.log(`Downloading ${VISION_FILE}`);
  await download(`${base}/${VISION_FILE}`, visionDest);
  console.log(`  ${(statSync(visionDest).size / 1e6).toFixed(1)} MB`);
  await download(`${base}/LICENSE`, join(out, 'LICENSE-MobileCLIP.txt'));

  const prompts = [];
  const owner = [];
  FOODS.forEach((f, i) => {
    for (const p of promptsFor(f)) {
      prompts.push(p);
      owner.push(i);
    }
  });
  console.log(`Embedding ${prompts.length} prompts for ${FOODS.length} dishes`);
  const embs = await embedTexts(prompts);
  const dim = embs[0].length;
  const sums = FOODS.map(() => new Float64Array(dim));
  embs.forEach((e, k) => {
    const s = sums[owner[k]];
    for (let j = 0; j < dim; j++) s[j] += e[j];
  });
  const flat = new Float32Array(FOODS.length * dim);
  sums.forEach((s, i) => flat.set(normalise(Array.from(s)), i * dim));
  writeFileSync(join(out, 'dish-embeddings.bin'), Buffer.from(flat.buffer));
  writeFileSync(join(out, 'dish-ids.json'), JSON.stringify(FOODS.map((f) => f.id)));
  writeFileSync(join(out, 'model-info.json'), JSON.stringify({
    model: MODEL_ID, revision: REVISION, visionFile: VISION_FILE, dim, dishes: FOODS.length,
    imageSize: 256, logitScale: 100,
  }, null, 1));
  console.log(`Wrote ${FOODS.length} x ${dim} fingerprints`);
  if (!existsSync(join(root, 'app/vendor/ort/ort.wasm.bundle.min.mjs'))) {
    console.log('Note: run `npm run vendor` too, to copy the ONNX Runtime files.');
  }
  writePhotoManifest(root);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
