// Debug: reach chapter 3's 'fan' beat, pick up the fan, wave it and log the lift.
import { launch, frames, movePinchTo, pinchAt, sweepTo, sleep, shot } from './harness.mjs';
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=story:3&ts=3', { width: 560, height: 420 });
const state = () => page.evaluate(() => window.__app.scene.debugState?.());
for (let i = 0; i < 600; i++) {
  const st = await state();
  if (st?.beat === 'fold') await page.evaluate(() => window.__app.scene.foldController?.skipAll());
  if (st?.beat === 'fan') break;
  await sleep(200);
}
const { obj, to } = (await state()).targets;
console.log('at fan', JSON.stringify({ obj, to }));
await shot(page, 'test-results/fan-debug-0.png');
await movePinchTo(page, 'right', [obj[0], obj[1] + 0.05, obj[2]]);
await pinchAt(page, 'right', obj);
const info = () =>
  page.evaluate(() => {
    const app = window.__app;
    const fan = app.scene.stage.foldlings.find((x) => x.def.id === 'fan');
    const sp = app.scene.book.spread;
    const h = app.hands.right;
    const cam = app.world.camera.getWorldPosition(fan.group.position.clone());
    return { cam: cam.toArray(), desk: app.desk.group.position.toArray(), scene: app.scene?.constructor?.name, mode: fan.mode, pinching: h.pinching, claimed: !!h.claimedBy, fanPos: app.fromDesk(fan.group.position.clone()).toArray(), basketY: sp.basket.position.y, rotor: sp.rotor.rotation.z, palmV: h.velocity.length() };
  });
console.log('after grab', JSON.stringify(await info()));
await shot(page, 'test-results/fan-debug-1.png');
const c = [to[0] + 0.1, to[1] - 0.04, to[2] + 0.1];
for (let k = 0; k < 8; k++) {
  await sweepTo(page, 'right', [c[0] - 0.06, c[1], c[2]], 0.8);
  await sweepTo(page, 'right', [c[0] + 0.06, c[1], c[2]], 0.8);
  if (k === 3) await shot(page, 'test-results/fan-debug-2.png');
  console.log('sweep', k, JSON.stringify(await info(), (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)));
}
await shot(page, 'test-results/fan-debug.png');
await close();
