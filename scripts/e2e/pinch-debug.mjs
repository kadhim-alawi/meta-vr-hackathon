import { launch, frames, movePinchTo, setPinch, sleep } from './harness.mjs';
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=lab&model=cup');
await sleep(1500);
const info = await page.evaluate(() => window.__app.scene.fold.debugPath(14));
await movePinchTo(page, 'right', info.path[0]);
const dump = () => page.evaluate(() => {
  const h = window.__app.hands.right;
  const tt = h.joints[4], it = h.joints[9];
  return { pinching: h.pinching, sys: h.systemSelect, strength: h.pinchStrength.toFixed(2), d: tt.distanceTo(it).toFixed(4), pp: h.pinchPoint.toArray().map(v=>v.toFixed(3)), claimed: !!h.claimedBy, phase: window.__app.scene.fold.phase };
});
console.log('before', JSON.stringify(await dump()), 'target', JSON.stringify(info.path[0].map(v=>v.toFixed(3))));
for (const v of [0.5, 0.8, 1]) { await page.evaluate((v) => window.__xrdevice.hands.right.updatePinchValue(v), v); await frames(page, 6); console.log(v, JSON.stringify(await dump())); }
await close();
