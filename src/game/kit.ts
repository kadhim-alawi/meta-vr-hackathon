/**
 * Kit, a tiny paper messenger with a letter to deliver. Kit talks in speech
 * bubbles (with an Animal-Crossing-style babble), waddles, hops and cheers.
 */
import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  Vector3,
  Quaternion,
} from '@iwsdk/core';
import type { App } from '../app/app.js';
import { clamp, damp, easeInOutCubic, seededRandom } from '../core/util.js';
import { TextCard } from '../ui/text.js';
import { disposeObject, markShared } from '../render/dispose.js';
import { angleDelta } from './foldling.js';

export type Emote = 'idle' | 'wave' | 'cheer' | 'sad' | 'think' | 'jump' | 'dance';

export class PaperCharacter {
  readonly group = new Group();
  protected body = new Group();
  protected head = new Group();
  protected armL = new Group();
  protected armR = new Group();
  readonly bubble = Object.assign(new TextCard(0.16, 2600), { scalable: true, largeScale: 2.5 });
  protected t = 0;
  protected emote: Emote = 'idle';
  protected emoteT = 0;
  protected walkFrom = new Vector3();
  protected walkTo = new Vector3();
  protected walkT = 1;
  protected walkDur = 1;
  protected walkHop = 0;
  protected walkDone: (() => void) | null = null;
  protected yaw = 0;
  protected yawGoal = 0;
  protected sayT = 0;
  protected sayDur = 0;
  protected voice = 70;
  private tmp = new Vector3();
  private voicePos = new Vector3();
  private q = new Quaternion();
  /** set to false to keep the speech bubble hidden (captions off) */
  captions = true;
  /** callbacks fired after speech ends */
  private sayDone: (() => void) | null = null;

