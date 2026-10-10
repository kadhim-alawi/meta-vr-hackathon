/**
 * The pleated strip of the Fan model, spread open around its handle. The
 * texture is the same paper (creases and all), mapped so each pleat panel
 * becomes a wedge of the fan.
 */
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial } from '@iwsdk/core';
import { ModelDef } from '../fold/model.js';

export interface OpenFan extends Group {
  setOpen(k: number): void;
}

export function buildOpenFan(def: ModelDef, material: MeshLambertMaterial, S: number): OpenFan {
  const panels = 6;
  const w = def.paper.w;
  const h = def.paper.h;
  const r0 = 0.012;
  const r1 = r0 + h * S;
  const depth = 0.006;
  // vertices: for each crease k (0..panels) an inner and outer vertex
  const nCreases = panels + 1;
  const pos = new Float32Array(nCreases * 2 * 3);
  const uv = new Float32Array(nCreases * 2 * 2);
  const idx: number[] = [];
  for (let k = 0; k < nCreases; k++) {
    const u = k / panels;
    uv.set([u, 0], (k * 2) * 2);
    uv.set([u, 1], (k * 2 + 1) * 2);
    if (k < panels) {
      const a = k * 2;
      const b = k * 2 + 1;
      const c = (k + 1) * 2;
      const d = (k + 1) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new Mesh(geo, material);
  mesh.castShadow = true;
  const group = new Group() as OpenFan;
  group.add(mesh);
  // a little handle where the pleats meet
  const setOpen = (k: number) => {
    const spread = (Math.PI * 0.42) * k + 0.04;
    for (let c = 0; c < nCreases; c++) {
      const t = c / panels - 0.5;
      const ang = t * spread * 2;
      const z = (c % 2 ? depth : -depth) * (0.3 + 0.7 * k);
      const sx = Math.sin(ang);
      const cy = Math.cos(ang);
      pos.set([sx * r0, cy * r0, z * 0.2], c * 2 * 3);
      pos.set([sx * r1, cy * r1, z], (c * 2 + 1) * 3);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  };
  setOpen(1);
  group.setOpen = setOpen;
  void w;
  return group;
}
