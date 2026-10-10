/**
 * Frame-driven async scripting: story beats are written as async functions
 * that `await` timers and conditions, resolved from the game loop.
 */
export class Cancelled extends Error {
  constructor() {
    super('script cancelled');
  }
}

interface Waiter {
  cond: () => boolean;
  res: () => void;
  rej: (e: unknown) => void;
}

export class Script {
  private waiters: Waiter[] = [];
  private cancelled = false;
  time = 0;

  /** Resolve after `sec` seconds of game time. */
  wait(sec: number): Promise<void> {
    const end = this.time + sec;
    return this.until(() => this.time >= end);
  }

  /** Resolve once `cond` becomes true (checked every frame). */
  until(cond: () => boolean): Promise<void> {
    if (this.cancelled) return Promise.reject(new Cancelled());
    if (cond()) return Promise.resolve();
    return new Promise((res, rej) => this.waiters.push({ cond, res, rej }));
  }

  /** Await a promise but abort if the script is cancelled meanwhile. */
  async guard<T>(p: Promise<T>): Promise<T> {
    const v = await p;
    if (this.cancelled) throw new Cancelled();
    return v;
  }

  tick(dt: number): void {
    this.time += dt;
    if (this.waiters.length === 0) return;
    const ready = this.waiters.filter((w) => {
      try {
        return w.cond();
      } catch (e) {
        w.rej(e);
        return false;
      }
    });
    if (ready.length) {
      this.waiters = this.waiters.filter((w) => !ready.includes(w));
      for (const w of ready) w.res();
    }
  }

  cancel(): void {
    this.cancelled = true;
    for (const w of this.waiters) w.rej(new Cancelled());
    this.waiters = [];
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }
}
