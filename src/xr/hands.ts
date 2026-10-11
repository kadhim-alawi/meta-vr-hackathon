/**
 * Unified hand input: articulated hand tracking when available, controllers
 * as a fallback (trigger = pinch). Everything is reported in world space.
 */
import { Matrix4, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { clamp01, damp } from '../core/util.js';

export type Side = 'left' | 'right';

export const J = {
  wrist: 0,
  thumbMeta: 1,
  thumbProx: 2,
  thumbDist: 3,
  thumbTip: 4,
  indexMeta: 5,
  indexProx: 6,
  indexInter: 7,
  indexDist: 8,
  indexTip: 9,
  middleMeta: 10,
  middleProx: 11,
  middleInter: 12,
  middleDist: 13,
  middleTip: 14,
  ringMeta: 15,
  ringProx: 16,
  ringInter: 17,
  ringDist: 18,
  ringTip: 19,
  pinkyMeta: 20,
  pinkyProx: 21,
  pinkyInter: 22,
  pinkyDist: 23,
  pinkyTip: 24,
} as const;

/** Bones as joint index pairs, used by the hand visual. */
export const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8], [8, 9],
  [0, 10], [10, 11], [11, 12], [12, 13], [13, 14],
  [0, 15], [15, 16], [16, 17], [17, 18], [18, 19],
  [0, 20], [20, 21], [21, 22], [22, 23], [23, 24],
  // palm webbing
  [6, 11], [11, 16], [16, 21], [2, 6],
];

/** Hand-tracking frame methods (WebXR Hand Input module). */
type HandFrame = XRFrame & {
  fillPoses?: (spaces: XRSpace[], base: XRSpace, out: Float32Array) => boolean;
  fillJointRadii?: (spaces: XRJointSpace[], out: Float32Array) => boolean;
  getJointPose?: (joint: XRJointSpace, base: XRSpace) => XRJointPose | undefined;
};

const PINCH_START = 0.019;
const PINCH_END = 0.034;
const HISTORY = 12;
/** m/s; caps release velocity against tracking glitches */
const MAX_THROW = 6;

export class HandState {
  readonly side: Side;
  /** 'hand' (articulated), 'controller' or 'none' */
  source: 'hand' | 'controller' | 'none' = 'none';
  readonly joints: Vector3[] = Array.from({ length: 25 }, () => new Vector3());
  readonly radii = new Float32Array(25).fill(0.008);
  /** point between thumb and index tips (or in front of the controller) */
  readonly pinchPoint = new Vector3();
  readonly indexTip = new Vector3();
  readonly palm = new Vector3();
  readonly palmNormal = new Vector3(0, -1, 0);
  /** hand orientation frame (x: thumb side, y: back of hand, z: towards wrist) */
  readonly orientation = new Quaternion();
  /** smoothed palm velocity (world, m/s) */
  readonly velocity = new Vector3();
  /** target ray (system pointer) for point-and-pinch */
  readonly rayOrigin = new Vector3();
  readonly rayDir = new Vector3(0, 0, -1);
  rayValid = false;
  /** 0 (open) … 1 (closed) */
  pinchStrength = 0;
  pinching = false;
  pinchStarted = false;
  pinchEnded = false;
  /** seconds since the current pinch began (0 when not pinching) */
  pinchAge = 0;
  /** seconds the hand has been continuously tracked */
  trackedTime = 0;
  /** true while the system select (pinch/trigger) is held */
  systemSelect = false;
  private wasPinching = false;
  private hist: { p: Vector3; t: number }[] = [];
  private histIdx = 0;
  private lastPinchPoint = new Vector3();
  private inst = new Vector3();
  private hasLast = false;
  inputSource: XRInputSource | null = null;
  /** true when fingers are extended and together (a flat palm) */
  palmFlat = false;
  /** consumer can mark a pinch as used so others ignore it */
  claimedBy: unknown = null;

