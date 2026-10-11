/**
 * Classic first-origami faces: dog, cat and fox. Each starts as a diamond
 * folded into a triangle, then ears and snout are folded.
 */
import { ModelDef, onto, ontoXY, viewToPaper } from '../model.js';

const S = 1.0;
const r = S / Math.SQRT2;

function diamond(start: 'front' | 'back') {
  const P = viewToPaper(start, Math.PI / 4);
  return { P, T: P(0, r), B: P(0, -r), L: P(-r, 0), R: P(r, 0) };
}

const dogD = diamond('back');
export const dog: ModelDef = {
  id: 'dog',
  name: 'Puppy',
  blurb: 'Floppy ears, waggy everything.',
  paper: { w: S, h: S, front: '#c98b52', back: '#f7ead7', pattern: 'dots' },
  start: 'back',
  startAngle: Math.PI / 4,
  steps: [
    { kind: 'fold', hint: 'Fold the top corner down to the bottom corner.', grab: dogD.T, line: onto(dogD.T, dogD.B) },
    { kind: 'fold', hint: 'Flop the left ear down.', grab: dogD.L, line: ontoXY(dogD.L, () => [-0.36, -0.42]) },
    { kind: 'fold', hint: 'Flop the right ear down.', grab: dogD.R, line: ontoXY(dogD.R, () => [0.36, -0.42]) },
    { kind: 'fold', hint: 'Fold the chin up a little.', grab: dogD.B, line: ontoXY(dogD.B, () => [0, -0.44]) },
  ],
  eyes: [
    { fold: [-0.09, -0.16], r: 0.026 },
    { fold: [0.09, -0.16], r: 0.026 },
    { fold: [0, -0.4], r: 0.038 },
  ],
  cheeks: [
    { fold: [-0.15, -0.25], r: 0.035 },
    { fold: [0.15, -0.25], r: 0.035 },
  ],
  alive: 'face',
  aliveScale: 0.42,
};

const catD = diamond('back');
export const cat: ModelDef = {
  id: 'cat',
  name: 'Kitten',
  blurb: 'Curious about everything you do.',
  paper: { w: S, h: S, front: '#9a9dae', back: '#f3efe8', pattern: 'stripes' },
  start: 'back',
  startAngle: Math.PI / 4,
  steps: [
    { kind: 'fold', hint: 'Fold the top corner down to the bottom corner.', grab: catD.T, line: onto(catD.T, catD.B) },
    { kind: 'fold', hint: 'Fold the left corner up to make an ear.', grab: catD.L, line: ontoXY(catD.L, () => [-0.3, 0.22]) },
    { kind: 'fold', hint: 'And the right ear.', grab: catD.R, line: ontoXY(catD.R, () => [0.3, 0.22]) },
    { kind: 'fold', hint: 'Tuck the chin up.', grab: catD.B, line: ontoXY(catD.B, () => [0, -0.5]) },
  ],
  eyes: [
    { fold: [-0.1, -0.12], r: 0.026 },
    { fold: [0.1, -0.12], r: 0.026 },
    { fold: [0, -0.24], r: 0.02 },
  ],
  cheeks: [
    { fold: [-0.17, -0.22], r: 0.035 },
    { fold: [0.17, -0.22], r: 0.035 },
  ],
  alive: 'face',
  aliveScale: 0.42,
};

const foxD = diamond('back');
export const fox: ModelDef = {
  id: 'fox',
  name: 'Fox',
  blurb: 'Clever, quick and a little bit sly.',
  paper: { w: S, h: S, front: '#e0752d', back: '#fff4e6', pattern: 'leaves' },
  start: 'back',
  startAngle: Math.PI / 4,
  steps: [
    { kind: 'fold', hint: 'Fold the top corner down to the bottom corner.', grab: foxD.T, line: onto(foxD.T, foxD.B) },
    { kind: 'fold', hint: 'Fold the left corner up into a tall ear.', grab: foxD.L, line: ontoXY(foxD.L, () => [-0.2, 0.32]) },
    { kind: 'fold', hint: 'And the other ear.', grab: foxD.R, line: ontoXY(foxD.R, () => [0.2, 0.32]) },
    { kind: 'flip', hint: 'Turn it over.', axis: 'y' },
  ],
  eyes: [
    { fold: [-0.08, -0.14], r: 0.024 },
    { fold: [0.08, -0.14], r: 0.024 },
    { fold: [0, -0.46], r: 0.03 },
  ],
  alive: 'face',
  aliveScale: 0.42,
};
