// Field-of-view check for Meta VR Glasses (37° left/right, 25° up, 43° down):
// with the head tilted down at the desk, report how far each key object
// extends from the view centre at the story's main beats.
import { launch, sleep } from './harness.mjs';
const PITCH = Number(process.env.PITCH ?? -25);
const BOUNDS = { left: 37, right: 37, up: 25, down: 43 };
const checks = [
  { scene: 'story:0', wait: 9000, label: 'prologue (mat + closed book far)' },
  { scene: 'story:1', wait: 9000, label: 'river intro (book far, mat)' },
  { scene: 'story:1', beat: 'place', label: 'boat waiting to be placed (book near)' },
];
for (const c of checks) {
  const { page, close } = await launch(`emulate=glasses&autostart=ar&scene=${c.scene}&ts=3`, { width: 320, height: 240 });
  await sleep(800);
  await page.evaluate((p) => {
    const d = window.__xrdevice;
    const a = (p * Math.PI) / 180;
    d.quaternion.set(Math.sin(a / 2), 0, 0, Math.cos(a / 2));
  }, PITCH);
  if (c.beat) {
    for (let i = 0; i < 400; i++) {
      const b = await page.evaluate(() => window.__app.scene.debugState?.().beat);
      if (b === 'fold') await page.evaluate(() => window.__app.scene.foldController?.skipAll());
      if (b === c.beat) break;
      await sleep(250);
    }
    await sleep(1500);
  } else await sleep(c.wait);
  const rows = await page.evaluate(() => {
    const app = window.__app;
    const cam = app.world.camera;
    const inv = cam.matrixWorld.clone().invert();
    const Box3 = app.root.position.constructor; // Vector3 constructor
    const ext = (obj) => {
      obj.updateWorldMatrix(true, true);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
      obj.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        let vis = true;
        for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
        if (!vis) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (let i = 0; i < 8; i++) {
          const v = new Box3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          if (v.z >= -0.01) continue;
          const h = (Math.atan2(v.x, -v.z) * 180) / Math.PI;
          const vv = (Math.atan2(v.y, -v.z) * 180) / Math.PI;
          minX = Math.min(minX, h); maxX = Math.max(maxX, h); minY = Math.min(minY, vv); maxY = Math.max(maxY, vv);
          any = true;
        }
      });
      return any ? { left: +(-minX).toFixed(1), right: +maxX.toFixed(1), up: +maxY.toFixed(1), down: +(-minY).toFixed(1) } : null;
    };
    const sc = app.scene;
    const out = {};
    out.mat = ext(app.env.mat);
    if (sc.book) out.book = ext(sc.book.group);
    if (sc.stage?.hint) out.hint = ext(sc.stage.hint.mesh);
    if (sc.stage?.fold) out.sheet = ext(sc.stage.fold.group);
    if (sc.kit) out.kitBubble = ext(sc.kit.bubble.mesh);
    if (sc.pause?.group) out.menuTag = ext(sc.pause.group);
    for (const f of sc.stage?.foldlings ?? []) out[f.def.id] = ext(f.group);
    return out;
  });
  console.log(`\n${c.label} (head pitch ${PITCH}°)`);
  for (const [k, v] of Object.entries(rows)) {
    if (!v) { console.log(`  ${k.padEnd(10)} (not visible)`); continue; }
    const out = Object.entries(BOUNDS).filter(([d, lim]) => v[d] > lim).map(([d]) => d);
    console.log(`  ${k.padEnd(10)} L${v.left} R${v.right} U${v.up} D${v.down}${out.length ? '   OUTSIDE: ' + out.join(',') : ''}`);
  }
  await close();
}
