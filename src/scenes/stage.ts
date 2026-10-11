/**
 * Shared stagecraft for scenes: the floating hint card, folding a model on
 * the mat and waking it, the shelf where finished Foldlings live, and moving
 * the mat aside when the book needs the space.
 */
import { Group, Quaternion, Vector3 } from '@iwsdk/core';
import type { App } from '../app/app.js';
import { clamp, damp } from '../core/util.js';
import { Script } from '../core/script.js';
import { ModelDef, runModel } from '../fold/model.js';
import { FoldController } from '../game/fold-controller.js';
import { Foldling, Surface } from '../game/foldling.js';
import { PaperSheet } from '../render/paper-sheet.js';
import { TextCard } from '../ui/text.js';

export const SHEET_SIZE = 0.22;

export class Stage {
  readonly group = new Group();
  readonly hint = new TextCard(0.26, 2600);
  readonly foldlings: Foldling[] = [];
  fold: FoldController | null = null;
  private hintGoal = new Vector3(0, 0.15, -0.2);
  private hintAlpha = 0;
  private hintWanted = false;
  private matGoal = new Vector3(0, 0.0006, 0);
  private matScale = 1;
  private matScaleGoal = 1;
  private tmp = new Vector3();
  private viewV = new Vector3();
  private viewQ = new Quaternion();
  surfaces: Surface[] = [];
  /** shelf slots used so far */
  private shelfUsed = 0;
  /** multiplier for handle sizes etc. (accessibility) */
  bigUI = false;

  constructor(private app: App) {
    this.hint.opacity = 0;
    this.group.add(this.hint.mesh);
    app.deskGroup.add(this.group);
  }

  showHint(text: string, sub?: string, at?: Vector3): void {
    const lines = [{ text, size: 1 }];
    if (sub) lines.push({ text: sub, size: 0.72, color: '#8a6a50' } as { text: string; size: number; color?: string });
    this.hint.set(lines, { bg: '#fffaf0', radius: 0.1 });
    if (at) this.hintGoal.copy(at);
    this.hintWanted = true;
  }

  hideHint(): void {
    this.hintWanted = false;
  }

  hintAt(p: Vector3): void {
    this.hintGoal.copy(p);
  }

  /** Slide the folding mat to the middle, or tuck it away to the right. */
  matTo(where: 'center' | 'aside'): void {
    if (where === 'center') {
      this.matGoal.set(0, 0.0006, 0);
      this.matScaleGoal = 1;
    } else {
      this.matGoal.set(0.36, 0.0006, 0.06);
      this.matScaleGoal = 0.45;
    }
  }

  /**
   * Fold a model on the mat and bring it to life. Resolves with the awake
   * Foldling once its waking animation has finished.
   */
  async foldAndWake(script: Script, def: ModelDef, colors?: { front: string; back: string }): Promise<Foldling> {
    this.matTo('center');
    const fc = new FoldController(def, SHEET_SIZE, this.app.audio, this.app.sparkles, Math.floor(Math.random() * 1000), colors);
    this.fold = fc;
    this.group.add(fc.group);
    this.hintAt(new Vector3(0, 0.16, -0.21));
    let done = false;
    fc.events.on('step', (e) => {
      const p = fc.progress;
      if (!e.step && e.hint) this.showHint(e.hint);
      else if (e.step) {
        const dots = '●'.repeat(p.done) + '○'.repeat(Math.max(0, p.total - p.done));
        this.showHint(e.hint, e.step.auto ? 'watch…' : dots);
      }
    });
    fc.events.on('folded', (e) => {
      if (e.manual) this.app.save.data.folds++;
    });
    fc.events.on('complete', () => {
      done = true;
    });
    // paper slides onto the mat
    fc.group.position.set(0, 0.06, -0.12);
    this.app.audio.whoosh(this.app.fromDesk(fc.group.position), 0.5, false);
    fc.start();
    await script.until(() => {
      fc.group.position.lerp(this.tmp.set(0, 0, 0), 0.18);
      return fc.group.position.lengthSq() < 1e-6;
    });
    await script.until(() => done);
    this.hideHint();
    this.app.save.data.crisp += fc.crisp;
    this.app.save.write();
    await script.wait(0.35);
    const f = this.spawnFrom(fc, def);
    this.fold = null;
    await script.wait(1.7);
    return f;
  }

