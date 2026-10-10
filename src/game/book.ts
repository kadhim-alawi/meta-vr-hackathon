/**
 * The storybook. A cloth-bound book that opens on the desk; each spread holds
 * pop-up dioramas that stand up as the page opens and fold flat as it turns.
 * Pages are turned by pinching the corner and sweeping it over — the same
 * gesture as folding.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry,
  MeshBasicMaterial,
  AdditiveBlending,
  Vector3,
  Quaternion,
  Matrix4,
} from '@iwsdk/core';
import type { App } from '../app/app.js';
import { clamp, damp, easeInOutCubic, easeOutBack, spring } from '../core/util.js';
import { PopUp } from './popups.js';
import { HandState } from '../xr/hands.js';
import { paperFiber } from './kit.js';

export const PAGE_W = 0.22;
export const PAGE_D = 0.28;
const BLOCK = 0.014;
const BOARD = 0.004;

export class Spread {
  readonly left = new Group();
  readonly right = new Group();
  readonly popups: PopUp[] = [];
  /** updates for animated props */
  tick: ((dt: number, t: number) => void) | null = null;

  add(side: 'left' | 'right', content: Group | Mesh, x: number, z: number, delay = 0, rotY = 0): PopUp {
    const p = new PopUp(content, delay);
    p.position.set(x, 0, z);
    p.rotation.y = rotY;
    (side === 'left' ? this.left : this.right).add(p);
    this.popups.push(p);
    return p;
  }

  /** flat decoration lying on the page (no pop). */
  flat(side: 'left' | 'right', obj: Group | Mesh, x: number, z: number): void {
    obj.position.x += x;
    obj.position.z += z;
    (side === 'left' ? this.left : this.right).add(obj);
  }
}

type BookPhase = 'closed' | 'opening' | 'open' | 'turning' | 'closing';

export class Book {
  readonly group = new Group();
  /** shifts so the closed book is centred */
  private body = new Group();
  private leftHinge = new Group();
  private leaf = new Group();
  private leafMesh: Mesh;
  private leftSurface = new Group();
  private rightSurface = new Group();
  phase: BookPhase = 'closed';
  openAmount = 0;
  spread: Spread | null = null;
  private popT = 0;
  private turnAngle = 0;
  private turnVel = 0;
  private turnHolder: HandState | null = null;
  private nextSpread: Spread | null = null;
  private corner: Mesh;
  /** player may grab the corner to turn the page */
  turnEnabled = false;
  onTurned: (() => void) | null = null;
  private tmp = new Vector3();
  private inv = new Matrix4();
  private goalPos = new Vector3();
  private goalTilt = 0;
  private tilt = 0;
  private wiggle = 0;
  private coverTitle: CanvasTexture;

