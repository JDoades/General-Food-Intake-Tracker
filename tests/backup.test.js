import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCode, toJSON, parseBackup, mergeData, replaceData, summarise, backupFilename, BackupError } from '../app/js/backup.js';
import { normaliseData } from '../app/js/store.js';

const sample = normaliseData({
  settings: { targetPreset: 'custom', targetKcal: 1900, floorPct: 75, dayStartHour: 5 },
  entries: [
    { id: 'e1', t: 1000, day: '2026-11-18', name: 'Spaghetti bolognese', foodId: 'spaghetti-bolognese', kcal: 650, portion: 'normal' },
    { id: 'e2', t: 2000, day: '2026-11-19', name: 'Toast', foodId: 'toast-butter', kcal: 250, portion: 'small' },
  ],
  customFoods: [{ id: 'c-1', name: "Mum's lasagne", kcal: 700 }],
  favourites: ['spaghetti-bolognese'],
});

test('gzip code round trip', async () => {
  const code = await toCode(sample, { compress: true });
  assert.ok(code.startsWith('ISH1:'));
  const back = await parseBackup(code);
  assert.deepEqual(back.entries, sample.entries);
  assert.deepEqual(back.customFoods, sample.customFoods);
  assert.deepEqual(back.settings, sample.settings);
});

test('plain code round trip', async () => {
  const code = await toCode(sample, { compress: false });
  assert.ok(code.startsWith('ISH0:'));
  const back = await parseBackup(code);
  assert.deepEqual(back.entries, sample.entries);
});

test('pasted codes with line breaks and spaces still work', async () => {
  const code = await toCode(sample, { compress: true });
  const messy = '  ' + code.slice(0, 20) + '\n' + code.slice(20, 40) + ' \n ' + code.slice(40) + '\n';
  const back = await parseBackup(messy);
  assert.equal(back.entries.length, 2);
});

test('backup file JSON round trip', async () => {
  const back = await parseBackup(toJSON(sample));
  assert.deepEqual(back.entries, sample.entries);
  assert.equal(back.settings.targetKcal, 1900);
});

test('bad input gives friendly errors', async () => {
  await assert.rejects(parseBackup(''), BackupError);
  await assert.rejects(parseBackup('hello'), BackupError);
  await assert.rejects(parseBackup('ISH1:@@@notbase64@@@'), BackupError);
  await assert.rejects(parseBackup('ISH1:AAAA'), BackupError);
  await assert.rejects(parseBackup('{"broken": '), BackupError);
  await assert.rejects(parseBackup('{"app":"other","entries":[]}'), BackupError);
  await assert.rejects(parseBackup('{"foo": 1}'), BackupError);
  await assert.rejects(parseBackup('{"app":"ish","version":99,"entries":[]}'), BackupError);
});

test('truncated code is rejected', async () => {
  const code = await toCode(sample, { compress: true });
  await assert.rejects(parseBackup(code.slice(0, Math.floor(code.length / 2))), BackupError);
});

test('merge keeps both sides and dedupes by id', () => {
  const incoming = normaliseData({
    entries: [
      { id: 'e2', t: 2000, day: '2026-11-19', name: 'Toast changed', kcal: 999 },
      { id: 'e3', t: 3000, day: '2026-11-19', name: 'Apple', kcal: 70 },
    ],
    customFoods: [{ id: 'c-1', name: 'Other', kcal: 1 }, { id: 'c-2', name: 'Soup', kcal: 300 }],
    favourites: ['apple'],
  });
  const merged = mergeData(sample, incoming);
  assert.deepEqual(merged.entries.map((e) => e.id), ['e1', 'e2', 'e3']);
  assert.equal(merged.entries.find((e) => e.id === 'e2').name, 'Toast');
  assert.deepEqual(merged.customFoods.map((f) => f.id), ['c-1', 'c-2']);
  assert.deepEqual(merged.favourites, ['spaghetti-bolognese', 'apple']);
  assert.equal(merged.settings.targetKcal, 1900);
});

test('replace uses the backup but keeps local hint state', () => {
  const current = normaliseData({ meta: { installHintDismissed: true, lastExport: 5 } });
  const replaced = replaceData(current, sample);
  assert.equal(replaced.entries.length, 2);
  assert.equal(replaced.meta.installHintDismissed, true);
  assert.equal(replaced.meta.lastExport, 5);
});

test('summary and filename', () => {
  assert.deepEqual(summarise(sample), { entries: 2, customFoods: 1, days: 2, firstDay: '2026-11-18', lastDay: '2026-11-19' });
  assert.equal(backupFilename(new Date(2026, 10, 9)), 'ish-backup-2026-11-09.json');
});
