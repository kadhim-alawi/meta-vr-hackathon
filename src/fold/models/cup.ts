import { ModelDef, alongXY, onto, ontoXY, viewToPaper } from '../model.js';

// Square sheet turned into a diamond; coloured side down so the cup is
// coloured outside.
const S = 1.0;
const r = S / Math.SQRT2;
const P = viewToPaper('back', Math.PI / 4);

const BOT = P(0, -r);
const TOP = P(0, r);
const LEFT = P(-r, 0);
const RIGHT = P(r, 0);

// After the diagonal fold the triangle is L(-r,0) R(r,0) T(0,r). Folding a side
// corner so the flap's top edge is horizontal lands it at t = 2/(2+√2) up the
// opposite edge.
const t = 2 / (2 + Math.SQRT2);
const lip = t * r;

export const cup: ModelDef = {
  id: 'cup',
  name: 'Cup',
  blurb: 'Holds water, secrets and the occasional tadpole.',
  paper: { w: S, h: S, front: '#e0573d', back: '#f6efe0', pattern: 'dots' },
  start: 'back',
  startAngle: Math.PI / 4,
  steps: [
    {
      kind: 'fold',
      hint: 'Fold the bottom corner up to the top corner.',
      grab: BOT,
      line: onto(BOT, TOP),
    },
    {
      kind: 'fold',
      hint: 'Bring the right corner across to the left edge.',
      grab: RIGHT,
      line: ontoXY(RIGHT, () => [-r + lip, lip]),
    },
    {
      kind: 'fold',
      hint: 'Now the left corner across to the right.',
      grab: LEFT,
      line: ontoXY(LEFT, () => [r - lip, lip]),
    },
    {
      kind: 'fold',
      hint: 'Fold the front flap down over the cup.',
      grab: BOT,
      select: 'flap',
      line: alongXY(() => [
        [-1, lip],
        [1, lip],
      ]),
    },
    { kind: 'flip', hint: 'Turn it over.', axis: 'y' },
    {
      kind: 'fold',
      hint: 'Fold the last flap down.',
      grab: TOP,
      select: 'flap',
      line: alongXY(() => [
        [-1, lip],
        [1, lip],
      ]),
    },
  ],
  eyes: [
    { at: P(-0.13, 0.05), r: 0.03 },
    { at: P(0.13, 0.05), r: 0.03 },
  ],
  alive: 'cup',
  aliveScale: 0.36,
};