  /**
   * A pinch that may still grab something: just started, or started a moment
   * ago and not yet used. The grace window forgives pinching a little off the
   * target and sliding onto it.
   */
  get freshPinch(): boolean {
    // 0.4 s or 8 frames, whichever is longer, so slow frames don't shrink it
    return this.pinching && !this.claimedBy && (this.pinchAge < 0.4 || this.pinchFrames < 8);
  }
  /** frames since the current pinch began */
  pinchFrames = 0;

  constructor(side: Side) {
    this.side = side;
    for (let i = 0; i < HISTORY; i++) this.hist.push({ p: new Vector3(), t: -1 });
  }

  get tracked(): boolean {
    return this.source !== 'none';
  }

  /**
   * Release velocity for throws: the fastest stretch of hand motion in the
   * last ~250 ms. Hands decelerate as fingers open, so the plain latest
   * velocity under-reports a throw. Each stretch spans at least 50 ms so a
   * one-frame tracking jump can't pass for a flick.
   */
  throwVelocity(out: Vector3, now: number, window = 0.25, span = 0.05): Vector3 {
    // the last 0.25 s or the last 5 samples, whichever is longer, so a slow
    // frame between the flick and the release can't hide the flick
    const all = this.hist.filter((h) => h.t >= 0).sort((a, b) => a.t - b.t);
    const from = Math.min(now - window, all.length >= 5 ? all[all.length - 5].t : -Infinity);
    const recent = all.filter((h) => h.t >= from);
    let best = -1;
    for (let i = 1; i < recent.length; i++) {
      let j = i - 1;
      while (j > 0 && recent[i].t - recent[j].t < span) j--;
      const dt = recent[i].t - recent[j].t;
      if (dt < 0.02) continue;
      this.inst.subVectors(recent[i].p, recent[j].p).divideScalar(dt);
      const sp = this.inst.lengthSq();
      if (sp > best) {
        best = sp;
        out.copy(this.inst);
      }
    }
    if (best < 0) out.copy(this.velocity);
    // nobody tosses paper faster than this
    if (out.lengthSq() > MAX_THROW * MAX_THROW) out.setLength(MAX_THROW);
    return out;
  }

  /** @internal */
  _record(now: number, dt: number): void {
    // Track the palm, not the fingertips: opening the fingers to release a
    // throw moves the fingertip midpoint and would fake a flick.
    const h = this.hist[this.histIdx];
    h.p.copy(this.palm);
    h.t = now;
    this.histIdx = (this.histIdx + 1) % HISTORY;
    if (this.hasLast && dt > 0) {
      this.inst.subVectors(this.palm, this.lastPinchPoint).multiplyScalar(1 / dt);
      this.velocity.lerp(this.inst, damp(18, dt));
    }
    this.lastPinchPoint.copy(this.palm);
    this.hasLast = true;
  }

  /** @internal */
  _updatePinchEdges(dt = 0): void {
    this.pinchStarted = this.pinching && !this.wasPinching;
    this.pinchAge = this.pinching ? (this.pinchStarted ? 0 : this.pinchAge + dt) : 0;
    this.pinchFrames = this.pinching ? (this.pinchStarted ? 0 : this.pinchFrames + 1) : 0;
    this.pinchEnded = !this.pinching && this.wasPinching;
    this.wasPinching = this.pinching;
    if (this.pinchEnded) this.claimedBy = null;
  }

  /** @internal */
  _lost(): void {
    this.source = 'none';
    this.rayValid = false;
    this.pinching = false;
    this.trackedTime = 0;
    this.hasLast = false;
    this.velocity.set(0, 0, 0);
    this.systemSelect = false;
  }
}

/**
 * Reads hands each XR frame. Joint poses come from fillPoses (one call per
 * hand) and are transformed into world space through the player rig.
 */
export class HandTracker {
  readonly left = new HandState('left');
  readonly right = new HandState('right');
  readonly hands: [HandState, HandState] = [this.left, this.right];
  private poses = new Float32Array(25 * 16);
  private m = new Matrix4();
  private rig = new Matrix4();
  private v = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private q = new Quaternion();
  private spaceCache = new WeakMap<XRHand, XRSpace[]>();
  private session: XRSession | null = null;
  private onSelectStart = (e: XRInputSourceEvent) => this.setSelect(e.inputSource, true);
  private onSelectEnd = (e: XRInputSourceEvent) => this.setSelect(e.inputSource, false);
  /** set when any hand was articulated this session */
  sawHands = false;

