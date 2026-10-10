/**
 * A finished origami model that has come alive. The mesh is the actual paper
 * the player folded (creases, colours and all), stood up into a living pose
 * with ink eyes. Foldlings breathe, blink, watch your hand, react to pokes,
 * can be picked up with a pinch, and some can fly.
 */
import { Box3, Euler, Group, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import type { App } from '../app/app.js';
import { clamp, damp, easeOutBack, easeOutCubic, lerp, seededRandom } from '../core/util.js';
import { AliveKind, ModelDef } from '../fold/model.js';
import { PaperState } from '../fold/paper.js';
import { PaperSheet } from '../render/paper-sheet.js';
import { setPaperGlow } from '../render/paper-view.js';
import { disposeObject } from '../render/dispose.js';
import { HandState } from '../xr/hands.js';
import { OpenFan, buildOpenFan } from '../render/fan-mesh.js';

export type FoldlingMode = 'waking' | 'idle' | 'held' | 'flying' | 'falling' | 'moving' | 'scripted';

/** Voice pitch per creature (MIDI) */
const VOICE: Record<string, number> = {
  plane: 79,
  boat: 67,
  cup: 74,
  fan: 77,
  heart: 81,
  dog: 63,
  cat: 82,
  fox: 72,
  whale: 52,
  tulip: 86,
};

/** Euler rotation that stands a flat folded model up in its living pose. */
const POSES: Record<AliveKind, [number, number, number]> = {
  glider: [0, 0, -Math.PI / 2],
  boat: [Math.PI / 2, 0, 0],
  cup: [Math.PI / 2, 0, 0],
  fan: [0, 0, 0],
  heart: [Math.PI / 2, 0, 0],
  hopper: [Math.PI / 2, 0, 0],
  swimmer: [Math.PI / 2, 0, 0],
  flower: [Math.PI / 2, 0, 0],
  waddler: [Math.PI / 2, 0, 0],
  face: [Math.PI / 2, 0, 0],
};

export interface Surface {
  /** desk-local rectangle (x0,z0)-(x1,z1) at height y */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}

export class Foldling {
  readonly group = new Group();
  /** pose rotation + idle motion */
  readonly body = new Group();
  private offset = new Group();
  readonly kind: AliveKind;
  mode: FoldlingMode = 'waking';
  /** half extents of the living pose bounding box */
  readonly size = new Vector3();
  name: string;
  private t = 0;
  private wakeT = 0;
  private blinkT = 2;
  private hopT = -1;
  private hopH = 0;
  private lookYaw = 0;
  private rnd = seededRandom(Math.floor(Math.random() * 1e6));
  holder: HandState | null = null;
  private holdOffset = new Vector3();
  private holdQ = new Quaternion();
  private handQ0 = new Quaternion();
  private q0 = new Quaternion();
  readonly velocity = new Vector3();
  /** desk-space velocity at the last release (debug) */
  readonly lastRelease = new Vector3();
  private moveFrom = new Vector3();
  private moveTo = new Vector3();
  private moveT = 0;
  private moveDur = 1;
  private moveArc = 0;
  private moveDone: (() => void) | null = null;
  /** when false the player can't pick it up */
  grabbable = true;
  /** called when released by the player (desk-local velocity) */
  onRelease: ((vel: Vector3) => void) | null = null;
  onGrab: (() => void) | null = null;
  onPoke: (() => void) | null = null;
  /** extra spin about Y for scripted facing */
  facing = 0;
  private faceGoal = 0;
  /** idle animation strength (0 while doing tricks) */
  liveliness = 1;
  /** desk-local surfaces it can land on */
  surfaces: Surface[] = [];
  private pokeCool = 0;
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private m = new Matrix4();
  /** extra per-kind animation hook */
  animate: ((dt: number, t: number) => void) | null = null;
  readonly sheet: PaperSheet;
  /** the open-fan mesh replaces the pleated stack */
  private fanOpen = 0;

  constructor(
    private app: App,
    readonly def: ModelDef,
    state: PaperState,
    sheet: PaperSheet,
  ) {
    this.sheet = sheet;
    this.kind = def.alive;
    this.name = def.name;
    sheet.view.rebuild(state);
    this.group.add(this.body);
    this.body.add(this.offset);
    if (this.kind === 'fan') {
      this.fanMesh = buildOpenFan(def, sheet.material, sheet.S);
      this.offset.add(this.fanMesh);
    } else {
      this.offset.add(sheet.view.group);
    }
    const pose = def.pose ?? POSES[this.kind];
    this.body.rotation.set(pose[0], pose[1], pose[2]);
    this.centre();
    this.fanMesh?.setOpen(0);
  }

  private fanMesh: OpenFan | null = null;

  /** Centre the mesh so the creature's pivot sits at its feet. */
  private centre(): void {
    this.offset.position.set(0, 0, 0);
    this.body.updateMatrixWorld(true);
    const box = new Box3();
    const inv = new Matrix4().copy(this.group.matrixWorld).invert();
    this.body.traverse((o) => {
      const mesh = o as unknown as { geometry?: { boundingBox: Box3 | null; computeBoundingBox(): void } };
      if (!mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!.clone();
      b.applyMatrix4(this.m.multiplyMatrices(inv, o.matrixWorld));
      box.union(b);
    });
    const c = box.getCenter(new Vector3());
    box.getSize(this.size).multiplyScalar(0.5);
    // shift in body space: convert the group-space correction back through the pose rotation
    const corr = new Vector3(-c.x, -box.min.y, -c.z);
    const qInv = this.body.quaternion.clone().invert();
    this.offset.position.copy(corr.applyQuaternion(qInv));
  }

  /** current uniform scale (creatures shrink to storybook size when alive) */
  get s(): number {
    return this.group.scale.x;
  }

  get radius(): number {
    return Math.max(this.size.x, this.size.y, this.size.z) * this.s;
  }

  /** scale the creature eases to once awake */
  scaleGoal = 1;

  /** world-ish centre of the body (desk-local) */
  centreLocal(out: Vector3): Vector3 {
    // no scratch vectors here: callers pass this.tmp as `out`
    out.copy(this.group.position);
    out.y += this.size.y * this.s + this.body.position.y * this.s;
    return out;
  }

  /** The waking sequence: glow, ink eyes, hop up into pose. */
  wake(): void {
    this.mode = 'waking';
    this.wakeT = 0;
    this.body.scale.setScalar(1);
    this.app.audio.alive(this.app.fromDesk(this.group.position));
  }

  /** Skip the waking show (Foldlings restored from a save). */
  awaken(): void {
    this.mode = 'idle';
    this.scaleGoal = this.def.aliveScale ?? 1;
    this.group.scale.setScalar(this.scaleGoal);
    this.sheet.drawFace();
    this.fanOpen = 1;
    this.fanMesh?.setOpen(1);
    setPaperGlow(this.sheet.material, 0);
  }

  private finishWake(): void {
    this.mode = 'idle';
    this.scaleGoal = this.def.aliveScale ?? 1;
    setPaperGlow(this.sheet.material, 0);
    this.app.audio.chirp(this.app.fromDesk(this.group.position), VOICE[this.def.id] ?? 74, 3, 'happy');
  }

  chirp(mood: 'happy' | 'curious' | 'sad' = 'happy', syll = 2): void {
    this.app.audio.chirp(this.app.fromDesk(this.group.position), VOICE[this.def.id] ?? 74, syll, mood);
  }

  hop(height = 0.03): void {
    this.hopT = 0;
    this.hopH = height;
  }

  /** Face a desk-local point (yaw only). */
  faceTowards(p: Vector3): void {
    this.faceGoal = Math.atan2(p.x - this.group.position.x, p.z - this.group.position.z);
  }

  /** Hop/glide to a desk-local position. */
  moveToPos(to: Vector3, dur = 0.8, arc = 0.05): Promise<void> {
    // the story can move a creature the player is holding: let go first
    if (this.holder) {
      if (this.holder.claimedBy === this) this.holder.claimedBy = null;
      this.holder = null;
    }
    this.mode = 'moving';
    this.moveFrom.copy(this.group.position);
    this.moveTo.copy(to);
    this.moveT = 0;
    this.moveDur = dur;
    this.moveArc = arc;
    return new Promise((res) => {
      this.moveDone = res;
    });
  }

  /** Throw/launch with a desk-local velocity. */
  launch(vel: Vector3): void {
    this.mode = this.kind === 'glider' ? 'flying' : 'falling';
    this.velocity.copy(vel);
  }

  update(dt: number, t: number): void {
    this.t += dt;
    this.pokeCool = Math.max(0, this.pokeCool - dt);
    if (this.mode !== 'waking' && Math.abs(this.s - this.scaleGoal) > 1e-4) {
      this.group.scale.setScalar(this.s + (this.scaleGoal - this.s) * damp(5, dt));
    }
    switch (this.mode) {
      case 'waking':
        this.updateWake(dt);
        break;
      case 'held':
        this.updateHeld(dt);
        break;
      case 'flying':
        this.updateFlight(dt);
        break;
      case 'falling':
        this.updateFall(dt);
        break;
      case 'moving':
        this.updateMove(dt);
        break;
    }
    if (this.mode !== 'held' && this.mode !== 'flying') this.updateIdle(dt);
    if (this.mode === 'idle' || this.mode === 'scripted') this.checkInteractions();
    this.animate?.(dt, t);
  }

  private updateWake(dt: number): void {
    this.wakeT += dt;
    const w = this.wakeT;
    // 0–0.8 s glow builds, eyes ink at 0.8 s, then a happy hop
    setPaperGlow(this.sheet.material, Math.sin(Math.min(1, w / 1.4) * Math.PI) * 0.55);
    if (w > 0.8 && w - dt <= 0.8) {
      this.sheet.drawFace();
      this.app.sparkles.burst(this.app.fromDesk(this.centreLocal(this.tmp)), 26, undefined, 0.3, 0.014);
    }
    const s = w < 0.8 ? 1 + Math.sin(w * 30) * 0.015 * (w / 0.8) : 1;
    this.body.scale.setScalar(s);
    if (w > 0.9 && w - dt <= 0.9) this.hop(0.05);
    if (this.kind === 'fan') {
      this.fanOpen = easeOutBack(clamp((w - 0.6) / 0.8, 0, 1));
      this.fanMesh?.setOpen(this.fanOpen);
    }
    if (w > 1.6) this.finishWake();
  }

  private updateIdle(dt: number): void {
    const L = this.liveliness;
    // breathing
    const breathe = 1 + Math.sin(this.t * 2.4) * 0.025 * L;
    this.body.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
    // hop
    let y = 0;
    if (this.hopT >= 0) {
      this.hopT += dt;
      const d = 0.45;
      const k = this.hopT / d;
      y = Math.sin(Math.min(1, k) * Math.PI) * this.hopH;
      if (k >= 1) this.hopT = -1;
    }
    // gentle sway & look at the nearest hand
    const h = this.nearestHand();
    if (h && L > 0) {
      this.app.toDesk(h.palm, this.tmp);
      const goal = Math.atan2(this.tmp.x - this.group.position.x, this.tmp.z - this.group.position.z);
      this.lookYaw += angleDelta(this.lookYaw, goal) * damp(3, dt);
    } else {
      this.lookYaw += angleDelta(this.lookYaw, this.faceGoal) * damp(3, dt);
    }
    this.facing += angleDelta(this.facing, this.faceGoal) * damp(4, dt);
    const sway = Math.sin(this.t * 1.3) * 0.08 * L;
    const yaw = this.kind === 'glider' ? this.facing : lerp(this.facing, this.lookYaw, 0.45 * L) + sway;
    this.group.rotation.set(0, yaw, 0);
    this.body.position.y = y;
    this.body.position.x = 0;
    this.personality(dt, L);
    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      const b = clamp(1 - Math.abs(this.blinkT + 0.08) / 0.08, 0, 1);
      this.sheet.setBlink(b);
      if (this.blinkT < -0.16) {
        this.sheet.setBlink(0);
        this.blinkT = 2 + this.rnd() * 3;
      }
    }
  }

  /** Per-creature flavour on top of the shared idle motion. */
  private personality(dt: number, L: number): void {
    const t = this.t;
    switch (this.kind) {
      case 'heart': {
        this.body.position.y += 0.015 + Math.sin(t * 2) * 0.006;
        const beat = Math.pow(Math.max(0, Math.sin(t * 6)), 8) * 0.07;
        this.body.scale.multiplyScalar(1 + beat);
        break;
      }
      case 'face':
        // puppet-like head tilts
        this.group.rotation.z = Math.sin(t * 1.7) * 0.12 * L;
        break;
      case 'flower':
        this.group.rotation.z = Math.sin(t * 1.1) * 0.1 * L;
        break;
      case 'swimmer': {
        // floats and bobs; now and then a little spout
        this.body.position.y += 0.02 + Math.sin(t * 1.6) * 0.008;
        this.group.rotation.z = Math.sin(t * 1.6 + 0.6) * 0.08 * L;
        this.spoutT -= dt;
        if (this.spoutT < 0) {
          this.spoutT = 4 + this.rnd() * 4;
          const top = this.app.fromDesk(this.centreLocal(this.tmp).add(this.tmp2.set(0, this.size.y * 1.2 * this.s, 0)));
          this.app.sparkles.droplets(top, new Vector3(0, 0.55, 0), 10);
          this.app.audio.splash(top);
        }
        break;
      }
      case 'boat':
        this.group.rotation.z = Math.sin(t * 1.9) * 0.05 * L;
        break;
    }
  }
  private spoutT = 3;

  private nearestHand(): HandState | null {
    let best: HandState | null = null;
    let bd = 0.45;
    for (const h of this.app.hands.hands) {
      if (!h.tracked) continue;
      this.app.toDesk(h.palm, this.tmp2);
      const d = this.tmp2.distanceTo(this.group.position);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  /** Pinch to pick up; poke to tickle. */
  private checkInteractions(): void {
    for (const h of this.app.hands.hands) {
      if (!h.tracked) continue;
      const c = this.centreLocal(this.tmp);
      if (this.grabbable && h.freshPinch) {
        this.app.toDesk(h.pinchPoint, this.tmp2);
        if (this.tmp2.distanceTo(c) < this.radius + 0.035) {
          this.grab(h);
          return;
        }
      }
      if (h.source === 'hand' && this.pokeCool === 0) {
        this.app.toDesk(h.indexTip, this.tmp2);
        if (this.tmp2.distanceTo(c) < this.radius * 0.8 && h.velocity.length() > 0.12) {
          this.pokeCool = 1.2;
          this.hop(0.035);
          this.chirp('happy', 3);
          this.app.sparkles.burst(this.app.fromDesk(c), 8, undefined, 0.15, 0.008);
          this.onPoke?.();
        }
      }
    }
  }

  grab(h: HandState): void {
    this.holder = h;
    h.claimedBy = this;
    this.mode = 'held';
    this.app.toDesk(h.pinchPoint, this.tmp2);
    this.holdOffset.copy(this.group.position).sub(this.tmp2);
    this.handQ0.copy(this.deskQuat(h.orientation));
    this.q0.copy(this.group.quaternion);
    // remember offset in the hand's frame so rotating the hand swings the creature
    this.holdOffset.applyQuaternion(this.handQ0.clone().invert());
    this.holdQ.copy(this.handQ0).invert().multiply(this.q0);
    this.chirp('curious', 1);
    this.app.audio.rustle(this.app.fromDesk(this.group.position), 0.5);
    this.onGrab?.();
  }

  /** Hand orientation expressed in desk space. */
  private deskQuat(q: Quaternion): Quaternion {
    const dq = new Quaternion();
    this.app.desk.group.getWorldQuaternion(dq);
    return dq.invert().multiply(q);
  }

  private updateHeld(dt: number): void {
    const h = this.holder;
    if (!h || !h.tracked || !h.pinching) {
      this.release();
      return;
    }
    const hq = this.deskQuat(h.orientation);
    this.app.toDesk(h.pinchPoint, this.tmp2);
    this.tmp.copy(this.holdOffset).applyQuaternion(hq);
    this.group.position.copy(this.tmp2).add(this.tmp);
    this.group.quaternion.copy(hq).multiply(this.holdQ);
    this.body.position.y = 0;
    this.body.scale.setScalar(1.03);
    void dt;
  }

  release(): void {
    const h = this.holder;
    this.holder = null;
    if (h && h.claimedBy === this) h.claimedBy = null;
    const v = new Vector3();
    if (h) {
      h.throwVelocity(v, this.app.time);
      // world → desk direction
      const dq = new Quaternion();
      this.app.desk.group.getWorldQuaternion(dq);
      v.applyQuaternion(dq.invert());
    }
    // keep yaw only when put down
    const e = new Euler().setFromQuaternion(this.group.quaternion, 'YXZ');
    this.facing = this.faceGoal = e.y;
    // a tossed plane glides; everything else (and a plane set down) drops
    this.mode = this.kind === 'glider' && v.lengthSq() > 0.25 ? 'flying' : 'falling';
    this.velocity.copy(v);
    this.lastRelease.copy(v);
    if (this.onRelease) this.onRelease(v);
  }

  private updateFall(dt: number): void {
    this.velocity.y -= 2.2 * dt;
    this.velocity.x *= Math.exp(-3 * dt);
    this.velocity.z *= Math.exp(-3 * dt);
    this.group.position.addScaledVector(this.velocity, dt);
    // settle upright
    const e = new Euler().setFromQuaternion(this.group.quaternion, 'YXZ');
    e.x *= Math.exp(-10 * dt);
    e.z *= Math.exp(-10 * dt);
    this.group.quaternion.setFromEuler(e);
    const ground = this.groundAt(this.group.position);
    if (this.group.position.y <= ground) {
      this.group.position.y = ground;
      this.velocity.set(0, 0, 0);
      this.group.rotation.set(0, e.y, 0);
      this.mode = 'idle';
      this.app.audio.rustle(this.app.fromDesk(this.group.position), 0.35);
      this.hop(0.012);
      this.stayOnDesk();
    }
  }

  /** Desk area creatures may roam (desk-local x/z). */
  static readonly BOUNDS = { x0: -0.5, x1: 0.5, z0: -0.62, z1: 0.3 };

  /** Dropped or flown off the desk? Hop back on. */
  stayOnDesk(): void {
    const b = Foldling.BOUNDS;
    const p = this.group.position;
    if (p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1) return;
    const back = new Vector3(clamp(p.x, b.x0 + 0.08, b.x1 - 0.08), 0, clamp(p.z, b.z0 + 0.1, b.z1 - 0.05));
    back.y = this.groundAt(back);
    this.chirp('curious', 2);
    void this.moveToPos(back, 0.9, 0.12);
  }

  /** Height of the highest surface under a desk-local point (0 = desk). */
  groundAt(p: Vector3): number {
    let y = 0;
    for (const s of this.surfaces) {
      if (p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1) y = Math.max(y, s.y);
    }
    return y;
  }

  // ---- flight (paper plane) ----------------------------------------------------

  /** Optional homing target for a thrown plane (desk-local). */
  homeTarget: Vector3 | null = null;
  onLand: ((hitTarget: boolean) => void) | null = null;

  /** Curved flight from the throw into a target (story beats must land). */
  private path: { p0: Vector3; p1: Vector3; p2: Vector3; t: number; dur: number } | null = null;

  /** Launch along a curve that starts in the throw direction and ends at `target`. */
  flyTo(target: Vector3, throwVel: Vector3): void {
    const p0 = this.group.position.clone();
    const dir = throwVel.clone();
    if (dir.lengthSq() < 1e-4) dir.set(0, 0.3, -1);
    dir.normalize();
    const dist = p0.distanceTo(target);
    const p1 = p0.clone().addScaledVector(dir, dist * 0.55);
    p1.y = Math.max(p1.y, Math.max(p0.y, target.y) + 0.12);
    this.path = { p0, p1, p2: target.clone(), t: 0, dur: clamp(dist / 1.0, 0.5, 1.6) };
    this.mode = 'flying';
  }

  private updatePath(dt: number): void {
    const P = this.path!;
    P.t = Math.min(1, P.t + dt / P.dur);
    const t = P.t;
    const u = 1 - t;
    // quadratic Bézier position and tangent
    this.prevPos.copy(this.group.position);
    this.group.position
      .copy(P.p0)
      .multiplyScalar(u * u)
      .addScaledVector(P.p1, 2 * u * t)
      .addScaledVector(P.p2, t * t);
    this.velocity.subVectors(this.group.position, this.prevPos).divideScalar(Math.max(dt, 1e-4));
    const v = this.velocity;
    if (v.lengthSq() > 1e-6) {
      const yaw = Math.atan2(-v.x, -v.z);
      const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
      const bank = clamp(-angleDelta(this.facing, yaw) * 4, -0.6, 0.6);
      this.facing = yaw;
      this.group.rotation.set(pitch, yaw, bank, 'YXZ');
    }
    if (t >= 1) {
      this.path = null;
      this.mode = 'scripted';
      this.onLand?.(true);
    }
  }

  private updateFlight(dt: number): void {
    if (this.path) {
      this.updatePath(dt);
      return;
    }
    // sub-step so fast throws (or slow frames) can't tunnel through the target
    const steps = Math.max(1, Math.ceil(dt / 0.02));
    const h = dt / steps;
    for (let i = 0; i < steps && this.mode === 'flying'; i++) this.flightStep(h);
  }

  private prevPos = new Vector3();
  private seg = new Vector3();

  private flightStep(dt: number): void {
    const v = this.velocity;
    let speed = v.length();
    // simple glider: gravity, lift ∝ speed², drag
    v.y -= 1.2 * dt;
    v.y += Math.min(0.9, speed * speed * 0.35) * dt;
    v.multiplyScalar(Math.exp(-0.25 * dt));
    if (this.homeTarget) {
      // a graceful, visible flight: steer towards the target at a calm speed
      this.tmp.subVectors(this.homeTarget, this.group.position);
      this.tmp.normalize().multiplyScalar(clamp(speed, 0.9, 1.5));
      v.lerp(this.tmp, clamp(damp(3, dt), 0, 1));
      speed = v.length();
    }
    this.prevPos.copy(this.group.position);
    this.group.position.addScaledVector(v, dt);
    if (this.homeTarget) {
      // swept hit test: distance from the target to this step's segment
      this.seg.subVectors(this.group.position, this.prevPos);
      const l2 = this.seg.lengthSq();
      const t = l2 > 0 ? clamp(this.tmp.subVectors(this.homeTarget, this.prevPos).dot(this.seg) / l2, 0, 1) : 0;
      const closest = this.tmp.copy(this.prevPos).addScaledVector(this.seg, t);
      if (closest.distanceTo(this.homeTarget) < 0.07) {
        this.group.position.copy(closest);
        this.mode = 'scripted';
        this.onLand?.(true);
        return;
      }
    }
    // point the nose along the velocity (nose is −z in the pose)
    if (speed > 0.05) {
      const yaw = Math.atan2(-v.x, -v.z);
      const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
      const bank = clamp(-angleDelta(this.facing, yaw) * 4, -0.6, 0.6);
      this.facing = yaw;
      this.group.rotation.set(pitch, yaw, bank, 'YXZ');
    }
    const ground = this.groundAt(this.group.position);
    if (this.group.position.y <= ground) {
      this.group.position.y = ground;
      this.velocity.set(0, 0, 0);
      this.group.rotation.set(0, this.facing, 0);
      this.mode = 'idle';
      this.app.audio.rustle(this.app.fromDesk(this.group.position), 0.5);
      if (this.onLand) this.onLand(false);
      else this.stayOnDesk();
    }
  }

  private updateMove(dt: number): void {
    this.moveT += dt;
    const k = clamp(this.moveT / this.moveDur, 0, 1);
    const e = easeOutCubic(k);
    this.group.position.lerpVectors(this.moveFrom, this.moveTo, e);
    this.group.position.y += Math.sin(k * Math.PI) * this.moveArc;
    if (k >= 1) {
      this.mode = 'idle';
      const done = this.moveDone;
      this.moveDone = null;
      done?.();
    }
  }

  get openAmount(): number {
    return this.fanOpen;
  }

  dispose(): void {
    if (this.holder && this.holder.claimedBy === this) this.holder.claimedBy = null;
    this.group.removeFromParent();
    if (this.fanMesh) disposeObject(this.fanMesh);
    this.sheet.dispose();
  }
}

export function angleDelta(a: number, b: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return d;
}

export { VOICE };
