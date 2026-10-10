import { launch, frames, movePinchTo, sleep } from './harness.mjs';
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=viewer:plane', { width: 400, height: 300 });
await sleep(2000);
await movePinchTo(page, 'right', [0.1, 0.9, -0.3]);
const dump = () => page.evaluate(() => {
  const h = window.__app.hands.right;
  return { t: window.__app.time.toFixed(3), pp: h.pinchPoint.toArray().map((v) => v.toFixed(3)), vel: h.velocity.toArray().map((v) => v.toFixed(2)), hist: h.hist.filter((x) => x.t >= 0).sort((a, b) => b.t - a.t).slice(0, 4).map((x) => [x.t.toFixed(3), x.p.z.toFixed(3)]) };
});
console.log(JSON.stringify(await dump()));
await page.evaluate(() => { window.__xrdevice.hands.right.position.z -= 0.1; });
for (let i = 0; i < 4; i++) { await frames(page, 1); console.log(JSON.stringify(await dump())); }
await close();
