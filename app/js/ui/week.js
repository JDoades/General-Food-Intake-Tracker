// The last 7 days as small rings. Tap a day to see or change what was logged.

import { h, icon, fill } from './dom.js';
import { ringSvg } from './ring.js';
import { entryRow } from './parts.js';
import {
  lastNDays, targetFromSettings, totalKcal, displayPercent, entriesForDay,
  shortDayName, dayLabel,
} from '../calc.js';

export function renderWeek(root, ctx) {
  const { store, actions } = ctx;
  const d = store.data;
  const today = actions.todayKey();
  const days = lastNDays(today, 7);
  if (!days.includes(ctx.state.weekSelected)) ctx.state.weekSelected = today;
  const selected = ctx.state.weekSelected;
  const target = targetFromSettings(d.settings);
  const floor = d.settings.floorPct;

  const cells = days.map((key) => {
    const has = d.entries.some((e) => e.day === key);
    const pct = displayPercent(totalKcal(d.entries, key), target);
    const name = key === today ? 'Today' : shortDayName(key);
    return h('button', {
      class: `day-cell${key === today ? ' is-today' : ''}`, type: 'button',
      'aria-pressed': String(key === selected),
      'aria-label': `${dayLabel(key, today)}: ${has ? `about ${pct}%` : 'nothing logged'}`,
      onclick: () => {
        ctx.state.weekSelected = key;
        ctx.render();
      },
    },
    h('span', { class: 'day-name' }, key === today ? 'Now' : name.slice(0, 3)),
    ringSvg({ pct: has ? pct : 0, floorPct: floor, none: !has, showTick: false }),
    h('span', { class: `day-pct${has ? '' : ' none'}` }, has ? `${pct}%` : 'none'));
  });

  const entries = entriesForDay(d.entries, selected);
  const selPct = displayPercent(totalKcal(d.entries, selected), target);

  fill(root, 
    h('h1', { class: 'page-title' }, 'This week'),
    h('p', { class: 'lead' }, 'Roughly how full each day was. Tap a day to see it.'),
    h('div', { class: 'card week-grid' }, cells),
    h('div', { class: 'day-summary' },
      h('h2', {}, dayLabel(selected, today)),
      entries.length > 0 && h('span', { class: 'pill' }, `${selPct}%`),
    ),
    entries.length
      ? h('ul', { class: 'list' }, entries.map((e) => entryRow(e, ctx.openEntry)))
      : h('p', { class: 'empty' }, 'Nothing logged for this day.'),
    h('button', {
      class: 'btn btn-soft btn-block', type: 'button',
      onclick: () => ctx.openAdd({ day: selected }),
    }, icon('plus'), selected === today ? 'Log food' : 'Log something for this day'),
  );
}
