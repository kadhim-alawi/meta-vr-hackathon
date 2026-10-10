/**
 * Paper-craft pop-up pieces for the storybook. Each piece is hinged at its
 * base on the page and stands up as the page opens, like a real pop-up book.
 */
import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from '@iwsdk/core';
import { paperFiber } from './kit.js';
import { clamp, easeOutBack, seededRandom } from '../core/util.js';

const matCache = new Map<number, MeshLambertMaterial>();
export function paperMat(color: number): MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new MeshLambertMaterial({ color, map: paperFiber(), side: DoubleSide });
    matCache.set(color, m);
  }
  return m;
}

/** A flat cut-out standing on its base edge (shape drawn in x/y, base at y=0). */
export function cutout(shape: Shape, color: number, thickness = 0.0016): Mesh {
  const geo = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -thickness / 2);
  const m = new Mesh(geo, paperMat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Hinged pop-up element: rotates from flat (lying back on the page) to upright. */
export class PopUp extends Group {
  /** 0 = flat, 1 = standing */
  amount = 0;
  delay = 0;
  /** lie flat towards −z (away) when folded */
  lieDir = 1;
  private popped = false;
  onPop: (() => void) | null = null;

  constructor(readonly content: Object3D, delay = 0) {
    super();
    this.add(content);
    this.delay = delay;
    this.apply();
  }

  /** progress: global pop progress in seconds since the page opened */
  setProgress(seconds: number): void {
    const t = clamp((seconds - this.delay) / 0.45, 0, 1);
    const k = easeOutBack(t, 2.2);
    if (t > 0 && !this.popped) {
      this.popped = true;
      this.onPop?.();
    }
    if (t === 0) this.popped = false;
    this.amount = k;
    this.apply();
  }

  /** fold flat as the page closes (0..1 closed) */
  setClosed(c: number): void {
    this.amount = Math.min(this.amount, 1 - c);
    this.apply();
  }

  private apply(): void {
    this.rotation.x = -(1 - this.amount) * (Math.PI / 2) * this.lieDir;
    this.visible = this.amount > 0.02;
  }
}

// ---- shapes ------------------------------------------------------------------

export function treeShape(w: number, h: number, tiers = 3): Shape {
  const s = new Shape();
  const trunkW = w * 0.14;
  const trunkH = h * 0.18;
  s.moveTo(-trunkW / 2, 0);
  s.lineTo(trunkW / 2, 0);
  s.lineTo(trunkW / 2, trunkH);
  for (let i = 0; i < tiers; i++) {
    const y0 = trunkH + (i * (h - trunkH)) / (tiers + 0.4);
    const ww = w * (1 - i * 0.22);
    s.lineTo(ww / 2, y0);
    s.lineTo(ww * 0.18, y0 + (h - trunkH) / (tiers + 0.4) * 1.1);
  }
  s.lineTo(0, h);
  for (let i = tiers - 1; i >= 0; i--) {
    const y0 = trunkH + (i * (h - trunkH)) / (tiers + 0.4);
    const ww = w * (1 - i * 0.22);
    s.lineTo(-ww * 0.18, y0 + (h - trunkH) / (tiers + 0.4) * 1.1);
    s.lineTo(-ww / 2, y0);
  }
  s.lineTo(-trunkW / 2, trunkH);
  s.closePath();
  return s;
}

export function roundTreeShape(w: number, h: number): Shape {
  const s = new Shape();
  const tw = w * 0.12;
  s.moveTo(-tw / 2, 0);
  s.lineTo(tw / 2, 0);
  s.lineTo(tw / 2, h * 0.35);
  s.absarc(0, h * 0.62, w / 2, -Math.PI / 2 + 0.25, Math.PI * 1.5 - 0.25, false);
  s.lineTo(-tw / 2, h * 0.35);
  s.closePath();
  return s;
}

export function hillShape(w: number, h: number, bumps = 2, seed = 1): Shape {
  const rnd = seededRandom(seed);
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -w / 2 + t * w;
    let y = Math.sin(t * Math.PI) * h;
    y *= 0.8 + 0.2 * Math.sin(t * Math.PI * bumps * 2 + rnd() * 0.3);
    s.lineTo(x, y);
  }
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}

export function cloudShape(w: number): Shape {
  const s = new Shape();
  const r = w / 4;
  s.moveTo(-w / 2, 0);
  s.absarc(-w / 4, r * 0.5, r * 0.9, Math.PI, Math.PI / 2, true);
  s.absarc(0, r * 1.0, r * 1.2, Math.PI * 0.9, Math.PI * 0.1, true);
  s.absarc(w / 4, r * 0.5, r * 0.9, Math.PI / 2, 0, true);
  s.lineTo(-w / 2, 0);
  return s;
}

