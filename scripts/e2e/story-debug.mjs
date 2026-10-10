import { launch, frames, sleep } from './harness.mjs';
const { page, logs, close } = await launch('emulate=quest3&autostart=vr&scene=story&ts=3', { width: 480, height: 360 });
for (let i = 0; i < 12; i++) {
  await sleep(2500);
  const st = await page.evaluate(() => {
    const sc = window.__app.scene;
    const fc = sc.foldController;
    return { beat: sc.debugState?.().beat, fc: !!fc, phase: fc?.phase, step: fc?.stepIndex, pos: fc?.group.position.toArray().map((v) => v.toFixed(3)), path0: fc?.debugPath(4).path[0] };
  });
  console.log(JSON.stringify(st));
}
console.log(logs.filter((l) => /error|warn/i.test(l) && !l.includes('TUNNEL') && !l.includes('xr-input')).slice(0, 10).join('\n'));
await close();
