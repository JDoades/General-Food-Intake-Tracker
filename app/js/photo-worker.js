// Runs the photo model off the main thread so the app stays smooth.
// It never touches the network: every file it needs was saved to Cache Storage by photo.js,
// and the photo arrives as plain numbers. Nothing here is stored or sent anywhere.

import * as ort from '../vendor/ort/ort.wasm.bundle.min.mjs';
import { l2normalise, rankDishes } from './photo-rank.js';

let ready = null;

async function readCached(cacheName, url) {
  const cache = await caches.open(cacheName);
  const res = await cache.match(url);
  if (!res) throw new Error(`missing:${url}`);
  return res.arrayBuffer();
}

async function load({ cacheName, files }) {
  const [model, wasm, embs, ids] = await Promise.all([
    readCached(cacheName, files.model),
    readCached(cacheName, files.wasm),
    readCached(cacheName, files.embeddings),
    readCached(cacheName, files.ids),
  ]);
  ort.env.wasm.wasmBinary = wasm;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return {
    session,
    dishEmbs: new Float32Array(embs),
    ids: JSON.parse(new TextDecoder().decode(ids)),
  };
}

async function guess(pixels, size, topK) {
  const { session, dishEmbs, ids } = await ready;
  const input = new ort.Tensor('float32', pixels, [1, 3, size, size]);
  const out = await session.run({ [session.inputNames[0]]: input });
  const emb = l2normalise(out[session.outputNames[0]].data);
  return { results: rankDishes(emb, dishEmbs, ids, { logitScale: 100, topK }), embedding: Array.from(emb) };
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'load') {
      if (!ready) ready = load(msg);
      await ready;
      self.postMessage({ id: msg.id, ok: true });
    } else if (msg.type === 'guess') {
      if (!ready) throw new Error('not-loaded');
      const res = await guess(msg.pixels, msg.size, msg.topK || 4);
      self.postMessage({ id: msg.id, ok: true, ...res });
    }
  } catch (err) {
    if (msg.type === 'load') ready = null;
    self.postMessage({ id: msg.id, ok: false, error: String(err?.message || err) });
  }
};
