/**
 * Paper tag buttons: poke them with a fingertip, pinch while touching, or
 * point at them and pinch from a distance.
 */
import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial, Ray, Vector3 } from '@iwsdk/core';
import { HandState, HandTracker } from '../xr/hands.js';
import { CardStyle, TextCard, TextLine } from './text.js';
import { damp } from '../core/util.js';

const PRESS_DEPTH = 0.006;
const HOVER_RANGE = 0.05;

export interface ButtonOptions {
  width: number;
  height: number;
  lines: (TextLine | string)[];
  style?: CardStyle;
  color?: string;
  onPress: () => void;
  /** allow point-and-pinch from afar */
  ray?: boolean;
}

export class PokeButton {
  readonly group = new Group();
  private face: TextCard;
  private slab: Mesh;
  private prevZ = new Map<string, number>();
  private push = 0;
  private hover = 0;
  private cooldown = 0;
  enabled = true;
  /** true while any hand hovers (for affordance sounds) */
  hovered = false;
  rayHovered = false;
  private local = new Vector3();
  private inv = new Matrix4();
  private ray = new Ray();
  private hit = new Vector3();
  private normal = new Vector3();
  private planePoint = new Vector3();
  onHover?: () => void;

  constructor(public opts: ButtonOptions) {
    this.face = new TextCard(opts.width, 2600, opts.height);
    this.face.set(opts.lines, {
      bg: opts.color ?? '#fff6e6',
      radius: 0.18,
      border: 'rgba(120,80,40,0.25)',
      ...opts.style,
    });
    this.face.mesh.position.z = 0.004;
    this.slab = new Mesh(
      new BoxGeometry(opts.width * 0.96, opts.height * 0.86, 0.006),
      new MeshLambertMaterial({ color: 0xd8c7aa }),
    );
    this.slab.castShadow = true;
    this.group.add(this.slab, this.face.mesh);
  }

  setLines(lines: (TextLine | string)[], style?: CardStyle): void {
    this.face.set(lines, { bg: this.opts.color ?? '#fff6e6', radius: 0.18, border: 'rgba(120,80,40,0.25)', ...style });
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Returns true if pressed this frame. */
  update(tracker: HandTracker, dt: number): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.group.visible || !this.enabled) {
      this.hover = 0;
      this.hovered = false;
      this.applyVisual(dt, 0);
      return false;
    }
    this.group.updateWorldMatrix(true, false);
    this.inv.copy(this.group.matrixWorld).invert();
    const hw = this.opts.width / 2;
    const hh = this.opts.height / 2;
    let pressed = false;
    let maxPush = 0;
    let anyHover = false;
    let anyRay = false;
    for (const h of tracker.hands) {
      if (!h.tracked) {
        this.prevZ.delete(h.side);
        continue;
      }
      this.local.copy(h.indexTip).applyMatrix4(this.inv);
      const inside = Math.abs(this.local.x) < hw + 0.01 && Math.abs(this.local.y) < hh + 0.01;
      const z = this.local.z;
      const prev = this.prevZ.get(h.side);
      if (inside && z < HOVER_RANGE && z > -0.03) {
        anyHover = true;
        maxPush = Math.max(maxPush, Math.min(0.012, Math.max(0, 0.012 - z)));
        // poke: crossed the surface from the front
        if (prev !== undefined && prev > PRESS_DEPTH && z <= PRESS_DEPTH) pressed = true;
        // pinch while touching
        if (h.pinchStarted && z < 0.03 && !h.claimedBy) pressed = true;
      }
      this.prevZ.set(h.side, inside ? z : 1);
      if (this.opts.ray !== false && !anyHover && h.rayValid && this.rayHits(h)) {
        anyRay = true;
        if (h.pinchStarted && !h.claimedBy) pressed = true;
      }
    }
    if (anyHover && !this.hovered) this.onHover?.();
    this.hovered = anyHover;
    this.rayHovered = anyRay;
    this.hover += ((anyHover || anyRay ? 1 : 0) - this.hover) * damp(14, dt);
    this.applyVisual(dt, maxPush);
    if (pressed && this.cooldown === 0) {
      this.cooldown = 0.45;
      this.opts.onPress();
      return true;
    }
    return false;
  }

  private rayHits(h: HandState): boolean {
    this.ray.origin.copy(h.rayOrigin);
    this.ray.direction.copy(h.rayDir);
    this.normal.set(0, 0, 1).transformDirection(this.group.matrixWorld);
    this.planePoint.setFromMatrixPosition(this.group.matrixWorld);
    const denom = this.normal.dot(this.ray.direction);
    if (Math.abs(denom) < 1e-4) return false;
    const t = this.planePoint.clone().sub(this.ray.origin).dot(this.normal) / denom;
    if (t < 0 || t > 3) return false;
    this.hit.copy(this.ray.direction).multiplyScalar(t).add(this.ray.origin).applyMatrix4(this.inv);
    return Math.abs(this.hit.x) < this.opts.width / 2 && Math.abs(this.hit.y) < this.opts.height / 2;
  }

  private applyVisual(dt: number, target: number): void {
    this.push += (target - this.push) * damp(30, dt);
    this.face.mesh.position.z = 0.004 - this.push * 0.5;
    const s = 1 + this.hover * 0.05;
    this.face.mesh.scale.set(this.opts.width * s, this.face.heightM * s, 1);
  }

  dispose(): void {
    this.face.dispose();
    this.slab.geometry.dispose();
  }
}
