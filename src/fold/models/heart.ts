import { FoldStep, ModelDef, alongXY, onto, ontoXY, viewToPaper } from '../model.js';

// Diamond, cream side up. Top corner to the centre, bottom corner up to the
// new top edge, then the lower edges fold up to the centre line on the back,
// which pinches the point and leaves two lobes.
const S = 1.0;
const r = S / Math.SQRT2;
const P = viewToPaper('back', Math.PI / 4);

const T = P(0, r);
const B = P(0, -r);
const L = P(-r, 0);
const R = P(r, 0);
const O = P(0, 0);
// Heart outline after the last turn-over: point (0,-r/4), outer lobe corners
// (±5r/8, 3r/8), lobe tops (±r/4, 3r/4), notch (0, r/2).
const OUTER: [number, number] = [(5 * r) / 8, (3 * r) / 8];
const LOBE_TOP: [number, number] = [r / 4, (3 * r) / 4];
const CUT_SIDE = 0.085;
const CUT_TOP = 0.06;

export const heart: ModelDef = {
  id: 'heart',
  name: 'Heart',
  blurb: 'Soft-spoken. Gives the best hugs.',
  paper: { w: S, h: S, front: '#e2486f', back: '#fde9ee', pattern: 'hearts' },
  start: 'back',
  startAngle: Math.PI / 4,
  steps: [
    {
      kind: 'fold',
      hint: 'Fold the top corner down to the centre.',
      grab: T,
      line: onto(T, O),
    },
    {
      kind: 'fold',
      hint: 'Fold the bottom corner up to the top edge.',
      grab: B,
      line: ontoXY(B, () => [0, r / 2]),
    },
    { kind: 'flip', hint: 'Turn it over.', axis: 'y' },
    {
      kind: 'fold',
      hint: 'Fold the right half of the bottom edge up to the middle.',
      // the sheet is turned over, so paper corner L now sits on the right
      grab: L,
      line: alongXY(() => [
        [0, -r / 4],
        [1, -r / 4 + 1],
      ]),
    },
    {
      kind: 'fold',
      hint: 'Now the left half.',
      grab: R,
      line: alongXY(() => [
        [0, -r / 4],
        [-1, -r / 4 + 1],
      ]),
    },
    { kind: 'flip', hint: 'Turn it back over.', axis: 'y' },
    // Round the lobes: tuck both outer corners, then both lobe tops at once.
    ...[-1, 1].map(
      (sx): FoldStep => ({
        kind: 'fold',
        hint: 'Round the lobes.',
        auto: true,
        dir: 'mountain',
        grab: () => [sx * OUTER[0], OUTER[1]],
        line: alongXY(() => [
          [sx * (OUTER[0] - CUT_SIDE), OUTER[1] - 1],
          [sx * (OUTER[0] - CUT_SIDE), OUTER[1] + 1],
        ]),
      }),
    ),
    {
      kind: 'fold',
      hint: 'Round the lobes.',
      auto: true,
      dir: 'mountain',
      grab: () => [LOBE_TOP[0], LOBE_TOP[1]],
      line: alongXY(() => [
        [-1, LOBE_TOP[1] - CUT_TOP],
        [1, LOBE_TOP[1] - CUT_TOP],
      ]),
    },
  ],
  eyes: [
    { fold: [-0.075, 0.13], r: 0.024 },
    { fold: [0.075, 0.13], r: 0.024 },
  ],
  cheeks: [
    { fold: [-0.13, 0.07], r: 0.03 },
    { fold: [0.13, 0.07], r: 0.03 },
  ],
  alive: 'heart',
};
