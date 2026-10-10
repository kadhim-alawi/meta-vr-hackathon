/** Folds a whole model with the emulated right hand: node scripts/e2e/fold-model.mjs cup */
import { launch, frames, movePinchTo, pinchAt, setPinch, shot, sleep } from './harness.mjs';

const model = process.argv[2] ?? 'cup';
const device = process.argv[3] ?? 'quest3';
const { page, logs, close } = await launch(`emulate=${device}&autostart=vr&scene=lab&model=${model}`);
const out = `test-results/fold-${model}`;
console.log('launched'); await sleep(1500);
// look down at the desk like a seated player
await page.evaluate(() => {
  const d = window.__xrdevice;
  const pitch = -0.75;
  d.quaternion.set(Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2));
});
await frames(page, 30);
await shot(page, `${out}/00-start.png`); console.log('start shot');

let guard = 0;
for (;;) {
  if (guard++ > 40) throw new Error('too many steps');
  // wait for the controller to be ready for input (skips auto steps/flips)
  let info;
  for (let i = 0; i < 200; i++) {
    info = await page.evaluate(() => window.__app.scene.fold.debugPath(14));
    if (info.phase === 'ready' || info.phase === 'done') break;
    await frames(page, 2);
  }
  if (info.phase === 'done') break;
  const { path, step } = info; console.log('step', step, 'path', path.length, JSON.stringify(path[0]));
  // hover above the handle, then pinch on it
  await setPinch(page, 'right', 0);
  await movePinchTo(page, 'right', [path[0][0], path[0][1] + 0.05, path[0][2]]);
  await pinchAt(page, 'right', path[0]);
  const phase = await page.evaluate(() => window.__app.scene.fold.phase);
  if (phase !== 'drag') {
    console.log(`step ${step}: pinch did not grab (phase ${phase})`);
    throw new Error('grab failed');
  }
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    // lift a little in the middle of the arc so the hand passes above the paper
    await movePinchTo(page, 'right', p);
    if (i === Math.floor(path.length / 2)) await shot(page, `${out}/${String(step).padStart(2, '0')}-mid.png`);
  }
  await setPinch(page, 'right', 0);
  await frames(page, 30);
  const after = await page.evaluate(() => ({ phase: window.__app.scene.fold.phase, step: window.__app.scene.fold.stepIndex }));
  console.log(`step ${step} → now step ${after.step} (${after.phase})`);
  await shot(page, `${out}/${String(step).padStart(2, '0')}-done.png`);
}
await movePinchTo(page, 'right', [0.25, 1.0, -0.1]);
await frames(page, 40);
await shot(page, `${out}/99-final.png`);
const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]')).filter((l) => !l.includes('ERR_TUNNEL'));
console.log(errors.length ? errors.join('\n') : 'no errors');
await close();
