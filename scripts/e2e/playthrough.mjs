/**
 * Plays the whole story with emulated hands: folds every model, throws the
 * plane, sails the boat, waters the flowers, fans the windmill, gives the
 * heart, turns every page and opens the final letter.
 *   node scripts/e2e/playthrough.mjs [quest3|glasses] [startChapter]
 */
import { launch, frames, movePinchTo, pinchAt, setPinch, shot, sleep, throwToward, sweepTo } from './harness.mjs';

const device = process.argv[2] ?? 'quest3';
const chapter = process.argv[3] ?? '';
const scene = chapter ? `story:${chapter}` : 'story';
const suffix = chapter && chapter !== '0' ? `-ch${chapter}` : '';
// E2E_SIZE=1280x720 and E2E_HEAD="x,y,z,pitchRadians" for nicer screenshots
const [width, height] = (process.env.E2E_SIZE ?? '560x420').split('x').map(Number);
const head = (process.env.E2E_HEAD ?? '0,1.2,0,-0.6').split(',').map(Number);
const { page, logs, close } = await launch(`emulate=${device}&autostart=vr&scene=${scene}&ts=3`, { width, height });
const out = process.env.E2E_OUT ?? `test-results/playthrough-${device}${suffix}`;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
await sleep(1000);
await page.evaluate((head) => {
  const d = window.__xrdevice;
  const p = head[3];
  d.position.set(head[0], head[1], head[2]);
  d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2));
}, head);
const R = 'right';
const state = () => page.evaluate(() => window.__app.scene?.debugState?.() ?? { beat: 'none', targets: {} });
const setHandRot = (q) => page.evaluate((q) => window.__xrdevice.hands.right.quaternion.set(...q), q);
const restHand = async () => {
  await setPinch(page, R, 0);
  await movePinchTo(page, R, [0.22, 1.0, -0.15]);
};
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shots = new Set();
const snap = async (name) => {
  if (shots.has(name)) return;
  shots.add(name);
  await shot(page, `${out}/${String(shots.size).padStart(2, '0')}-${name}.png`);
};

let foldFails = 0;
let carryFails = 0;
const issues = [];
async function foldStep() {
  let info;
  for (let i = 0; i < 300; i++) {
    info = await page.evaluate(() => window.__app.scene.foldController?.debugPath(14) ?? { phase: 'none', path: [] });
    if (info.phase === 'ready' || info.phase === 'done' || info.phase === 'none') break;
    await frames(page, 2);
  }
  if (info.phase !== 'ready') return false;
  const path = info.path;
  await setPinch(page, R, 0);
  await movePinchTo(page, R, [path[0][0], path[0][1] + 0.05, path[0][2]]);
  await pinchAt(page, R, path[0]);
  const st = await page.evaluate(() => {
    const h = window.__app.hands.right;
    return { phase: window.__app.scene.foldController?.phase, tracked: h.tracked, pinching: h.pinching, age: h.pinchAge, claimed: h.claimedBy ? h.claimedBy.constructor.name : null, pp: h.pinchPoint.toArray().map((v) => +v.toFixed(3)) };
  });
  if (st.phase !== 'drag') {
    foldFails++;
    log('grab failed', JSON.stringify(st), 'target', JSON.stringify(path[0].map((v) => +v.toFixed(3))));
    if (foldFails >= 3) {
      issues.push(`fold step ${info.step}: grab failed 3x, skipped`);
      await page.evaluate(() => window.__app.scene.foldController?.skipAll());
      foldFails = 0;
    }
    await setPinch(page, R, 0);
    return true;
  }
  foldFails = 0;
  for (let i = 1; i < path.length; i++) await movePinchTo(page, R, path[i]);
  await setPinch(page, R, 0);
  await frames(page, 6);
  return true;
}

