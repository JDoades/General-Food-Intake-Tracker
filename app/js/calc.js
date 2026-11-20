// Pure logic for Ish. No DOM and no storage in here, so it can be unit tested in Node.

export const PRESETS = [
  { id: 'smaller', label: 'Smaller frame or not very active', kcal: 1800 },
  { id: 'average', label: 'Average', kcal: 2000 },
  { id: 'bigger', label: 'Taller, bigger or fairly active', kcal: 2400 },
  { id: 'active', label: 'Very active or physical job', kcal: 2800 },
];

// A custom daily target can't go below this. It stops the app being used as a restriction tool.
export const CUSTOM_MIN = 1200;
export const CUSTOM_MAX = 5000;

export const FLOOR_MIN = 50;
export const FLOOR_MAX = 95;
export const FLOOR_DEFAULT = 80;

export const DAY_START_DEFAULT = 4;
export const DAY_START_MAX = 11;

export const PORTIONS = [
  { id: 'half', label: 'Half', mult: 0.5, more: true },
  { id: 'small', label: 'Small', mult: 0.7 },
  { id: 'normal', label: 'Normal', mult: 1 },
  { id: 'large', label: 'Large', mult: 1.4 },
  { id: 'double', label: 'Double', mult: 2, more: true },
];

const PORTION_BY_ID = Object.fromEntries(PORTIONS.map((p) => [p.id, p]));

export function isPortion(id) {
  return Object.prototype.hasOwnProperty.call(PORTION_BY_ID, id);
}

export function portionLabel(id) {
  return (PORTION_BY_ID[id] || PORTION_BY_ID.normal).label;
}

export function portionKcal(baseKcal, portionId = 'normal') {
  const p = PORTION_BY_ID[portionId] || PORTION_BY_ID.normal;
  return Math.round(baseKcal * p.mult);
}

/** Clamp a typed-in custom target. Returns the value to use and whether it had to be changed. */
export function clampTarget(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return { value: 2000, clamped: 'invalid' };
  if (v < CUSTOM_MIN) return { value: CUSTOM_MIN, clamped: 'low' };
  if (v > CUSTOM_MAX) return { value: CUSTOM_MAX, clamped: 'high' };
  return { value: v, clamped: null };
}

export function targetFromSettings(settings) {
  const preset = PRESETS.find((p) => p.id === settings?.targetPreset);
  if (preset) return preset.kcal;
  return clampTarget(settings?.targetKcal ?? 2000).value;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Which "day" a moment belongs to. Before the day start hour (default 4am) still counts
 * as the previous day, so a 1am snack goes with the evening before.
 */
export function dayKey(ts, startHour = DAY_START_DEFAULT) {
  const d = new Date(ts);
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  return ymd(d);
}

/** Local noon on the given day key. Noon keeps date maths clear of daylight saving jumps. */
export function dayKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function shiftDay(key, delta) {
  const d = dayKeyToDate(key);
  d.setDate(d.getDate() + delta);
  return ymd(d);
}

/** The last n day keys ending with `endKey`, oldest first. */
export function lastNDays(endKey, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDay(endKey, -i));
  return out;
}

export function entriesForDay(entries, key) {
  return entries.filter((e) => e.day === key).sort((a, b) => a.t - b.t);
}

export function totalKcal(entries, key) {
  let sum = 0;
  for (const e of entries) if (e.day === key) sum += e.kcal;
  return sum;
}

export function rawPercent(total, target) {
  if (!target || target <= 0) return 0;
  return (total / target) * 100;
}

/**
 * The percentage people see: rounded to the nearest 5 so it is too rough to chase
 * single digits. Anything logged shows at least 5% so logging never looks like it did nothing.
 */
export function displayPercent(total, target) {
  if (total <= 0) return 0;
  const rounded = Math.round(rawPercent(total, target) / 5) * 5;
  return Math.max(5, rounded);
}

/** 'empty' | 'below' | 'in' | 'over'. Based on the displayed (rounded) percentage. */
export function rangeStatus(displayPct, floorPct = FLOOR_DEFAULT) {
  if (displayPct <= 0) return 'empty';
  if (displayPct > 100) return 'over';
  if (displayPct >= floorPct) return 'in';
  return 'below';
}

export function roughKcal(k) {
  return Math.round(k / 10) * 10;
}

export function formatKcal(k) {
  return `~${roughKcal(k)} kcal`;
}

export const KIND_OVER_LINES = [
  "That's okay. Tomorrow is a fresh day.",
  "Some days need more food. That's normal.",
  "Bodies don't count in single days. You're fine.",
  'One day over is just one day. Be kind to yourself.',
];

/** Picks a kind line that stays the same all day instead of changing on every render. */
export function kindOverLine(key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return KIND_OVER_LINES[h % KIND_OVER_LINES.length];
}

/** Friendly label for a day key relative to today. */
export function dayLabel(key, todayKey) {
  if (key === todayKey) return 'Today';
  if (key === shiftDay(todayKey, -1)) return 'Yesterday';
  return dayKeyToDate(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function shortDayName(key) {
  return dayKeyToDate(key).toLocaleDateString('en-GB', { weekday: 'short' });
}

export function timeLabel(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
