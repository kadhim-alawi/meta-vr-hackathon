/**
 * A sheet of origami paper: both printed faces, the shared material and the
 * mesh view. Keeps the crease/ink textures in sync with the paper state.
 */
import { MeshLambertMaterial } from '@iwsdk/core';
import { ModelDef, ResolvedMark, resolveMarks } from '../fold/model.js';
import { PaperState } from '../fold/paper.js';
import { PaperFace } from './paper-texture.js';
import { PaperView, createPaperMaterial } from './paper-view.js';

export class PaperSheet {
  readonly front: PaperFace;
  readonly back: PaperFace;
  readonly material: MeshLambertMaterial;
  readonly view: PaperView;
  private marks: (ResolvedMark & { kind: 'eye' | 'cheek' })[] = [];
  private blink = 0;

  constructor(
    readonly def: ModelDef,
    public state: PaperState,
    readonly S: number,
    seed = 1,
    colors?: { front: string; back: string },
  ) {
    const p = def.paper;
    this.front = new PaperFace(p.w, p.h, colors?.front ?? p.front, p.pattern, seed, true);
    this.back = new PaperFace(p.w, p.h, colors?.back ?? p.back, 'plain', seed + 101, false);
    this.material = createPaperMaterial({ front: this.front.texture, back: this.back.texture });
    this.view = new PaperView(state, this.material, S);
  }

  setState(state: PaperState): void {
    this.state = state;
    this.redraw();
  }

  /** Ink the eyes (and cheeks) onto whichever face shows on the finished model. */
  drawFace(): void {
    this.marks = [
      ...resolveMarks(this.state, this.def.eyes).map((m) => ({ ...m, kind: 'eye' as const })),
      ...resolveMarks(this.state, this.def.cheeks).map((m) => ({ ...m, kind: 'cheek' as const })),
    ];
    this.redraw();
  }

  setBlink(v: number): void {
    // three steps read as a blink and keep texture uploads to a few per blink
    v = Math.round(v * 2) / 2;
    if (v === this.blink || this.marks.length === 0) return;
    this.blink = v;
    this.redraw(true);
  }

  /** Repaint the faces; `inkedOnly` skips a face that carries no eyes. */
  redraw(inkedOnly = false): void {
    const creases = this.state.creases;
    const front = this.marks.filter((m) => m.face === 'front');
    const back = this.marks.filter((m) => m.face === 'back');
    if (!inkedOnly || front.length) this.front.redraw(creases, front, this.blink);
    if (!inkedOnly || back.length) this.back.redraw(creases, back, this.blink);
  }

  dispose(): void {
    this.view.dispose();
    this.front.dispose();
    this.back.dispose();
    this.material.dispose();
  }
}
