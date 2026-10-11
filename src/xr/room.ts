/**
 * The player's real room as WebXR plane detection reports it: tables, sofas,
 * shelves, the floor and the walls, in world space. Foldlings use it in mixed
 * reality so a tossed paper plane bumps into your real walls and lands on
 * your real furniture instead of flying through them.
 */
import { Matrix4, Vector3 } from '@iwsdk/core';

export interface RoomPlane {
  /** plane space → world; plane space has its normal along +y */
  world: Matrix4;
  inv: Matrix4;
  /** polygon in plane space as x0, z0, x1, z1, … */
  poly: number[];
  vertical: boolean;
  label: string;
}

export class Room {
  planes: RoomPlane[] = [];
  private next = 0;
  private a = new Vector3();
  private b = new Vector3();

  /** Refresh from the frame's detected planes (twice a second is plenty). */
  update(frame: XRFrame, ref: XRReferenceSpace, rig: Matrix4, time: number): void {
    if (time < this.next) return;
    this.next = time + 0.5;
    const set = (frame as XRFrame & { detectedPlanes?: Set<XRPlane> }).detectedPlanes;
    this.planes.length = 0;
    if (!set) return;
    for (const p of set) {
      const pose = frame.getPose(p.planeSpace, ref);
      if (!pose || p.polygon.length < 3) continue;
      const world = new Matrix4().fromArray(pose.transform.matrix).premultiply(rig);
      const poly: number[] = [];
      for (const pt of p.polygon) poly.push(pt.x, pt.z);
      this.planes.push({
        world,
        inv: world.clone().invert(),
        poly,
        vertical: p.orientation === 'vertical',
        label: (p as XRPlane & { semanticLabel?: string }).semanticLabel ?? '',
      });
    }
  }

  clear(): void {
    this.planes.length = 0;
    this.next = 0;
  }

  /** World height of the highest horizontal surface under `p` that is no higher than `maxY`. */
  surfaceBelow(p: Vector3, maxY: number): number | null {
    let best: number | null = null;
    for (const pl of this.planes) {
      if (pl.vertical) continue;
      this.a.copy(p).applyMatrix4(pl.inv);
      if (!inPolygon(pl.poly, this.a.x, this.a.z)) continue;
      const y = this.b.setFromMatrixPosition(pl.world).y;
      if (y > maxY) continue;
      if (best === null || y > best) best = y;
    }
    return best;
  }

  /**
   * First wall crossed going from `from` to `to` (world). Writes the crossing
   * point and the wall normal pointing back towards `from`.
   */
  wallHit(from: Vector3, to: Vector3, hit: Vector3, normal: Vector3): boolean {
    let bestT = Infinity;
    for (const pl of this.planes) {
      if (!pl.vertical) continue;
      this.a.copy(from).applyMatrix4(pl.inv);
      this.b.copy(to).applyMatrix4(pl.inv);
      const ya = this.a.y;
      const yb = this.b.y;
      if (ya === yb || (ya > 0) === (yb > 0)) continue;
      const t = ya / (ya - yb);
      if (t >= bestT) continue;
      const x = this.a.x + (this.b.x - this.a.x) * t;
      const z = this.a.z + (this.b.z - this.a.z) * t;
      if (!inPolygon(pl.poly, x, z)) continue;
      bestT = t;
      hit.lerpVectors(from, to, t);
      normal.set(0, 1, 0).transformDirection(pl.world);
      if (ya < 0) normal.negate();
    }
    return bestT !== Infinity;
  }
}

/** Even-odd point-in-polygon test on a flat x, z list. */
export function inPolygon(poly: number[], x: number, z: number): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const zi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const zj = poly[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
