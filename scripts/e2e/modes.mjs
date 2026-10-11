/**
 * Smoke test for the hub and the non-story modes with an emulated hand:
 * poke through the menu into Free fold, fold a model (skipped), press Done,
 * then the Daily fold, then Settings → Captions. Checks the save data, the
 * desk shelf and the daily streak along the way.
 *   node scripts/e2e/modes.mjs [quest3|glasses]
 */
import { launch, frames, sleep, shot } from './harness.mjs';

const device = process.argv[2] ?? 'quest3';
const { page, logs, close } = await launch(`emulate=${device}&autostart=vr&scene=menu&ts=3`, { width: 560, height: 420 });
const out = `test-results/modes-${device}`;
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
await sleep(1000);
await page.evaluate(() => {
  const d = window.__xrdevice;
  const p = -0.6;
  d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2));
});
await sleep(2500);

/** Every button in the current scene with its label. */
const buttons = () =>
  page.evaluate(() => {
    const sc = window.__app.scene;
    const list = [...(sc.buttons ?? []), ...(sc.done ? [sc.done] : [])];
    return list.map((b) => String(b.opts.lines[0].text ?? b.opts.lines[0]));
  });

/** Move the right index fingertip through the button's face (a poke). */
async function poke(label) {
  for (const depth of [0.04, 0.02, -0.006]) {
    const ok = await page.evaluate(
      ({ label, depth }) => {
        const app = window.__app;
        const sc = app.scene;
        const list = [...(sc.buttons ?? []), ...(sc.done ? [sc.done] : [])];
        const b = list.find((x) => String(x.opts.lines[0].text ?? x.opts.lines[0]).startsWith(label));
        if (!b) return false;
        b.group.updateWorldMatrix(true, false);
        const target = b.group.localToWorld(app.headPos.clone().set(0, 0, depth));
        const h = app.hands.right;
        const dev = window.__xrdevice.hands.right;
        dev.position.x += target.x - h.indexTip.x;
        dev.position.y += target.y - h.indexTip.y;
        dev.position.z += target.z - h.indexTip.z;
        return true;
      },
      { label, depth },
    );
    if (!ok) return false;
    await frames(page, 3);
  }
  // pull back out of the button
  await page.evaluate(() => {
    window.__xrdevice.hands.right.position.z += 0.08;
  });
  await frames(page, 4);
  return true;
}

const sceneName = () => page.evaluate(() => window.__app.scene?.name);
const save = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__app.save.data)));
async function waitFor(fn, what, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(250);
  }
  check(false, `timed out waiting for ${what}`);
  return false;
}
/** Skip the fold (as the ☰ menu's "Skip this fold" does) and wait for the Done button. */
async function finishFold() {
  await waitFor(() => page.evaluate(() => !!window.__app.scene.stage?.fold), 'the sheet');
  await page.evaluate(() => window.__app.scene.stage.fold.skipAll());
  await waitFor(() => page.evaluate(() => !!window.__app.scene.done), 'the Done button');
}

// --- hub ---
check((await sceneName()) === 'menu', 'starts in the hub');
check((await buttons()).some((b) => b.startsWith('Start the story')), 'fresh save offers "Start the story"');
await shot(page, `${out}/01-hub.png`);

// --- free fold ---
check(await poke('Free fold'), 'poke "Free fold"');
await waitFor(async () => (await buttons()).includes('Puppy'), 'the model picker');
await shot(page, `${out}/02-picker.png`);
check(await poke('Puppy'), 'poke "Puppy"');
await waitFor(async () => (await sceneName()) === 'free', 'free fold scene');
await finishFold();
await shot(page, `${out}/03-free-done.png`);
let s = await save();
check(s.foldlings.some((f) => f.model === 'dog'), 'the puppy is saved to the desk');
check(await poke('Done'), 'poke "Done"');
await waitFor(async () => (await sceneName()) === 'menu', 'back to the hub');
await sleep(1500);
const shelf = await page.evaluate(() => window.__app.scene.stage.foldlings.map((f) => f.def.id));
check(shelf.includes('dog'), `the hub shelf shows the puppy (${shelf.join(',')})`);

// --- daily fold ---
check(await poke('Daily fold'), 'poke "Daily fold"');
await waitFor(async () => (await sceneName()) === 'daily', 'daily fold scene');
await finishFold();
s = await save();
check(s.daily.streak === 1, `daily streak is 1 (got ${s.daily.streak})`);
await shot(page, `${out}/04-daily-done.png`);
check(await poke('Done'), 'poke "Done" after the daily fold');
await waitFor(async () => (await sceneName()) === 'menu', 'back to the hub');
await sleep(800);
check((await buttons()).some((b) => b.startsWith('Daily fold ✓')), 'the daily button shows it is done');

// --- settings ---
const captionsBefore = (await save()).settings.captions;
check(await poke('Settings'), 'poke "Settings"');
await waitFor(async () => (await buttons()).includes('Captions'), 'the settings panel');
check(await poke('Captions'), 'poke "Captions"');
check((await save()).settings.captions === !captionsBefore, 'captions toggled');
check(await poke('Back'), 'poke "Back"');
await waitFor(async () => (await buttons()).includes('Settings'), 'the main panel again');
await shot(page, `${out}/05-hub-after.png`);

const errors = logs.filter((l) => /pageerror|\[error\]/.test(l) && !/Failed to load|net::|TUNNEL/.test(l));
check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exitCode = failures.length ? 1 : 0;
