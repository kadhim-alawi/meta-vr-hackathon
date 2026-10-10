// Debug: reach chapter 1's 'wind' beat and log the wind check per frame during a sweep.
import { launch, frames, movePinchTo, pinchAt, setPinch, sleep } from './harness.mjs';
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=story:1&ts=3', { width: 400, height: 300 });
const state = () => page.evaluate(() => window.__app.scene.debugState?.());
for (let i = 0; i < 600; i++) {
  const st = await state();
  if (st?.beat === 'fold') await page.evaluate(() => window.__app.scene.foldController?.skipAll());
  if (st?.beat === 'place') {
    const { obj, to } = st.targets;
    await movePinchTo(page, 'right', [obj[0], obj[1] + 0.05, obj[2]]);
    await pinchAt(page, 'right', obj);
    for (let k = 1; k <= 8; k++) await movePinchTo(page, 'right', obj.map((v, j) => v + ((to[j] + (j === 1 ? 0.03 : 0)) - v) * (k / 8)));
    await setPinch(page, 'right', 0);
    await frames(page, 6);
  }
  if (st?.beat === 'wind') break;
  await sleep(200);
}
console.log('at wind');
const at = (await state()).targets.at;
await page.evaluate(() => {
  const app = window.__app;
  const boat = app.scene.stage.foldlings.find((x) => x.def.id === 'boat');
  window.__rec = [];
  let last = -1;
  const q = new app.hands.right.orientation.constructor();
  const tick = () => {
    if (app.frames !== last) {
      last = app.frames;
      for (const h of app.hands.hands) {
        if (!h.tracked) continue;
        const p = app.toDesk(h.palm.clone());
        app.desk.group.getWorldQuaternion(q).invert();
        const v = h.velocity.clone().applyQuaternion(q);
        window.__rec.push({ f: app.frames, side: h.side, palm: p.toArray(), boat: boat.group.position.toArray(), d: p.distanceTo(boat.group.position), vx: v.x });
      }
    }
    if (window.__rec.length < 80) setTimeout(tick, 1);
  };
  tick();
});
for (let k = 0; k < 3; k++) {
  await movePinchTo(page, 'right', [at[0] - 0.12, at[1] + 0.03, at[2]]);
  await movePinchTo(page, 'right', [at[0] - 0.01, at[1] + 0.03, at[2]]);
}
const rec = await page.evaluate(() => window.__rec);
for (const r of rec) console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)));
await close();
