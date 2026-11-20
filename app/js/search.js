// Pure search logic: forgiving matching of dish names and aliases.

const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'with', 'on', 'in', 'some', 'my', 'bit', 'bowl', 'plate']);

export function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(s) {
  const n = normalise(s);
  return n ? n.split(' ') : [];
}

/** Plain Levenshtein distance, stopping early once it exceeds `max`. */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function allowedTypos(len) {
  if (len >= 7) return 2;
  if (len >= 4) return 1;
  return 0;
}

/** How well a single query token matches a single word: 3 exact, 2 prefix, 1 typo, 0 none. */
function tokenWordMatch(tok, word) {
  if (tok === word) return 3;
  if (word.startsWith(tok)) return 2;
  const typos = allowedTypos(tok.length);
  if (typos === 0) return 0;
  if (editDistance(tok, word, typos) <= typos) return 1;
  // Typo inside a prefix, e.g. "spagett" for "spaghetti"
  if (word.length > tok.length && editDistance(tok, word.slice(0, tok.length), typos) <= typos) return 1;
  return 0;
}

/** Score one candidate string (already normalised) against query tokens. 0 means no match. */
function scoreCandidate(qNorm, qTokens, cand) {
  if (!cand) return 0;
  if (cand === qNorm) return 100;
  if (cand.startsWith(qNorm)) return 85;
  const words = cand.split(' ');
  let total = 0;
  let matchedImportant = 0;
  let important = 0;
  for (const tok of qTokens) {
    const isStop = STOP_WORDS.has(tok);
    if (!isStop) important++;
    let best = 0;
    for (const w of words) {
      const m = tokenWordMatch(tok, w);
      if (m > best) best = m;
      if (best === 3) break;
    }
    if (best === 0) {
      if (isStop) continue;
      // Allow a plain substring as a last resort (e.g. "bol" inside "spagbol")
      if (tok.length >= 3 && cand.includes(tok)) best = 1;
      else return 0;
    }
    if (!isStop) matchedImportant++;
    total += best;
  }
  if (important > 0 && matchedImportant === 0) return 0;
  if (total === 0) return 0;
  const maxPossible = qTokens.length * 3;
  // 20..70 depending on match quality, small bonus for shorter names
  return 20 + Math.round((total / maxPossible) * 50) + Math.max(0, 5 - Math.floor(words.length / 2));
}

/**
 * Search foods. Each food is { id, name, aliases?: string[] }.
 * `boost` is an optional map of id -> small number added to the score (favourites, recent use).
 */
export function searchFoods(foods, query, { limit = 30, boost = {} } = {}) {
  const qNorm = normalise(query);
  if (!qNorm) return [];
  const qTokens = qNorm.split(' ');
  const scored = [];
  for (const f of foods) {
    let best = scoreCandidate(qNorm, qTokens, f._n || normalise(f.name));
    const aliases = f._a || (f.aliases || []).map(normalise);
    for (const a of aliases) {
      const s = scoreCandidate(qNorm, qTokens, a) - 3;
      if (s > best) best = s;
    }
    if (best > 0) scored.push({ food: f, score: best + (boost[f.id] || 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return scored.slice(0, limit).map((s) => s.food);
}

/** Precompute normalised names so searching 300+ items on every keypress stays fast. */
export function prepareFoods(foods) {
  return foods.map((f) => ({ ...f, _n: normalise(f.name), _a: (f.aliases || []).map(normalise) }));
}
