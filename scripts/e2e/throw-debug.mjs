import { launch, frames, movePinchTo, pinchAt, sleep, throwToward } from './harness.mjs';
const { page, logs, close } = await launch('emulate=quest3&autostart=vr&scene=story&ts=3', { width: 480, height: 360 });
await page.evaluate(() => { const d = window.__xrdevice; const p = -0.6; d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2)); });
// skip the fold via the controller
for (let i = 0; i < 200; i++) {
  const st = await page.evaluate(() => window.__app.scene.debugState().beat);
  if (st === 'fold') { await page.evaluate(() => window.__app.scene.foldController?.skipAll()); }
  if (st === 'throw') break;
  await sleep(500);
}
const t = await page.evaluate(() => window.__app.scene.debugState().targets);
console.log('targets', JSON.stringify(t));
await movePinchTo(page, 'right', [t.obj[0], t.obj[1] + 0.05, t.obj[2]]);
await pinchAt(page, 'right', t.obj);
const mode = await page.evaluate(() => window.__app.scene.stage.foldlings[0].mode);
console.log('after pinch mode', mode);
const from = await page.evaluate(() => window.__app.hands.right.pinchPoint.toArray());
await throwToward(page, 'right', [t.to[0] - from[0], t.to[1] - from[1] + 0.15, t.to[2] - from[2]], 1.8, 5);
for (let i = 0; i < 12; i++) {
  await sleep(700);
  const st = await page.evaluate(() => { const f = window.__app.scene.stage.foldlings[0]; return { beat: window.__app.scene.debugState().beat, mode: f.mode, pos: f.group.position.toArray().map((x) => x.toFixed(3)), vel: f.velocity.toArray().map((x) => x.toFixed(2)) }; });
  console.log(JSON.stringify(st));
}
console.log(logs.filter((l) => /pageerror|\[error\]/.test(l) && !l.includes('TUNNEL')).join('\n'));
await close();