export function houseShape(w: number, h: number): Shape {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * 0.6);
  s.lineTo(0, h);
  s.lineTo(-w / 2, h * 0.6);
  s.closePath();
  return s;
}

export function rectShape(w: number, h: number): Shape {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  return s;
}

// ---- prefab props --------------------------------------------------------------

export function tree(h = 0.07, color = 0x5c9e5a, round = false): Group {
  const g = new Group();
  const m = cutout(round ? roundTreeShape(h * 0.7, h) : treeShape(h * 0.7, h), color);
  g.add(m);
  // a crossed second layer gives the cut-out some volume
  const m2 = m.clone();
  m2.rotation.y = Math.PI / 2;
  m2.scale.x = 0.85;
  g.add(m2);
  return g;
}

export function hill(w: number, h: number, color: number, seed = 1): Mesh {
  return cutout(hillShape(w, h, 2, seed), color);
}

export function cloud(w: number): Mesh {
  return cutout(cloudShape(w), 0xfdfaf2);
}

export function grassTufts(n: number, area: [number, number], color = 0x7fbf6a, seed = 3): Group {
  const g = new Group();
  const rnd = seededRandom(seed);
  for (let i = 0; i < n; i++) {
    const s = new Shape();
    const w = 0.008 + rnd() * 0.006;
    const h = 0.008 + rnd() * 0.01;
    s.moveTo(-w / 2, 0);
    s.lineTo(-w / 4, h);
    s.lineTo(0, h * 0.4);
    s.lineTo(w / 4, h * 1.1);
    s.lineTo(w / 2, 0);
    s.closePath();
    const m = cutout(s, color, 0.001);
    m.position.set((rnd() - 0.5) * area[0], 0, (rnd() - 0.5) * area[1]);
    m.rotation.y = rnd() * Math.PI;
    g.add(m);
  }
  return g;
}

