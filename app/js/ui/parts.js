// Pieces shared by several screens.

import { h, icon } from './dom.js';
import { PORTIONS, portionKcal, roughKcal, formatKcal, portionLabel, timeLabel } from '../calc.js';

/** Small / Normal / Large, with Half and Double behind "More sizes". */
export function portionPicker(baseKcal, selected, onChange) {
  const main = PORTIONS.filter((p) => !p.more);
  const more = PORTIONS.filter((p) => p.more);
  let showMore = more.some((p) => p.id === selected);

  const btn = (p) => h('button', {
    type: 'button',
    'aria-pressed': String(p.id === selected),
    onclick: () => onChange(p.id),
  }, p.label, h('small', {}, `~${roughKcal(portionKcal(baseKcal, p.id))}`));

  const wrap = h('div', { class: 'field' });
  const moreWrap = h('div', { class: 'seg seg-2', hidden: !showMore }, more.map(btn));
  const toggle = h('button', {
    type: 'button', class: 'btn btn-quiet', 'aria-expanded': String(showMore),
    onclick: () => {
      showMore = !showMore;
      moreWrap.hidden = !showMore;
      toggle.setAttribute('aria-expanded', String(showMore));
      toggle.textContent = showMore ? 'Fewer sizes' : 'More sizes (half, double)';
    },
  }, showMore ? 'Fewer sizes' : 'More sizes (half, double)');
  wrap.append(h('div', { class: 'seg', role: 'group', 'aria-label': 'Portion size' }, main.map(btn)), moreWrap, toggle);
  return wrap;
}

export function entryRow(entry, onOpen) {
  const portion = entry.portion === 'normal' ? 'Normal' : portionLabel(entry.portion);
  return h('li', {},
    h('button', { class: 'row', type: 'button', onclick: () => onOpen(entry.id) },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, entry.name),
        h('div', { class: 'row-sub' }, `${portion} · ${formatKcal(entry.kcal)}`),
      ),
      h('div', { class: 'row-end' }, timeLabel(entry.t), icon('chevron')),
    ),
  );
}

export function foodRow(food, { favourite = false, onPick }) {
  return h('li', {},
    h('button', { class: 'row', type: 'button', onclick: () => onPick(food) },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, food.name, food.cat === 'custom' && h('span', { class: 'tag' }, 'yours')),
      ),
      h('div', { class: 'row-end' },
        favourite && h('span', { class: 'visually-hidden' }, 'Favourite'),
        favourite && h('span', { style: null }, icon('star', { filled: true })),
        `~${roughKcal(food.kcal)}`,
      ),
    ),
  );
}

/**
 * "How much?" panel for a chosen food, with the Add button.
 * Used by the Log food sheet and the photo guess sheet.
 */
export function pickPanel({ food, ctx, day, via = 'search', onAdded, onBack, backLabel = 'Choose something else' }) {
  const { actions } = ctx;
  let portion = actions.lastPortion(food.id);
  const wrap = h('div', { class: 'pick' });
  const canFav = !food.id.startsWith('q-');

  function render() {
    const fav = canFav && actions.isFavourite(food.id);
    wrap.replaceChildren(
      onBack && h('button', { class: 'back-link', type: 'button', onclick: onBack }, icon('back'), backLabel),
      h('div', { class: 'picked' },
        h('h3', {}, food.name),
        canFav && h('button', {
          class: 'icon-btn', type: 'button', 'aria-pressed': String(fav),
          'aria-label': fav ? 'Remove from favourites' : 'Add to favourites',
          onclick: () => {
            actions.toggleFavourite(food.id);
            render();
          },
        }, icon('star', { filled: fav })),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'label' }, 'How much?'),
        portionPicker(food.kcal, portion, (p) => {
          portion = p;
          render();
        }),
      ),
      h('p', { class: 'picked-kcal' }, formatKcal(portionKcal(food.kcal, portion))),
      h('button', {
        class: 'btn btn-primary btn-block btn-big', type: 'button',
        onclick: () => {
          const entry = actions.log(food, portion, { via, day });
          onAdded(entry);
        },
      }, icon('plus'), 'Add'),
    );
  }
  render();
  return wrap;
}
