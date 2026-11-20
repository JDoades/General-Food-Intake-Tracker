// Photo guessing, page side: download the model once, turn a photo into numbers, ask the
// worker for the closest dishes, and show the choices. Photos are never saved or sent anywhere.

import { PHOTO_CACHE, PHOTO_FILES, PHOTO_TOTAL_BYTES } from './photo-files.js';
import { confidence } from './photo-rank.js';
import { h, icon, openSheet, toast, formatBytes } from './ui/dom.js';
import { pickPanel } from './ui/parts.js';

export const IMAGE_SIZE = 256;

function urlFor(f) {
  return new URL(`${f.path}?v=${f.hash}`, document.baseURI).href;
}

/**
 * Turn an image into the numbers the model expects: centre square, 256x256, RGB scaled 0..1,
 * laid out as three colour planes. Steps down in halves so big photos shrink cleanly.
 */
export async function preprocess(source, size = IMAGE_SIZE) {
  const bmp = source instanceof Blob ? await createImageBitmap(source) : source;
  const w = bmp.width;
  const hgt = bmp.height;
  const side = Math.min(w, hgt);
  let cur = bmp;
  let sx = (w - side) / 2;
  let sy = (hgt - side) / 2;
  let cw = side;
  while (cw / 2 >= size * 1.5) {
    const next = Math.round(cw / 2);
    const c = document.createElement('canvas');
    c.width = next;
    c.height = next;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(cur, sx, sy, cw, cw, 0, 0, next, next);
    cur = c;
    sx = 0;
    sy = 0;
    cw = next;
  }
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const octx = out.getContext('2d', { willReadFrequently: true });
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(cur, sx, sy, cw, cw, 0, 0, size, size);
  const { data } = octx.getImageData(0, 0, size, size);
  const plane = size * size;
  const px = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    px[i] = data[i * 4] / 255;
    px[plane + i] = data[i * 4 + 1] / 255;
    px[2 * plane + i] = data[i * 4 + 2] / 255;
  }
  if (source instanceof Blob && bmp.close) bmp.close();
  return px;
}

export function createPhoto() {
  let worker = null;
  let loaded = null;
  let seq = 0;
  const pending = new Map();
  const supported = typeof caches !== 'undefined' && typeof Worker !== 'undefined'
    && typeof WebAssembly === 'object' && typeof createImageBitmap === 'function';

  async function status() {
    if (!supported) return 'unsupported';
    try {
      const cache = await caches.open(PHOTO_CACHE);
      for (const f of Object.values(PHOTO_FILES)) {
        if (!(await cache.match(urlFor(f)))) return 'absent';
      }
      return 'ready';
    } catch {
      return 'absent';
    }
  }

  /** Download every file into Cache Storage. onProgress gets 0..1. */
  async function download(onProgress = () => {}) {
    const cache = await caches.open(PHOTO_CACHE);
    let done = 0;
    for (const f of Object.values(PHOTO_FILES)) {
      const url = urlFor(f);
      if (await cache.match(url)) {
        done += f.bytes;
        onProgress(done / PHOTO_TOTAL_BYTES);
        continue;
      }
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
      const reader = res.body.getReader();
      const chunks = [];
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        chunks.push(value);
        done += value.byteLength;
        onProgress(Math.min(1, done / PHOTO_TOTAL_BYTES));
      }
      await cache.put(url, new Response(new Blob(chunks), {
        headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' },
      }));
    }
    // Tidy up files left over from older versions
    const keep = new Set(Object.values(PHOTO_FILES).map(urlFor));
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  }

  function ensureWorker() {
    if (worker) return;
    worker = new Worker(new URL('./photo-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data?.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(new Error('worker'));
      pending.clear();
      worker?.terminate();
      worker = null;
      loaded = null;
    };
  }

  function call(msg, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transfer);
    });
  }

  /** Start the model up. Safe to call more than once. */
  function load() {
    ensureWorker();
    if (!loaded) {
      const files = Object.fromEntries(Object.entries(PHOTO_FILES).map(([k, f]) => [k, urlFor(f)]));
      loaded = call({ type: 'load', cacheName: PHOTO_CACHE, files }).catch((err) => {
        loaded = null;
        throw err;
      });
    }
    return loaded;
  }

  async function guessPixels(pixels, topK = 4) {
    await load();
    return call({ type: 'guess', pixels, size: IMAGE_SIZE, topK }, [pixels.buffer]);
  }

  async function guess(file, topK = 4) {
    const pixels = await preprocess(file);
    return guessPixels(pixels, topK);
  }

  async function remove() {
    worker?.terminate();
    worker = null;
    loaded = null;
    await caches.delete(PHOTO_CACHE);
  }

  return { supported, status, download, load, guess, guessPixels, remove, totalBytes: PHOTO_TOTAL_BYTES };
}

