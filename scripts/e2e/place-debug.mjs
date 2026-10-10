// Debug: skip to chapter 1's 'place' beat and watch a pinch on the boat frame by frame.
import { launch, frames, movePinchTo, pinchAt, sleep } from './harness.mjs';
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=story:1&ts=3', { width: 400, height: 300 });
const beat = () => page.evaluate(() => window.__app.scene.debugState?.().beat);
for (let i = 0; i < 400; i++) {
  const b = await beat();
  if (b === 'fold') await page.evaluate(() => window.__app.scene.foldController?.skipAll());
  if (b === 'place') break;
  await sleep(250);
}
console.log('at place');
const st = await page.evaluate(() => window.__app.scene.debugState());
const obj = st.targets.obj;
await movePinchTo(page, 'right', [obj[0], obj[1] + 0.05, obj[2]]);
await page.evaluate(() => {
  const app = window.__app;
  const f = app.scene.stage.foldlings.find((x) => x.def.id === 'boat');
  const h = app.hands.right;
  window.__rec = [];
  let last = -1;
  const tick = () => {
    if (app.frames !== last) {
      last = app.frames;
      const c = f.centreLocal(h.palm.clone());
      const pp = app.toDesk(h.pinchPoint.clone());
      window.__rec.push({ f: app.frames, mode: f.mode, pinching: h.pinching, fresh: h.freshPinch, age: h.pinchAge, frames: h.pinchFrames, claimed: !!h.claimedBy, d: pp.distanceTo(c), r: f.radius });
    }
    if (window.__rec.length < 60) setTimeout(tick, 1);
  };
  tick();
});
await pinchAt(page, 'right', obj);
await frames(page, 4);
const rec = await page.evaluate(() => window.__rec);
for (const r of rec) console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)));
await close();
