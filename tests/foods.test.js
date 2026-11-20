import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { FOODS, QUICK, CATEGORIES, foodById } from '../app/js/foods.js';

test('food ids are unique and names are not duplicated', () => {
  const ids = new Set();
  const names = new Set();
  for (const f of [...FOODS, ...QUICK]) {
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
    ids.add(f.id);
    const n = f.name.toLowerCase();
    assert.ok(!names.has(n), `duplicate name ${f.name}`);
    names.add(n);
  }
});

test('every food has a known category, sane kcal and clean text', () => {
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const f of FOODS) {
    assert.ok(cats.has(f.cat), `${f.id} has unknown category ${f.cat}`);
    assert.ok(Number.isInteger(f.kcal) && f.kcal >= 1 && f.kcal <= 3000, `${f.id} kcal ${f.kcal}`);
    assert.match(f.id, /^[a-z0-9-]+$/);
    assert.ok(!/\u2014/.test(f.name + f.aliases.join()), `${f.id} contains an emdash`);
    for (const a of f.aliases) assert.ok(a.length > 0);
  }
});

test('the list is a decent size and every category has items', () => {
  assert.ok(FOODS.length >= 300, `only ${FOODS.length} foods`);
  for (const c of CATEGORIES) assert.ok(FOODS.some((f) => f.cat === c.id), `${c.id} is empty`);
});

test('foodById finds dishes and quick sizes', () => {
  assert.equal(foodById('spaghetti-bolognese').name, 'Spaghetti bolognese');
  assert.equal(foodById('q-snack').kcal, 250);
  assert.equal(foodById('nope'), null);
});

test('photo index matches the food list (run `npm run photo-index` if this fails)', () => {
  const path = new URL('../app/model/dish-ids.json', import.meta.url);
  if (!existsSync(path)) return; // Photo index not built yet
  const ids = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(ids, FOODS.map((f) => f.id));
  const bin = readFileSync(new URL('../app/model/dish-embeddings.bin', import.meta.url));
  assert.equal(bin.byteLength % (ids.length * 4), 0);
});
