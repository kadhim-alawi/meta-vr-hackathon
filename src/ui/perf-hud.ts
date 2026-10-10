/**
 * On-device performance readout (`?stats=1`): frames per second, draw calls
 * and triangles, floating at the back-right of the desk.
 */
import type { App } from '../app/app.js';
import { TextCard } from './text.js';

export class PerfHud {
  private card = new TextCard(0.12, 2400);
  private frames = 0;
  private acc = 0;
  private worst = 0;

  constructor(private app: App) {
    this.card.mesh.position.set(0.26, 0.16, -0.3);
    app.deskGroup.add(this.card.mesh);
  }

  update(rawDt: number): void {
    this.frames++;
    this.acc += rawDt;
    this.worst = Math.max(this.worst, rawDt);
    if (this.acc < 0.5) return;
    const info = this.app.world.renderer.info;
    const fps = this.frames / this.acc;
    this.card.set(
      [
        { text: `${fps.toFixed(0)} fps`, size: 1.6, font: 'title', color: fps >= 70 ? '#2e8b57' : fps >= 60 ? '#c9861a' : '#c8344a' },
        { text: `worst ${(this.worst * 1000).toFixed(0)} ms`, size: 0.8 },
        { text: `${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(1)}k tris`, size: 0.8 },
      ],
      { bg: '#fffaf0' },
    );
    this.card.mesh.lookAt(this.app.headPos);
    this.frames = 0;
    this.acc = 0;
    this.worst = 0;
  }
}
