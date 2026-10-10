/**
 * Development scene: line up Foldlings to check their living poses
 * (`?scene=viewer` or `?scene=viewer:plane,boat`).
 */
import { Vector3 } from '@iwsdk/core';
import type { App, Scene } from '../app/app.js';
import { MODEL_BY_ID, MODELS } from '../fold/models/index.js';
import { Stage } from './stage.js';

export class ViewerScene implements Scene {
  readonly name = 'viewer';
  private stage: Stage;

  constructor(
    private app: App,
    private ids?: string,
  ) {
    this.stage = new Stage(app);
  }

  enter(): void {
    const list = this.ids ? this.ids.split(',').map((id) => MODEL_BY_ID[id]).filter(Boolean) : MODELS;
    const n = list.length;
    list.forEach((def, i) => {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const perRow = Math.min(5, n - row * 5);
      const x = (col - (perRow - 1) / 2) * 0.12;
      const f = this.stage.materialize(def, new Vector3(x, 0, -0.05 - row * 0.16));
      f.faceTowards(new Vector3(x, 0, 1));
      f.liveliness = 0.3;
    });
  }

  update(dt: number, time: number): void {
    this.stage.update(dt, time);
  }

  exit(): void {
    this.stage.dispose();
  }
}
