// The Log food sheet: search, browse by category, pick a portion, or add your own dish.

import { h, icon, openSheet } from './dom.js';
import { foodRow, pickPanel } from './parts.js';
import { FOODS, QUICK, CATEGORIES, categoryLabel } from '../foods.js';
import { searchFoods, prepareFoods } from '../search.js';
import { dayLabel, roughKcal } from '../calc.js';

const PREPARED_BUILTIN = prepareFoods([...FOODS, ...QUICK]);

function customAsFoods(store) {
  return store.data.customFoods.map((f) => ({ ...f, cat: 'custom', aliases: [] }));
}

function searchBoost(ctx) {
  const boost = {};
  // Your own dishes come first when they match, then favourites and recent ones get a nudge
  for (const f of ctx.store.data.customFoods) boost[f.id] = 30;
  for (const id of ctx.store.data.favourites) boost[id] = (boost[id] || 0) + 8;
  const since = ctx.now() - 14 * 86400000;
  const counted = new Set();
  for (const e of ctx.store.data.entries) {
    if (e.t >= since && e.foodId) boost[e.foodId] = (boost[e.foodId] || 0) + (counted.has(e.foodId) ? 0 : 1);
    counted.add(e.foodId);
  }
  return boost;
}

export function openAddSheet(ctx, { day } = {}) {
  const { store, actions } = ctx;
  const today = actions.todayKey();
  const forDay = day && day !== today ? day : undefined;
  const title = forDay ? `Log food for ${dayLabel(forDay, today).toLowerCase()}` : 'Log food';
  const sheet = openSheet({ title, full: true });

  let mode = 'browse'; // browse | category | results | pick | custom
  let category = null;
  let picked = null;
  let prepared = [...prepareFoods(customAsFoods(store)), ...PREPARED_BUILTIN];
  const boost = searchBoost(ctx);

  const input = h('input', {
    type: 'search', placeholder: 'What did you have?', autocomplete: 'off', autocapitalize: 'off',
    spellcheck: 'false', enterkeyhint: 'search', 'aria-label': 'Search foods', autofocus: true,
    oninput: () => {
      mode = input.value.trim() ? 'results' : (category ? 'category' : 'browse');
      render();
    },
  });
  const searchBar = h('div', { class: 'search-bar' },
    h('div', { class: 'search-field' }, icon('search'), input),
    h('button', {
      class: 'btn', type: 'button', 'aria-label': 'Guess from a photo',
      onclick: () => {
        sheet.close();
        ctx.openPhoto({ day: forDay });
      },
    }, icon('camera')),
  );
  const content = h('div', { class: 'add-content' });
  sheet.setContent(searchBar, content);
  // Some browsers ignore autofocus inside dialogs
  setTimeout(() => input.focus(), 50);

  const favs = () => new Set(store.data.favourites);
  const listOf = (foods) => {
    const f = favs();
    return h('ul', { class: 'list' }, foods.map((food) => foodRow(food, { favourite: f.has(food.id), onPick: choose })));
  };

  function choose(food) {
    picked = food;
    mode = 'pick';
    render();
  }

  function added(entry) {
    sheet.close();
    ctx.afterLog(entry);
  }

  function render() {
    searchBar.hidden = mode === 'pick' || mode === 'custom';
    if (mode === 'pick') {
      content.replaceChildren(pickPanel({
        food: picked, ctx, day: forDay, via: 'search', onAdded: added,
        onBack: () => {
          mode = input.value.trim() ? 'results' : (category ? 'category' : 'browse');
          render();
        },
      }));
      sheet.body.scrollTop = 0;
      return;
    }
    if (mode === 'custom') {
      content.replaceChildren(customDishForm(ctx, {
        name: input.value.trim(),
        onSaved: (food) => {
          prepared = [...prepareFoods(customAsFoods(store)), ...PREPARED_BUILTIN];
          choose(food);
        },
        onBack: () => {
          mode = input.value.trim() ? 'results' : 'browse';
          render();
        },
      }));
      sheet.body.scrollTop = 0;
      return;
    }
    if (mode === 'results') {
      const q = input.value.trim();
      const results = searchFoods(prepared, q, { limit: 40, boost });
      content.replaceChildren(
        results.length ? listOf(results) : h('p', { class: 'empty' }, `Nothing called "${q}" yet.`),
        h('button', {
          class: 'btn btn-soft btn-block', type: 'button',
          onclick: () => {
            mode = 'custom';
            render();
          },
        }, icon('plus'), `Add "${q}" as your own dish`),
      );
      return;
    }
    if (mode === 'category') {
      const foods = category === 'quick' ? QUICK
        : category === 'custom' ? customAsFoods(store)
          : FOODS.filter((f) => f.cat === category);
      content.replaceChildren(
        h('button', {
          class: 'back-link', type: 'button',
          onclick: () => {
            category = null;
            mode = 'browse';
            render();
          },
        }, icon('back'), 'All foods'),
        h('h3', { class: 'section-title' }, categoryLabel(category)),
        listOf(foods),
      );
      return;
    }
    // Browse
    const custom = customAsFoods(store);
    const cats = [
      { id: 'quick', label: 'Quick sizes' },
      ...(custom.length ? [{ id: 'custom', label: 'Your dishes' }] : []),
      ...CATEGORIES,
    ];
    content.replaceChildren(
      h('h3', { class: 'section-title' }, 'Browse'),
      h('ul', { class: 'list' }, cats.map((c) => h('li', {},
        h('button', {
          class: 'row', type: 'button',
          onclick: () => {
            category = c.id;
            mode = 'category';
            render();
          },
        }, h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, c.label)), h('div', { class: 'row-end' }, icon('chevron'))),
      ))),
      h('button', {
        class: 'btn btn-soft btn-block', type: 'button',
        onclick: () => {
          mode = 'custom';
          render();
        },
      }, icon('plus'), 'Add your own dish'),
    );
  }

  render();
  return sheet;
}

