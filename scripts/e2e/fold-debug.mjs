import { launch, frames, movePinchTo, pinchAt, setPinch, shot, sleep } from './harness.mjs';
const { page, logs, close } = await launch('emulate=quest3&autostart=vr&scene=story:1&ts=3', { width: 480, height: 360 });
await page.evaluate(() => { const d = window.__xrdevice; const p = -0.6; d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2)); });
for (let i = 0; i < 120; i++) {
  const b = await page.evaluate(() => window.__app.scene.debugState().beat);
  if (b === 'fold') break;
  await sleep(500);
}
await sleep(2000);
for (let k = 0; k < 3; k++) {
  const info = await page.evaluate(() => window.__app.scene.foldController?.debugPath(14));
  console.log('phase', info.phase, 'step', info.step, 'p0', JSON.stringify(info.path[0]));
  if (info.phase !== 'ready') { await sleep(1500); continue; }
  await setPinch(page, 'right', 0);
  await movePinchTo(page, 'right', [info.path[0][0], info.path[0][1] + 0.05, info.path[0][2]]);
  const hp = await page.evaluate(() => window.__app.hands.right.pinchPoint.toArray());
  console.log('hand at', JSON.stringify(hp));
  await pinchAt(page, 'right', info.path[0]);
  const st = await page.evaluate(() => ({ phase: window.__app.scene.foldController.phase, pinching: window.__app.hands.right.pinching, claimed: String(window.__app.hands.right.claimedBy?.constructor?.name), pp: window.__app.hands.right.pinchPoint.toArray() }));
  console.log('after pinch', JSON.stringify(st));
  for (let i = 1; i < info.path.length; i++) await movePinchTo(page, 'right', info.path[i]);
  await setPinch(page, 'right', 0);
  await frames(page, 8);
  await shot(page, `test-results/folddbg-${k}.png`);
}
console.log(logs.filter((l) => /pageerror|\[error\]/.test(l) && !l.includes('TUNNEL')).join('\n'));
await close();
