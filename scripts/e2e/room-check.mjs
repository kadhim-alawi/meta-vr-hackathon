/**
 * Mixed reality room check with synthetic detected planes (IWER reports none
 * offline): a floor, a sofa to the right and a wall ahead. Tosses the
 * finished paper plane at the wall and then at the sofa, and checks that it
 * bumps off the wall, lands on the real surface below, then flies home.
 *   node scripts/e2e/room-check.mjs
 */
import { launch, frames, movePinchTo, pinchAt, sleep, throwToward } from './harness.mjs';

const { page, close } = await launch('emulate=quest3&autostart=ar&scene=free:plane&ts=3', { width: 480, height: 360 });
let ok = true;
const check = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) ok = false;
};
await sleep(1500);
for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__app.scene.stage?.fold)); i++) await sleep(200);
await page.evaluate(() => window.__app.scene.stage.fold.skipAll());
for (let i = 0; i < 150 && !(await page.evaluate(() => !!window.__app.scene.done)); i++) await sleep(200);
check((await page.evaluate(() => window.__app.mode)) === 'ar', 'mixed reality session');

// the room: floor at y 0, a sofa seat at y 0.45 to the right, a wall 1.3 m ahead
await page.evaluate(() => {
  const app = window.__app;
  const M = app.desk.group.matrixWorld.constructor;
  const plane = (m, poly, vertical, label) => ({ world: m, inv: m.clone().invert(), poly, vertical, label });
  const sq = (hx, hz) => [-hx, -hz, hx, -hz, hx, hz, -hx, hz];
  const floor = new M().makeTranslation(0, 0, 0);
  const sofa = new M().makeTranslation(1.2, 0.45, -0.4);
  // plane space +y is the normal: rotate +90° about x so it faces the player (+z)
  const wall = new M().makeRotationX(Math.PI / 2).setPosition(0, 1.2, -1.3);
  app.room.planes = [plane(floor, sq(4, 4), false, 'floor'), plane(sofa, sq(0.8, 0.6), false, 'couch'), plane(wall, sq(4, 1.5), true, 'wall')];
  app.room.next = Infinity; // keep the synthetic room
});

const plane = () =>
  page.evaluate(() => {
    const app = window.__app;
    const f = app.scene.stage.foldlings.find((x) => x.def.id === 'plane');
    const w = app.fromDesk(f.group.position.clone());
    return { mode: f.mode, world: w.toArray().map((v) => +v.toFixed(3)), onDesk: f.constructor.overDesk(f.group.position) };
  });

async function toss(dir, speed, label) {
  const p = await plane();
  await movePinchTo(page, 'right', [p.world[0], p.world[1] + 0.08, p.world[2]]);
  const obj = await page.evaluate(() => {
    const app = window.__app;
    const f = app.scene.stage.foldlings.find((x) => x.def.id === 'plane');
    return app.fromDesk(f.centreLocal(f.group.position.clone())).toArray();
  });
  await pinchAt(page, 'right', obj);
  await frames(page, 2);
  check((await plane()).mode === 'held', `${label}: picked up the plane`);
  // record every mode and the lowest point it reaches
  await page.evaluate(() => {
    const app = window.__app;
    const f = app.scene.stage.foldlings.find((x) => x.def.id === 'plane');
    window.__trace = { modes: [], minY: Infinity, maxZ: -Infinity, minZ: Infinity, restY: null, rest: null, wallAt: null };
    let last = -1;
    const tick = () => {
      if (app.frames !== last) {
        last = app.frames;
        const w = app.fromDesk(f.group.position.clone());
        const tr = window.__trace;
        if (tr.modes[tr.modes.length - 1] !== f.mode) tr.modes.push(f.mode);
        tr.minY = Math.min(tr.minY, w.y);
        tr.minZ = Math.min(tr.minZ, w.z);
        if (f.mode === 'idle' && !f.constructor.overDesk(f.group.position) && tr.restY === null) {
          tr.restY = w.y;
          tr.rest = w.toArray().map((v) => +v.toFixed(2));
        }
        if (f.mode === 'falling' && tr.wallAt === null) tr.wallAt = w.toArray().map((v) => +v.toFixed(2));
      }
      if (tr_alive()) setTimeout(tick, 1);
    };
    const tr_alive = () => window.__trace && window.__trace.modes.length < 40;
    tick();
  });
  await throwToward(page, 'right', dir, speed, 4);
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    const s = await plane();
    const tr = await page.evaluate(() => window.__trace);
    if (s.onDesk && s.mode === 'idle' && tr.modes.includes('flying') && tr.restY !== null) break;
  }
  const tr = await page.evaluate(() => window.__trace);
  const end = await plane();
  return { tr, end };
}

// 1. straight at the wall
let r = await toss([0, 0.25, -1], 3.2, 'wall');
console.log('     wall trace', JSON.stringify({ modes: r.tr.modes, minZ: +r.tr.minZ.toFixed(2), restY: r.tr.restY }));
check(r.tr.minZ > -1.3, `wall: stopped at the wall (closest z ${r.tr.minZ.toFixed(2)} > -1.30)`);
check(r.tr.modes.includes('falling'), 'wall: bumped and fluttered down');
check(r.tr.restY !== null && Math.abs(r.tr.restY) < 0.03, `wall: rested on the floor (y ${r.tr.restY?.toFixed(3)})`);
check(r.end.onDesk && r.end.mode === 'idle', 'wall: flew home to the desk');

// 2. glide off to the right onto the sofa (a fixed launch: tosses in the
//    emulator vary with frame timing, and the wall case already covers a toss)
await page.evaluate(() => {
  const app = window.__app;
  const f = app.scene.stage.foldlings.find((x) => x.def.id === 'plane');
  window.__trace = { modes: [], restY: null, rest: null };
  let last = -1;
  const tick = () => {
    if (app.frames !== last) {
      last = app.frames;
      const w = app.fromDesk(f.group.position.clone());
      const tr = window.__trace;
      if (tr.modes[tr.modes.length - 1] !== f.mode) tr.modes.push(f.mode);
      if (f.mode === 'idle' && !f.constructor.overDesk(f.group.position) && tr.restY === null) {
        tr.restY = w.y;
        tr.rest = w.toArray().map((v) => +v.toFixed(2));
      }
    }
    if (window.__trace.modes.length < 40) setTimeout(tick, 1);
  };
  tick();
  f.group.position.set(0.3, 0.1, -0.1);
  f.launch(f.velocity.set(0.9, 0.1, -0.05).clone());
});
for (let i = 0; i < 60; i++) {
  await sleep(250);
  const s = await plane();
  const tr = await page.evaluate(() => window.__trace);
  if (s.onDesk && s.mode === 'idle' && tr.restY !== null) break;
}
r = { tr: await page.evaluate(() => window.__trace), end: await plane() };
console.log('     sofa trace', JSON.stringify({ modes: r.tr.modes, rest: r.tr.rest, startedFalling: r.tr.wallAt }));
check(r.tr.restY !== null && Math.abs(r.tr.restY - 0.45) < 0.03, `sofa: rested on the sofa seat (y ${r.tr.restY?.toFixed(3)})`);
check(r.end.onDesk && r.end.mode === 'idle', 'sofa: flew home to the desk');

await close();
console.log(ok ? '\nall passed' : '\nFAILED');
process.exitCode = ok ? 0 : 1;
