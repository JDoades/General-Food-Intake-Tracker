// Settings: daily amount, good range, day start, your dishes, photo model, data and about.

import { h, icon, fill, openSheet, toast, confirmSheet, formatBytes, timeAgo } from './dom.js';
import { customDishForm } from './add.js';
import {
  PRESETS, CUSTOM_MIN, CUSTOM_MAX, FLOOR_MIN, FLOOR_MAX, DAY_START_MAX, clampTarget, roughKcal,
} from '../calc.js';
import { dataSize } from '../store.js';
import { toCode, parseBackup, summarise, mergeData, replaceData, saveBackupFile, copyText, BackupError } from '../backup.js';

export const APP_VERSION = '1.0.0';

function hourLabel(hr) {
  if (hr === 0) return 'Midnight';
  if (hr === 12) return 'Midday';
  return hr < 12 ? `${hr}am` : `${hr - 12}pm`;
}

function niceDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function renderSettings(root, ctx) {
  const { store, actions } = ctx;
  const d = store.data;
  const s = d.settings;

  // ----- Daily amount -----
  const customInput = h('input', {
    type: 'number', inputmode: 'numeric', min: String(CUSTOM_MIN), max: String(CUSTOM_MAX), step: '50',
    value: String(s.targetKcal), 'aria-label': 'Your own daily amount in kcal',
    onchange: () => {
      const { value, clamped } = clampTarget(customInput.value);
      customInput.value = String(value);
      actions.setSettings({ targetPreset: 'custom', targetKcal: value });
      if (clamped === 'low') {
        toast(`Ish keeps the daily amount at ${CUSTOM_MIN.toLocaleString('en-GB')} or more, so it can't be used to under-eat.`, { duration: 8000 });
      } else if (clamped === 'high') {
        toast(`The most Ish allows is ${CUSTOM_MAX.toLocaleString('en-GB')} a day.`);
      }
    },
  });
  const choices = [
    ...PRESETS.map((p) => ({ id: p.id, label: p.label, sub: `About ${p.kcal.toLocaleString('en-GB')} a day` })),
    { id: 'custom', label: 'My own number', sub: 'For example, one a dietitian gave you' },
  ];
  const dailyCard = h('section', { class: 'card settings-group', 'aria-labelledby': 'set-daily' },
    h('p', { class: 'hint' }, 'This is what 100% means. Pick the closest. No weighing or body measurements needed.'),
    h('div', { class: 'choice-list', role: 'radiogroup', 'aria-labelledby': 'set-daily' },
      choices.map((c) => h('label', { class: 'choice' },
        h('input', {
          type: 'radio', name: 'target', value: c.id, checked: s.targetPreset === c.id,
          onchange: () => {
            actions.setSettings({ targetPreset: c.id });
            if (c.id === 'custom') setTimeout(() => root.querySelector('input[type="number"]')?.focus(), 50);
          },
        }),
        h('div', { class: 'row-main' }, h('div', {}, c.label), h('div', { class: 'row-sub' }, c.sub)),
      )),
    ),
    s.targetPreset === 'custom' && h('div', { class: 'field' },
      h('label', {}, 'kcal a day'),
      customInput,
      h('p', { class: 'hint' }, `Between ${CUSTOM_MIN.toLocaleString('en-GB')} and ${CUSTOM_MAX.toLocaleString('en-GB')}.`),
    ),
  );

  // ----- Good range -----
  const floorOut = h('strong', {}, `${s.floorPct}%`);
  const floorInput = h('input', {
    type: 'range', min: String(FLOOR_MIN), max: String(FLOOR_MAX), step: '5', value: String(s.floorPct),
    'aria-label': 'Where your good range starts',
    oninput: () => {
      floorOut.textContent = `${floorInput.value}%`;
    },
    onchange: () => actions.setSettings({ floorPct: Number(floorInput.value) }),
  });
  const rangeCard = h('section', { class: 'card settings-group' },
    h('div', { class: 'kv' }, h('span', {}, 'Good range starts at'), floorOut),
    floorInput,
    h('p', { class: 'hint' }, 'The ring shows a mark here. Anywhere from the mark to 100% is a good amount for the day.'),
  );

  // ----- Day start -----
  const daySelect = h('select', {
    'aria-label': 'New day starts at',
    onchange: () => actions.setSettings({ dayStartHour: Number(daySelect.value) }),
  }, Array.from({ length: DAY_START_MAX + 1 }, (_, hr) => h('option', { value: String(hr), selected: hr === s.dayStartHour }, hourLabel(hr))));
  const dayCard = h('section', { class: 'card settings-group' },
    h('div', { class: 'field' }, h('label', {}, 'New day starts at'), daySelect),
    h('p', { class: 'hint' }, 'Food before this time counts toward the day before. Handy for late nights or shift work.'),
  );

  // ----- Your dishes -----
  const dishes = d.customFoods;
  const dishCard = h('section', { class: 'settings-group' },
    dishes.length
      ? h('ul', { class: 'list' }, dishes.map((f) => h('li', {},
        h('button', { class: 'row', type: 'button', onclick: () => editDish(ctx, f.id) },
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, f.name)),
          h('div', { class: 'row-end' }, `~${roughKcal(f.kcal)} kcal`, icon('chevron')),
        ))))
      : h('p', { class: 'empty' }, "You haven't added any dishes yet."),
    h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: () => newDish(ctx) }, icon('plus'), 'Add a dish'),
  );

  // ----- Favourites -----
  const favs = d.favourites.map((id) => actions.findFood(id)).filter(Boolean);
  const favCard = h('section', { class: 'settings-group' },
    favs.length
      ? h('ul', { class: 'list' }, favs.map((f) => h('li', {},
        h('div', { class: 'row' },
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, f.name)),
          h('button', {
            class: 'icon-btn', type: 'button', 'aria-pressed': 'true', 'aria-label': `Remove ${f.name} from favourites`,
            onclick: () => actions.toggleFavourite(f.id),
          }, icon('star', { filled: true })),
        ))))
      : h('p', { class: 'empty' }, 'Tap the star when logging something to keep it here and on the home screen.'),
  );

  // ----- Photo guessing -----
  const photoCard = h('section', { class: 'card settings-group' }, h('div', { class: 'spinner' }));
  ctx.photo.status().then((st) => {
    if (st === 'ready') {
      photoCard.replaceChildren(
        h('div', { class: 'kv' }, h('span', {}, 'Photo guessing'), h('span', {}, `Ready, works offline`)),
        h('p', { class: 'hint' }, `Uses about ${formatBytes(ctx.photo.totalBytes)} on this phone. Photos are never saved or sent anywhere.`),
        h('button', {
          class: 'btn btn-block', type: 'button',
          onclick: async () => {
            const ok = await confirmSheet({
              title: 'Remove photo guessing?',
              message: 'This frees up space. You can download it again any time.',
              confirmLabel: 'Remove',
            });
            if (!ok) return;
            await ctx.photo.remove();
            toast('Photo guessing removed');
            ctx.render();
          },
        }, icon('trash'), 'Remove'),
      );
    } else {
      photoCard.replaceChildren(
        h('div', { class: 'kv' }, h('span', {}, 'Photo guessing'), h('span', {}, 'Not downloaded')),
        h('p', { class: 'hint' }, `Take a photo of your food and Ish suggests what it might be. Needs a one-time download of about ${formatBytes(ctx.photo.totalBytes)}. Works offline after that.`),
        h('button', { class: 'btn btn-block', type: 'button', onclick: () => ctx.openPhoto({ downloadOnly: true }) }, icon('download'), 'Download'),
      );
    }
  });

  // ----- Data -----
  const persistLine = h('span', {}, 'Checking');
  if (navigator.storage?.persisted) {
    navigator.storage.persisted().then((p) => {
      persistLine.textContent = p ? 'Yes' : 'Not yet';
    }).catch(() => {
      persistLine.textContent = 'Unknown';
    });
  } else {
    persistLine.textContent = 'Unknown';
  }
  const fileInput = h('input', {
    type: 'file', accept: '.json,application/json,text/plain', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true',
    onchange: async () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (!f) return;
      startRestore(ctx, await f.text());
    },
  });
  const dataCard = h('section', { class: 'card settings-group' },
    h('p', { class: 'note' }, 'Everything stays on this phone. Nothing is sent anywhere. Back up now and then: if Ish is deleted, its data goes with it.'),
    h('div', { class: 'kv' }, h('span', {}, 'Last backup'), h('span', {}, timeAgo(d.meta.lastExport, ctx.now()))),
    h('div', { class: 'kv' }, h('span', {}, 'Stored'), h('span', {}, `${d.entries.length} entries, ${formatBytes(dataSize(d))}`)),
    h('div', { class: 'kv' }, h('span', {}, 'Protected from clean-up'), persistLine),
    h('div', { class: 'btn-stack' },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => ctx.backupNow() }, icon('download'), 'Save backup file'),
      h('button', {
        class: 'btn btn-block', type: 'button',
        onclick: async () => {
          const code = await toCode(store.data);
          const ok = await copyText(code);
          if (ok) {
            actions.setMeta({ lastExport: ctx.now() });
            toast('Backup code copied. Paste it somewhere safe, like Notes.');
          } else {
            showCode(code);
          }
        },
      }, icon('copy'), 'Copy backup code'),
      h('button', { class: 'btn btn-block', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Restore from a file'),
      h('button', { class: 'btn btn-block', type: 'button', onclick: () => pasteCode(ctx) }, icon('upload'), 'Restore from a code'),
      store.hasCopyBeforeImport() && h('button', {
        class: 'btn btn-block', type: 'button',
        onclick: async () => {
          const ok = await confirmSheet({
            title: 'Undo the last restore?',
            message: 'This puts your data back to how it was just before you last restored a backup.',
            confirmLabel: 'Undo restore',
          });
          if (ok && store.restoreCopyBeforeImport()) toast('Restore undone');
        },
      }, icon('undo'), 'Undo last restore'),
      h('button', { class: 'btn btn-quiet btn-block', type: 'button', onclick: () => deleteEverything(ctx) }, icon('trash'), 'Delete everything'),
    ),
    fileInput,
  );

  // ----- About -----
  const aboutCard = h('section', { class: 'card about' },
    h('h3', {}, 'Rough on purpose'),
    h('p', {}, 'Every number in Ish is a rough estimate. Portions, recipes and packs all vary. The aim is a general feel for your day, not precise counting.'),
    h('h3', {}, 'Private'),
    h('p', {}, 'No accounts, no tracking, no cookies. Your food log is stored only inside this app on this phone. The optional photo model downloads from the same place as the app, and photos never leave your phone.'),
    h('h3', {}, 'If food feels hard right now'),
    h('p', {}, "You don't have to deal with it alone. Beat is the UK's eating disorder charity:"),
    h('ul', { class: 'helplines' },
      h('li', {}, 'England: ', h('a', { href: 'tel:08088010677' }, '0808 801 0677')),
      h('li', {}, 'Scotland: ', h('a', { href: 'tel:08088010432' }, '0808 801 0432')),
      h('li', {}, 'Wales: ', h('a', { href: 'tel:08088010433' }, '0808 801 0433')),
      h('li', {}, 'Northern Ireland: ', h('a', { href: 'tel:08088010434' }, '0808 801 0434')),
    ),
    h('p', { class: 'small muted' }, 'Opening hours are on ', h('a', { href: 'https://www.beateatingdisorders.org.uk', target: '_blank', rel: 'noopener noreferrer' }, 'beateatingdisorders.org.uk'), '.'),
    h('p', {}, 'Samaritans, any time, day or night: ', h('a', { href: 'tel:116123' }, '116 123'), '.'),
    h('h3', {}, 'Licence'),
    h('p', { class: 'small' }, 'Ish is shared under the IDGAFPL. The photo model (MobileCLIP-S0, by Apple) and ONNX Runtime (by Microsoft, MIT licence) keep their own licences.'),
    h('p', { class: 'small muted' }, `Version ${APP_VERSION}`),
  );

  fill(root, 
    h('h1', { class: 'page-title' }, 'Settings'),
    h('h2', { class: 'section-title', id: 'set-daily' }, 'Daily amount'),
    dailyCard,
    h('h2', { class: 'section-title' }, 'Good range'),
    rangeCard,
    h('h2', { class: 'section-title' }, 'New day'),
    dayCard,
    h('h2', { class: 'section-title' }, 'Your dishes'),
    dishCard,
    h('h2', { class: 'section-title' }, 'Favourites'),
    favCard,
    h('h2', { class: 'section-title' }, 'Photo guessing'),
    photoCard,
    h('h2', { class: 'section-title' }, 'Your data'),
    dataCard,
    h('h2', { class: 'section-title' }, 'About Ish'),
    aboutCard,
  );
}

