// Draw calls, triangles and GPU memory per scene (renderer.info), sampled in an
// emulated XR session. Headless frame rate means nothing here; draw calls and
// triangle counts are the numbers that predict Quest performance.
import { launch, sleep } from './harness.mjs';
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['story:0', 'story:1', 'story:2', 'story:3', 'story:4', 'menu', 'free:cup', 'daily'];
const device = process.env.DEVICE ?? 'quest3';
const rows = [];
for (const scene of scenes) {
  const { page, close } = await launch(`emulate=${device}&autostart=ar&scene=${scene}&ts=3`, { width: 480, height: 360 });
  await sleep(9000);
  const samples = [];
  for (let i = 0; i < 6; i++) {
    samples.push(
      await page.evaluate(() => {
        const r = window.__app.world.renderer;
        return { calls: r.info.render.calls, tris: r.info.render.triangles, geo: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length ?? 0 };
      }),
    );
    await sleep(500);
  }
  const max = (k) => Math.max(...samples.map((s) => s[k]));
  rows.push({ scene, calls: max('calls'), tris: max('tris'), geometries: max('geo'), textures: max('tex'), programs: max('progs') });
  await close();
}
console.table(rows);