async function carry(obj, to, lift = 0.05) {
  await setPinch(page, R, 0);
  await movePinchTo(page, R, [obj[0], obj[1] + 0.05, obj[2]]);
  await pinchAt(page, R, obj);
  const held = await page.evaluate(() => {
    const h = window.__app.hands.right;
    const fs = window.__app.scene.stage?.foldlings ?? [];
    return { held: fs.some((f) => f.mode === 'held'), modes: fs.map((f) => `${f.def.id}:${f.mode}`).join(','), claimed: h.claimedBy ? h.claimedBy.constructor.name : null, pinching: h.pinching, age: +h.pinchAge.toFixed(2), pp: h.pinchPoint.toArray().map((v) => +v.toFixed(3)) };
  });
  if (!held.held) {
    carryFails++;
    if (carryFails <= 2) log('carry: nothing grabbed', JSON.stringify(held), 'obj', JSON.stringify(obj.map((v) => +v.toFixed(3))));
  } else carryFails = 0;
  const mid = [(obj[0] + to[0]) / 2, Math.max(obj[1], to[1]) + lift, (obj[2] + to[2]) / 2];
  for (let i = 1; i <= 6; i++) await movePinchTo(page, R, lerp3(obj, mid, i / 6));
  for (let i = 1; i <= 6; i++) await movePinchTo(page, R, lerp3(mid, [to[0], to[1] + 0.025, to[2]], i / 6));
}

