/**
 * Paper faces are drawn into canvases indexed by *paper-space* coordinates,
 * so crease marks and ink (eyes, cheeks) land on the right spot of the sheet
 * no matter how it is folded.
 */
import { CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter } from '@iwsdk/core';
import { Vec2 } from '../fold/geom.js';
import { ModelDef, ResolvedMark } from '../fold/model.js';
import { seededRandom } from '../core/util.js';

const PX_PER_UNIT = 512;

export class PaperFace {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  private base: HTMLCanvasElement;

  constructor(
    readonly w: number,
    readonly h: number,
    color: string,
    pattern: ModelDef['paper']['pattern'],
    seed: number,
    patterned: boolean,
  ) {
    const cw = Math.round(w * PX_PER_UNIT);
    const ch = Math.round(h * PX_PER_UNIT);
    this.base = makeCanvas(cw, ch);
    paintBase(this.base, color, patterned ? pattern ?? 'plain' : 'plain', seed);
    this.canvas = makeCanvas(cw, ch);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.drawImage(this.base, 0, 0);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
  }

  /** paper space → canvas pixels (v grows downward in canvas) */
  px(q: Vec2): [number, number] {
    return [
      (q[0] / this.w + 0.5) * this.canvas.width,
      (0.5 - q[1] / this.h) * this.canvas.height,
    ];
  }

  redraw(creases: { a: Vec2; b: Vec2 }[], marks: (ResolvedMark & { kind: 'eye' | 'cheek' })[], blink = 0): void {
    const c = this.ctx;
    c.drawImage(this.base, 0, 0);
    // Crease marks: a soft shadow line plus a thin highlight, like a real fold.
    c.lineCap = 'round';
    for (const cr of creases) {
      const [ax, ay] = this.px(cr.a);
      const [bx, by] = this.px(cr.b);
      c.strokeStyle = 'rgba(60,40,30,0.22)';
      c.lineWidth = 3.2;
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(ax + 1.2, ay + 1.2);
      c.lineTo(bx + 1.2, by + 1.2);
      c.stroke();
    }
    for (const m of marks) {
      const [x, y] = this.px(m.at);
      const r = (m.r / this.w) * this.canvas.width;
      if (m.kind === 'eye') {
        const squash = 1 - 0.9 * blink;
        c.fillStyle = '#231a17';
        c.beginPath();
        c.ellipse(x, y, r, Math.max(r * squash, 1.2), 0, 0, Math.PI * 2);
        c.fill();
        if (blink < 0.5) {
          c.fillStyle = 'rgba(255,255,255,0.9)';
          c.beginPath();
          c.arc(x - r * 0.35, y - r * 0.35 * squash, r * 0.32, 0, Math.PI * 2);
          c.fill();
        }
      } else {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,105,140,0.55)');
        g.addColorStop(1, 'rgba(255,105,140,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Shade a hex colour by a factor (<1 darker, >1 lighter). */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function paintBase(cv: HTMLCanvasElement, color: string, pattern: string, seed: number): void {
  const c = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const rnd = seededRandom(seed);
  c.fillStyle = color;
  c.fillRect(0, 0, W, H);

  // Washi-style pattern, kept subtle so folds stay readable.
  c.save();
  c.globalAlpha = 0.16;
  c.fillStyle = shade(color, 1.45);
  c.strokeStyle = shade(color, 1.45);
  const u = 64;
  switch (pattern) {
    case 'dots':
      for (let y = 0; y < H + u; y += u * 0.5)
        for (let x = (y / (u * 0.5)) % 2 ? u * 0.25 : 0; x < W + u; x += u * 0.5) {
          c.beginPath();
          c.arc(x, y, 5, 0, Math.PI * 2);
          c.fill();
        }
      break;
    case 'stripes':
      c.lineWidth = 9;
      for (let x = -H; x < W + H; x += 40) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x + H, H);
        c.stroke();
      }
      break;
    case 'waves':
      c.lineWidth = 5;
      for (let y = 10; y < H + 20; y += 34) {
        c.beginPath();
        for (let x = 0; x <= W; x += 8) {
          const yy = y + Math.sin((x / W) * Math.PI * 6 + y * 0.1) * 7;
          if (x === 0) c.moveTo(x, yy);
          else c.lineTo(x, yy);
        }
        c.stroke();
      }
      break;
    case 'hearts':
      for (let y = 20; y < H; y += 70)
        for (let x = (y / 70) % 2 ? 50 : 15; x < W; x += 70) heartPath(c, x, y, 11);
      break;
    case 'stars':
      for (let i = 0; i < 60; i++) starPath(c, rnd() * W, rnd() * H, 5 + rnd() * 6);
      break;
    case 'leaves':
      for (let i = 0; i < 50; i++) {
        c.save();
        c.translate(rnd() * W, rnd() * H);
        c.rotate(rnd() * Math.PI * 2);
        c.beginPath();
        c.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      break;
  }
  c.restore();

  // Paper fibres: thousands of tiny light/dark flecks.
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d[i] = clampByte(d[i] + n);
    d[i + 1] = clampByte(d[i + 1] + n);
    d[i + 2] = clampByte(d[i + 2] + n);
  }
  c.putImageData(img, 0, 0);
  c.globalAlpha = 0.08;
  c.strokeStyle = '#000';
  c.lineWidth = 1;
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const a = rnd() * Math.PI * 2;
    const l = 4 + rnd() * 14;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a + 1) * l * 0.5, y + Math.sin(a + 1) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
  c.globalAlpha = 1;
}

const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function heartPath(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.6);
  c.bezierCurveTo(x - s * 1.4, y - s * 0.4, x - s * 0.5, y - s * 1.3, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.5, y - s * 1.3, x + s * 1.4, y - s * 0.4, x, y + s * 0.6);
  c.fill();
}

function starPath(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? s * 0.45 : s;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
}
