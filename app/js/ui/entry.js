// Edit one logged entry: change portion, move day, favourite or remove.

import { h, icon, openSheet, toast } from './dom.js';
import { portionPicker } from './parts.js';
import { dayLabel, timeLabel, formatKcal } from '../calc.js';

export function openEntrySheet(ctx, entryId) {
  const { store, actions } = ctx;
  const find = () => store.data.entries.find((e) => e.id === entryId);
  const first = find();
  if (!first) return;
  const sheet = openSheet({ title: first.name });

  function render() {
    const e = find();
    if (!e) {
      sheet.close();
      return;
    }
    const today = actions.todayKey();
    const food = actions.findFood(e.foodId);
    const canFav = food && !food.id.startsWith('q-');
    const fav = canFav && actions.isFavourite(food.id);
    sheet.setContent(
      h('p', { class: 'muted' }, `${dayLabel(e.day, today)}, logged at ${timeLabel(e.t)}`),
      h('div', { class: 'field' },
        h('span', { class: 'label' }, 'How much?'),
        portionPicker(actions.baseKcal(e), e.portion, (p) => {
          actions.setPortion(e.id, p);
          render();
        }),
      ),
      h('p', { class: 'picked-kcal' }, formatKcal(e.kcal)),
      h('div', { class: 'btn-stack' },
        canFav && h('button', {
          class: 'btn btn-block', type: 'button',
          onclick: () => {
            actions.toggleFavourite(food.id);
            render();
          },
        }, icon('star', { filled: fav }), fav ? 'Remove from favourites' : 'Add to favourites'),
        h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn', type: 'button',
            onclick: () => {
              actions.moveDay(e.id, -1);
              render();
            },
          }, icon('back'), 'Day before'),
          h('button', {
            class: 'btn', type: 'button', disabled: e.day >= today,
            onclick: () => {
              actions.moveDay(e.id, 1);
              render();
            },
          }, 'Day after', icon('chevron')),
        ),
        h('button', {
          class: 'btn btn-block', type: 'button',
          onclick: () => {
            const removed = actions.remove(e.id);
            sheet.close();
            if (removed) {
              toast(`Removed ${removed.name}`, { actionLabel: 'Undo', onAction: () => actions.restore(removed) });
            }
          },
        }, icon('trash'), 'Remove'),
        h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => sheet.close() }, 'Done'),
      ),
    );
  }
  render();
}
