import { BufferAttribute, BufferGeometry } from '@iwsdk/core';

/**
 * Merge geometries (already transformed into a common space) into one, so a
 * scatter of static decorations costs a single draw call. Inputs are
 * disposed.
 */
export function mergeGeometries(input: BufferGeometry[]): BufferGeometry {
  const geos = input.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    if (!geos.every((g) => g.getAttribute(name))) continue;
    const itemSize = geos[0].getAttribute(name).itemSize;
    let len = 0;
    for (const g of geos) len += g.getAttribute(name).count * itemSize;
    const arr = new Float32Array(len);
    let off = 0;
    for (const g of geos) {
      const a = g.getAttribute(name);
      for (let i = 0; i < a.count; i++) {
        for (let k = 0; k < itemSize; k++) arr[off++] = a.getComponent(i, k);
      }
    }
    out.setAttribute(name, new BufferAttribute(arr, itemSize));
  }
  out.computeBoundingSphere();
  for (const g of input) g.dispose();
  for (const g of geos) g.dispose();
  return out;
}
