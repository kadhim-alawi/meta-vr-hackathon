// Clean pause/resume: opening the system menu (visible-blurred) or taking the
// headset off (hidden) must freeze game time and sound; coming back resumes.
import { launch, sleep } from './harness.mjs';
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=story&ts=3', { width: 320, height: 240 });
await sleep(4000);
const probe = () => page.evaluate(() => ({ t: window.__app.scene.script?.time ?? null, paused: window.__app.paused, audio: window.__app.audio.ctx?.state ?? 'none' }));
let ok = true;
const check = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) ok = false; };
for (const state of ['visible-blurred', 'hidden']) {
  const before = await probe();
  await page.evaluate((s) => window.__xrdevice.updateVisibilityState(s), state);
  await sleep(500);
  const a = await probe();
  await sleep(2500);
  const b = await probe();
  check(a.paused && b.paused, `${state}: app reports paused`);
  check(Math.abs(b.t - a.t) < 1e-6, `${state}: story clock frozen (${a.t?.toFixed(2)} → ${b.t?.toFixed(2)})`);
  check(b.audio !== 'running', `${state}: audio ${b.audio}`);
  await page.evaluate(() => window.__xrdevice.updateVisibilityState('visible'));
  await sleep(1500);
  const c = await probe();
  check(!c.paused && c.t > b.t, `${state} → visible: resumes (${b.t?.toFixed(2)} → ${c.t?.toFixed(2)})`);
  void before;
}
await close();
process.exitCode = ok ? 0 : 1;