/** The photo guess sheet: download prompt, camera, results and portion. */
export function openPhotoFlow(ctx, { day, downloadOnly = false } = {}) {
  const { photo } = ctx;
  const sheet = openSheet({ title: downloadOnly ? 'Photo guessing' : 'Guess from a photo' });
  let previewUrl = null;
  let lastResults = null;

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  };
  sheet.el.addEventListener('close', clearPreview);

  const pickInput = (capture) => {
    const input = h('input', {
      type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true',
      capture: capture ? 'environment' : null,
      onchange: () => {
        const f = input.files?.[0];
        input.value = '';
        if (f) analyse(f);
      },
    });
    return input;
  };
  const cameraInput = pickInput(true);
  const libraryInput = pickInput(false);

  function showReady() {
    photo.load().catch(() => {}); // Warm up while the camera is open
    sheet.setContent(
      h('p', {}, 'Take a photo of your food and Ish will suggest what it might be. You still choose the portion.'),
      h('p', { class: 'note' }, "The photo stays on your phone and isn't saved."),
      h('div', { class: 'btn-stack' },
        h('button', { class: 'btn btn-primary btn-block btn-big', type: 'button', onclick: () => cameraInput.click() }, icon('camera'), 'Take a photo'),
        h('button', { class: 'btn btn-block', type: 'button', onclick: () => libraryInput.click() }, 'Choose from your photos'),
      ),
      cameraInput, libraryInput,
    );
  }

  function showDownload(errorText) {
    const bar = h('div');
    const label = h('p', { class: 'muted small' }, '');
    const btn = h('button', {
      class: 'btn btn-primary btn-block btn-big', type: 'button',
      onclick: async () => {
        btn.disabled = true;
        btn.textContent = 'Downloading';
        progressWrap.hidden = false;
        try {
          await photo.download((p) => {
            bar.style.width = `${Math.round(p * 100)}%`;
            label.textContent = `${Math.round(p * 100)}% of ${formatBytes(photo.totalBytes)}`;
          });
          ctx.render();
          if (downloadOnly) {
            sheet.close();
            toast('Photo guessing is ready');
          } else {
            showReady();
          }
        } catch {
          showDownload(navigator.onLine === false
            ? "You're offline. Connect to download it, then it works offline after that."
            : "The download didn't finish. Check your connection and try again.");
        }
      },
    }, icon('download'), `Download (${formatBytes(photo.totalBytes)})`);
    const progressWrap = h('div', { hidden: true }, h('div', { class: 'progress' }, bar), label);
    sheet.setContent(
      h('p', {}, `Photo guessing needs a one-time download of about ${formatBytes(photo.totalBytes)}. After that it works offline.`),
      h('p', { class: 'note' }, 'It downloads from the same place as the app. Your photos never leave your phone.'),
      errorText && h('p', { class: 'note', role: 'alert' }, errorText),
      progressWrap,
      btn,
      h('button', { class: 'btn btn-quiet btn-block', type: 'button', onclick: () => sheet.close() }, 'Not now'),
    );
  }

  async function analyse(file) {
    clearPreview();
    previewUrl = URL.createObjectURL(file);
    sheet.setContent(
      h('img', { class: 'photo-preview', src: previewUrl, alt: 'Your photo' }),
      h('div', { class: 'spinner', role: 'status', 'aria-label': 'Having a look' }),
      h('p', { class: 'muted', style: null }, 'Having a look...'),
    );
    try {
      const res = await photo.guess(file, 4);
      lastResults = res.results;
      showResults();
    } catch {
      sheet.setContent(
        h('p', { class: 'note', role: 'alert' }, "Something went wrong reading that photo. Try another, or search instead."),
        h('div', { class: 'btn-stack' },
          h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: showReady }, 'Try another photo'),
          h('button', { class: 'btn btn-block', type: 'button', onclick: searchInstead }, 'Search instead'),
        ),
      );
    }
  }

  function searchInstead() {
    sheet.close();
    ctx.openAdd({ day });
  }

  function showResults() {
    const foods = lastResults.map((r) => ({ r, food: ctx.actions.findFood(r.id) })).filter((x) => x.food);
    const sure = confidence(lastResults) === 'sure';
    const [first, ...rest] = foods;
    const row = ({ food }, big = false) => h('li', {},
      h('button', {
        class: `row${big ? ' guess-top' : ''}`, type: 'button',
        onclick: () => sheet.setContent(pickPanel({
          food, ctx, day, via: 'photo', backLabel: 'Back to suggestions',
          onBack: showResults,
          onAdded: (entry) => {
            sheet.close();
            ctx.afterLog(entry);
          },
        })),
      },
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, food.name)),
      h('div', { class: 'row-end' }, icon('chevron'))),
    );
    sheet.setContent(
      previewUrl && h('img', { class: 'photo-preview', src: previewUrl, alt: 'Your photo' }),
      first && h('div', {},
        h('p', { class: 'guess-title' }, sure ? 'Looks most like' : 'Not sure about this one. Could it be'),
        h('ul', { class: 'list' }, row(first, true)),
      ),
      rest.length > 0 && h('div', {},
        h('p', { class: 'guess-title' }, sure ? 'Or maybe' : 'Or'),
        h('ul', { class: 'list' }, rest.map((x) => row(x))),
      ),
      h('div', { class: 'btn-stack' },
        h('button', { class: 'btn btn-block', type: 'button', onclick: searchInstead }, icon('search'), 'None of these, search instead'),
        h('button', { class: 'btn btn-quiet btn-block', type: 'button', onclick: showReady }, 'Try another photo'),
      ),
    );
  }

  sheet.setContent(h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
  photo.status().then((st) => {
    if (st === 'unsupported') {
      sheet.setContent(h('p', {}, "This browser can't run photo guessing. Searching works just as well."));
    } else if (st === 'ready') {
      if (downloadOnly) {
        sheet.close();
        toast('Photo guessing is already downloaded');
      } else showReady();
    } else showDownload();
  });
  return sheet;
}