  get(side: Side): HandState {
    return side === 'left' ? this.left : this.right;
  }

  attach(session: XRSession | null): void {
    if (this.session === session) return;
    if (this.session) {
      this.session.removeEventListener('selectstart', this.onSelectStart as EventListener);
      this.session.removeEventListener('selectend', this.onSelectEnd as EventListener);
    }
    this.session = session;
    if (session) {
      session.addEventListener('selectstart', this.onSelectStart as EventListener);
      session.addEventListener('selectend', this.onSelectEnd as EventListener);
    }
    for (const h of this.hands) h._lost();
  }

  private setSelect(src: XRInputSource, on: boolean): void {
    if (src.handedness === 'left') this.left.systemSelect = on;
    else if (src.handedness === 'right') this.right.systemSelect = on;
  }

  update(frame: XRFrame | null | undefined, refSpace: XRReferenceSpace | null, player: Object3D, now: number, dt: number): void {
    const seen: Record<Side, boolean> = { left: false, right: false };
    if (frame && refSpace) {
      player.updateWorldMatrix(true, false);
      this.rig.copy(player.matrixWorld);
      for (const src of frame.session.inputSources) {
        const side = src.handedness;
        if (side !== 'left' && side !== 'right') continue;
        const hs = this.get(side);
        this.readRay(frame, refSpace, src, hs);
        if (src.hand) {
          if (this.readHand(frame, refSpace, src, hs)) {
            seen[side] = true;
            this.sawHands = true;
          }
        } else if (src.gripSpace && !seen[side]) {
          if (this.readController(frame, refSpace, src, hs)) seen[side] = true;
        }
      }
    }
    for (const hs of this.hands) {
      if (!seen[hs.side]) {
        if (hs.source !== 'none') hs._lost();
        hs._updatePinchEdges();
        continue;
      }
      hs.trackedTime += dt;
      hs._record(now, dt);
      hs._updatePinchEdges(dt);
    }
  }

  private readHand(frame: XRFrame, ref: XRReferenceSpace, src: XRInputSource, hs: HandState): boolean {
    const hand = src.hand!;
    let spaces = this.spaceCache.get(hand);
    if (!spaces) {
      spaces = Array.from(hand.values()) as XRSpace[];
      this.spaceCache.set(hand, spaces);
    }
    if (spaces.length < 25) return false;
    const f = frame as HandFrame;
    const ok = f.fillPoses ? f.fillPoses(spaces, ref, this.poses) : this.fillManually(frame, ref, spaces);
    if (!ok) return false;
    if (f.fillJointRadii) f.fillJointRadii(spaces as XRJointSpace[], hs.radii);
    for (let i = 0; i < 25; i++) {
      this.m.fromArray(this.poses, i * 16);
      hs.joints[i].setFromMatrixPosition(this.m).applyMatrix4(this.rig);
    }
    // a pose of all zeros means "not tracked"
    if (hs.joints[J.wrist].lengthSq() === 0 && hs.joints[J.indexTip].lengthSq() === 0) return false;
    hs.source = 'hand';
    hs.inputSource = src;
    const tt = hs.joints[J.thumbTip];
    const it = hs.joints[J.indexTip];
    hs.indexTip.copy(it);
    hs.pinchPoint.copy(tt).add(it).multiplyScalar(0.5);
    const d = tt.distanceTo(it);
    hs.pinchStrength = clamp01(1 - (d - PINCH_START) / (0.07 - PINCH_START));
    // Hysteresis on distance. The runtime's own select (pinch) also counts,
    // but only while the fingertips are plausibly together, so a missed
    // 'selectend' can never leave a pinch stuck on.
    const sys = hs.systemSelect && d < 0.05;
    if (hs.pinching) hs.pinching = d < PINCH_END || sys;
    else hs.pinching = d < PINCH_START || sys;
    if (hs.systemSelect && d > 0.07) hs.systemSelect = false;

    // Palm frame from wrist and knuckles.
    const w = hs.joints[J.wrist];
    const iM = hs.joints[J.indexProx];
    const pM = hs.joints[J.pinkyProx];
    const mM = hs.joints[J.middleProx];
    hs.palm.copy(w).add(mM).multiplyScalar(0.5);
    this.a.subVectors(iM, w);
    this.b.subVectors(pM, w);
    // left/right hands have mirrored winding
    hs.palmNormal.crossVectors(this.a, this.b).normalize();
    if (hs.side === 'left') hs.palmNormal.negate();
    // orientation: z = wrist→middle knuckle (forward), y = −palm normal (back of hand)
    this.c.subVectors(mM, w).normalize();
    this.v.copy(hs.palmNormal).negate();
    const x = this.a.crossVectors(this.v, this.c).normalize();
    const y = this.b.crossVectors(this.c, x).normalize();
    this.m.makeBasis(x, y, this.c);
    hs.orientation.setFromRotationMatrix(this.m);

    // Flat palm: fingertips far from the palm and roughly in its plane.
    let ext = 0;
    for (const tip of [J.indexTip, J.middleTip, J.ringTip, J.pinkyTip]) {
      if (hs.joints[tip].distanceTo(w) > 0.13) ext++;
    }
    hs.palmFlat = ext >= 4;
    return true;
  }

