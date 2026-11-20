// Keeps all of Ish's data in one JSON document in localStorage.
// Nothing here talks to the network. Storage is passed in so this can be tested in Node.

import {
  PRESETS, CUSTOM_MIN, CUSTOM_MAX, FLOOR_MIN, FLOOR_MAX, FLOOR_DEFAULT,
  DAY_START_DEFAULT, DAY_START_MAX, isPortion, clampTarget,
} from './calc.js';

export const KEY = 'ish.v1';
export const BEFORE_IMPORT_KEY = 'ish.v1.before-import';
export const SCHEMA_VERSION = 1;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const VIA = new Set(['search', 'quick', 'recent', 'photo', 'custom']);

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function defaultData(now = Date.now()) {
  return {
    version: SCHEMA_VERSION,
    settings: {
      targetPreset: 'average',
      targetKcal: 2000,
      floorPct: FLOOR_DEFAULT,
      dayStartHour: DAY_START_DEFAULT,
    },
    entries: [],
    customFoods: [],
    favourites: [],
    meta: {
      created: now,
      lastExport: null,
      installHintDismissed: false,
      backupNagSnoozedUntil: 0,
    },
  };
}

function cleanString(s, max = 80) {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const t = Number(e.t);
  const kcal = Number(e.kcal);
  const name = cleanString(e.name);
  if (!Number.isFinite(t) || !DAY_RE.test(String(e.day)) || !name) return null;
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 20000) return null;
  return {
    id: typeof e.id === 'string' && e.id ? e.id.slice(0, 64) : uid(),
    t,
    day: String(e.day),
    foodId: typeof e.foodId === 'string' ? e.foodId.slice(0, 64) : null,
    name,
    portion: isPortion(e.portion) ? e.portion : 'normal',
    kcal: Math.round(kcal),
    via: VIA.has(e.via) ? e.via : 'search',
  };
}

export function cleanCustomFood(f) {
  if (!f || typeof f !== 'object') return null;
  const name = cleanString(f.name, 60);
  const kcal = Number(f.kcal);
  if (!name || !Number.isFinite(kcal) || kcal < 1 || kcal > 5000) return null;
  return {
    id: typeof f.id === 'string' && f.id.startsWith('c-') ? f.id.slice(0, 64) : 'c-' + uid(),
    name,
    kcal: Math.round(kcal),
  };
}

/**
 * Take anything that looks roughly like Ish data and return a fully valid document.
 * Unknown or broken bits are dropped rather than crashing the app.
 */
export function normaliseData(raw, now = Date.now()) {
  const base = defaultData(now);
  if (!raw || typeof raw !== 'object') return base;
  const data = migrate(raw);

  const s = data.settings || {};
  const presetIds = PRESETS.map((p) => p.id);
  base.settings.targetPreset = presetIds.includes(s.targetPreset) || s.targetPreset === 'custom' ? s.targetPreset : 'average';
  base.settings.targetKcal = clampTarget(s.targetKcal ?? 2000).value;
  base.settings.floorPct = Math.round(clampInt(s.floorPct, FLOOR_MIN, FLOOR_MAX, FLOOR_DEFAULT) / 5) * 5;
  base.settings.dayStartHour = clampInt(s.dayStartHour, 0, DAY_START_MAX, DAY_START_DEFAULT);

  const seen = new Set();
  base.entries = (Array.isArray(data.entries) ? data.entries : [])
    .map(cleanEntry)
    .filter((e) => e && !seen.has(e.id) && seen.add(e.id))
    .sort((a, b) => a.t - b.t);

  const seenFoods = new Set();
  base.customFoods = (Array.isArray(data.customFoods) ? data.customFoods : [])
    .map(cleanCustomFood)
    .filter((f) => f && !seenFoods.has(f.id) && seenFoods.add(f.id));

  base.favourites = [...new Set((Array.isArray(data.favourites) ? data.favourites : [])
    .filter((id) => typeof id === 'string' && id))].slice(0, 100);

  const m = data.meta || {};
  base.meta.created = Number.isFinite(Number(m.created)) && m.created ? Number(m.created) : now;
  base.meta.lastExport = Number.isFinite(Number(m.lastExport)) && m.lastExport ? Number(m.lastExport) : null;
  base.meta.installHintDismissed = Boolean(m.installHintDismissed);
  base.meta.backupNagSnoozedUntil = Number(m.backupNagSnoozedUntil) || 0;
  return base;
}

/** Upgrade older document versions. Version 1 is the first, so this only fills the version in. */
export function migrate(raw) {
  const data = { ...raw };
  if (!data.version) data.version = 1;
  // Future: if (data.version === 1) { ...; data.version = 2; }
  return data;
}

/**
 * Create the app's store around a Storage-like object (localStorage in the browser).
 * If saved data is corrupt it is kept aside under a separate key rather than thrown away.
 */
export function createStore(storage, { now = () => Date.now() } = {}) {
  let data;
  const listeners = new Set();

  function load() {
    let text = null;
    try {
      text = storage.getItem(KEY);
    } catch {
      text = null;
    }
    if (!text) return defaultData(now());
    try {
      return normaliseData(JSON.parse(text), now());
    } catch {
      try {
        storage.setItem(`${KEY}.corrupt-${now()}`, text);
      } catch { /* storage full or blocked: nothing more we can do */ }
      return defaultData(now());
    }
  }

  function save() {
    try {
      storage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  data = load();

  return {
    get data() {
      return data;
    },
    /** Change data with a function, save, and tell listeners. Returns whether the save worked. */
    update(fn) {
      fn(data);
      const ok = save();
      for (const l of listeners) l(data);
      return ok;
    },
    replace(next) {
      data = normaliseData(next, now());
      const ok = save();
      for (const l of listeners) l(data);
      return ok;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    keepCopyBeforeImport() {
      try {
        storage.setItem(BEFORE_IMPORT_KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
    hasCopyBeforeImport() {
      try {
        return Boolean(storage.getItem(BEFORE_IMPORT_KEY));
      } catch {
        return false;
      }
    },
    restoreCopyBeforeImport() {
      let text = null;
      try {
        text = storage.getItem(BEFORE_IMPORT_KEY);
      } catch { /* ignore */ }
      if (!text) return false;
      try {
        this.replace(JSON.parse(text));
        storage.removeItem(BEFORE_IMPORT_KEY);
        return true;
      } catch {
        return false;
      }
    },
    wipe() {
      try {
        storage.removeItem(KEY);
        storage.removeItem(BEFORE_IMPORT_KEY);
      } catch { /* ignore */ }
      data = defaultData(now());
      save();
      for (const l of listeners) l(data);
    },
  };
}

/** Rough size of the saved data in bytes, for showing in settings. */
export function dataSize(data) {
  return new Blob([JSON.stringify(data)]).size;
}

export { CUSTOM_MIN, CUSTOM_MAX };
