import { test } from 'node:test';
import assert from 'node:assert/strict';
import { l2normalise, rankDishes, confidence } from '../app/js/photo-rank.js';

test('l2normalise gives unit length', () => {
  const v = l2normalise(new Float32Array([3, 4]));
  assert.ok(Math.abs(v[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(v[1] - 0.8) < 1e-6);
});

test('rankDishes orders by similarity and probabilities sum to 1', () => {
  const dim = 3;
  const ids = ['a', 'b', 'c'];
  const dishes = new Float32Array([
    ...l2normalise(new Float32Array([1, 0, 0])),
    ...l2normalise(new Float32Array([0, 1, 0])),
    ...l2normalise(new Float32Array([0.9, 0.1, 0])),
  ]);
  const img = l2normalise(new Float32Array([1, 0.05, 0]));
  const all = rankDishes(img, dishes, ids, { topK: 3, logitScale: 10 });
  assert.deepEqual(all.map((r) => r.id), ['a', 'c', 'b']);
  const sum = all.reduce((s, r) => s + r.prob, 0);
  assert.ok(Math.abs(sum - 1) < 1e-5);
  assert.equal(rankDishes(img, dishes, ids, { topK: 2 }).length, 2);
  assert.equal(dim, 3);
});

test('allowed set filters rows', () => {
  const ids = ['a', 'b'];
  const dishes = new Float32Array([1, 0, 0, 1]);
  const img = new Float32Array([1, 0]);
  const res = rankDishes(img, dishes, ids, { allowed: new Set(['b']) });
  assert.deepEqual(res.map((r) => r.id), ['b']);
  assert.ok(Math.abs(res[0].prob - 1) < 1e-6);
});

test('mismatched sizes throw', () => {
  assert.throws(() => rankDishes(new Float32Array(2), new Float32Array(5), ['a', 'b']));
});

test('confidence wording threshold', () => {
  assert.equal(confidence([{ prob: 0.9 }]), 'sure');
  assert.equal(confidence([{ prob: 0.1 }]), 'unsure');
  assert.equal(confidence([]), 'unsure');
});