  constructor(
    protected app: App,
    colors: { coat: number; face: number; scarf: number; hat: number },
    voice = 70,
  ) {
    this.voice = voice;
    const tex = paperFiber();
    const mat = (c: number) => new MeshLambertMaterial({ color: c, map: tex });
    const coat = new Mesh(new ConeGeometry(0.017, 0.042, 12, 1), mat(colors.coat));
    coat.position.y = 0.021;
    coat.castShadow = true;
    this.body.add(coat);
    const face = new Mesh(new SphereGeometry(0.0145, 16, 12), mat(colors.face));
    face.castShadow = true;
    this.head.add(face);
    const eyeMat = new MeshLambertMaterial({ color: 0x241914 });
    for (const sx of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(0.0021, 8, 6), eyeMat);
      eye.position.set(sx * 0.0055, 0.001, 0.0133);
      eye.scale.z = 0.5;
      this.head.add(eye);
      const cheek = new Mesh(new SphereGeometry(0.0028, 8, 6), new MeshLambertMaterial({ color: 0xf28b9b }));
      cheek.position.set(sx * 0.0088, -0.004, 0.0115);
      cheek.scale.z = 0.4;
      this.head.add(cheek);
    }
    const hat = new Mesh(new ConeGeometry(0.016, 0.016, 4, 1), mat(colors.hat));
    hat.position.y = 0.014;
    hat.rotation.y = Math.PI / 4;
    hat.scale.z = 0.55;
    hat.castShadow = true;
    this.head.add(hat);
    this.head.position.y = 0.05;
    this.body.add(this.head);
    const scarf = new Mesh(new TorusGeometry(0.0085, 0.0032, 6, 16), mat(colors.scarf));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.037;
    this.body.add(scarf);
    const tail = new Mesh(new BoxGeometry(0.004, 0.014, 0.002), mat(colors.scarf));
    tail.position.set(0.006, 0.03, -0.008);
    tail.rotation.z = 0.3;
    this.body.add(tail);
    for (const [arm, sx] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const a = new Mesh(new CylinderGeometry(0.0025, 0.0028, 0.018, 6), mat(colors.coat));
      a.position.y = -0.009;
      arm.add(a);
      const hand = new Mesh(new SphereGeometry(0.0032, 8, 6), mat(colors.face));
      hand.position.y = -0.019;
      arm.add(hand);
      arm.position.set(sx * 0.011, 0.036, 0);
      arm.rotation.z = sx * 0.35;
      this.body.add(arm);
    }
    this.group.add(this.body);
    this.bubble.mesh.position.y = 0.11;
    this.bubble.opacity = 0;
    this.group.add(this.bubble.mesh);
  }

  /** Say a line; resolves when the bubble has been read. */
  say(text: string, minDur = 2.4): Promise<void> {
    this.bubble.set([{ text, size: 1.05 }], { tail: 'bottom', bg: '#fffaf0', radius: 0.12 });
    // characters live inside the book, so use the true world position
    const len = this.app.audio.babble(this.group.getWorldPosition(this.voicePos), text, this.voice);
    this.sayDur = Math.max(minDur, text.length / 15 + 1.1, len + 0.8);
    this.sayT = 0;
    this.sayDone?.();
    return new Promise((res) => {
      this.sayDone = res;
    });
  }

  private viewV = new Vector3();
  private viewQ = new Quaternion();

  /** Pull the bubble down/sideways so it never pokes out of the top or sides of the field of view. */
  private keepBubbleInView(): void {
    const b = this.bubble;
    if (b.opacity <= 0.01) return;
    const app = this.app;
    const v = this.group.localToWorld(this.viewV.copy(b.mesh.position)).sub(app.headPos).applyQuaternion(this.viewQ.copy(app.headQuat).invert());
    const z = -v.z;
    if (z < 0.15) return;
    const f = app.fov;
    const k = 0.85;
    const halfW = (b.widthM * b.zoom) / 2;
    const halfH = (b.heightM * b.zoom) / 2;
    const x = clamp(v.x, -f.left * k * z + halfW, f.right * k * z - halfW);
    const y = Math.min(v.y, f.up * k * z - halfH);
    if (x === v.x && y === v.y) return;
    v.x = x;
    v.y = y;
    v.applyQuaternion(app.headQuat).add(app.headPos);
    this.group.worldToLocal(v);
    b.mesh.position.copy(v);
  }

  get speaking(): boolean {
    return this.sayT < this.sayDur;
  }

  /** Hide the body (e.g. Kit talking from inside the closed book). */
  setBodyVisible(v: boolean): void {
    this.body.visible = v;
  }

  setEmote(e: Emote): void {
    this.emote = e;
    this.emoteT = 0;
  }

  face(p: Vector3): void {
    this.yawGoal = Math.atan2(p.x - this.group.position.x, p.z - this.group.position.z);
  }

  faceAngle(a: number): void {
    this.yawGoal = a;
  }

  walkToPos(p: Vector3, speed = 0.08, hop = 0): Promise<void> {
    this.walkFrom.copy(this.group.position);
    this.walkTo.copy(p);
    this.walkT = 0;
    this.walkDur = Math.max(0.3, this.walkFrom.distanceTo(p) / speed);
    this.walkHop = hop;
    this.face(p);
    return new Promise((res) => {
      this.walkDone = res;
    });
  }

  hopTo(p: Vector3, dur = 0.6, h = 0.04): Promise<void> {
    this.walkFrom.copy(this.group.position);
    this.walkTo.copy(p);
    this.walkT = 0;
    this.walkDur = dur;
    this.walkHop = h;
    this.face(p);
    return new Promise((res) => {
      this.walkDone = res;
    });
  }

  get walking(): boolean {
    return this.walkT < 1;
  }

  update(dt: number, camWorld: Vector3): void {
    this.t += dt;
    this.emoteT += dt;
    // speech bubble
    if (this.sayT < this.sayDur) {
      this.sayT += dt;
      const fadeIn = clamp(this.sayT / 0.15, 0, 1);
      const fadeOut = clamp((this.sayDur - this.sayT) / 0.25, 0, 1);
      this.bubble.opacity = this.captions ? Math.min(fadeIn, fadeOut) : 0;
      if (this.sayT >= this.sayDur) {
        const d = this.sayDone;
        this.sayDone = null;
        d?.();
      }
    } else this.bubble.opacity = 0;
    // billboard the bubble towards the camera (yaw only), scaled with its own height
    this.bubble.refreshZoom();
    // lift the bubble as it grows so it clears Kit and whatever they hold
    // x/z reset every frame: the view clamp below moves them and must not accumulate
    this.bubble.mesh.position.set(0, 0.075 + 0.05 * (this.bubble.zoom - 1) + (this.bubble.heightM * this.bubble.zoom) / 2, 0);
    this.group.updateWorldMatrix(true, false);
    this.tmp.copy(camWorld);
    this.group.worldToLocal(this.tmp);
    this.bubble.mesh.rotation.set(0, Math.atan2(this.tmp.x, this.tmp.z), 0);
    this.keepBubbleInView();

    // walking
    let bob = 0;
    if (this.walkT < 1) {
      this.walkT = Math.min(1, this.walkT + dt / this.walkDur);
      const e = this.walkHop > 0 ? easeInOutCubic(this.walkT) : this.walkT;
      this.group.position.lerpVectors(this.walkFrom, this.walkTo, e);
      if (this.walkHop > 0) this.group.position.y += Math.sin(this.walkT * Math.PI) * this.walkHop;
      else bob = Math.abs(Math.sin(this.t * 14)) * 0.006;
      this.body.rotation.z = this.walkHop > 0 ? 0 : Math.sin(this.t * 14) * 0.12;
      if (this.walkT >= 1) {
        const d = this.walkDone;
        this.walkDone = null;
        d?.();
      }
    } else this.body.rotation.z *= Math.exp(-8 * dt);
    this.yaw += angleDelta(this.yaw, this.yawGoal) * damp(6, dt);
    this.group.rotation.y = this.yaw;

    // emotes
    const breathe = Math.sin(this.t * 2.2) * 0.012;
    this.body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    let armL = 0.35;
    let armR = -0.35;
    let headTilt = 0;
    let jump = 0;
    switch (this.emote) {
      case 'wave':
        armR = -2.6 + Math.sin(this.emoteT * 12) * 0.35;
        if (this.emoteT > 2) this.emote = 'idle';
        break;
      case 'cheer':
        armL = 2.5 + Math.sin(this.emoteT * 10) * 0.2;
        armR = -2.5 - Math.sin(this.emoteT * 10) * 0.2;
        jump = Math.abs(Math.sin(this.emoteT * 8)) * 0.018;
        if (this.emoteT > 1.8) this.emote = 'idle';
        break;
      case 'jump':
        jump = Math.sin(Math.min(1, this.emoteT / 0.45) * Math.PI) * 0.03;
        if (this.emoteT > 0.45) this.emote = 'idle';
        break;
      case 'sad':
        headTilt = 0.35;
        armL = 0.15;
        armR = -0.15;
        break;
      case 'think':
        headTilt = Math.sin(this.emoteT * 2) * 0.2;
        armR = -1.9;
        break;
      case 'dance':
        armL = 1.5 + Math.sin(this.emoteT * 8) * 1.0;
        armR = -1.5 + Math.sin(this.emoteT * 8) * 1.0;
        jump = Math.abs(Math.sin(this.emoteT * 8)) * 0.012;
        this.body.rotation.y = Math.sin(this.emoteT * 4) * 0.6;
        break;
    }
    if (this.emote !== 'dance') this.body.rotation.y *= Math.exp(-6 * dt);
    this.armL.rotation.z += (armL - this.armL.rotation.z) * damp(14, dt);
    this.armR.rotation.z += (armR - this.armR.rotation.z) * damp(14, dt);
    this.head.rotation.x += (headTilt - this.head.rotation.x) * damp(8, dt);
    this.body.position.y = bob + jump;
    void this.q;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.bubble.dispose();
    disposeObject(this.group);
  }
}

export class Kit extends PaperCharacter {
  constructor(app: App) {
    super(app, { coat: 0xf2b84b, face: 0xfbefdc, scarf: 0xd9483b, hat: 0x3d7be0 }, 70);
  }
}

export class Mo extends PaperCharacter {
  constructor(app: App) {
    super(app, { coat: 0x8bc48a, face: 0xfbefdc, scarf: 0x7a6fd6, hat: 0xe85d9a }, 64);
  }
}

let fiber: CanvasTexture | null = null;
/** A small shared paper-fibre texture for props and characters. */
export function paperFiber(): CanvasTexture {
  if (fiber) return fiber;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  const rnd = seededRandom(17);
  const img = g.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 235 + rnd() * 20;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
  }
  g.putImageData(img, 0, 0);
  fiber = markShared(new CanvasTexture(c));
  fiber.colorSpace = SRGBColorSpace;
  return fiber;
}
