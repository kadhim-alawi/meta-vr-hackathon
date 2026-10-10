/**
 * Canvas-rendered text cards. Everything is drawn on paper-like cards so the
 * UI belongs to the same handmade world as the origami.
 */
import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

let fontsReady: Promise<void> | null = null;

/** Load bundled fonts once (OFL licensed, served from /fonts). */
export function loadFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  const base = import.meta.env.BASE_URL;
  const faces = [
    new FontFace('Fredoka', `url(${base}fonts/fredoka-600.woff2)`, { weight: '600' }),
    new FontFace('Nunito', `url(${base}fonts/nunito-700.woff2)`, { weight: '700' }),
    new FontFace('Nunito', `url(${base}fonts/nunito-800.woff2)`, { weight: '800' }),
  ];
  fontsReady = Promise.all(
    faces.map((f) =>
      f
        .load()
        .then((ff) => {
          document.fonts.add(ff);
        })
        .catch(() => undefined),
    ),
  ).then(() => undefined);
  return fontsReady;
}

export const TITLE_FONT = '600 {px}px Fredoka, "Nunito", system-ui, sans-serif';
export const BODY_FONT = '700 {px}px Nunito, system-ui, sans-serif';
export const BOLD_FONT = '800 {px}px Nunito, system-ui, sans-serif';
export const font = (tpl: string, px: number) => tpl.replace('{px}', String(Math.round(px)));

export interface CardStyle {
  /** card fill; 'none' for transparent text */
  bg?: string;
  fg?: string;
  accent?: string;
  /** relative padding (fraction of height) */
  pad?: number;
  radius?: number;
  shadow?: boolean;
  /** draw a little tail at the bottom (speech bubble) */
  tail?: 'none' | 'bottom';
  border?: string;
  align?: 'left' | 'center';
}

export interface TextLine {
  text: string;
  size?: number; // relative size (1 = body)
  font?: 'title' | 'body' | 'bold';
  color?: string;
}

/**
 * A flat card of text. Width is fixed in metres; height follows the content
 * unless `fixedHeight` is given.
 */
export class TextCard {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private tex: CanvasTexture;
  private mat: MeshBasicMaterial;
  private key = '';
  heightM = 0;

  constructor(
    public widthM: number,
    private pxPerM = 2600,
    private fixedHeight?: number,
  ) {
    this.canvas.width = Math.round(widthM * pxPerM);
    this.canvas.height = 64;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 5;
  }

  set opacity(v: number) {
    this.mat.opacity = v;
    this.mesh.visible = v > 0.01;
  }

  get opacity(): number {
    return this.mat.opacity;
  }

  set(lines: (TextLine | string)[], style: CardStyle = {}): void {
    const ls = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
    const key = JSON.stringify([ls, style]);
    if (key === this.key) return;
    this.key = key;
    const W = this.canvas.width;
    const bodyPx = W * 0.062;
    const pad = (style.pad ?? 0.07) * W;
    const c = this.ctx;
    // Layout pass: wrap lines.
    const laid: { text: string; px: number; f: string; color: string }[] = [];
    for (const l of ls) {
      const px = bodyPx * (l.size ?? 1);
      const f = font(l.font === 'title' ? TITLE_FONT : l.font === 'bold' ? BOLD_FONT : BODY_FONT, px);
      c.font = f;
      for (const para of l.text.split('\n')) {
        const words = para.split(' ');
        let cur = '';
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (c.measureText(test).width > W - pad * 2 && cur) {
            laid.push({ text: cur, px, f, color: l.color ?? style.fg ?? '#3b2a20' });
            cur = w;
          } else cur = test;
        }
        laid.push({ text: cur, px, f, color: l.color ?? style.fg ?? '#3b2a20' });
      }
    }
    const lineGap = 1.28;
    const contentH = laid.reduce((a, l) => a + l.px * lineGap, 0);
    const tailH = style.tail === 'bottom' ? bodyPx * 0.9 : 0;
    const H = this.fixedHeight ? Math.round(this.fixedHeight * this.pxPerM) : Math.ceil(contentH + pad * 2 + tailH);
    if (this.canvas.height !== H) {
      this.canvas.height = H;
      this.tex.dispose();
      this.tex = new CanvasTexture(this.canvas);
      this.tex.colorSpace = SRGBColorSpace;
      this.tex.anisotropy = 4;
      this.mat.map = this.tex;
      this.mat.needsUpdate = true;
    }
    c.clearRect(0, 0, W, H);
    const bodyH = H - tailH;
    if (style.bg !== 'none') {
      const r = (style.radius ?? 0.06) * W;
      if (style.shadow !== false) {
        c.fillStyle = 'rgba(40,25,10,0.22)';
        roundRect(c, 6, 10, W - 12, bodyH - 14, r);
        c.fill();
      }
      c.fillStyle = style.bg ?? '#fffaf0';
      roundRect(c, 4, 4, W - 12, bodyH - 16, r);
      c.fill();
      if (style.tail === 'bottom') {
        c.beginPath();
        c.moveTo(W * 0.42, bodyH - 14);
        c.lineTo(W * 0.5, H - 4);
        c.lineTo(W * 0.56, bodyH - 14);
        c.closePath();
        c.fill();
      }
      if (style.border) {
        c.strokeStyle = style.border;
        c.lineWidth = W * 0.008;
        roundRect(c, 4, 4, W - 12, bodyH - 16, r);
        c.stroke();
      }
    }
    let y = (bodyH - 12 - contentH) / 2;
    c.textBaseline = 'top';
    for (const l of laid) {
      c.font = l.f;
      c.fillStyle = l.color;
      c.textAlign = style.align === 'left' ? 'left' : 'center';
      const x = style.align === 'left' ? pad : W / 2;
      c.fillText(l.text, x, y + l.px * 0.12);
      y += l.px * lineGap;
    }
    this.tex.needsUpdate = true;
    this.heightM = H / this.pxPerM;
    this.mesh.scale.set(this.widthM, this.heightM, 1);
  }

  dispose(): void {
    this.tex.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Plain material for UI that should ignore lighting. */
export function flatMaterial(color: number, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}

export { PlaneGeometry };
