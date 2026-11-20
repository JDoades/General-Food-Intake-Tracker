// Everything that changes data goes through here, so the screens stay simple.

import { uid } from './store.js';
import { dayKey, portionKcal, PORTIONS, shiftDay } from './calc.js';
import { foodById } from './foods.js';

const RECENT_DAYS = 14;

export function createActions(store, { now = () => Date.now() } = {}) {
  const data = () => store.data;

  function todayKey() {
    return dayKey(now(), data().settings.dayStartHour);
  }

  function findFood(id) {
    if (!id) return null;
    return foodById(id) || data().customFoods.find((f) => f.id === id) || null;
  }

  /** Log a food. `day` defaults to today (using the day start hour). */
  function log(food, portion = 'normal', { via = 'search', day } = {}) {
    const entry = {
      id: uid(),
      t: now(),
      day: day || todayKey(),
      foodId: food.id,
      name: food.name,
      portion,
      kcal: portionKcal(food.kcal, portion),
      via,
    };
    store.update((d) => {
      d.entries.push(entry);
    });
    return entry;
  }

  function remove(id) {
    let removed = null;
    store.update((d) => {
      const i = d.entries.findIndex((e) => e.id === id);
      if (i >= 0) removed = d.entries.splice(i, 1)[0];
    });
    return removed;
  }

  function restore(entry) {
    store.update((d) => {
      if (!d.entries.some((e) => e.id === entry.id)) d.entries.push(entry);
      d.entries.sort((a, b) => a.t - b.t);
    });
  }

  /** The normal-portion kcal behind an entry, worked out from the entry itself so history never shifts. */
  function baseKcal(entry) {
    const mult = PORTIONS.find((p) => p.id === entry.portion)?.mult || 1;
    return Math.round(entry.kcal / mult);
  }

  function setPortion(id, portion) {
    store.update((d) => {
      const e = d.entries.find((x) => x.id === id);
      if (!e) return;
      const base = baseKcal(e);
      e.portion = portion;
      e.kcal = portionKcal(base, portion);
    });
  }

  function moveDay(id, delta) {
    store.update((d) => {
      const e = d.entries.find((x) => x.id === id);
      if (!e) return;
      const next = shiftDay(e.day, delta);
      if (next > todayKey()) return; // Can't move into the future
      e.day = next;
    });
  }

  function isFavourite(foodId) {
    return data().favourites.includes(foodId);
  }

  function toggleFavourite(foodId) {
    let nowFav = false;
    store.update((d) => {
      const i = d.favourites.indexOf(foodId);
      if (i >= 0) d.favourites.splice(i, 1);
      else {
        d.favourites.push(foodId);
        nowFav = true;
      }
    });
    return nowFav;
  }

  function addCustomFood({ name, kcal }) {
    const food = { id: 'c-' + uid(), name: String(name).trim().slice(0, 60), kcal: Math.round(kcal), cat: 'custom' };
    store.update((d) => {
      d.customFoods.push({ id: food.id, name: food.name, kcal: food.kcal });
    });
    return food;
  }

  function updateCustomFood(id, { name, kcal }) {
    store.update((d) => {
      const f = d.customFoods.find((x) => x.id === id);
      if (!f) return;
      if (name != null) f.name = String(name).trim().slice(0, 60) || f.name;
      if (kcal != null && Number.isFinite(Number(kcal))) f.kcal = Math.min(5000, Math.max(1, Math.round(kcal)));
    });
  }

  function deleteCustomFood(id) {
    store.update((d) => {
      d.customFoods = d.customFoods.filter((f) => f.id !== id);
      d.favourites = d.favourites.filter((f) => f !== id);
    });
  }

  /** The portion last used for a food, so one-tap logging repeats what you usually have. */
  function lastPortion(foodId) {
    const es = data().entries;
    for (let i = es.length - 1; i >= 0; i--) if (es[i].foodId === foodId) return es[i].portion;
    return 'normal';
  }

  /** Favourites first, then what you've had most in the last couple of weeks. */
  function usualFoods(limit = 8) {
    const out = [];
    const seen = new Set();
    for (const id of data().favourites) {
      const f = findFood(id);
      if (f && !seen.has(id)) {
        out.push({ food: f, favourite: true });
        seen.add(id);
      }
    }
    const since = now() - RECENT_DAYS * 86400000;
    const counts = new Map();
    const lastUsed = new Map();
    for (const e of data().entries) {
      if (e.t < since || !e.foodId || e.foodId.startsWith('q-')) continue;
      counts.set(e.foodId, (counts.get(e.foodId) || 0) + 1);
      lastUsed.set(e.foodId, e.t);
    }
    const recent = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || lastUsed.get(b) - lastUsed.get(a));
    for (const id of recent) {
      if (out.length >= limit) break;
      if (seen.has(id)) continue;
      const f = findFood(id);
      if (f) {
        out.push({ food: f, favourite: false });
        seen.add(id);
      }
    }
    return out.slice(0, limit);
  }

  function setSettings(patch) {
    store.update((d) => {
      Object.assign(d.settings, patch);
    });
  }

  function setMeta(patch) {
    store.update((d) => {
      Object.assign(d.meta, patch);
    });
  }

  return {
    todayKey, findFood, log, remove, restore, baseKcal, setPortion, moveDay,
    isFavourite, toggleFavourite, addCustomFood, updateCustomFood, deleteCustomFood,
    lastPortion, usualFoods, setSettings, setMeta,
  };
}
