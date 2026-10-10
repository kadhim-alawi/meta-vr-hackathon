import { ModelDef, along, alongXY, viewToPaper } from '../model.js';

// Square sheet, cream side up. A coloured band folded up from the bottom
// becomes the hull; the top corners fold away behind so the cream middle
// becomes a triangular sail.
const S = 1.0;
const h = S / 2;
const BAND = 0.16;
const P = viewToPaper('back', 0);

const bandTop = -h + 2 * BAND;
const TOP_MID = P(0, h);
const TL = P(-h, h);
const TR = P(h, h);
const SAIL_L = P(-h, bandTop);
const SAIL_R = P(h, bandTop);
const TIP = 0.12;

export const boat: ModelDef = {
  id: 'boat',
  name: 'Sailboat',
  blurb: 'Steady, patient, loves a good breeze.',
  paper: { w: S, h: S, front: '#2f6fb3', back: '#fbf4e4', pattern: 'waves' },
  start: 'back',
  steps: [
    {
      kind: 'fold',
      hint: 'Fold the bottom edge up to make the hull.',
      grab: P(0, -h),
      line: alongXY(() => [
        [-1, -h + BAND],
        [1, -h + BAND],
      ]),
    },
    { kind: 'flip', hint: 'Turn it over.', axis: 'y' },
    {
      kind: 'fold',
      hint: 'Fold the top corner down along the line.',
      grab: TL,
      line: along(TOP_MID, SAIL_L),
    },
    {
      kind: 'fold',
      hint: 'And the other corner.',
      grab: TR,
      line: along(TOP_MID, SAIL_R),
    },
    { kind: 'flip', hint: 'Turn it back over.', axis: 'y' },
    {
      kind: 'fold',
      hint: 'Tuck the hull tips.',
      auto: true,
      dir: 'mountain',
      grab: P(-h, -h + BAND + 0.001),
      line: (s) => {
        const c = s.foldedPoint(P(-h, -h + BAND + 0.0001));
        const sx = Math.sign(c[0]) || -1;
        return alongXY(() => [
          [c[0] - sx * TIP, c[1]],
          [c[0], c[1] + TIP],
        ])(s);
      },
    },
    {
      kind: 'fold',
      hint: 'Tuck the hull tips.',
      auto: true,
      dir: 'mountain',
      grab: P(h, -h + BAND + 0.001),
      line: (s) => {
        const c = s.foldedPoint(P(h, -h + BAND + 0.0001));
        const sx = Math.sign(c[0]) || 1;
        return alongXY(() => [
          [c[0] - sx * TIP, c[1]],
          [c[0], c[1] + TIP],
        ])(s);
      },
    },
  ],
  eyes: [
    { at: P(-0.09, -0.42), r: 0.024 },
    { at: P(0.09, -0.42), r: 0.024 },
  ],
  alive: 'boat',
};
