import { launch, frames, shot, sleep } from './harness.mjs';
const { page, logs, close } = await launch('emulate=quest3&autostart=vr&scene=lab&model=cup');
await sleep(3000);
await frames(page, 10);
const info = await page.evaluate(() => {
  const a = window.__app;
  const r = a.hands.right;
  const dev = window.__xrdevice;
  return {
    mode: a.mode, session: !!a.world.session, desk: a.desk.group.position.toArray(), placed: a.desk.placed,
    head: a.headPos.toArray(), tracked: r.tracked, source: r.source,
    pinch: r.pinchPoint.toArray(), wrist: r.joints[0].toArray(), devHand: [dev.hands.right.position.x, dev.hands.right.position.y, dev.hands.right.position.z],
    phase: a.scene.fold?.phase,
  };
});
console.log(JSON.stringify(info, null, 1));
await shot(page, 'test-results/probe.png');
console.log(logs.slice(-15).join('\n'));
await close();
