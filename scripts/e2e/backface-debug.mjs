import { launch, frames, sleep } from './harness.mjs';
const { page, close, logs } = await launch('emulate=quest3&autostart=vr&scene=lab&model=boat');
await sleep(1500);
const r = await page.evaluate(() => {
  const f = window.__app.scene.fold;
  const m = f.sheet.view.staticMesh;
  const mat = m.material;
  const pos = m.geometry.getAttribute('position');
  const nrm = m.geometry.getAttribute('normal');
  const box = []; for (let i = 0; i < Math.min(pos.count, 6); i++) box.push([pos.getX(i).toFixed(3), pos.getY(i).toFixed(4), pos.getZ(i).toFixed(3), nrm.getY(i)]);
  return { verts: pos.count, visible: m.visible, side: mat.side, sample: box, worldY: m.getWorldPosition(new m.position.constructor()).toArray(), parentVisible: m.parent.visible };
});
console.log(JSON.stringify(r));
console.log(logs.filter(l=>/error|warn/i.test(l)).slice(0,10).join('\n'));
await close();