let lastBeat = '';
let fallbacks = [];
let guard = 0;
for (;;) {
  if (Date.now() - t0 > 40 * 60 * 1000) throw new Error('playthrough timed out');
  const { beat, targets, fallbacks: fb } = await state();
  if (fb) fallbacks = fb;
  if (beat !== lastBeat) {
    log('beat', beat);
    lastBeat = beat;
    guard = 0;
  }
  if (beat === 'end' || beat === 'none') break;
  if (process.env.E2E_STOP_AT && beat === process.env.E2E_STOP_AT) break;
  guard++;
  if (!['intro', 'talk', 'fold'].includes(beat) && guard > 30) {
    log(`STUCK at beat ${beat}`);
    await snap(`stuck-${beat}`);
    process.exitCode = 2;
    break;
  }
  switch (beat) {
    case 'fold': {
      const did = await foldStep();
      if (!did) await frames(page, 4);
      break;
    }
    case 'throw': {
      await snap('plane-alive');
      await carry(targets.obj, [targets.obj[0], targets.obj[1] + 0.06, targets.obj[2] + 0.05], 0.02);
      // record how the release was judged
      await page.evaluate(() => {
        const app = window.__app;
        const f = app.scene.stage.foldlings.find((x) => x.def.id === 'plane');
        if (!f || f.__wrapped) return;
        f.__wrapped = true;
        const orig = f.onRelease;
        f.onRelease = (v) => {
          const toBook = app.scene.book.group.position.clone().setY(app.scene.book.group.position.y + 0.05).sub(f.group.position).normalize();
          window.__rel = { v: v.toArray().map((x) => +x.toFixed(2)), along: +v.dot(toBook).toFixed(2), mode: f.mode };
          orig?.(v);
        };
      });
      // fling towards the book
      const from = await page.evaluate(() => window.__app.hands.right.pinchPoint.toArray());
      await throwToward(page, R, [targets.to[0] - from[0], targets.to[1] - from[1] + 0.15, targets.to[2] - from[2]], 1.6, 3);
      log('release', JSON.stringify(await page.evaluate(() => window.__rel ?? null)));
      await frames(page, 20);
      await snap('plane-thrown');
      break;
    }
    case 'place':
    case 'dip':
    case 'give': {
      await carry(targets.obj, targets.to);
      await snap(`${beat}-held`);
      if (beat === 'dip') {
        // dunk into the well and keep holding the cup for pouring
        await movePinchTo(page, R, [targets.to[0], targets.to[1], targets.to[2]]);
        await frames(page, 6);
        await movePinchTo(page, R, [targets.to[0], targets.to[1] + 0.08, targets.to[2]]);
      } else {
        await setPinch(page, R, 0);
        await frames(page, 10);
        await restHand();
      }
      break;
    }
    case 'pour': {
      // the cup is still held from the dip
      const flowers = targets.flowers;
      if (!flowers || flowers.length === 0) {
        await frames(page, 4);
        break;
      }
      const f = flowers[0];
      const holding = await page.evaluate(() => window.__app.scene.stage.foldlings.some((x) => x.mode === 'held'));
      if (!holding) await carry(targets.obj, [f[0], f[1] + 0.06, f[2]]);
      await movePinchTo(page, R, [f[0], f[1] + 0.09, f[2]]);
      // tip the hand to pour
      for (let a = 0; a <= 1.5; a += 0.25) {
        await setHandRot([0, 0, Math.sin(-a / 2), Math.cos(-a / 2)]);
        await frames(page, 2);
        await movePinchTo(page, R, [f[0] - 0.02, f[1] + 0.09, f[2]]);
      }
      await frames(page, 25);
      await snap('pouring');
      await setHandRot([0, 0, 0, 1]);
      await frames(page, 4);
      break;
    }
    case 'wind': {
      const at = targets.at;
      await setPinch(page, R, 0);
      // wave the open hand left to right behind the sail
      await movePinchTo(page, R, [at[0] - 0.16, at[1] + 0.03, at[2]]);
      for (let k = 0; k < 4; k++) {
        await sweepTo(page, R, [at[0] + 0.02, at[1] + 0.03, at[2]], 0.8);
        await sweepTo(page, R, [at[0] - 0.16, at[1] + 0.03, at[2]], 0.8);
      }
      await snap('sailing');
      break;
    }
    case 'fan': {
      const holding = await page.evaluate(() => window.__app.scene.stage.foldlings.some((f) => f.mode === 'held'));
      if (!holding) await carry(targets.obj, [targets.to[0] + 0.12, targets.to[1] - 0.04, targets.to[2] + 0.12]);
      const c = [targets.to[0] + 0.1, targets.to[1] - 0.04, targets.to[2] + 0.1];
      for (let k = 0; k < 6; k++) {
        await sweepTo(page, R, [c[0] - 0.06, c[1], c[2]], 0.8);
        await sweepTo(page, R, [c[0] + 0.06, c[1], c[2]], 0.8);
      }
      await snap('fanning');
      break;
    }
    case 'turn': {
      await snap(`turn-${guard}`);
      const c = targets.corner;
      await restHand();
      await movePinchTo(page, R, [c[0], c[1] + 0.05, c[2]]);
      await pinchAt(page, R, c);
      // sweep over the spine to the left page
      const spineX = c[0] - 0.21;
      for (let i = 1; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        await movePinchTo(page, R, [spineX + Math.cos(a) * 0.21, c[1] + Math.sin(a) * 0.15, c[2]]);
      }
      await setPinch(page, R, 0);
      await frames(page, 20);
      await restHand();
      break;
    }
    case 'letter': {
      await snap('letter');
      await restHand();
      await movePinchTo(page, R, [targets.at[0], targets.at[1] + 0.05, targets.at[2]]);
      await pinchAt(page, R, targets.at);
      await setPinch(page, R, 0);
      await frames(page, 30);
      await snap('letter-open');
      break;
    }
    default:
      await frames(page, 6);
      if (guard % 10 === 0) await snap(`${beat}-${guard}`);
  }
}
log('finished');
if (issues.length) log('ISSUES:', issues.join(' | '));
// a beat the story finished on the player's behalf means an interaction failed
if (fallbacks.length) {
  log('FALLBACKS used:', fallbacks.join(' | '));
  process.exitCode ||= 3;
} else log('no fallbacks used');
await sleep(4000);
await snap('menu');
const errors = logs.filter((l) => /\[(error|pageerror)\]/.test(l) && !l.includes('ERR_TUNNEL'));
console.log(errors.length ? errors.slice(0, 20).join('\n') : 'no errors');
if (errors.length) process.exitCode ||= 1;
await close();