function newDish(ctx) {
  const sheet = openSheet({ title: 'Add a dish' });
  sheet.setContent(customDishForm(ctx, {
    saveLabel: 'Save dish',
    onSaved: (food) => {
      sheet.close();
      toast(`Saved ${food.name}`);
    },
  }));
}

function editDish(ctx, id) {
  const f = ctx.store.data.customFoods.find((x) => x.id === id);
  if (!f) return;
  const sheet = openSheet({ title: 'Edit dish' });
  const nameInput = h('input', { type: 'text', value: f.name, maxlength: '60', 'aria-label': 'Dish name' });
  const kcalInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '5000', step: '10', value: String(f.kcal), 'aria-label': 'Rough kcal' });
  sheet.setContent(
    h('form', {
      class: 'settings-group',
      onsubmit: (e) => {
        e.preventDefault();
        ctx.actions.updateCustomFood(id, { name: nameInput.value, kcal: Number(kcalInput.value) });
        sheet.close();
        toast('Saved');
      },
    },
    h('div', { class: 'field' }, h('label', {}, 'Name'), nameInput),
    h('div', { class: 'field' }, h('label', {}, 'Rough kcal for a normal portion'), kcalInput),
    h('p', { class: 'hint' }, "Changes apply to new entries. Things you've already logged stay as they were."),
    h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save'),
    h('button', {
      class: 'btn btn-block', type: 'button',
      onclick: async () => {
        const ok = await confirmSheet({ title: `Delete ${f.name}?`, message: "It won't show up in search any more. Past entries stay.", confirmLabel: 'Delete' });
        if (!ok) return;
        ctx.actions.deleteCustomFood(id);
        sheet.close();
        toast(`Deleted ${f.name}`);
      },
    }, icon('trash'), 'Delete dish')),
  );
}

