import { Vec2 } from '../geom.js';
import { ModelDef, along, alongXY, ontoXY, viewToPaper } from '../model.js';

// A4-ish sheet, nose pointing away from the player (+y in the folded frame).
const W = 0.72;
const H = 1.0;
const P = viewToPaper('back', 0);
/** x of a paper point in the initial view (the sheet starts mirrored). */
const viewX = (q: Vec2) => -q[0];
const hw = W / 2;
const hh = H / 2;

const NOSE = P(0, hh);
const TL = P(-hw, hh);
const TR = P(hw, hh);
const BL = P(-hw, -hh);
// keel depth: how far the wing crease sits from the centre line
const KEEL = 0.075;

export const plane: ModelDef = {
  id: 'plane',
  name: 'Paper Plane',
  blurb: 'Zippy, brave and always first to go.',
  paper: { w: W, h: H, front: '#3d7be0', back: '#f6f1e6', pattern: 'stripes' },
  start: 'back',
  steps: [
    {
      kind: 'fold',
      hint: 'Pinch the glowing corner and fold it to the middle.',
      grab: TL,
      line: ontoXY(TL, (s) => {
        const n = s.foldedPoint(NOSE);
        return [n[0], n[1] - hw];
      }),
    },
    {
      kind: 'fold',
      hint: 'Now the other corner.',
      grab: TR,
      line: ontoXY(TR, (s) => {
        const n = s.foldedPoint(NOSE);
        return [n[0], n[1] - hw];
      }),
    },
    {
      kind: 'fold',
      hint: 'Fold it in half.',
      grab: BL,
      line: along(NOSE, P(0, -hh)),
    },
    {
      kind: 'fold',
      hint: 'Lift the wing up.',
      grab: P(-hw, -hh),
      // every layer that came from the left half of the sheet
      select: { region: (q) => viewX(q) < 0 },
      angle: Math.PI / 2,
      line: alongXY((s) => {
        const n = s.foldedPoint(NOSE);
        const t = s.foldedPoint(P(0, -hh));
        // crease parallel to the keel, KEEL away from it on the open side
        const dirX = Math.sign(s.foldedPoint(BL)[0] - n[0]) || 1;
        return [
          [n[0] + dirX * KEEL, n[1]],
          [t[0] + dirX * KEEL, t[1]],
        ];
      }),
    },
    {
      kind: 'fold',
      hint: 'The other wing follows!',
      auto: true,
      grab: P(hw, -hh),
      select: { region: (q) => viewX(q) > 0 },
      dir: 'mountain',
      angle: Math.PI / 2,
      line: alongXY((s) => {
        const n = s.foldedPoint(NOSE);
        const t = s.foldedPoint(P(0, -hh));
        const dirX = Math.sign(s.foldedPoint(BL)[0] - n[0]) || 1;
        return [
          [n[0] + dirX * KEEL, n[1]],
          [t[0] + dirX * KEEL, t[1]],
        ];
      }),
    },
  ],
  eyes: [
    { at: P(-0.05, 0.3), r: 0.018 },
    { at: P(0.05, 0.3), r: 0.018 },
  ],
  alive: 'glider',
};