  constructor(private app: App) {
    const cloth = new MeshLambertMaterial({ color: 0x8c2f39, map: clothTexture() });
    const pageMat = new MeshLambertMaterial({ color: 0xfbf3e2, map: paperFiber() });
    const edgeMat = new MeshLambertMaterial({ color: 0xeee2c8 });
    this.coverTitle = coverTexture();

    // right half: back board + page block, top surface at y = BOARD + BLOCK
    const backBoard = new Mesh(new BoxGeometry(PAGE_W + 0.008, BOARD, PAGE_D + 0.012), cloth);
    backBoard.position.set(PAGE_W / 2 + 0.002, BOARD / 2, 0);
    const rightBlock = new Mesh(new BoxGeometry(PAGE_W, BLOCK, PAGE_D), [edgeMat, edgeMat, pageMat, edgeMat, edgeMat, edgeMat]);
    rightBlock.position.set(PAGE_W / 2, BOARD + BLOCK / 2, 0);
    for (const m of [backBoard, rightBlock]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.body.add(m);
    }
    this.rightSurface.position.set(0, BOARD + BLOCK + 0.0005, 0);
    this.body.add(this.rightSurface);

    // left half rotates about the spine (z axis at x = 0)
    const frontBoard = new Mesh(new BoxGeometry(PAGE_W + 0.008, BOARD, PAGE_D + 0.012), [cloth, cloth, cloth, new MeshLambertMaterial({ map: this.coverTitle }), cloth, cloth]);
    frontBoard.position.set(-PAGE_W / 2 - 0.002, BOARD / 2, 0);
    const leftBlock = new Mesh(new BoxGeometry(PAGE_W, BLOCK, PAGE_D), [edgeMat, edgeMat, pageMat, edgeMat, edgeMat, edgeMat]);
    leftBlock.position.set(-PAGE_W / 2, BOARD + BLOCK / 2, 0);
    for (const m of [frontBoard, leftBlock]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.leftHinge.add(m);
    }
    this.leftSurface.position.set(0, BOARD + BLOCK + 0.0005, 0);
    this.leftHinge.add(this.leftSurface);
    // pivot at the page surface so the closed half rests on top of the block
    const H = BOARD + BLOCK + 0.0005;
    for (const child of this.leftHinge.children) child.position.y -= H;
    this.leftHinge.position.y = H;
    this.body.add(this.leftHinge);

    // the turning leaf (a single page sweeping right → left)
    this.leafMesh = new Mesh(new PlaneGeometry(PAGE_W, PAGE_D, 12, 1), pageMat.clone());
    (this.leafMesh.material as MeshLambertMaterial).side = 2;
    this.leafMesh.rotation.x = -Math.PI / 2;
    this.leafMesh.position.x = PAGE_W / 2;
    this.leafMesh.castShadow = true;
    this.leaf.add(this.leafMesh);
    this.leaf.position.y = BOARD + BLOCK + 0.001;
    this.leaf.visible = false;
    this.body.add(this.leaf);

    // glowing corner handle for page turning
    this.corner = new Mesh(
      new SphereGeometry(0.008, 14, 10),
      new MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }),
    );
    this.corner.position.set(PAGE_W - 0.012, BOARD + BLOCK + 0.004, PAGE_D / 2 - 0.012);
    this.corner.visible = false;
    this.body.add(this.corner);

    this.group.add(this.body);
    this.setOpen(0);
  }

  /** Where the book should sit (desk-local) and how much to tilt it up. */
  setSlot(pos: Vector3, tilt = 0, immediate = false): void {
    this.goalPos.copy(pos);
    this.goalTilt = tilt;
    if (immediate) {
      this.group.position.copy(pos);
      this.tilt = tilt;
    }
  }

  /** Little shake, e.g. when Kit knocks from inside. */
  rattle(): void {
    this.wiggle = 1;
  }

  setOpen(k: number): void {
    this.openAmount = k;
    // closed: left half folded on top of the right half (rotated π about z)
    this.leftHinge.rotation.z = -Math.PI * (1 - k);
    // centre the closed book; the open book is centred on the spine
    this.body.position.x = (1 - k) * (PAGE_W / 2);
  }

  open(spread: Spread): void {
    this.attach(spread);
    this.phase = 'opening';
    this.popT = 0;
    this.app.audio.thump(this.app.fromDesk(this.group.position), 0.5);
    this.app.audio.whoosh(this.app.fromDesk(this.group.position), 0.7, true);
  }

  close(): void {
    this.phase = 'closing';
  }

  private attach(spread: Spread): void {
    if (this.spread) {
      this.leftSurface.remove(this.spread.left);
      this.rightSurface.remove(this.spread.right);
    }
    this.spread = spread;
    this.leftSurface.add(spread.left);
    this.rightSurface.add(spread.right);
    for (const p of spread.popups) {
      p.setProgress(0);
      p.onPop = () => this.app.audio.pop(this.app.fromDesk(this.group.position), 0.8 + Math.random() * 0.6);
    }
  }

  /** Prepare the next spread; the player turns the page to reveal it. */
  offerTurn(next: Spread): void {
    this.nextSpread = next;
    this.turnEnabled = true;
    this.turnAngle = 0;
  }

  /** Turn without the player (e.g. reduced-interaction mode). */
  autoTurn(): void {
    if (!this.nextSpread) return;
    this.phase = 'turning';
    this.turnHolder = null;
    this.turnAuto = true;
  }
  private turnAuto = false;

  /** Desk-local position of a point given in page space. */
  pagePoint(side: 'left' | 'right', x: number, z: number, y = 0, out = new Vector3()): Vector3 {
    const surf = side === 'left' ? this.leftSurface : this.rightSurface;
    out.set(x, y, z);
    surf.updateWorldMatrix(true, false);
    out.applyMatrix4(surf.matrixWorld);
    return this.app.toDesk(out, out);
  }

  /** Height of the page surface in desk space (for landing creatures). */
  get pageHeight(): number {
    return this.group.position.y + BOARD + BLOCK;
  }

  update(dt: number, time: number): void {
    // glide to slot
    this.group.position.lerp(this.goalPos, damp(5, dt));
    this.tilt += (this.goalTilt - this.tilt) * damp(5, dt);
    this.wiggle = Math.max(0, this.wiggle - dt * 1.6);
    // positive x-rotation lifts the far edge towards the player
    this.group.rotation.set(this.tilt, Math.sin(time * 30) * 0.03 * this.wiggle, Math.sin(time * 23) * 0.02 * this.wiggle);

    switch (this.phase) {
      case 'opening': {
        this.popT += dt;
        const k = easeOutBack(clamp(this.popT / 1.1, 0, 1), 1.1);
        this.setOpen(k);
        if (this.popT > 1.1) this.phase = 'open';
        break;
      }
      case 'open':
        this.popT += dt;
        break;
      case 'closing': {
        this.openAmount = Math.max(0, this.openAmount - dt / 1.2);
        const k = easeInOutCubic(this.openAmount);
        this.setOpen(k);
        if (this.spread) for (const p of this.spread.popups) p.setClosed(1 - k);
        if (this.openAmount <= 0) this.phase = 'closed';
        break;
      }
      case 'turning':
        this.updateTurn(dt);
        break;
    }
    if (this.spread && (this.phase === 'open' || this.phase === 'opening')) {
      for (const p of this.spread.popups) p.setProgress(this.popT - 0.35);
    }
    this.spread?.tick?.(dt, time);
    this.updateCorner(dt, time);
  }

  private updateCorner(dt: number, time: number): void {
    const show = this.turnEnabled && this.phase === 'open';
    this.corner.visible = show;
    if (!show) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    this.corner.scale.setScalar(0.8 + pulse * 0.5);
    // grab the corner with a pinch
    for (const h of this.app.hands.hands) {
      if (!h.tracked || !h.freshPinch) continue;
      this.corner.getWorldPosition(this.tmp);
      if (this.tmp.distanceTo(h.pinchPoint) < 0.06) {
        this.turnHolder = h;
        h.claimedBy = this;
        this.phase = 'turning';
        this.turnAuto = false;
        this.app.audio.rustle(this.tmp, 0.7);
        break;
      }
    }
    void dt;
  }

  private updateTurn(dt: number): void {
    this.leaf.visible = true;
    let target = this.turnAngle;
    const h = this.turnHolder;
    if (this.turnAuto) {
      target = Math.PI;
    } else if (h && h.tracked && h.pinching) {
      // angle of the hand around the spine axis, in book space
      this.body.updateWorldMatrix(true, false);
      this.inv.copy(this.body.matrixWorld).invert();
      this.tmp.copy(h.pinchPoint).applyMatrix4(this.inv);
      const y = this.tmp.y - (BOARD + BLOCK);
      target = Math.atan2(Math.max(0, y), this.tmp.x);
      if (target > Math.PI * 0.85) target = Math.PI;
    } else {
      // released
      if (h) h.claimedBy = null;
      this.turnHolder = null;
      target = this.turnAngle > Math.PI * 0.45 ? Math.PI : 0;
      this.turnAuto = target === Math.PI;
    }
    [this.turnAngle, this.turnVel] = spring(this.turnAngle, this.turnVel, target, this.turnAuto ? 9 : 20, dt);
    this.turnAngle = clamp(this.turnAngle, 0, Math.PI);
    this.leaf.rotation.z = this.turnAngle;
    // bend the leaf a little while it moves
    const pos = this.leafMesh.geometry.attributes.position;
    const bend = Math.sin(this.turnAngle) * 0.25;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + PAGE_W / 2;
      pos.setZ(i, Math.sin((x / PAGE_W) * Math.PI * 0.5) * bend * 0.05);
    }
    pos.needsUpdate = true;
    // current pop-ups fold away as the leaf passes over them
    const k = this.turnAngle / Math.PI;
    if (this.spread) for (const p of this.spread.popups) p.setClosed(Math.min(1, k * 1.6));
    if (!this.turnAuto && !h && this.turnAngle < 0.02) {
      // gave up: restore
      this.phase = 'open';
      this.leaf.visible = false;
      if (this.spread) for (const p of this.spread.popups) p.setProgress(5);
      return;
    }
    if (this.turnAngle > Math.PI - 0.03 && this.nextSpread) {
      this.leaf.visible = false;
      this.turnEnabled = false;
      const next = this.nextSpread;
      this.nextSpread = null;
      this.attach(next);
      this.phase = 'open';
      this.popT = 0;
      this.turnAuto = false;
      this.app.audio.pageTurn(this.app.fromDesk(this.group.position));
      this.onTurned?.();
    }
  }

  /** Desk-local position of the page-turn corner handle. */
  cornerLocal(out = new Vector3()): Vector3 {
    this.corner.getWorldPosition(out);
    return this.app.toDesk(out, out);
  }

  /** Seconds since the current spread started popping up. */
  get popTime(): number {
    return this.popT;
  }

  /** Pop up an element that was held back (delay 99) right now. */
  reveal(p: PopUp): void {
    p.delay = this.popT - 0.35 + 0.02;
  }

  /** Is a desk-local point over the open book? */
  contains(p: Vector3): boolean {
    this.tmp.copy(p);
    const local = this.group.worldToLocal(this.app.fromDesk(this.tmp, this.tmp));
    return Math.abs(local.x) < PAGE_W && Math.abs(local.z) < PAGE_D / 2;
  }

  get quaternion(): Quaternion {
    return this.group.quaternion;
  }
}

function clothTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 128, 128);
  g.globalAlpha = 0.12;
  g.strokeStyle = '#000';
  for (let i = 0; i < 128; i += 3) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i + 1);
    g.lineTo(128, i + 1);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function coverTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 640;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8c2f39';
  g.fillRect(0, 0, 512, 640);
  g.strokeStyle = '#e9c46a';
  g.lineWidth = 8;
  g.strokeRect(28, 28, 456, 584);
  g.lineWidth = 2;
  g.strokeRect(44, 44, 424, 552);
  g.fillStyle = '#f4d58d';
  g.textAlign = 'center';
  g.font = '600 92px Fredoka, sans-serif';
  g.fillText('Foldlings', 256, 270);
  g.font = '700 30px Nunito, sans-serif';
  g.fillText('a hand-folded tale', 256, 330);
  // a little crane emblem
  g.beginPath();
  g.moveTo(256, 380);
  g.lineTo(316, 460);
  g.lineTo(256, 440);
  g.lineTo(196, 460);
  g.closePath();
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  // The cover art sits on the front board's −y face, which faces up once the
  // board is flipped shut (rotated π about z). That flip mirrors u and puts
  // v=1 at the near edge, so the art needs a half turn to read upright.
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI;
  return t;
}