function showCode(code) {
  const sheet = openSheet({ title: 'Your backup code' });
  const ta = h('textarea', { readonly: true, 'aria-label': 'Backup code' }, code);
  sheet.setContent(
    h('p', {}, "Copying didn't work automatically. Select all of this and copy it somewhere safe."),
    ta,
  );
  setTimeout(() => ta.select(), 50);
}

function pasteCode(ctx) {
  const sheet = openSheet({ title: 'Restore from a code' });
  const ta = h('textarea', { placeholder: 'Paste your backup code here (it starts with ISH)', 'aria-label': 'Backup code' });
  sheet.setContent(
    ta,
    h('button', {
      class: 'btn btn-primary btn-block', type: 'button',
      onclick: () => {
        sheet.close();
        startRestore(ctx, ta.value);
      },
    }, 'Continue'),
  );
  setTimeout(() => ta.focus(), 50);
}

async function startRestore(ctx, text) {
  let incoming;
  try {
    incoming = await parseBackup(text);
  } catch (err) {
    toast(err instanceof BackupError ? err.message : "That backup couldn't be read.", { duration: 7000 });
    return;
  }
  const sum = summarise(incoming);
  const range = sum.firstDay ? ` from ${niceDate(sum.firstDay)} to ${niceDate(sum.lastDay)}` : '';
  const sheet = openSheet({ title: 'Restore this backup?' });
  const apply = (how) => {
    const { store } = ctx;
    store.keepCopyBeforeImport();
    store.replace(how === 'merge' ? mergeData(store.data, incoming) : replaceData(store.data, incoming));
    sheet.close();
    toast('Backup restored', { actionLabel: 'Undo', onAction: () => store.restoreCopyBeforeImport() });
  };
  sheet.setContent(
    h('p', {}, `It has ${sum.entries} ${sum.entries === 1 ? 'entry' : 'entries'}${range}, and ${sum.customFoods} of your own ${sum.customFoods === 1 ? 'dish' : 'dishes'}.`),
    h('div', { class: 'btn-stack' },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => apply('merge') }, "Add to what's here"),
      h('button', { class: 'btn btn-block', type: 'button', onclick: () => apply('replace') }, "Replace what's here"),
      h('button', { class: 'btn btn-quiet btn-block', type: 'button', onclick: () => sheet.close() }, 'Cancel'),
    ),
    h('p', { class: 'hint' }, 'Adding keeps everything on this phone and adds anything new from the backup. Replacing swaps it all for the backup, including settings.'),
  );
}

async function deleteEverything(ctx) {
  const first = await confirmSheet({
    title: 'Delete everything?',
    message: 'This removes every entry, your dishes, favourites and settings from this phone. It cannot be undone unless you have a backup.',
    confirmLabel: 'Yes, delete everything',
  });
  if (!first) return;
  const second = await confirmSheet({
    title: 'Are you sure?',
    message: 'Last check. Everything in Ish on this phone will be gone.',
    confirmLabel: 'Delete it all',
    cancelLabel: 'Keep my data',
  });
  if (!second) return;
  ctx.store.wipe();
  toast('Everything deleted');
}
