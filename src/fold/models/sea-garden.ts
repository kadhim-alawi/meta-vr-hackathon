/** A whale from a kite base, and a tulip. */
import { ModelDef, alongXY, onto, ontoXY, viewToPaper } from '../model.js';

const S = 1.0;
const r = S / Math.SQRT2;

const W = viewToPaper('back', Math.PI / 4);
const wT = W(0, r);
const wB = W(0, -r);
const wL = W(-r, 0);
const wR = W(r, 0);

export const whale: ModelDef = {
  id: 'whale',
  name: 'Whale',
  blurb: 'Big, gentle, sings in the bath.',
  paper: { w: S, h: S, front: '#3f7fc0', back: '#eaf3fb', pattern: 'waves' },
  start: 'back',
  startAngle: Math.PI / 4,
  steps: [
    // kite base: each lower edge onto the centre line
    { kind: 'fold', hint: 'Fold the lower-left edge to the middle line.', grab: wL, line: ontoXY(wL, () => [0, -r + S]) },
    { kind: 'fold', hint: 'And the lower-right edge.', grab: wR, line: ontoXY(wR, () => [0, -r + S]) },
    { kind: 'fold', hint: 'Fold the top point down.', grab: wT, line: ontoXY(wT, () => [0, -0.07]) },
    {
      kind: 'fold',
      hint: 'Fold it in half.',
      grab: (s) => {
        const b = s.foldedBounds();
        return [b.min[0] + 0.03, 0.27];
      },
      line: alongXY(() => [
        [0, -1],
        [0, 1],
      ]),
    },
    {
      kind: 'fold',
      hint: 'Flip the tail up!',
      grab: wB,
      line: alongXY(() => [
        [0.05, -0.45],
        [1.05, 0.55],
      ]),
    },
  ],
  eyes: [{ fold: [0.07, 0.17], r: 0.026 }],
  cheeks: [{ fold: [0.12, 0.1], r: 0.03 }],
  alive: 'swimmer',
  aliveScale: 0.45,
  // head along +x, back (the folded edge) up
  pose: [Math.PI / 2, -Math.PI / 2, 0],
};

const F = viewToPaper('back', Math.PI / 4);
const fT = F(0, r);
const fB = F(0, -r);
const fL = F(-r, 0);
const fR = F(r, 0);

export const tulip: ModelDef = {
  id: 'tulip',
  name: 'Tulip',
  blurb: 'Blooms a little more every time you smile.',
  paper: { w: S, h: S, front: '#e2486f', back: '#fde9ee', pattern: 'hearts' },
  start: 'back',
  startAngle: Math.PI / 4,
  steps: [
    { kind: 'fold', hint: 'Fold the bottom corner up to the top.', grab: fB, line: onto(fB, fT) },
    { kind: 'fold', hint: 'Fold the left corner up into a petal.', grab: fL, line: ontoXY(fL, () => [-0.12, 0.62]) },
    { kind: 'fold', hint: 'And the right petal.', grab: fR, line: ontoXY(fR, () => [0.12, 0.62]) },
  ],
  eyes: [
    { fold: [-0.06, 0.12], r: 0.022 },
    { fold: [0.06, 0.12], r: 0.022 },
  ],
  cheeks: [
    { fold: [-0.12, 0.07], r: 0.026 },
    { fold: [0.12, 0.07], r: 0.026 },
  ],
  alive: 'flower',
  aliveScale: 0.4,
};
