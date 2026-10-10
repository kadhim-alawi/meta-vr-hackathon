import { launch, frames, movePinchTo, pinchAt, sleep, throwToward } from './harness.mjs';
const { page, logs, close } = await launch('emulate=quest3&autostart=vr&scene=story&ts=3', { width: 480, height: 360 });
await page.evaluate(() => { const d = window.__xrdevice; const p = -0.6; d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2)); });
for (let i = 0; i < 200; i++) {
  const st = await page.evaluate(() => window.__app.scene.debugState().beat);
  if (st === 'fold') await page.evaluate(() => window.__app.scene.foldController?.skipAll());
  if (st === 'throw') break;
  await sleep(500);
}
await sleep(1500);
for (let attempt = 0; attempt < 2; attempt++) {
  const t = await page.evaluate(() => window.__app.scene.debugState().targets);
  console.log('targets', JSON.stringify(t));
  await movePinchTo(page, 'right', [t.obj[0], t.obj[1] + 0.06, t.obj[2]]);
  await pinchAt(page, 'right', t.obj);
  console.log('mode after pinch', await page.evaluate(() => window.__app.scene.stage.foldlings[0].mode));
  const from = await page.evaluate(() => window.__app.hands.right.pinchPoint.toArray());
  await throwToward(page, 'right', [t.to[0] - from[0], t.to[1] - from[1] + 0.15, t.to[2] - from[2]], 1.6, 3);
  for (let i = 0; i < 6; i++) {
    await sleep(600);
    const st = await page.evaluate(() => { const f = window.__app.scene.stage.foldlings[0]; return { beat: window.__app.scene.debugState().beat, mode: f.mode, pos: f.group.position.toArray().map((x) => +x.toFixed(3)), rel: f.lastRelease.toArray().map((x) => +x.toFixed(2)) }; });
    console.log(JSON.stringify(st));
    if (st.beat !== 'throw') break;
  }
}
console.log(logs.filter((l) => /pageerror|\[error\]/.test(l) && !l.includes('TUNNEL')).join('\n'));
await close();