/**
 * Form for adding your own dish: a name, plus a rough size or a rough kcal number.
 * Calls onSaved(food) with the new dish.
 */
export function customDishForm(ctx, { name = '', onSaved, onBack, saveLabel = 'Save and choose portion' }) {
  let size = null;
  let knowKcal = false;
  const wrap = h('form', {
    class: 'settings-group',
    onsubmit: (e) => {
      e.preventDefault();
      save();
    },
  });
  const nameInput = h('input', {
    type: 'text', value: name, maxlength: '60', placeholder: "e.g. Mum's lasagne", 'aria-label': 'Dish name',
    autocapitalize: 'sentences', oninput: update,
  });
  const kcalInput = h('input', {
    type: 'number', inputmode: 'numeric', min: '1', max: '5000', step: '10', placeholder: 'e.g. 600',
    'aria-label': 'Rough kcal for a normal portion', oninput: update,
  });
  const saveBtn = h('button', { class: 'btn btn-primary btn-block btn-big', type: 'submit' }, saveLabel);
  const sizeSeg = h('div', { class: 'seg seg-2', role: 'group', 'aria-label': 'Usual size' });
  const kcalField = h('div', { class: 'field' }, h('label', {}, 'Rough kcal for a normal portion'), kcalInput);

  function kcalValue() {
    if (knowKcal) {
      const n = Math.round(Number(kcalInput.value));
      return Number.isFinite(n) && n >= 1 && n <= 5000 ? n : null;
    }
    return size ? size.kcal : null;
  }

  function update() {
    saveBtn.disabled = !(nameInput.value.trim() && kcalValue());
  }

  function renderSizes() {
    sizeSeg.replaceChildren(...QUICK.map((q) => h('button', {
      type: 'button', 'aria-pressed': String(size?.id === q.id),
      onclick: () => {
        size = q;
        renderSizes();
        update();
      },
    }, q.name, h('small', {}, `~${roughKcal(q.kcal)}`))));
  }

  const toggle = h('button', {
    type: 'button', class: 'btn btn-quiet',
    onclick: () => {
      knowKcal = !knowKcal;
      sizeSeg.hidden = knowKcal;
      kcalField.hidden = !knowKcal;
      toggle.textContent = knowKcal ? 'Pick a size instead' : 'I know roughly how many kcal';
      if (knowKcal) kcalInput.focus();
      update();
    },
  }, 'I know roughly how many kcal');
  kcalField.hidden = true;

  function save() {
    const kcal = kcalValue();
    const n = nameInput.value.trim();
    if (!n || !kcal) return;
    const food = ctx.actions.addCustomFood({ name: n, kcal });
    onSaved(food);
  }

  renderSizes();
  wrap.append(
    onBack && h('button', { class: 'back-link', type: 'button', onclick: onBack }, icon('back'), 'Back'),
    h('div', { class: 'field' }, h('label', {}, 'Name'), nameInput),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'How big is it usually?'), sizeSeg, kcalField, toggle),
    h('p', { class: 'hint' }, 'It will show up in search next time.'),
    saveBtn,
  );
  update();
  return wrap;
}
