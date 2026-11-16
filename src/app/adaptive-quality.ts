/**
 * Frame-rate safety net for headsets we cannot test on: if the average frame
 * stays slow, step quality down (never back up): foveation, then a smaller
 * shadow map, then no sun shadow. Each step waits for a fresh measurement.
 */
import type { App } from './app.js';

const SLOW_MS = 15.5; // above this average we are under about 64 fps
const WINDOW = 2; // seconds measured before each decision
const WARMUP = 4; // seconds ignored after a session or scene starts loading

export class AdaptiveQuality {
  level = 0;
  private acc = 0;
  private n = 0;
  private warm = WARMUP;

  constructor(private app: App) {}

  /** Call when a session starts or the scene changes (loading hitches are not "slow"). */
  restart(): void {
    this.warm = WARMUP;
    this.acc = 0;
    this.n = 0;
  }

  update(rawDt: number): void {
    if (!this.app.world.renderer.xr.isPresenting || this.level >= 3) return;
    if (this.warm > 0) {
      this.warm -= rawDt;
      return;
    }
    this.acc += rawDt;
    this.n++;
    if (this.acc < WINDOW) return;
    const avgMs = (this.acc / this.n) * 1000;
    this.acc = 0;
    this.n = 0;
    if (avgMs > SLOW_MS) this.step();
  }

  private step(): void {
    const sun = this.app.env.sun;
    this.level++;
    if (this.level === 1) this.app.world.renderer.xr.setFoveation?.(1);
    else if (this.level === 2) {
      sun.shadow.mapSize.set(512, 512);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    } else sun.castShadow = false;
    console.info(`[quality] slow frames, lowered quality to level ${this.level}`);
    this.warm = WARMUP / 2;
  }
}
