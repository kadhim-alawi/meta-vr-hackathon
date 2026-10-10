/**
 * Development scene: fold any model on the mat (`?scene=lab&model=cup`).
 */
import { Group } from '@iwsdk/core';
import type { App, Scene } from '../app/app.js';
import { FoldController } from '../game/fold-controller.js';
import { MODEL_BY_ID } from '../fold/models/index.js';
import { TextCard } from '../ui/text.js';

export class FoldLabScene implements Scene {
  readonly name = 'lab';
  fold: FoldController | null = null;
  private hint = new TextCard(0.3);
  private group = new Group();

  constructor(
    private app: App,
    private modelId: string,
  ) {}

  enter(): void {
    const def = MODEL_BY_ID[this.modelId] ?? MODEL_BY_ID.cup;
    this.fold = new FoldController(def, 0.22, this.app.audio, this.app.sparkles);
    this.group.add(this.fold.group);
    this.hint.mesh.position.set(0, 0.16, -0.2);
    this.hint.mesh.rotation.x = -0.35;
    this.group.add(this.hint.mesh);
    this.app.deskGroup.add(this.group);
    this.fold.events.on('step', (e) => {
      const p = this.fold!.progress;
      this.hint.set([{ text: e.hint || 'Done!', size: 1 }, { text: `${p.done} / ${p.total}`, size: 0.7, color: '#8a6a50' }]);
    });
    this.fold.start();
  }

  update(dt: number, time: number): void {
    this.fold?.update(dt, time, this.app.hands);
  }

  exit(): void {
    this.fold?.dispose();
    this.app.deskGroup.remove(this.group);
  }
}
