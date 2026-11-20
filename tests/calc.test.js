import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  displayPercent, rawPercent, rangeStatus, portionKcal, clampTarget, targetFromSettings,
  dayKey, shiftDay, lastNDays, totalKcal, roughKcal, formatKcal, overLine, OVER_LINES,
  CUSTOM_MIN, CUSTOM_MAX,
} from '../app/js/calc.js';


test('percentage rounding edges', () => {
  assert.equal(displayPercent(1140, 2000), 55); // 57.0 -> 55
  assert.equal(displayPercent(1160, 2000), 60); // 58.0 -> 60
  assert.equal(displayPercent(1200, 2000), 60);
  assert.equal(displayPercent(2000, 2000), 100);
  assert.equal(displayPercent(2300, 2000), 115);
});

test('nothing logged is 0, anything logged is at least 5', () => {
  assert.equal(displayPercent(0, 2000), 0);
  assert.equal(displayPercent(5, 2000), 5);
  assert.equal(displayPercent(40, 2000), 5);
});

test('raw percent handles a missing target', () => {
  assert.equal(rawPercent(500, 0), 0);
  assert.equal(rawPercent(500, 2000), 25);
});

test('range status uses the floor', () => {
  assert.equal(rangeStatus(0, 80), 'empty');
  assert.equal(rangeStatus(50, 80), 'below');
  assert.equal(rangeStatus(80, 80), 'in');
  assert.equal(rangeStatus(100, 80), 'in');
  assert.equal(rangeStatus(105, 80), 'over');
});

test('portions scale the base kcal', () => {
  assert.equal(portionKcal(650, 'normal'), 650);
  assert.equal(portionKcal(650, 'small'), 455);
  assert.equal(portionKcal(650, 'large'), 910);
  assert.equal(portionKcal(650, 'half'), 325);
  assert.equal(portionKcal(650, 'double'), 1300);
  assert.equal(portionKcal(650, 'nonsense'), 650);
});

test('custom target is clamped and never below the minimum', () => {
  assert.deepEqual(clampTarget(800), { value: CUSTOM_MIN, clamped: 'low' });
  assert.deepEqual(clampTarget(1199), { value: CUSTOM_MIN, clamped: 'low' });
  assert.deepEqual(clampTarget(1200), { value: 1200, clamped: null });
  assert.deepEqual(clampTarget(9000), { value: CUSTOM_MAX, clamped: 'high' });
  assert.equal(clampTarget('abc').clamped, 'invalid');
});

test('target comes from preset or custom number', () => {
  assert.equal(targetFromSettings({ targetPreset: 'average' }), 2000);
  assert.equal(targetFromSettings({ targetPreset: 'active' }), 2800);
  assert.equal(targetFromSettings({ targetPreset: 'custom', targetKcal: 1850 }), 1850);
  assert.equal(targetFromSettings({ targetPreset: 'custom', targetKcal: 500 }), CUSTOM_MIN);
});

test('day key: before the day start hour counts as the previous day', () => {
  const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  assert.equal(dayKey(at(2026, 11, 19, 1, 30), 4), '2026-11-18');
  assert.equal(dayKey(at(2026, 11, 19, 3, 59), 4), '2026-11-18');
  assert.equal(dayKey(at(2026, 11, 19, 4, 0), 4), '2026-11-19');
  assert.equal(dayKey(at(2026, 11, 19, 23, 59), 4), '2026-11-19');
  assert.equal(dayKey(at(2026, 11, 19, 1, 30), 0), '2026-11-19');
  // Month and year boundaries
  assert.equal(dayKey(at(2026, 1, 1, 2), 4), '2025-12-31');
  assert.equal(dayKey(at(2026, 3, 1, 2), 4), '2026-02-28');
});

test('day key across UK daylight saving changes', () => {
  // Clocks go forward 29 March 2026, back 25 October 2026 (only meaningful when TZ is Europe/London)
  const fwd = new Date(2026, 2, 29, 3, 30).getTime();
  assert.equal(dayKey(fwd, 4), '2026-03-28');
  const back = new Date(2026, 9, 25, 1, 30).getTime();
  assert.equal(dayKey(back, 4), '2026-10-24');
  assert.equal(shiftDay('2026-03-29', 1), '2026-03-30');
  assert.equal(shiftDay('2026-10-25', -1), '2026-10-24');
});

test('shiftDay and lastNDays', () => {
  assert.equal(shiftDay('2026-11-19', -1), '2026-11-18');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(lastNDays('2026-11-19', 3), ['2026-11-17', '2026-11-18', '2026-11-19']);
  assert.equal(lastNDays('2026-11-19', 7).length, 7);
});

test('total kcal only counts the given day', () => {
  const entries = [
    { day: '2026-11-19', kcal: 650 },
    { day: '2026-11-19', kcal: 250 },
    { day: '2026-11-18', kcal: 999 },
  ];
  assert.equal(totalKcal(entries, '2026-11-19'), 900);
});

test('rough kcal display', () => {
  assert.equal(roughKcal(455), 460);
  assert.equal(roughKcal(454), 450);
  assert.equal(formatKcal(651), '~650 kcal');
});

test('over-100 line is stable for a day and from the list', () => {
  const a = overLine('2026-11-19');
  assert.equal(a, overLine('2026-11-19'));
  assert.ok(OVER_LINES.includes(a));
});
