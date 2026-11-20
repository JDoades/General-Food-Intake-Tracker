import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchFoods, prepareFoods, normalise, editDistance } from '../app/js/search.js';
import { FOODS, QUICK } from '../app/js/foods.js';

const all = prepareFoods([...FOODS, ...QUICK]);
const top = (q, foods = all) => searchFoods(foods, q, { limit: 5 }).map((f) => f.id);

test('normalise strips case, accents and punctuation', () => {
  assert.equal(normalise("Shepherd's Pie"), 'shepherds pie');
  assert.equal(normalise('Crème Brûlée!'), 'creme brulee');
  assert.equal(normalise('Fish & Chips'), 'fish and chips');
});

test('edit distance', () => {
  assert.equal(editDistance('spagetti', 'spaghetti'), 1);
  assert.equal(editDistance('abc', 'xyz', 1), 2);
});

test('spaghetti bolognese is found by name, alias and slang', () => {
  assert.equal(top('spaghetti bolognese')[0], 'spaghetti-bolognese');
  assert.equal(top('spag bol')[0], 'spaghetti-bolognese');
  assert.equal(top('bolognese')[0], 'spaghetti-bolognese');
});

test('typos still find the dish', () => {
  assert.ok(top('spagetti bolognase').includes('spaghetti-bolognese'));
  assert.ok(top('lasagna').includes('lasagne'));
  assert.ok(top('capucino').includes('cappuccino'));
});

test('common UK phrasing works', () => {
  assert.equal(top('chippy tea')[0], 'fish-and-chips');
  assert.equal(top('cuppa')[0], 'tea');
  assert.ok(top('fry up').includes('full-english'));
  assert.ok(top('beans on toast').includes('beans-on-toast'));
  assert.ok(top('pint').includes('pint-lager'));
});

test('custom dishes are searchable and boosts reorder results', () => {
  const foods = prepareFoods([...FOODS, { id: 'c-1', name: "Mum's lasagne", kcal: 700, cat: 'custom' }]);
  const res = searchFoods(foods, 'lasagne', { limit: 5, boost: { 'c-1': 50 } }).map((f) => f.id);
  assert.equal(res[0], 'c-1');
  assert.ok(res.includes('lasagne'));
});

test('empty or junk queries return nothing sensible', () => {
  assert.deepEqual(top(''), []);
  assert.deepEqual(top('   '), []);
  assert.deepEqual(top('zzqqxx'), []);
});
