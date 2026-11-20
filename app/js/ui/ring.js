// The progress ring. 0 to 100% fills the main ring; anything over shows as a soft inner ring.

import { s } from './dom.js';

const CX = 100;
const R = 84;
const SW = 16;
const R_OVER = 62;
const SW_OVER = 9;

function arc(r, pct) {
  const c = 2 * Math.PI * r;
  return `${(c * Math.max(0, Math.min(100, pct))) / 100} ${c}`;
}

/**
 * pct: the displayed (rounded) percentage.
 * floorPct: where the good range starts (tick + shaded band up to 100).
 * none: draw a dashed empty ring (a day with nothing logged).
 */
export function ringSvg({ pct, floorPct, none = false, label = '', showTick = true }) {
  const main = Math.min(pct, 100);
  const over = Math.max(0, pct - 100);
  const c = 2 * Math.PI * R;
  const theta = (2 * Math.PI * floorPct) / 100;
  const inner = R - SW / 2 - 3;
  const outer = R + SW / 2 + 3;

  const g = s('g', { transform: `rotate(-90 ${CX} ${CX})` },
    s('circle', { class: 'r-track', cx: CX, cy: CX, r: R, 'stroke-width': SW }),
    !none && s('circle', {
      class: 'r-band', cx: CX, cy: CX, r: R, 'stroke-width': SW,
      'stroke-dasharray': `${(c * (100 - floorPct)) / 100} ${c}`,
      'stroke-dashoffset': `${-(c * floorPct) / 100}`,
    }),
    main > 0 && s('circle', { class: 'r-progress', cx: CX, cy: CX, r: R, 'stroke-width': SW, 'stroke-dasharray': arc(R, main) }),
    over > 0 && s('circle', { class: 'r-over-track', cx: CX, cy: CX, r: R_OVER, 'stroke-width': SW_OVER }),
    over > 0 && s('circle', { class: 'r-over', cx: CX, cy: CX, r: R_OVER, 'stroke-width': SW_OVER, 'stroke-dasharray': arc(R_OVER, over) }),
    !none && showTick && s('line', {
      class: 'r-tick', 'stroke-width': 3,
      x1: CX + inner * Math.cos(theta), y1: CX + inner * Math.sin(theta),
      x2: CX + outer * Math.cos(theta), y2: CX + outer * Math.sin(theta),
    }),
  );

  return s('svg', {
    class: `ring${none ? ' is-none' : ''}`, viewBox: '0 0 200 200',
    role: label ? 'img' : null, 'aria-label': label || null, 'aria-hidden': label ? null : 'true',
  }, g);
}