  /** Turn a finished fold into a living Foldling on the mat. */
  private spawnFrom(fc: FoldController, def: ModelDef): Foldling {
    // the Foldling takes over the sheet (textures, creases and all)
    const sheet = fc.sheet;
    fc.releaseSheet();
    sheet.view.group.removeFromParent();
    fc.dispose();
    this.group.remove(fc.group);
    const f = new Foldling(this.app, def, fc.state, sheet);
    f.group.position.set(0, 0, 0.0);
    f.surfaces = this.surfaces;
    this.app.deskGroup.add(f.group);
    f.wake();
    this.foldlings.push(f);
    return f;
  }

  /** Rebuild a Foldling from a saved model (instantly folded). */
  materialize(def: ModelDef, at: Vector3, colors?: { front: string; back: string }, awake = true): Foldling {
    const states = runModel(def);
    const final = states[states.length - 1];
    const sheet = new PaperSheet(def, final, SHEET_SIZE, Math.floor(Math.random() * 1000), colors);
    const f = new Foldling(this.app, def, final, sheet);
    f.group.position.copy(at);
    f.surfaces = this.surfaces;
    this.app.deskGroup.add(f.group);
    if (awake) f.awaken();
    this.foldlings.push(f);
    return f;
  }

  /** Next free spot on the shelf along the left edge of the desk. */
  shelfSpot(out = new Vector3()): Vector3 {
    const i = this.shelfUsed++;
    const col = Math.floor(i / 5);
    const row = i % 5;
    return out.set(-0.36 - col * 0.07, 0, -0.26 + row * 0.085);
  }

  /** Send a Foldling to the shelf. */
  async toShelf(f: Foldling): Promise<void> {
    const spot = this.shelfSpot();
    f.grabbable = true;
    await f.moveToPos(spot, 0.9, 0.06);
    f.faceTowards(new Vector3(0, 0, 0.4));
  }

  /**
   * FoV-aware placement: if a card (desk-local position, half size in
   * metres) would sit outside a comfortable cone of this headset's actual
   * field of view, slide it to the cone's edge. Wide Quest views leave it
   * where it was authored; the narrower VR Glasses view pulls it in.
   */
  keepInView(pos: Vector3, halfW: number, halfH: number, comfort = 0.85): void {
    const app = this.app;
    const v = app.fromDesk(pos, this.viewV).sub(app.headPos).applyQuaternion(this.viewQ.copy(app.headQuat).invert());
    const z = -v.z;
    if (z < 0.15) return;
    const f = app.fov;
    const x = clamp(v.x, Math.min(0, -f.left * comfort * z + halfW), Math.max(0, f.right * comfort * z - halfW));
    const y = clamp(v.y, Math.min(0, -f.down * comfort * z + halfH), Math.max(0, f.up * comfort * z - halfH));
    if (x === v.x && y === v.y) return;
    v.x = x;
    v.y = y;
    v.applyQuaternion(app.headQuat).add(app.headPos);
    app.toDesk(v, pos);
  }

  update(dt: number, time: number): void {
    // hint card: ease in/out and face the player
    this.hintAlpha += ((this.hintWanted ? 1 : 0) - this.hintAlpha) * damp(8, dt);
    this.hint.opacity = this.hintAlpha;
    this.hint.mesh.position.lerp(this.hintGoal, damp(6, dt));
    if (this.hintAlpha > 0.05) this.keepInView(this.hint.mesh.position, this.hint.widthM / 2, this.hint.heightM / 2);
    this.hint.mesh.lookAt(this.app.headPos);
    // mat glide
    const mat = this.app.env.mat;
    mat.position.lerp(this.matGoal, damp(5, dt));
    this.matScale += (this.matScaleGoal - this.matScale) * damp(5, dt);
    mat.scale.setScalar(this.matScale);
    this.fold?.update(dt, time, this.app.hands);
    for (const f of this.foldlings) f.update(dt, time);
  }

  dispose(): void {
    this.fold?.dispose();
    for (const f of this.foldlings) f.dispose();
    this.foldlings.length = 0;
    this.group.removeFromParent();
    this.hint.dispose();
    this.app.env.mat.position.set(0, 0.0006, 0);
    this.app.env.mat.scale.setScalar(1);
  }
}
