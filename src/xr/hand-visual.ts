/**
 * Procedural hands built from instanced spheres and cylinders.
 *
 * In mixed reality they render depth-only: the player's real hands (seen in
 * passthrough) correctly cover the virtual paper they hold. In VR they render
 * as soft paper-white hands. A small ring shows pinch progress.
 */
import {
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { BONES, HandState, HandTracker, J } from './hands.js';

const UP = new Vector3(0, 1, 0);

export class HandVisuals {
  readonly group = new Group();
  private spheres: InstancedMesh;
  private bones: InstancedMesh;
  private rings: Mesh[] = [];
  private occluderMat = new MeshBasicMaterial({ colorWrite: false });
  private skinMat = new MeshLambertMaterial({ color: 0xf4ebe0, emissive: 0x2a1d14 });
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private s = new Vector3();
  private d = new Vector3();
  private mode: 'occlude' | 'visible' = 'visible';

  constructor() {
    this.spheres = new InstancedMesh(new SphereGeometry(1, 10, 8), this.skinMat, 50);
    this.bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 10, 1, true), this.skinMat, BONES.length * 2);
    for (const im of [this.spheres, this.bones]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      this.group.add(im);
    }
    for (let i = 0; i < 2; i++) {
      const ring = new Mesh(
        new RingGeometry(0.75, 1, 28),
        new MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.0, depthWrite: false }),
      );
      ring.renderOrder = 10;
      ring.visible = false;
      this.rings.push(ring);
      this.group.add(ring);
    }
  }

  setMode(mode: 'occlude' | 'visible'): void {
    this.mode = mode;
    const mat = mode === 'occlude' ? this.occluderMat : this.skinMat;
    this.spheres.material = mat;
    this.bones.material = mat;
    // Occluders must be drawn before the paper so they mask it.
    this.spheres.renderOrder = this.bones.renderOrder = mode === 'occlude' ? -10 : 0;
    this.spheres.castShadow = this.bones.castShadow = mode === 'visible';
  }

  update(tracker: HandTracker, camPos: Vector3, highlight: (h: HandState) => boolean): void {
    let si = 0;
    let bi = 0;
    tracker.hands.forEach((h, hi) => {
      const ring = this.rings[hi];
      if (h.source !== 'hand') {
        ring.visible = false;
        return;
      }
      const scale = this.mode === 'occlude' ? 1.12 : 1.0;
      for (let j = 0; j < 25; j++) {
        const r = Math.max(0.006, h.radii[j]) * scale;
        this.m.compose(h.joints[j], this.q.identity(), this.s.set(r, r, r));
        this.spheres.setMatrixAt(si++, this.m);
      }
      for (const [a, b] of BONES) {
        const pa = h.joints[a];
        const pb = h.joints[b];
        this.d.subVectors(pb, pa);
        const len = this.d.length();
        if (len < 1e-4) continue;
        const r = Math.max(0.0055, Math.min(h.radii[a], h.radii[b])) * scale;
        this.p.addVectors(pa, pb).multiplyScalar(0.5);
        this.q.setFromUnitVectors(UP, this.d.multiplyScalar(1 / len));
        this.m.compose(this.p, this.q, this.s.set(r, len, r));
        this.bones.setMatrixAt(bi++, this.m);
      }
      // Pinch ring: shrinks as the fingers close, glows on contact.
      const show = h.pinchStrength > 0.15 || highlight(h);
      ring.visible = show;
      if (show) {
        const rr = 0.006 + 0.016 * (1 - h.pinchStrength);
        ring.position.copy(h.pinchPoint);
        ring.lookAt(camPos);
        ring.scale.setScalar(rr);
        const mat = ring.material as MeshBasicMaterial;
        mat.opacity = h.pinching ? 0.95 : 0.25 + 0.5 * h.pinchStrength;
        mat.color.setHex(highlight(h) ? 0x8fffd0 : h.pinching ? 0xffffff : 0xffd27a);
      }
      void J;
    });
    this.spheres.count = si;
    this.bones.count = bi;
    this.spheres.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }
}
