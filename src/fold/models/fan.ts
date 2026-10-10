import { FoldStep, ModelDef, Step, alongXY, viewToPaper } from '../model.js';

// A strip pleated into an accordion. Every pleat is the same quick fold; the
// sheet turns over by itself between pleats, which is what makes the creases
// alternate.
const W = 1.0;
const H = 0.42;
const PANELS = 6;
const p = W / PANELS;
const P = viewToPaper('front', 0);

const steps: Step[] = [];
for (let i = 1; i < PANELS; i++) {
  const x = -W / 2 + i * p;
  const fold: FoldStep = {
    kind: 'fold',
    hint: i === 1 ? 'Fold the end over to the first line.' : i === PANELS - 1 ? 'Last pleat!' : 'Pleat it again.',
    grab: P(-W / 2 + (i - 1) * p + 0.01, 0),
    line: alongXY(() => [
      [x, -1],
      [x, 1],
    ]),
  };
  steps.push(fold);
  if (i < PANELS - 1) steps.push({ kind: 'flip', hint: 'Over it goes.', axis: 'x' });
}

export const fan: ModelDef = {
  id: 'fan',
  name: 'Fan',
  blurb: 'A breezy show-off. Wave it and see.',
  paper: { w: W, h: H, front: '#e8a33a', back: '#fdf3df', pattern: 'stripes' },
  start: 'front',
  steps,
  eyes: [],
  alive: 'fan',
};
