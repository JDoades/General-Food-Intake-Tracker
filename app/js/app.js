// Ish: starts the app, switches screens and wires everything together.

import { createStore } from './store.js';
import { createActions } from './actions.js';
import { renderToday } from './ui/today.js';
import { renderWeek } from './ui/week.js';
import { renderSettings } from './ui/settings.js';
import { openAddSheet } from './ui/add.js';
import { openEntrySheet } from './ui/entry.js';
import { createPhoto, openPhotoFlow } from './photo.js';
import { h, icon, toast } from './ui/dom.js';
import { portionLabel, dayKeyToDate } from './calc.js';
import { saveBackupFile } from './backup.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function pickStorage() {
  try {
    const k = '__ish_check';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return { storage: localStorage, ok: true };
  } catch {
    return { storage: memoryStorage(), ok: false };
  }
}

const { storage, ok: storageOk } = pickStorage();
const store = createStore(storage);
const actions = createActions(store);
const photo = createPhoto();

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const ROUTES = {
  today: { label: 'Today', icon: 'today', render: renderToday },
  week: { label: 'Week', icon: 'week', render: renderWeek },
  settings: { label: 'Settings', icon: 'settings', render: renderSettings },
};

function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '');
  return ROUTES[r] ? r : 'today';
}

let persistAsked = false;
function askToPersist() {
  if (persistAsked || !navigator.storage?.persist) return;
  persistAsked = true;
  navigator.storage.persisted().then((p) => (p ? null : navigator.storage.persist())).catch(() => {});
}

const ctx = {
  store,
  actions,
  photo,
  storageOk,
  now: () => Date.now(),
  state: { weekSelected: null },
  install: { ios: isIOS, standalone, deferredPrompt: null },
  openAdd: (opts) => openAddSheet(ctx, opts),
  openEntry: (id) => openEntrySheet(ctx, id),
  openPhoto: (opts) => openPhotoFlow(ctx, opts),
  afterLog(entry) {
    const size = entry.portion === 'normal' ? '' : ` (${portionLabel(entry.portion).toLowerCase()})`;
    toast(`Added ${entry.name}${size}`, { actionLabel: 'Undo', onAction: () => actions.remove(entry.id) });
    askToPersist();
  },
  async backupNow() {
    const result = await saveBackupFile(store.data);
    if (result !== 'cancelled') {
      actions.setMeta({ lastExport: Date.now() });
      toast(result === 'shared' ? 'Backup saved' : 'Backup file downloaded');
    }
  },
  async promptInstall() {
    const p = ctx.install.deferredPrompt;
    if (!p) return;
    p.prompt();
    try {
      await p.userChoice;
    } catch { /* ignore */ }
    ctx.install.deferredPrompt = null;
    render();
  },
  render,
};

// ---------- Shell ----------

const viewEl = h('main', { class: 'view', id: 'view', tabindex: '-1' });
const dateEl = h('span', { class: 'topbar-date' });
const tabs = Object.entries(ROUTES).map(([id, r]) => h('a', { class: 'tab', href: `#/${id}`, dataset: { route: id } }, icon(r.icon), r.label));

document.getElementById('app').replaceChildren(
  h('header', { class: 'topbar' }, h('p', { class: 'wordmark' }, 'Ish'), dateEl),
  viewEl,
  h('nav', { class: 'tabbar', 'aria-label': 'Main' }, h('div', { class: 'tabbar-inner' }, tabs)),
);

let lastRoute = null;
let lastDay = null;

function render() {
  const route = currentRoute();
  const day = actions.todayKey();
  dateEl.textContent = dayKeyToDate(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  for (const t of tabs) {
    if (t.dataset.route === route) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  ROUTES[route].render(viewEl, ctx);
  if (route !== lastRoute) {
    window.scrollTo(0, 0);
    document.title = route === 'today' ? 'Ish' : `${ROUTES[route].label} · Ish`;
  }
  lastRoute = route;
  lastDay = day;
}

store.subscribe(() => render());
window.addEventListener('hashchange', render);

// A new day can start while the app is open (default 4am)
function checkDay() {
  if (actions.todayKey() !== lastDay) render();
}
setInterval(checkDay, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkDay();
});

// If another tab changes the data, pick it up
window.addEventListener('storage', (e) => {
  if (e.key === 'ish.v1') location.reload();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  ctx.install.deferredPrompt = e;
  render();
});
window.addEventListener('appinstalled', () => {
  ctx.install.deferredPrompt = null;
  ctx.install.standalone = true;
  render();
});

render();
if (standalone) askToPersist();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
