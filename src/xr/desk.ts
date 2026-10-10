/**
 * Places the play area ("the desk") in front of the player.
 *
 * Order of preference in mixed reality:
 *   1. a persistent anchor saved last session (same spot on the same table),
 *   2. a detected table plane in front of the player,
 *   3. the player's palm laid flat on a surface (hands-first calibration),
 *   4. a comfortable floating lap desk.
 */
import { Group, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { damp } from '../core/util.js';
import { HandTracker } from './hands.js';

export type DeskSource = 'default' | 'plane' | 'palm' | 'anchor';

const ANCHOR_KEY = 'foldlings.deskAnchor.v1';

export class Desk {
  readonly group = new Group();
  source: DeskSource = 'default';
  placed = false;
  private goalPos = new Vector3();
  private goalYaw = 0;
  private yaw = 0;
  private settle = 0;
  private anchor: XRAnchor | null = null;
  private anchorTried = false;
  private palmTimer = 0;
  private palmPos = new Vector3();
  calibrating = false;
  private m = new Matrix4();
  private v = new Vector3();
  private q = new Quaternion();
  private headPos = new Vector3();
  private fwd = new Vector3();
  onPlaced?: (source: DeskSource) => void;

  /** Desk height below the eyes for a seated player. */
  static SEATED_DROP = 0.46;
  static REACH = 0.36;

  reset(): void {
    this.placed = false;
    this.source = 'default';
    this.anchor = null;
    this.anchorTried = false;
    this.settle = 0;
    this.cancelCalibration();
  }

  /** Called every frame while in XR. */
  update(
    frame: XRFrame | null | undefined,
    ref: XRReferenceSpace | null,
    head: { position: Vector3; quaternion: Quaternion },
    hands: HandTracker,
    rig: Matrix4,
    mode: 'ar' | 'vr',
    dt: number,
  ): void {
    this.headPos.copy(head.position);
    this.fwd.set(0, 0, -1).applyQuaternion(head.quaternion);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
    this.fwd.normalize();

    if (!this.placed) {
      this.settle += dt;
      // Wait a moment for tracking to settle before placing.
      if (this.settle > 0.4) {
        this.placeDefault();
        this.placed = true;
        this.snap();
        if (mode === 'ar' && frame && ref) {
          this.tryRestoreAnchor(frame.session);
          this.tryPlanes(frame, ref, rig);
        }
        this.onPlaced?.(this.source);
      }
    } else if (mode === 'ar' && frame && ref) {
      this.followAnchor(frame, ref, rig);
      if (this.source === 'default') this.tryPlanes(frame, ref, rig);
    }
    if (this.calibrating) this.updatePalm(hands, frame ?? null, ref, dt);

    // Smoothly glide to the goal (quick, to avoid motion discomfort).
    const k = damp(10, dt);
    this.group.position.lerp(this.goalPos, k);
    let dy = this.goalYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * k;
    this.group.rotation.set(0, this.yaw, 0);
  }

  private snap(): void {
    this.group.position.copy(this.goalPos);
    this.yaw = this.goalYaw;
    this.group.rotation.set(0, this.yaw, 0);
  }

  placeDefault(): void {
    this.goalPos.copy(this.headPos).addScaledVector(this.fwd, Desk.REACH);
    this.goalPos.y = this.headPos.y - Desk.SEATED_DROP;
    this.goalYaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    this.source = 'default';
  }

  /** Re-centre the desk in front of the player (menu "Move desk here"). */
  recenterHere(): void {
    this.placeDefault();
    this.anchor?.delete?.();
    this.anchor = null;
    try {
      localStorage.removeItem(ANCHOR_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private tryPlanes(frame: XRFrame, ref: XRReferenceSpace, rig: Matrix4): void {
    const planes = (frame as XRFrame & { detectedPlanes?: Set<XRPlane> }).detectedPlanes;
    if (!planes || planes.size === 0) return;
    let best: { y: number; d: number; label: string } | null = null;
    const want = this.v.copy(this.headPos).addScaledVector(this.fwd, Desk.REACH);
    for (const p of planes) {
      if (p.orientation !== 'horizontal') continue;
      const pose = frame.getPose(p.planeSpace, ref);
      if (!pose) continue;
      this.m.fromArray(pose.transform.matrix).premultiply(rig);
      const origin = new Vector3().setFromMatrixPosition(this.m);
      const drop = this.headPos.y - origin.y;
      // a surface between knee and chest height
      if (drop < 0.18 || drop > 0.85) continue;
      const label = (p as XRPlane & { semanticLabel?: string }).semanticLabel ?? '';
      if (label === 'floor' || label === 'ceiling') continue;
      // horizontal distance from where we'd like the desk to the plane polygon
      const local = new Vector3();
      const inv = this.m.clone().invert();
      local.copy(want).applyMatrix4(inv);
      const d = distToPolygon(p.polygon, local.x, local.z);
      if (d > 0.35) continue;
      const score = d + (label === 'table' || label === 'desk' ? -0.2 : 0);
      if (!best || score < best.d) best = { y: origin.y, d: score, label };
    }
    if (best) {
      this.goalPos.y = best.y;
      this.source = 'plane';
      this.onPlaced?.('plane');
    }
  }

  /** Start listening for a flat palm laid on a surface. */
  beginPalmCalibration(): void {
    this.calibrating = true;
    this.palmTimer = 0;
  }

  /** Stop listening for a palm (left the scene that asked for it). */
  cancelCalibration(): void {
    this.calibrating = false;
    this.palmTimer = 0;
  }

  private updatePalm(hands: HandTracker, frame: XRFrame | null, ref: XRReferenceSpace | null, dt: number): void {
    let found = false;
    for (const h of hands.hands) {
      if (h.source !== 'hand' || !h.palmFlat) continue;
      // palm facing down and below the eyes
      if (h.palmNormal.y > -0.75) continue;
      if (this.headPos.y - h.palm.y < 0.15) continue;
      // steady
      if (h.velocity.length() > 0.05) continue;
      if (this.palmTimer > 0 && h.palm.distanceTo(this.palmPos) > 0.03) this.palmTimer = 0;
      this.palmPos.copy(h.palm);
      found = true;
      break;
    }
    this.palmTimer = found ? this.palmTimer + dt : 0;
    if (this.palmTimer > 0.9) {
      this.calibrating = false;
      // the palm centre is ~1.5 cm above the table surface
      this.goalPos.set(this.palmPos.x, this.palmPos.y - 0.016, this.palmPos.z);
      // pull the mat a little towards the player so the book fits behind it
      this.goalPos.addScaledVector(this.fwd, -0.04);
      this.goalYaw = Math.atan2(-this.fwd.x, -this.fwd.z);
      this.source = 'palm';
      this.onPlaced?.('palm');
      if (frame && ref) void this.saveAnchor(frame, ref);
    }
  }

  /** Progress 0..1 of holding the palm still (for UI). */
  get palmProgress(): number {
    return Math.min(1, this.palmTimer / 0.9);
  }

  /** Save the current desk pose as a persistent anchor (Quest Browser). */
  async saveAnchor(frame: XRFrame, ref: XRReferenceSpace): Promise<void> {
    const create = (frame as XRFrame & { createAnchor?: (p: XRRigidTransform, s: XRSpace) => Promise<XRAnchor> }).createAnchor;
    if (!create) return;
    try {
      this.q.setFromAxisAngle(new Vector3(0, 1, 0), this.goalYaw);
      // goalPos is in world space; the rig is at the origin in this app
      const pose = new XRRigidTransform(
        { x: this.goalPos.x, y: this.goalPos.y, z: this.goalPos.z },
        { x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w },
      );
      const anchor = await create.call(frame, pose, ref);
      this.anchor = anchor;
      const persist = (anchor as XRAnchor & { requestPersistentHandle?: () => Promise<string> }).requestPersistentHandle;
      if (persist) {
        const handle = await persist.call(anchor);
        localStorage.setItem(ANCHOR_KEY, handle);
      }
    } catch {
      /* anchors unsupported or denied: the desk simply won't persist */
    }
  }

  private tryRestoreAnchor(session: XRSession): void {
    if (this.anchorTried) return;
    this.anchorTried = true;
    let handle: string | null = null;
    try {
      handle = localStorage.getItem(ANCHOR_KEY);
    } catch {
      return;
    }
    const restore = (session as XRSession & { restorePersistentAnchor?: (h: string) => Promise<XRAnchor> }).restorePersistentAnchor;
    if (!handle || !restore) return;
    restore
      .call(session, handle)
      .then((a) => {
        this.anchor = a;
        this.source = 'anchor';
        this.onPlaced?.('anchor');
      })
      .catch(() => {
        try {
          localStorage.removeItem(ANCHOR_KEY);
        } catch {
          /* ignore */
        }
      });
  }

  private followAnchor(frame: XRFrame, ref: XRReferenceSpace, rig: Matrix4): void {
    if (!this.anchor || this.source !== 'anchor') return;
    if (!frame.trackedAnchors?.has(this.anchor)) return;
    const pose = frame.getPose(this.anchor.anchorSpace, ref);
    if (!pose) return;
    this.m.fromArray(pose.transform.matrix).premultiply(rig);
    this.goalPos.setFromMatrixPosition(this.m);
    this.q.setFromRotationMatrix(this.m);
    const f = new Vector3(0, 0, -1).applyQuaternion(this.q);
    this.goalYaw = Math.atan2(-f.x, -f.z);
  }
}

function distToPolygon(poly: ReadonlyArray<DOMPointReadOnly>, x: number, z: number): number {
  // inside test
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi.z > z !== pj.z > z) {
      const xx = ((pj.x - pi.x) * (z - pi.z)) / (pj.z - pi.z) + pi.x;
      if (x < xx) inside = !inside;
    }
  }
  if (inside) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const l2 = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
    best = Math.min(best, Math.hypot(a.x + abx * t - x, a.z + abz * t - z));
  }
  return best;
}
