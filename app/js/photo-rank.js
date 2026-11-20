// Pure maths for photo guessing: compare a photo's fingerprint with every dish's fingerprint.

export function l2normalise(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/**
 * Rank dishes by similarity to the image.
 * imageEmb: Float32Array(dim), already normalised.
 * dishEmbs: Float32Array(n * dim), each row normalised.
 * ids: string[n], row order.
 * Returns the top `topK` as [{ id, score, prob }], best first.
 */
export function rankDishes(imageEmb, dishEmbs, ids, { logitScale = 100, topK = 4, allowed = null } = {}) {
  const dim = imageEmb.length;
  const n = ids.length;
  if (dishEmbs.length !== n * dim) throw new Error('Dish fingerprints do not match the dish list');
  const scores = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    let dot = 0;
    const off = r * dim;
    for (let i = 0; i < dim; i++) dot += imageEmb[i] * dishEmbs[off + i];
    scores[r] = dot;
  }
  // Softmax over the allowed rows
  let max = -Infinity;
  for (let r = 0; r < n; r++) if ((!allowed || allowed.has(ids[r])) && scores[r] > max) max = scores[r];
  let sum = 0;
  const exps = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    if (allowed && !allowed.has(ids[r])) continue;
    exps[r] = Math.exp((scores[r] - max) * logitScale);
    sum += exps[r];
  }
  const rows = [];
  for (let r = 0; r < n; r++) {
    if (allowed && !allowed.has(ids[r])) continue;
    rows.push({ id: ids[r], score: scores[r], prob: sum ? exps[r] / sum : 0 });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, topK);
}

// Below this, the heading says "not sure". On 30 test photos of UK meals, correct top picks
// all scored 0.38 or more, and most wrong ones scored under 0.35.
export const SURE_THRESHOLD = 0.35;

/** 'sure' or 'unsure', used only to pick the heading wording. */
export function confidence(results, threshold = SURE_THRESHOLD) {
  if (!results.length) return 'unsure';
  return results[0].prob >= threshold ? 'sure' : 'unsure';
}
