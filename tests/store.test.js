import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, defaultData, normaliseData, KEY, BEFORE_IMPORT_KEY } from '../app/js/store.js';

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
    _m: m,
  };
}

test('fresh store has sensible defaults', () => {
  const s = createStore(memoryStorage(), { now: () => 1000 });
  assert.equal(s.data.version, 1);
  assert.equal(s.data.settings.targetPreset, 'average');
  assert.equal(s.data.settings.dayStartHour, 4);
  assert.equal(s.data.settings.floorPct, 80);
  assert.deepEqual(s.data.entries, []);
  assert.equal(s.data.meta.created, 1000);
});

test('update saves to storage and notifies listeners', () => {
  const st = memoryStorage();
  const s = createStore(st);
  let calls = 0;
  s.subscribe(() => calls++);
  s.update((d) => d.entries.push({ id: 'a', t: 1, day: '2026-11-19', name: 'Toast', kcal: 250, portion: 'normal' }));
  assert.equal(calls, 1);
  const saved = JSON.parse(st.getItem(KEY));
  assert.equal(saved.entries.length, 1);
  const s2 = createStore(st);
  assert.equal(s2.data.entries[0].name, 'Toast');
});

test('corrupt saved data is kept aside, not lost, and the app starts fresh', () => {
  const st = memoryStorage({ [KEY]: '{not json' });
  const s = createStore(st, { now: () => 42 });
  assert.deepEqual(s.data.entries, []);
  assert.equal(st.getItem(`${KEY}.corrupt-42`), '{not json');
});

test('normaliseData drops broken entries and fixes bad settings', () => {
  const d = normaliseData({
    settings: { targetPreset: 'weird', targetKcal: 300, floorPct: 12, dayStartHour: 30 },
    entries: [
      { id: 'ok', t: 5, day: '2026-11-19', name: 'Apple', kcal: 70, portion: 'small' },
      { id: 'dup', t: 6, day: '2026-11-19', name: 'Pear', kcal: 80 },
      { id: 'dup', t: 7, day: '2026-11-19', name: 'Pear again', kcal: 80 },
      { t: 'nope', day: '2026-11-19', name: 'Bad time', kcal: 10 },
      { t: 8, day: '19/11/2026', name: 'Bad day', kcal: 10 },
      { t: 9, day: '2026-11-19', name: '', kcal: 10 },
      { t: 10, day: '2026-11-19', name: 'Negative', kcal: -5 },
    ],
    customFoods: [{ id: 'c-1', name: 'Mum lasagne', kcal: 700 }, { name: 'no kcal' }],
    favourites: ['a', 'a', 5, 'b'],
  });
  assert.equal(d.settings.targetPreset, 'average');
  assert.equal(d.settings.targetKcal, 1200);
  assert.equal(d.settings.floorPct, 50);
  assert.equal(d.settings.dayStartHour, 11);
  assert.deepEqual(d.entries.map((e) => e.id), ['ok', 'dup']);
  assert.equal(d.entries[1].portion, 'normal');
  assert.equal(d.customFoods.length, 1);
  assert.deepEqual(d.favourites, ['a', 'b']);
});

test('missing version is migrated to version 1', () => {
  const d = normaliseData({ entries: [] });
  assert.equal(d.version, 1);
});

test('copy before import can be restored once', () => {
  const st = memoryStorage();
  const s = createStore(st);
  s.update((d) => d.entries.push({ id: 'orig', t: 1, day: '2026-11-19', name: 'Toast', kcal: 250 }));
  s.keepCopyBeforeImport();
  s.replace({ ...defaultData(), entries: [] });
  assert.equal(s.data.entries.length, 0);
  assert.ok(s.hasCopyBeforeImport());
  assert.ok(s.restoreCopyBeforeImport());
  assert.equal(s.data.entries[0].id, 'orig');
  assert.equal(st.getItem(BEFORE_IMPORT_KEY), null);
});

test('wipe clears everything', () => {
  const st = memoryStorage();
  const s = createStore(st);
  s.update((d) => d.entries.push({ id: 'x', t: 1, day: '2026-11-19', name: 'Toast', kcal: 250 }));
  s.wipe();
  assert.equal(s.data.entries.length, 0);
});

test('a full storage does not crash, it reports failure', () => {
  const st = memoryStorage();
  st.setItem = () => { throw new Error('QuotaExceededError'); };
  const s = createStore(st);
  const ok = s.update((d) => d.entries.push({ id: 'x', t: 1, day: '2026-11-19', name: 'Toast', kcal: 250 }));
  assert.equal(ok, false);
});
