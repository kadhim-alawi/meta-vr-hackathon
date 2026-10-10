/**
 * Shown behind the 2D landing page (before entering XR): the closed storybook
 * and a few Foldlings idling on the desk, with a slow camera drift.
 */
import { Vector3 } from '@iwsdk/core';
import type { App, Scene } from '../app/app.js';
import { MODEL_BY_ID } from '../fold/models/index.js';
import { Book } from '../game/book.js';
import { Stage } from './stage.js';

export class IdleScene implements Scene {
  readonly name = 'idle';
  private stage: Stage;
  private book: Book;
  private t = 0;

  constructor(private app: App) {
    this.stage = new Stage(app);
    this.book = new Book(app);
  }

  enter(): void {
    this.book.setSlot(new Vector3(0, 0, -0.3), 0.18, true);
    this.app.deskGroup.add(this.book.group);
    const lineup: [string, number, number, number][] = [
      ['plane', -0.2, 0.0, 0.6],
      ['boat', -0.08, 0.06, 0.2],
      ['heart', 0.05, 0.07, -0.2],
      ['cup', 0.17, 0.03, -0.5],
      ['fan', 0.27, -0.06, -0.8],
    ];
    for (const [id, x, z, yaw] of lineup) {
      const f = this.stage.materialize(MODEL_BY_ID[id], new Vector3(x, 0, z));
      f.faceTowards(new Vector3(x + Math.sin(yaw), 0, z + Math.cos(yaw)));
    }
    this.app.env.mat.visible = false;
  }

  update(dt: number, time: number): void {
    this.t += dt;
    this.book.update(dt, time);
    this.stage.update(dt, time);
    // gentle desktop camera drift (ignored once XR takes over the camera)
    if (this.app.mode === 'none') {
      const cam = this.app.world.camera;
      cam.position.set(Math.sin(this.t * 0.15) * 0.08, 1.2, 0.3);
      cam.rotation.set(-0.72, Math.sin(this.t * 0.15) * 0.06, 0, 'YXZ');
    }
  }

  exit(): void {
    this.stage.dispose();
    this.book.dispose();
    this.app.env.mat.visible = true;
  }
}
