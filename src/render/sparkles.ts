/**
 * Pooled additive sparkle particles (one instanced draw call). Used for fold
 * snaps, Foldlings waking up, water, wind and celebrations.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { seededRandom } from '../core/util.js';

const MAX = 400;

interface P {
  pos: Vector3;
  vel: Vector3;
  life: number;
  max: number;
  size: number;
  color: Color;
  gravity: number;
  drag: number;
}

export class Sparkles {
  readonly mesh: InstancedMesh;
  private ps: P[] = [];
  private free: P[] = [];
  private rnd = seededRandom(3);
  private m = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private camQ = new Quaternion();
  private colors: InstancedBufferAttribute;

  constructor() {
    const tex = makeStarTexture();
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.colors = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.instanceColor = this.colors;
    this.mesh.count = 0;
    for (let i = 0; i < MAX; i++) {
      this.free.push({ pos: new Vector3(), vel: new Vector3(), life: 0, max: 1, size: 0.01, color: new Color(), gravity: 0, drag: 2 });
    }
  }

  private spawn(): P | null {
    return this.free.pop() ?? null;
  }

  burst(at: Vector3, count = 16, color = new Color(0xffe2a0), speed = 0.25, size = 0.012, gravity = -0.3): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn();
      if (!p) return;
      p.pos.copy(at);
      p.vel.set(this.rnd() - 0.5, this.rnd() * 0.8 + 0.1, this.rnd() - 0.5).normalize().multiplyScalar(speed * (0.4 + this.rnd()));
      p.life = 0;
      p.max = 0.5 + this.rnd() * 0.6;
      p.size = size * (0.6 + this.rnd() * 0.8);
      p.color.copy(color).offsetHSL((this.rnd() - 0.5) * 0.08, 0, (this.rnd() - 0.5) * 0.2);
      p.gravity = gravity;
      p.drag = 2.5;
      this.ps.push(p);
    }
  }

  burstLine(a: Vector3, b: Vector3, count = 14, color = new Color(0xfff0c0)): void {
    const tmp = new Vector3();
    for (let i = 0; i < count; i++) {
      tmp.lerpVectors(a, b, this.rnd());
      this.burst(tmp, 1, color, 0.12, 0.009, -0.05);
    }
  }

  /** Slow rising motes (ambient magic). */
  drift(at: Vector3, color = new Color(0xffe9b0), spread = 0.05): void {
    const p = this.spawn();
    if (!p) return;
    p.pos.set(at.x + (this.rnd() - 0.5) * spread, at.y, at.z + (this.rnd() - 0.5) * spread);
    p.vel.set((this.rnd() - 0.5) * 0.02, 0.03 + this.rnd() * 0.04, (this.rnd() - 0.5) * 0.02);
    p.life = 0;
    p.max = 1.2 + this.rnd();
    p.size = 0.006 + this.rnd() * 0.006;
    p.color.copy(color);
    p.gravity = 0;
    p.drag = 0.2;
    this.ps.push(p);
  }

  /** Water droplets. */
  droplets(at: Vector3, dir: Vector3, count = 6): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn();
      if (!p) return;
      p.pos.copy(at);
      p.vel.copy(dir).multiplyScalar(0.5 + this.rnd() * 0.5);
      p.vel.x += (this.rnd() - 0.5) * 0.08;
      p.vel.z += (this.rnd() - 0.5) * 0.08;
      p.life = 0;
      p.max = 0.6;
      p.size = 0.006 + this.rnd() * 0.004;
      p.color.setRGB(0.45, 0.75, 1.0);
      p.gravity = -2.2;
      p.drag = 0.4;
      this.ps.push(p);
    }
  }

  update(dt: number, camQuat: Quaternion): void {
    this.camQ.copy(camQuat);
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.ps[i] = this.ps[this.ps.length - 1];
        this.ps.pop();
        this.free.push(p);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
    }
    for (const p of this.ps) {
      const t = p.life / p.max;
      const sz = p.size * Math.sin(Math.PI * Math.min(1, t * 1.4 + 0.1));
      this.q.copy(this.camQ);
      this.m.compose(p.pos, this.q, this.s.set(sz, sz, sz));
      this.mesh.setMatrixAt(n, this.m);
      this.colors.setXYZ(n, p.color.r, p.color.g, p.color.b);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true;
  }
}

function makeStarTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(32, 4);
  g.lineTo(32, 60);
  g.moveTo(4, 32);
  g.lineTo(60, 32);
  g.stroke();
  return new CanvasTexture(c);
}
