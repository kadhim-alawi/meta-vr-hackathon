import { createSystem } from '@iwsdk/core';
import type { App } from './app.js';

/** One IWSDK system ticks the whole game each frame. */
export class GameSystem extends createSystem({}) {
  app: App | null = null;

  update(delta: number, time: number): void {
    this.app?.update(delta, time, this.xrFrame ?? undefined);
  }
}