/** Flat ribbon of animated water lying on the page. */
export class Water extends Mesh {
  private tex: CanvasTexture;
  constructor(w: number, d: number, color = '#4f9fd8') {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 4;
    for (let y = 8; y < 128; y += 26) {
      g.beginPath();
      for (let x = 0; x <= 128; x += 4) {
        const yy = y + Math.sin((x / 128) * Math.PI * 4) * 4;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(w / 0.06, d / 0.06);
    super(new PlaneGeometry(w, d), new MeshLambertMaterial({ map: tex }));
    this.tex = tex;
    this.rotation.x = -Math.PI / 2;
    this.receiveShadow = true;
  }
  flow(dt: number, speedX: number, speedY: number): void {
    this.tex.offset.x += speedX * dt;
    this.tex.offset.y += speedY * dt;
  }
}

/** A paper flower that droops when thirsty and blooms when watered. */
export class Flower extends Group {
  bloom = 0;
  private stem: Group;
  private head: Group;
  private petals: Mesh[] = [];
  private petalMat: MeshLambertMaterial;
  private goal = 0;
  private dull = new Color(0x9b8a74);
  private col = new Color();
  constructor(readonly petalColor: number) {
    super();
    this.stem = new Group();
    const stem = new Mesh(new CylinderGeometry(0.0012, 0.0015, 0.05, 5), paperMat(0x4f8f45));
    stem.position.y = 0.025;
    this.stem.add(stem);
    const leaf = cutout(leafShape(0.016, 0.008), 0x67a85a, 0.0008);
    leaf.position.set(0.001, 0.016, 0);
    leaf.rotation.z = -0.6;
    this.stem.add(leaf);
    this.head = new Group();
    this.head.position.y = 0.05;
    const centre = new Mesh(new SphereGeometry(0.0045, 10, 8), paperMat(0xf2c23c));
    this.head.add(centre);
    // own material: petals change colour as the flower recovers
    this.petalMat = new MeshLambertMaterial({ color: petalColor, map: paperFiber(), side: DoubleSide });
    for (let i = 0; i < 6; i++) {
      const p = new Mesh(new CircleGeometry(0.0065, 10), this.petalMat);
      const a = (i / 6) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.006, Math.sin(a) * 0.006, -0.0005);
      this.petals.push(p);
      this.head.add(p);
    }
    this.stem.add(this.head);
    this.add(this.stem);
    this.apply();
  }
  water(): void {
    this.goal = 1;
  }
  update(dt: number, t: number): void {
    this.bloom += (this.goal - this.bloom) * (1 - Math.exp(-3 * dt));
    this.apply(t);
  }
  private apply(t = 0): void {
    const b = this.bloom;
    // droop: the stem bends and the head hangs, petals curl in and fade
    this.stem.rotation.z = (1 - b) * 0.9 + Math.sin(t * 2 + this.id) * 0.04 * b;
    this.head.rotation.x = (1 - b) * 1.1;
    const s = 0.45 + 0.55 * b;
    for (const p of this.petals) p.scale.setScalar(s);
    this.petalMat.color.copy(this.col.set(this.petalColor).lerp(this.dull, 1 - b));
  }
}

function leafShape(w: number, h: number): Shape {
  const s = new Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(w * 0.5, h, w, 0);
  s.quadraticCurveTo(w * 0.5, -h, 0, 0);
  return s;
}

/** Stone well with water inside. */
export function well(): Group {
  const g = new Group();
  const wall = new Mesh(new CylinderGeometry(0.022, 0.024, 0.022, 14, 1, true), paperMat(0xb9aa96));
  wall.position.y = 0.011;
  wall.castShadow = true;
  g.add(wall);
  const water = new Mesh(new CircleGeometry(0.021, 20), new MeshLambertMaterial({ color: 0x3f8fd0 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.014;
  water.name = 'well-water';
  g.add(water);
  for (const sx of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.0018, 0.0018, 0.05, 6), paperMat(0x7a5232));
    post.position.set(sx * 0.02, 0.035, 0);
    g.add(post);
  }
  const roof = new Mesh(new ConeGeometry(0.032, 0.022, 4), paperMat(0xc65a3e));
  roof.position.y = 0.068;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

/** Windmill with a spinning rotor (returned as userData.rotor). */
export function windmill(): Group {
  const g = new Group();
  const tower = new Mesh(new CylinderGeometry(0.012, 0.02, 0.09, 8), paperMat(0xf0e2c8));
  tower.position.y = 0.045;
  tower.castShadow = true;
  g.add(tower);
  const cap = new Mesh(new ConeGeometry(0.016, 0.02, 8), paperMat(0xc65a3e));
  cap.position.y = 0.1;
  g.add(cap);
  const rotor = new Group();
  rotor.position.set(0, 0.088, 0.016);
  for (let i = 0; i < 4; i++) {
    const blade = cutout(rectShape(0.012, 0.045), i % 2 ? 0xfdf6e7 : 0x7fb4d8, 0.0008);
    blade.rotation.z = (i / 4) * Math.PI * 2;
    rotor.add(blade);
  }
  const hub = new Mesh(new SphereGeometry(0.004, 8, 6), paperMat(0x5a4636));
  rotor.add(hub);
  g.add(rotor);
  g.userData.rotor = rotor;
  return g;
}

export function sign(text: string, w = 0.05): Group {
  const g = new Group();
  const post = new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.04, 5), paperMat(0x7a5232));
  post.position.y = 0.02;
  g.add(post);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c8a06a';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#3b2a20';
  ctx.font = '600 44px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 50);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const board = new Mesh(new PlaneGeometry(w, w * 0.375), new MeshLambertMaterial({ map: tex, side: DoubleSide }));
  board.position.y = 0.04;
  board.castShadow = true;
  g.add(board);
  return g;
}

export function sun(r = 0.02): Group {
  const g = new Group();
  const disc = new Mesh(new CircleGeometry(r, 24), new MeshBasicMaterial({ color: 0xffd257, side: DoubleSide }));
  g.add(disc);
  for (let i = 0; i < 10; i++) {
    const ray = cutout(rectShape(r * 0.18, r * 0.5), 0xffc23c, 0.0008);
    const a = (i / 10) * Math.PI * 2;
    ray.position.set(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, 0);
    ray.rotation.z = a - Math.PI / 2;
    g.add(ray);
  }
  return g;
}

export function rainbow(r = 0.09): Group {
  const g = new Group();
  const cols = [0xe85d4a, 0xf29b3a, 0xf2d03a, 0x7cc36a, 0x5fa8d3, 0x8a6fd6];
  cols.forEach((c, i) => {
    const t = new Mesh(new TorusGeometry(r - i * 0.006, 0.003, 4, 40, Math.PI), paperMat(c));
    g.add(t);
  });
  return g;
}

export function moon(): Mesh {
  const s = new Shape();
  s.absarc(0, 0, 0.018, 0.6, Math.PI * 2 - 0.6, false);
  s.absarc(0.008, 0, 0.014, Math.PI * 2 - 0.9, 0.9, true);
  return cutout(s, 0xfff1b8);
}

export function star(r = 0.007, color = 0xffe08a): Mesh {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return cutout(s, color, 0.0008);
}

/** A marker object used to find interaction spots in world space. */
export function marker(name: string, at: Vector3): Object3D {
  const o = new Object3D();
  o.name = name;
  o.position.copy(at);
  return o;
}
