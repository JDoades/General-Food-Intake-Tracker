// Small DOM helpers: element builder, icons, sheets, toasts and confirm dialogs.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'type', 'min', 'max', 'step']);

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** Build an HTML element. h('button', { class: 'btn', onclick }, 'Label') */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

/** Replace an element's children, skipping empty slots (false, null) from conditional parts. */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** Build an SVG element. */
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

const ICONS = {
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  back: ['M15 18l-6-6 6-6'],
  chevron: ['M9 18l6-6-6-6'],
  search: ['M20 20l-4.2-4.2', 'circle:11,11,7'],
  camera: ['rect:3,7,18,13,3', 'M8.5 7l1.5-3h4l1.5 3', 'circle:12,13.5,3.5'],
  star: ['M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9-4.4-4.1 6-.8z'],
  today: ['circle:12,12,8', 'M12 4a8 8 0 0 1 8 8'],
  week: ['M5 20v-7', 'M10 20V6', 'M15 20v-10', 'M20 20V9'],
  settings: ['M4 7h9', 'M18 7h2', 'M4 17h3', 'M12 17h8', 'circle:15.5,7,2.5', 'circle:9.5,17,2.5'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  upload: ['M12 15V4', 'M7 9l5-5 5 5', 'M5 20h14'],
  copy: ['rect:8,8,12,12,2', 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  share: ['M12 3v12', 'M8 7l4-4 4 4', 'M6 11v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
};

/** A simple stroked icon. Filled stars use `filled`. */
export function icon(name, { filled = false } = {}) {
  const parts = ICONS[name] || [];
  const svg = s('svg', {
    viewBox: '0 0 24 24', fill: filled ? 'currentColor' : 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  });
  for (const p of parts) {
    if (p.startsWith('circle:')) {
      const [cx, cy, r] = p.slice(7).split(',');
      svg.append(s('circle', { cx, cy, r }));
    } else if (p.startsWith('rect:')) {
      const [x, y, w, hh, rx] = p.slice(5).split(',');
      svg.append(s('rect', { x, y, width: w, height: hh, rx }));
    } else {
      svg.append(s('path', { d: p }));
    }
  }
  return svg;
}

// ---------- Sheets ----------

const openSheets = [];

/**
 * Open a bottom sheet. Returns { el, body, close, setTitle, setContent }.
 * Uses <dialog> so focus, Escape and the Android back gesture behave properly.
 */
export function openSheet({ title = '', content = null, full = false, onClose } = {}) {
  const titleEl = h('h2', { class: 'sheet-title', id: `sheet-title-${Date.now()}` }, title);
  const body = h('div', { class: 'sheet-body' });
  const dlg = h('dialog', { class: `sheet${full ? ' sheet-full' : ''}`, 'aria-labelledby': titleEl.id },
    h('div', { class: 'sheet-inner' },
      h('div', { class: 'sheet-head' },
        titleEl,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close')),
      ),
      body,
    ),
  );
  // Tapping the dimmed area outside the sheet closes it
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  dlg.addEventListener('close', () => {
    const i = openSheets.indexOf(api);
    if (i >= 0) openSheets.splice(i, 1);
    dlg.remove();
    if (onClose) onClose();
  });
  document.body.append(dlg);
  dlg.showModal();

  function close() {
    // Forget this sheet straight away (the dialog's close event fires a moment later), so a
    // toast shown right after closing lands on the page instead of the closing sheet
    const i = openSheets.indexOf(api);
    if (i >= 0) openSheets.splice(i, 1);
    if (dlg.open) dlg.close();
  }
  function setTitle(t) {
    titleEl.textContent = t;
  }
  function setContent(...nodes) {
    body.replaceChildren(...nodes.flat().filter(Boolean));
    body.scrollTop = 0;
  }
  if (content) setContent(content);
  const api = { el: dlg, body, close, setTitle, setContent };
  openSheets.push(api);
  return api;
}

export function closeAllSheets() {
  for (const sh of [...openSheets]) sh.close();
}

// ---------- Toasts ----------

let currentToast = null;
let toastTimer = 0;

/** Show a short message, optionally with an action button such as Undo. */
export function toast(message, { actionLabel, onAction, duration = 5000 } = {}) {
  if (currentToast) currentToast.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' },
    h('p', {}, message),
    actionLabel && h('button', {
      class: 'btn btn-quiet', type: 'button',
      onclick: () => {
        el.remove();
        currentToast = null;
        onAction();
      },
    }, actionLabel),
  );
  // Toasts must sit inside an open dialog to be visible above it
  const top = [...openSheets].reverse().find((sh) => sh.el.open);
  const host = top ? top.el : document.body;
  host.append(el);
  currentToast = el;
  toastTimer = setTimeout(() => {
    el.remove();
    if (currentToast === el) currentToast = null;
  }, duration);
}

// ---------- Confirm ----------

/** Ask a yes/no question in a sheet. Resolves true or false. */
export function confirmSheet({ title, message, confirmLabel = 'Yes', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet({
      title,
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
    sheet.setContent(
      h('p', {}, message),
      h('div', { class: 'btn-stack' },
        h('button', {
          class: 'btn btn-primary btn-block', type: 'button',
          onclick: () => { answered = true; resolve(true); sheet.close(); },
        }, confirmLabel),
        h('button', {
          class: 'btn btn-block', type: 'button',
          onclick: () => { answered = true; resolve(false); sheet.close(); },
        }, cancelLabel),
      ),
    );
  });
}

export function formatBytes(n) {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n / (1024 * 1024))} MB`;
}

export function timeAgo(ts, now = Date.now()) {
  if (!ts) return 'Never';
  const days = Math.floor((now - ts) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'About a month ago' : `About ${months} months ago`;
}
