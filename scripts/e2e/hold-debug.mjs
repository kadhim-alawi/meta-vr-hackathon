import { launch, frames, movePinchTo, pinchAt, sleep } from './harness.mjs';
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=viewer:plane', { width: 400, height: 300 });
await sleep(2500);
const obj = await page.evaluate(() => { const f = window.__app.scene.stage.foldlings[0]; return window.__app.fromDesk(f.centreLocal(f.group.position.clone())).toArray(); });
await movePinchTo(page, 'right', [obj[0], obj[1] + 0.05, obj[2]]);
await pinchAt(page, 'right', obj);
const rec = await page.evaluate(async () => {
  const app = window.__app;
  const f = app.scene.stage.foldlings[0];
  const h = app.hands.right;
  const dev = window.__xrdevice.hands.right;
  const out = [];
  const nf = () => new Promise((res) => { const t = app.frames + 1; const p = () => (app.frames >= t ? res() : setTimeout(p, 1)); p(); });
  out.push({ mode: f.mode, pos: f.group.position.toArray(), pp: app.toDesk(h.pinchPoint.clone()).toArray(), q: h.orientation.toArray() });
  for (let i = 0; i < 5; i++) { dev.position.z -= 0.025; await nf(); out.push({ mode: f.mode, pos: f.group.position.toArray(), pp: app.toDesk(h.pinchPoint.clone()).toArray(), q: h.orientation.toArray() }); }
  const v = h.velocity.clone(); const tv = h.throwVelocity(v.clone(), app.time);
  dev.updatePinchValue(0); await nf(); await nf();
  out.push({ mode: f.mode, pos: f.group.position.toArray(), fvel: f.velocity.toArray(), tv: tv.toArray(), pinching: h.pinching });
  return out;
});
for (const r of rec) console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)));
await close();
