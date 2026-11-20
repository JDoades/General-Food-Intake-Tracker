// The home screen: the ring, quick ways to log, and today's list.

import { h, icon, fill } from './dom.js';
import { ringSvg } from './ring.js';
import { entryRow } from './parts.js';
import { QUICK } from '../foods.js';
import {
  targetFromSettings, entriesForDay, totalKcal, displayPercent, rangeStatus,
  kindOverLine, roughKcal, portionLabel,
} from '../calc.js';

const DAY = 86400000;

export function renderToday(root, ctx) {
  const { store, actions } = ctx;
  const d = store.data;
  const day = actions.todayKey();
  const target = targetFromSettings(d.settings);
  const entries = entriesForDay(d.entries, day);
  const pct = displayPercent(totalKcal(d.entries, day), target);
  const status = rangeStatus(pct, d.settings.floorPct);
  const usual = actions.usualFoods(8);

  fill(root, 
    ...banners(ctx),
    ringCard(pct, status, d.settings.floorPct, day),
    h('div', { class: 'actions-main' },
      h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => ctx.openAdd() }, icon('plus'), 'Log food'),
      h('button', {
        class: 'btn btn-big btn-photo', type: 'button', 'aria-label': 'Guess from a photo',
        onclick: () => ctx.openPhoto(),
      }, icon('camera')),
    ),
    h('h2', { class: 'section-title' }, 'Quick add'),
    h('div', { class: 'chips' },
      QUICK.map((q) => h('button', {
        class: 'chip', type: 'button',
        onclick: () => ctx.afterLog(actions.log(q, 'normal', { via: 'quick' })),
      }, h('span', {}, q.name), h('span', { class: 'chip-sub' }, `~${roughKcal(q.kcal)}`))),
    ),
    usual.length > 0 && h('h2', { class: 'section-title' }, 'Your usual'),
    usual.length > 0 && h('div', { class: 'chips' },
      usual.map(({ food, favourite }) => {
        const portion = actions.lastPortion(food.id);
        return h('button', {
          class: 'chip', type: 'button',
          'aria-label': `Add ${food.name}${portion !== 'normal' ? `, ${portionLabel(portion).toLowerCase()}` : ''}`,
          onclick: () => ctx.afterLog(actions.log(food, portion, { via: 'recent' })),
        }, favourite && icon('star', { filled: true }), h('span', {}, food.name));
      }),
    ),
    h('h2', { class: 'section-title' }, 'Today'),
    entries.length
      ? h('ul', { class: 'list' }, entries.map((e) => entryRow(e, ctx.openEntry)))
      : h('p', { class: 'empty' }, "Nothing yet. Log something whenever you're ready."),
  );
}

function ringCard(pct, status, floorPct, day) {
  const label = status === 'empty' ? "Nothing logged yet today" : `About ${pct}% of today's food`;
  return h('section', { class: 'card ring-card', 'aria-label': 'Today so far' },
    h('div', { class: 'ring-wrap' },
      ringSvg({ pct, floorPct, label }),
      h('div', { class: 'ring-center', 'aria-hidden': 'true' },
        h('div', { class: 'ring-pct' }, String(pct), h('small', {}, '%')),
        h('div', { class: 'ring-sub' }, status === 'empty' ? 'Nothing logged yet' : "of today's food"),
      ),
    ),
    status === 'over' && h('p', { class: 'over-note' }, kindOverLine(day)),
    h('div', { class: 'ring-legend' }, h('i'), `Good range starts at ${floorPct}%`),
  );
}

function banners(ctx) {
  const out = [];
  const { store, actions, install } = ctx;
  const meta = store.data.meta;

  if (!ctx.storageOk) {
    out.push(h('div', { class: 'banner', role: 'note' },
      h('p', {}, h('strong', { class: 'banner-title' }, "Saving isn't working"),
        'This browser is blocking storage (often private browsing). Anything you log will be lost when you close it.'),
    ));
  }

  if (!install.standalone && !meta.installHintDismissed) {
    const dismiss = () => actions.setMeta({ installHintDismissed: true });
    if (install.ios) {
      out.push(h('div', { class: 'banner', role: 'note' },
        h('p', {}, h('strong', { class: 'banner-title' }, 'Install Ish first'),
          'On iPhone, Safari and the home screen app keep separate data. Install it now and use Ish from your home screen.'),
        h('ol', { class: 'banner-steps' },
          h('li', {}, 'Tap Share ', icon('share'), ' in Safari'),
          h('li', {}, 'Choose ', h('strong', {}, 'Add to Home Screen')),
          h('li', {}, 'Open Ish from your home screen'),
        ),
        h('p', { class: 'small' }, 'Already logged things here? Back up in Settings, then restore in the installed app.'),
        h('button', { class: 'btn', type: 'button', onclick: dismiss }, 'Got it'),
      ));
    } else if (install.deferredPrompt) {
      out.push(h('div', { class: 'banner', role: 'note' },
        h('p', {}, h('strong', { class: 'banner-title' }, 'Install Ish'), 'Add it to your home screen so it opens like an app and works offline.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.promptInstall() }, 'Install'),
          h('button', { class: 'btn', type: 'button', onclick: dismiss }, 'Not now'),
        ),
      ));
    } else {
      out.push(h('div', { class: 'banner', role: 'note' },
        h('p', {}, h('strong', { class: 'banner-title' }, 'Add Ish to your home screen'),
          'Open your browser menu and choose Install app or Add to Home screen. It then works offline like an app.'),
        h('button', { class: 'btn', type: 'button', onclick: dismiss }, 'Got it'),
      ));
    }
  }

  // Gentle backup reminder once there's at least a week of data
  const days = new Set(store.data.entries.map((e) => e.day)).size;
  const now = ctx.now();
  const stale = !meta.lastExport || now - meta.lastExport > 30 * DAY;
  if (days >= 7 && stale && now > (meta.backupNagSnoozedUntil || 0)) {
    out.push(h('div', { class: 'banner', role: 'note' },
      h('p', {}, h('strong', { class: 'banner-title' }, 'Time for a backup?'),
        'Your data lives only on this phone. If Ish gets deleted, the data goes with it.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.backupNow() }, 'Back up'),
        h('button', {
          class: 'btn', type: 'button',
          onclick: () => actions.setMeta({ backupNagSnoozedUntil: now + 7 * DAY }),
        }, 'Later'),
      ),
    ));
  }
  return out;
}
