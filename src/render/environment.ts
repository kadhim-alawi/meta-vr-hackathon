/**
 * Lighting, the folding mat, a passthrough shadow catcher, and a cozy
 * paper-craft study for VR mode (hidden in mixed reality, where the player's
 * own room is the set).
 */
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  ShadowMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from '@iwsdk/core';
import { seededRandom } from '../core/util.js';

export const MAT_SIZE = 0.34;

export class Environment {
  readonly lights = new Group();
  readonly room = new Group();
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  /** children of the desk: mat and shadow catcher */
  readonly deskDecor = new Group();
  private catcher: Mesh;
  private deskTop: Mesh;
  /** the folding mat; scenes slide it aside when the book comes close */
  readonly mat: Mesh;
  private lamp: PointLight;

  constructor(renderer: WebGLRenderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;

    this.hemi = new HemisphereLight(0xfff4e6, 0x6b5848, 1.25);
    this.sun = new DirectionalLight(0xfff1dc, 1.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(768, 768);
    const cam = this.sun.shadow.camera;
    cam.left = -0.45;
    cam.right = 0.45;
    cam.top = 0.45;
    cam.bottom = -0.45;
    cam.near = 0.05;
    cam.far = 2.5;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.002;
    this.sun.shadow.radius = 3;
    this.lights.add(this.hemi, this.sun, this.sun.target);

    // Folding mat (a self-healing cutting mat) and shadow catcher on the desk.
    const mat = new Mesh(new PlaneGeometry(MAT_SIZE, MAT_SIZE), new MeshLambertMaterial({ map: matTexture() }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.0006;
    mat.receiveShadow = true;
    mat.name = 'folding-mat';
    this.deskDecor.add(mat);
    this.mat = mat;

    this.catcher = new Mesh(new PlaneGeometry(1.6, 1.2), new ShadowMaterial({ opacity: 0.32 }));
    this.catcher.rotation.x = -Math.PI / 2;
    this.catcher.position.set(0, 0.0002, -0.15);
    this.catcher.receiveShadow = true;
    this.deskDecor.add(this.catcher);

    // Virtual desk top, used in VR or when no real table was found.
    this.deskTop = new Mesh(new BoxGeometry(1.15, 0.035, 0.68), new MeshLambertMaterial({ map: woodTexture() }));
    this.deskTop.position.set(0, -0.0178, -0.16);
    this.deskTop.receiveShadow = true;
    this.deskDecor.add(this.deskTop);

    this.lamp = new PointLight(0xffc77a, 0.0, 2.5, 2);
    this.lamp.position.set(-0.45, 0.42, -0.4);
    this.deskDecor.add(this.lamp);

    this.buildRoom();
  }

  /** Aim the sun at the desk so its shadow box covers the play area. */
  follow(deskWorldPos: Vector3): void {
    this.sun.position.copy(deskWorldPos).add(new Vector3(-0.35, 1.1, 0.45));
    this.sun.target.position.copy(deskWorldPos).add(new Vector3(0, 0, -0.15));
    this.sun.target.updateMatrixWorld();
  }

  /**
   * MR with a real table: only the mat and shadows. MR on a "floating desk":
   * show a desk top too. VR: the whole study.
   */
  setMode(mode: 'mr-table' | 'mr-floating' | 'vr'): void {
    this.room.visible = mode === 'vr';
    this.deskTop.visible = mode !== 'mr-table';
    this.catcher.visible = mode === 'mr-table';
    this.lamp.intensity = mode === 'vr' ? 0.9 : 0;
    this.hemi.intensity = mode === 'vr' ? 0.95 : 1.25;
  }

  private buildRoom(): void {
    const rnd = seededRandom(5);
    const g = this.room;
    // floor
    const floor = new Mesh(new CircleGeometry(6, 48), new MeshLambertMaterial({ color: 0x5a4636 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    // a rug
    const rug = new Mesh(new CircleGeometry(1.3, 40), new MeshLambertMaterial({ color: 0x8c3f35 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.003;
    g.add(rug);
    // back wall with a big round window full of paper stars
    const wall = new Mesh(new PlaneGeometry(8, 4), new MeshLambertMaterial({ color: 0xe9d9bf }));
    wall.position.set(0, 2, -2.4);
    g.add(wall);
    const win = new Mesh(new CircleGeometry(0.85, 48), new MeshBasicMaterial({ color: 0x1d2547 }));
    win.position.set(0, 1.75, -2.39);
    g.add(win);
    const frame = new Mesh(new CylinderGeometry(0.9, 0.9, 0.06, 48, 1, true), new MeshLambertMaterial({ color: 0x7a5232 }));
    frame.rotation.x = Math.PI / 2;
    frame.position.copy(win.position);
    g.add(frame);
    const starMat = new MeshBasicMaterial({ color: 0xffe9a8 });
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.78;
      const s = new Mesh(new SphereGeometry(0.008 + rnd() * 0.012, 6, 4), starMat);
      s.position.set(Math.cos(a) * r, 1.75 + Math.sin(a) * r, -2.38);
      g.add(s);
    }
    const moon = new Mesh(new CircleGeometry(0.16, 32), new MeshBasicMaterial({ color: 0xfff3cf }));
    moon.position.set(0.35, 2.05, -2.375);
    g.add(moon);
    // side walls
    for (const sx of [-1, 1]) {
      const w = new Mesh(new PlaneGeometry(6, 4), new MeshLambertMaterial({ color: 0xdcc8aa }));
      w.position.set(sx * 3, 2, 0.4);
      w.rotation.y = -sx * Math.PI / 2;
      g.add(w);
    }
    // hanging paper lanterns
    const lanternColors = [0xe85d4a, 0xf2b84b, 0x5fa8d3, 0x8bc48a, 0xd77fb3];
    for (let i = 0; i < 7; i++) {
      const lg = new Group();
      const col = lanternColors[i % lanternColors.length];
      const body = new Mesh(new SphereGeometry(0.11, 14, 10), new MeshBasicMaterial({ color: new Color(col).multiplyScalar(1.15) }));
      body.scale.y = 1.2;
      const cord = new Mesh(new CylinderGeometry(0.003, 0.003, 0.6, 4), new MeshLambertMaterial({ color: 0x333333 }));
      cord.position.y = 0.4;
      lg.add(body, cord);
      const a = -1.2 + (i / 6) * 2.4;
      lg.position.set(Math.sin(a) * 2.0, 2.3 + rnd() * 0.3, -Math.cos(a) * 2.0 + 0.2);
      g.add(lg);
    }
    // bookshelf silhouettes
    const shelfMat = new MeshLambertMaterial({ color: 0x6b4a2f });
    for (const sx of [-1, 1]) {
      const shelf = new Mesh(new BoxGeometry(0.9, 1.9, 0.3), shelfMat);
      shelf.position.set(sx * 1.7, 0.95, -2.2);
      g.add(shelf);
      for (let r = 0; r < 4; r++) {
        let x = -0.38;
        while (x < 0.36) {
          const w = 0.03 + rnd() * 0.05;
          const h = 0.25 + rnd() * 0.12;
          const book = new Mesh(
            new BoxGeometry(w, h, 0.2),
            new MeshLambertMaterial({ color: new Color().setHSL(rnd(), 0.45, 0.45) }),
          );
          book.position.set(sx * 1.7 + x + w / 2, 0.2 + r * 0.45 + h / 2, -2.05);
          g.add(book);
          x += w + 0.005;
        }
      }
    }
  }
}

function matTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f5d50';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,255,255,0.13)';
  g.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(256, 0);
  g.lineTo(256, 512);
  g.moveTo(0, 256);
  g.lineTo(512, 256);
  g.stroke();
  g.strokeStyle = 'rgba(255,230,160,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(512, 512);
  g.moveTo(512, 0);
  g.lineTo(0, 512);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 506, 506);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function woodTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const rnd = seededRandom(9);
  g.fillStyle = '#9a6b45';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${60 + rnd() * 40},${35 + rnd() * 20},${20},${0.12 + rnd() * 0.18})`;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath();
    const y = rnd() * 256;
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6 + (rnd() - 0.5) * 3);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}