  private readRay(frame: XRFrame, ref: XRReferenceSpace, src: XRInputSource, hs: HandState): void {
    const pose = frame.getPose(src.targetRaySpace, ref);
    hs.rayValid = !!pose;
    if (!pose) return;
    this.m.fromArray(pose.transform.matrix).premultiply(this.rig);
    hs.rayOrigin.setFromMatrixPosition(this.m);
    hs.rayDir.set(0, 0, -1).transformDirection(this.m);
  }

  private fillManually(frame: XRFrame, ref: XRReferenceSpace, spaces: XRSpace[]): boolean {
    for (let i = 0; i < spaces.length; i++) {
      const p = (frame as HandFrame).getJointPose?.(spaces[i] as XRJointSpace, ref);
      if (!p) return false;
      this.poses.set(p.transform.matrix, i * 16);
    }
    return true;
  }

  private readController(frame: XRFrame, ref: XRReferenceSpace, src: XRInputSource, hs: HandState): boolean {
    const pose = frame.getPose(src.gripSpace!, ref);
    if (!pose) return false;
    hs.source = 'controller';
    hs.inputSource = src;
    this.m.fromArray(pose.transform.matrix).premultiply(this.rig);
    const pos = this.v.setFromMatrixPosition(this.m);
    const q = this.q.setFromRotationMatrix(this.m);
    // The pinch point sits a little in front of the grip, where fingertips would be.
    hs.pinchPoint.set(0, -0.02, -0.05).applyQuaternion(q).add(pos);
    hs.indexTip.set(0, -0.015, -0.08).applyQuaternion(q).add(pos);
    hs.palm.copy(pos);
    hs.palmNormal.set(-1, 0, 0).applyQuaternion(q);
    hs.orientation.copy(q);
    const gp = src.gamepad;
    const trigger = gp?.buttons[0]?.value ?? 0;
    const squeeze = gp?.buttons[1]?.value ?? 0;
    const v = Math.max(trigger, squeeze);
    hs.pinchStrength = v;
    hs.pinching = hs.pinching ? v > 0.35 : v > 0.6;
    for (let i = 0; i < 25; i++) hs.joints[i].copy(pos);
    hs.joints[J.indexTip].copy(hs.indexTip);
    hs.joints[J.thumbTip].copy(hs.pinchPoint);
    hs.palmFlat = false;
    return true;
  }

  /** Brief vibration on controllers; no-op for hands. */
  pulse(side: Side, intensity = 0.4, ms = 30): void {
    const hs = this.get(side);
    const act = hs.inputSource?.gamepad?.hapticActuators?.[0] as
      | { pulse?: (v: number, d: number) => void }
      | undefined;
    act?.pulse?.(intensity, ms);
  }
}
