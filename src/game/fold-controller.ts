/**
 * Interactive folding of one sheet, step by step.
 *
 * The player pinches the glowing handle and moves their hand; the flap's
 * angle is the angle of the hand around the crease axis, so lifting over the
 * crease or simply dragging across both work. Releasing past ~55% completes
 * the fold with a snap; otherwise the paper springs back.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { AudioEngine, Loop } from '../audio/audio.js';
import { Emitter } from '../core/events.js';
import { clamp, damp, easeInOutCubic, easeOutBack, spring } from '../core/util.js';
import { Vec2, apply, reflectPoint } from '../fold/geom.js';
import { FoldStep, ModelDef, commitStep, grabPoint, initialState, planStep } from '../fold/model.js';
import { FoldPlan, PaperState } from '../fold/paper.js';
import { PaperSheet } from '../render/paper-sheet.js';
import { disposeObject } from '../render/dispose.js';
import { HandState, HandTracker } from '../xr/hands.js';
import { Sparkles } from '../render/sparkles.js';

export type FoldPhase = 'intro' | 'ready' | 'drag' | 'settle' | 'revert' | 'auto' | 'flip' | 'done';

export interface FoldEvents extends Record<string, unknown> {
  step: { index: number; step: FoldStep | null; hint: string };
  folded: { index: number; manual: boolean };
  grab: { side: 'left' | 'right' };
  complete: { state: PaperState };
}

const GRAB_RADIUS = 0.05;
const COMPLETE_FRACTION = 0.55;
const ARC_DOTS = 14;

export class FoldController {
  readonly events = new Emitter<FoldEvents>();
  /** sits on the mat; recentred as the model shrinks */
  readonly group = new Group();
  /** animates turn-overs */
  private flipper = new Group();
  readonly sheet: PaperSheet;
  state: PaperState;
  stepIndex = 0;
  phase: FoldPhase = 'intro';
  private plan: FoldPlan | null = null;
  private angle = 0;
  private angleVel = 0;
  private targetAngle = Math.PI;
  private handTarget = 0;
  private holder: HandState | null = null;
  private timer = 0;
  private idle = 0;
  private drag: Loop | null = null;
  private lastAngle = 0;
  // guides
  private handle: Mesh;
  private handleHalo: Mesh;
  private target: Mesh;
  private arc: InstancedMesh;
  private creaseLine: Mesh;
  private ghost: Mesh | null = null;
  private ghostPivot = new Group();
  private ghostMat = new MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.0, depthWrite: false });
  // pivot geometry, display-local
  private axisP = new Vector3();
  private axisD = new Vector3();
  private nIn = new Vector3();
  private uUp = new Vector3();
  private grabLocal = new Vector3();
  private targetLocal = new Vector3();
  private radius = 0.1;
  private recenter = new Vector3();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private q = new Quaternion();
  private idQ = new Quaternion();
  private sv = new Vector3();
  private m = new Matrix4();
  private m2 = new Matrix4();
  private inv = new Matrix4();
  private flipAxis = new Vector3();
  private flipCenter = new Vector3();
  /** set by the owner: whether folding input is accepted */
  inputEnabled = true;
  /** count of folds the player sharpened by running a finger along them */
  crisp = 0;
  private sharpen: { a: Vector3; b: Vector3; t: number; progress: Set<number> } | null = null;

  constructor(
    readonly def: ModelDef,
    readonly S: number,
    private audio: AudioEngine,
    private sparkles: Sparkles,
    seed = 1,
    colors?: { front: string; back: string },
  ) {
    this.state = initialState(def);
    this.sheet = new PaperSheet(def, this.state, S, seed, colors);
    this.group.add(this.flipper);
    this.flipper.add(this.sheet.view.group);

    const glow = (c: number, o = 1) =>
      new MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    this.handle = new Mesh(new SphereGeometry(0.0065, 16, 12), new MeshBasicMaterial({ color: 0xfff1b8, toneMapped: false }));
    this.handleHalo = new Mesh(new CircleGeometry(0.02, 28), glow(0xffd36b, 0.55));
    this.handleHalo.rotation.x = -Math.PI / 2;
    this.handle.add(this.handleHalo);
    this.target = new Mesh(new RingGeometry(0.011, 0.015, 32), glow(0x9fe8ff, 0.8));
    this.target.rotation.x = -Math.PI / 2;
    this.arc = new InstancedMesh(new SphereGeometry(0.0022, 8, 6), glow(0xffe7a3, 0.9), ARC_DOTS);
    this.arc.frustumCulled = false;
    this.creaseLine = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
    this.creaseLine.rotation.x = -Math.PI / 2;
    for (const o of [this.handle, this.target, this.arc, this.creaseLine]) {
      o.renderOrder = 6;
      o.visible = false;
      this.flipper.add(o);
    }
    this.flipper.add(this.ghostPivot);
  }

  get currentStep(): FoldStep | null {
    const s = this.def.steps[this.stepIndex];
    return s && s.kind === 'fold' ? s : null;
  }

  /** Number of folds the player does by hand, and how many are done. */
  get progress(): { done: number; total: number } {
    let total = 0;
    let done = 0;
    this.def.steps.forEach((s, i) => {
      if (s.kind === 'fold' && !s.auto) {
        total++;
        if (i < this.stepIndex) done++;
      }
    });
    return { done, total };
  }

  /** Is this hand currently holding the paper? */
  isHolding(h: HandState): boolean {
    return this.holder === h;
  }

  start(): void {
    this.sheet.redraw();
    this.recenterTarget(true);
    this.setupStep();
  }

  private setupStep(): void {
    this.plan = null;
    this.angle = 0;
    this.angleVel = 0;
    this.idle = 0;
    this.hideGuides();
    const step = this.def.steps[this.stepIndex];
    if (!step) {
      this.phase = 'done';
      this.events.emit('step', { index: this.stepIndex, step: null, hint: '' });
      this.events.emit('complete', { state: this.state });
      return;
    }
    if (step.kind === 'flip') {
      this.beginFlip(step.axis ?? 'y');
      this.events.emit('step', { index: this.stepIndex, step: null, hint: step.hint ?? 'Turn it over.' });
      return;
    }
    this.plan = planStep(this.state, step);
    this.sheet.view.beginFold(this.plan);
    this.targetAngle = step.unfold ? Math.PI * 0.92 : step.angle ?? Math.PI;
    this.computeAxis(step);
    this.events.emit('step', { index: this.stepIndex, step, hint: step.hint });
    if (step.auto || this.autoAll) {
      this.phase = 'auto';
      this.timer = this.autoAll ? -0.1 : -0.35;
      return;
    }
    this.phase = 'ready';
    this.showGuides(step);
  }

  private computeAxis(step: FoldStep): void {
    const v = this.sheet.view;
    this.axisP.copy(v.pivot.position);
    this.axisD.copy(v.axisDir);
    const g = grabPoint(this.state, step);
    this.grabLocal.set(g[0] * this.S, this.axisP.y, -g[1] * this.S);
    // in-plane direction from the crease towards the grabbed point
    this.tmp.subVectors(this.grabLocal, this.axisP);
    this.tmp.addScaledVector(this.axisD, -this.tmp.dot(this.axisD));
    this.radius = Math.max(0.01, this.tmp.length());
    this.nIn.copy(this.tmp).normalize();
    // the direction the grab point moves first when the flap lifts
    this.q.setFromAxisAngle(this.axisD, v.pivotSign * (Math.PI / 2));
    this.uUp.copy(this.nIn).applyQuaternion(this.q);
    const l = this.plan!.line;
    const t: Vec2 = reflectPoint(l, g);
    this.targetLocal.set(t[0] * this.S, this.axisP.y + v.landLift, -t[1] * this.S);
  }

  private showGuides(step: FoldStep): void {
    this.handle.visible = true;
    this.target.visible = !step.angle || step.angle >= Math.PI - 1e-3;
    this.arc.visible = true;
    this.creaseLine.visible = true;
    // crease line across the moving flap
    const segs = this.plan!.creases.map(([a, b]) => {
      const f = this.plan!.state.facetsAtPaper(a)[0];
      return f ? [apply(f.m, a), apply(f.m, b)] : null;
    });
    let lo = Infinity;
    let hi = -Infinity;
    const l = this.plan!.line;
    for (const s of segs) {
      if (!s) continue;
      for (const p of s) {
        const t = (p[0] - l.p[0]) * l.d[0] + (p[1] - l.p[1]) * l.d[1];
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
    if (!isFinite(lo)) {
      lo = -0.3;
      hi = 0.3;
    }
    const c: Vec2 = [l.p[0] + l.d[0] * (lo + hi) * 0.5, l.p[1] + l.d[1] * (lo + hi) * 0.5];
    const len = (hi - lo) * this.S;
    this.creaseLine.position.set(c[0] * this.S, this.axisP.y + this.sheet.view.landLift + 0.0015, -c[1] * this.S);
    this.creaseLine.scale.set(len, 0.0016, 1);
    this.creaseLine.rotation.set(-Math.PI / 2, 0, Math.atan2(l.d[1], l.d[0]));
    this.target.position.copy(this.targetLocal).y += 0.0015;
    this.makeGhost();
  }

  private hideGuides(): void {
    this.handle.visible = false;
    this.target.visible = false;
    this.arc.visible = false;
    this.creaseLine.visible = false;
    if (this.ghost) {
      this.ghostPivot.remove(this.ghost);
      this.ghost = null;
    }
  }

  private makeGhost(): void {
    const mm = this.sheet.view.movingMesh;
    if (!mm) return;
    this.ghost = new Mesh(mm.geometry as BufferGeometry, this.ghostMat);
    this.ghost.renderOrder = 7;
    this.ghostPivot.position.copy(this.sheet.view.pivot.position);
    this.ghostPivot.quaternion.identity();
    this.ghostPivot.add(this.ghost);
    this.ghostMat.opacity = 0;
  }

  /** Where a world-space point is in this controller's (flipper) frame. */
  private toLocal(world: Vector3, out: Vector3): Vector3 {
    this.flipper.updateWorldMatrix(true, false);
    this.inv.copy(this.flipper.matrixWorld).invert();
    return out.copy(world).applyMatrix4(this.inv);
  }

  /** Angle of a local point around the crease, 0 = flat, π = folded over. */
  private angleOf(local: Vector3): number {
    this.tmp.subVectors(local, this.axisP);
    const u = this.tmp.dot(this.nIn);
    const v = this.tmp.dot(this.uUp);
    return Math.atan2(Math.max(v, 0), u);
  }

  update(dt: number, time: number, hands: HandTracker): void {
    this.updateRecenter(dt);
    this.updateSharpen(dt, hands);
    switch (this.phase) {
      case 'ready':
        this.updateReady(dt, time, hands);
        break;
      case 'drag':
        this.updateDrag(dt);
        break;
      case 'settle':
        this.updateSettle(dt);
        break;
      case 'revert':
        this.updateRevert(dt);
        break;
      case 'auto':
        this.updateAuto(dt);
        break;
      case 'flip':
        this.updateFlip(dt);
        break;
    }
    this.updateGuides(time);
  }

  private updateReady(dt: number, time: number, hands: HandTracker): void {
    this.idle += dt;
    this.sheet.view.setFoldAngle(0, 0);
    if (!this.inputEnabled) return;
    for (const h of hands.hands) {
      if (!h.tracked || !h.freshPinch) continue;
      this.toLocal(h.pinchPoint, this.tmp2);
      const near = this.tmp2.distanceTo(this.grabLocal) < GRAB_RADIUS;
      const onFlap = !near && this.pointOnFlap(this.tmp2);
      if (near || onFlap) {
        this.holder = h;
        h.claimedBy = this;
        this.phase = 'drag';
        this.handTarget = 0;
        this.audio.rustle(this.worldOf(this.grabLocal), 0.8);
        this.drag = this.audio.dragLoop(this.worldOf(this.grabLocal));
        this.events.emit('grab', { side: h.side });
        hands.pulse(h.side, 0.3, 20);
        break;
      }
    }
    void time;
  }

  /** Is a local point close above the moving flap? (forgiving secondary grab) */
  private pointOnFlap(local: Vector3): boolean {
    if (!this.plan) return false;
    const h = local.y - this.axisP.y;
    if (h < -0.01 || h > 0.035) return false;
    const fx = local.x / this.S;
    const fy = -local.z / this.S;
    const s = this.plan.state;
    for (const f of s.facets) {
      if (!this.plan.moving.has(f.id)) continue;
      const poly = s.foldedPoly(f);
      if (pointInPoly(poly, [fx, fy])) return true;
    }
    return false;
  }

  private updateDrag(dt: number): void {
    const h = this.holder;
    if (!h || !h.tracked || !h.pinching) {
      this.release();
      return;
    }
    this.toLocal(h.pinchPoint, this.tmp2);
    let a = this.angleOf(this.tmp2);
    // gentle magnet near the end
    if (a > this.targetAngle * 0.88) a = this.targetAngle;
    this.handTarget = clamp(a, 0, this.targetAngle);
    [this.angle, this.angleVel] = spring(this.angle, this.angleVel, this.handTarget, 24, dt);
    this.angle = clamp(this.angle, 0, this.targetAngle);
    const landing = smooth01(this.angle / this.targetAngle);
    this.sheet.view.setFoldAngle(this.angle, landing);
    const speed = Math.abs(this.angle - this.lastAngle) / Math.max(dt, 1e-3);
    this.lastAngle = this.angle;
    this.drag?.set(Math.min(1, speed * 0.25), 0.9 + landing * 0.3);
  }

  private release(): void {
    this.drag?.stop();
    this.drag = null;
    if (this.holder) this.holder.claimedBy = null;
    this.holder = null;
    this.timer = 0;
    if (this.angle >= this.targetAngle * COMPLETE_FRACTION) {
      this.phase = 'settle';
      this.settleFrom = this.angle;
    } else {
      this.phase = 'revert';
      this.audio.rustle(this.worldOf(this.grabLocal), 0.4);
    }
  }

  private settleFrom = 0;

  private updateSettle(dt: number): void {
    this.timer += dt;
    const d = 0.22;
    const t = Math.min(1, this.timer / d);
    this.angle = this.settleFrom + (this.targetAngle - this.settleFrom) * easeOutBack(t, 1.2);
    this.sheet.view.setFoldAngle(Math.min(this.angle, this.targetAngle + 0.06), smooth01(this.angle / this.targetAngle));
    if (t >= 1) this.finishFold(true);
  }

  private updateRevert(dt: number): void {
    [this.angle, this.angleVel] = spring(this.angle, this.angleVel, 0, 16, dt);
    this.sheet.view.setFoldAngle(Math.max(0, this.angle), 0);
    if (this.angle < 0.01) {
      this.angle = 0;
      this.phase = 'ready';
      this.idle = 0;
    }
  }

  private updateAuto(dt: number): void {
    this.timer += dt;
    if (this.timer < 0) return;
    const d = this.autoAll ? 0.5 : 0.75;
    const t = Math.min(1, this.timer / d);
    this.angle = this.targetAngle * easeInOutCubic(t);
    this.sheet.view.setFoldAngle(this.angle, smooth01(t));
    if (this.timer > 0.05 && this.timer - dt <= 0.05) this.audio.rustle(this.worldOf(this.grabLocal), 0.5);
    if (t >= 1) this.finishFold(false);
  }

  private finishFold(manual: boolean): void {
    const step = this.def.steps[this.stepIndex] as FoldStep;
    const plan = this.plan!;
    const unfolding = !!step.unfold;
    const creaseWorld = this.creaseWorld(plan);
    this.state = commitStep(plan, step);
    this.sheet.setState(this.state);
    this.sheet.view.rebuild(this.state);
    this.audio.crease(creaseWorld.mid, manual ? 1 : 0.6);
    this.sparkles.burstLine(creaseWorld.a, creaseWorld.b, manual ? 18 : 8);
    if (manual) this.sharpen = { a: creaseWorld.aLocal, b: creaseWorld.bLocal, t: 0, progress: new Set() };
    this.events.emit('folded', { index: this.stepIndex, manual });
    this.stepIndex++;
    this.recenterTarget(false);
    void unfolding;
    this.setupStep();
  }

  private creaseWorld(plan: FoldPlan): { a: Vector3; b: Vector3; mid: Vector3; aLocal: Vector3; bLocal: Vector3 } {
    let lo = Infinity;
    let hi = -Infinity;
    const l = plan.line;
    for (const [a, b] of plan.creases) {
      const f = plan.state.facetsAtPaper(a)[0];
      if (!f) continue;
      for (const p of [apply(f.m, a), apply(f.m, b)]) {
        const t = (p[0] - l.p[0]) * l.d[0] + (p[1] - l.p[1]) * l.d[1];
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
    if (!isFinite(lo)) {
      lo = -0.2;
      hi = 0.2;
    }
    const y = this.axisP.y + 0.002;
    const aL = new Vector3((l.p[0] + l.d[0] * lo) * this.S, y, -(l.p[1] + l.d[1] * lo) * this.S);
    const bL = new Vector3((l.p[0] + l.d[0] * hi) * this.S, y, -(l.p[1] + l.d[1] * hi) * this.S);
    const a = this.worldOf(aL);
    const b = this.worldOf(bL);
    return { a, b, mid: a.clone().add(b).multiplyScalar(0.5), aLocal: aL, bLocal: bL };
  }

  private worldOf(local: Vector3): Vector3 {
    this.flipper.updateWorldMatrix(true, false);
    return local.clone().applyMatrix4(this.flipper.matrixWorld);
  }

  // ---- turning over --------------------------------------------------------

  private flipAxisName: 'x' | 'y' = 'y';

  private beginFlip(axis: 'x' | 'y'): void {
    this.phase = 'flip';
    this.timer = 0;
    this.flipAxisName = axis;
    const b = this.state.foldedBounds();
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    this.flipCenter.set(cx * this.S, 0, -cy * this.S);
    // folded 'y' axis maps to local −z; 'x' to +x
    this.flipAxis.set(axis === 'y' ? 0 : 1, 0, axis === 'y' ? -1 : 0);
    this.audio.whoosh(this.worldOf(this.flipCenter), 0.6, true);
  }

  private updateFlip(dt: number): void {
    this.timer += dt;
    const d = 0.8;
    const t = Math.min(1, this.timer / d);
    const e = easeInOutCubic(t);
    const lift = Math.sin(Math.PI * t) * 0.07;
    // rotate the sheet about the flip axis through its centre, lifted mid-way
    this.q.setFromAxisAngle(this.flipAxis, Math.PI * e);
    this.m.makeTranslation(this.flipCenter.x, this.flipCenter.y + lift, this.flipCenter.z);
    this.m.multiply(this.m2.makeRotationFromQuaternion(this.q));
    this.m.multiply(this.m2.makeTranslation(-this.flipCenter.x, -this.flipCenter.y, -this.flipCenter.z));
    this.sheet.view.group.matrixAutoUpdate = false;
    this.sheet.view.group.matrix.copy(this.m);
    this.sheet.view.group.matrixWorldNeedsUpdate = true;
    if (t >= 1) {
      this.sheet.view.group.matrix.identity();
      this.sheet.view.group.matrixAutoUpdate = true;
      const n = this.state.clone();
      n.flip(this.flipAxisName);
      this.state = n;
      this.sheet.setState(n);
      this.sheet.view.rebuild(n);
      this.audio.thump(this.worldOf(this.flipCenter), 0.25);
      this.stepIndex++;
      this.recenterTarget(false);
      this.setupStep();
    }
  }

  // ---- recentring ------------------------------------------------------------

  private recenterGoal = new Vector3();

  private recenterTarget(immediate: boolean): void {
    const b = this.state.foldedBounds();
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    this.recenterGoal.set(-cx * this.S, 0, cy * this.S);
    if (immediate) this.recenter.copy(this.recenterGoal);
  }

  private updateRecenter(dt: number): void {
    // Don't slide the paper while it is being held.
    if (this.phase === 'drag') return;
    this.recenter.lerp(this.recenterGoal, damp(4, dt));
    this.flipper.position.copy(this.recenter);
  }

  // ---- guides ------------------------------------------------------------------

  private updateGuides(time: number): void {
    const show = this.phase === 'ready' || this.phase === 'drag';
    const step = this.currentStep;
    if (!show || !step || step.auto || this.autoAll) {
      this.hideGuides();
      return;
    }
    // The handle rides on the flap.
    this.tmp.subVectors(this.grabLocal, this.axisP);
    this.q.setFromAxisAngle(this.axisD, this.sheet.view.pivotSign * this.angle);
    this.handle.position.copy(this.tmp).applyQuaternion(this.q).add(this.axisP);
    this.handle.position.y += 0.003;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    this.handleHalo.scale.setScalar(this.phase === 'drag' ? 0.6 : 0.85 + pulse * 0.35);
    (this.handleHalo.material as MeshBasicMaterial).opacity = this.phase === 'drag' ? 0.35 : 0.35 + pulse * 0.35;
    // Target ring brightens when releasing would complete the fold.
    const ready = this.angle >= this.targetAngle * COMPLETE_FRACTION;
    const tm = this.target.material as MeshBasicMaterial;
    tm.color.set(ready ? 0x8dffc1 : 0x9fe8ff);
    this.target.scale.setScalar(ready ? 1.25 : 1 + pulse * 0.1);
    // Arc of dots from handle over the crease to the target; dots flow along it.
    const flow = (time * 0.6) % 1;
    const end = this.targetAngle;
    for (let i = 0; i < ARC_DOTS; i++) {
      const f = ((i + flow) / ARC_DOTS) % 1;
      const a = f * end;
      this.q.setFromAxisAngle(this.axisD, this.sheet.view.pivotSign * a);
      this.tmp2.copy(this.tmp).applyQuaternion(this.q).add(this.axisP);
      this.tmp2.y += 0.003;
      const s = Math.sin(f * Math.PI) * (this.phase === 'drag' ? 0.5 : 1);
      this.m.compose(this.tmp2, this.idQ, this.sv.set(s, s, s));
      this.arc.setMatrixAt(i, this.m);
    }
    this.arc.instanceMatrix.needsUpdate = true;
    const cm = this.creaseLine.material as MeshBasicMaterial;
    cm.opacity = 0.35 + 0.45 * pulse;
    // Ghost preview after a few idle seconds.
    if (this.ghost) {
      const showGhost = this.phase === 'ready' && this.idle > 5;
      const cyc = ((this.idle - 5) % 2.4) / 2.4;
      const ga = easeInOutCubic(Math.min(1, cyc / 0.7)) * this.targetAngle;
      this.ghostPivot.quaternion.setFromAxisAngle(this.axisD, this.sheet.view.pivotSign * ga);
      this.ghostMat.opacity = showGhost ? 0.4 * Math.sin(Math.min(1, cyc / 0.9) * Math.PI) : 0;
      this.ghost.visible = showGhost;
    }
  }

  // ---- crease sharpening -----------------------------------------------------

  private updateSharpen(dt: number, hands: HandTracker): void {
    const s = this.sharpen;
    if (!s) return;
    s.t += dt;
    if (s.t > 4) {
      this.sharpen = null;
      return;
    }
    for (const h of hands.hands) {
      if (h.source !== 'hand') continue;
      this.toLocal(h.indexTip, this.tmp2);
      // distance to the crease segment
      const ab = this.tmp.subVectors(s.b, s.a);
      const len = ab.length();
      const t = clamp(this.tmp2.clone().sub(s.a).dot(ab) / (len * len), 0, 1);
      const closest = s.a.clone().addScaledVector(ab, t);
      if (closest.distanceTo(this.tmp2) < 0.018) {
        s.progress.add(Math.floor(t * 8));
        if (s.progress.size >= 6) {
          this.crisp++;
          this.audio.zip(this.worldOf(closest));
          this.sparkles.burstLine(this.worldOf(s.a), this.worldOf(s.b), 14, new Color(0xbfefff));
          this.sharpen = null;
          return;
        }
      }
    }
  }

  /** Fold the rest of the model automatically (pause menu "skip"). */
  skipAll(): void {
    this.autoAll = true;
    if (this.phase === 'ready' || this.phase === 'drag' || this.phase === 'revert') {
      this.drag?.stop();
      this.drag = null;
      if (this.holder) this.holder.claimedBy = null;
      this.holder = null;
      this.hideGuides();
      this.phase = 'auto';
      this.timer = 0;
      this.angle = 0;
    }
  }
  private autoAll = false;

  get done(): boolean {
    return this.phase === 'done';
  }

  /** Test/debug helper: world-space path a hand should follow for the current step. */
  debugPath(n = 12): { phase: FoldPhase; step: number; path: number[][] } {
    const path: number[][] = [];
    if (this.plan && this.phase === 'ready') {
      const rel = new Vector3().subVectors(this.grabLocal, this.axisP);
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * this.targetAngle;
        this.q.setFromAxisAngle(this.axisD, this.sheet.view.pivotSign * a);
        const p = rel.clone().applyQuaternion(this.q).add(this.axisP);
        // stay a little above the paper so the path reads like a lift
        p.addScaledVector(this.uUp, 0.0);
        const w = this.worldOf(p);
        path.push([w.x, w.y, w.z]);
      }
    }
    return { phase: this.phase, step: this.stepIndex, path };
  }

  /** The sheet now belongs to someone else (a Foldling); don't dispose it. */
  releaseSheet(): void {
    this.sheetReleased = true;
  }
  private sheetReleased = false;

  dispose(): void {
    this.drag?.stop();
    this.hideGuides();
    // the ghost borrows the sheet's geometry, so only its material is ours
    this.ghostPivot.clear();
    this.ghostMat.dispose();
    for (const o of [this.handle, this.target, this.arc, this.creaseLine]) disposeObject(o);
    if (!this.sheetReleased) this.sheet.dispose();
  }
}

function smooth01(t: number): number {
  t = clamp(t, 0, 1);
  // start lifting late so the flap doesn't hover during the first half
  const u = clamp((t - 0.45) / 0.55, 0, 1);
  return u * u * (3 - 2 * u);
}

function pointInPoly(poly: Vec2[], q: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi[1] > q[1] !== pj[1] > q[1]) {
      const x = ((pj[0] - pi[0]) * (q[1] - pi[1])) / (pj[1] - pi[1]) + pi[0];
      if (q[0] < x) inside = !inside;
    }
  }
  return inside;
}
