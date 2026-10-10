import { describe, expect, it } from 'vitest';
import { Cancelled, Script } from '../src/core/script.js';
import { dayNumber, spring } from '../src/core/util.js';
import { Save } from '../src/core/save.js';
import { MODELS } from '../src/fold/models/index.js';
import { runModel } from '../src/fold/model.js';

describe('script runner', () => {
  it('resolves waits from game time, in order', async () => {
    const s = new Script();
    const log: string[] = [];
    const run = (async () => {
      await s.wait(1);
      log.push('a');
      await s.until(() => s.time > 2.5);
      log.push('b');
    })();
    for (let i = 0; i < 40; i++) {
      s.tick(0.1);
      await Promise.resolve();
      await Promise.resolve();
    }
    await run;
    expect(log).toEqual(['a', 'b']);
  });

  it('cancels pending waits', async () => {
    const s = new Script();
    const p = s.wait(5);
    s.cancel();
    await expect(p).rejects.toBeInstanceOf(Cancelled);
  });
});

describe('spring', () => {
  it('settles on the target without overshoot', () => {
    let x = 0;
    let v = 0;
    let max = 0;
    for (let i = 0; i < 200; i++) {
      [x, v] = spring(x, v, 1, 20, 1 / 72);
      max = Math.max(max, x);
    }
    expect(x).toBeCloseTo(1, 4);
    expect(max).toBeLessThanOrEqual(1.0001);
  });
});

describe('save data', () => {
  it('works without localStorage and tracks the daily streak', () => {
    const save = new Save();
    expect(save.hasProgress).toBe(false);
    save.addFoldling('plane', 'Paper Plane');
    expect(save.hasProgress).toBe(true);
    expect(save.completeDaily()).toBe(1);
    // completing twice on the same day doesn't double count
    expect(save.completeDaily()).toBe(1);
    save.data.daily.lastDay = dayNumber() - 1;
    save.data.daily.streak = 4;
    save.data.daily.lastDay -= 0;
    expect(save.completeDaily()).toBe(5);
  });
});

describe('model catalogue', () => {
  it('has unique ids and every model folds', () => {
    const ids = new Set(MODELS.map((m) => m.id));
    expect(ids.size).toBe(MODELS.length);
    for (const m of MODELS) {
      const states = runModel(m);
      expect(states.length).toBe(m.steps.length + 1);
    }
  });

  it('story models need few enough hand folds for a 10-minute session', () => {
    for (const id of ['plane', 'boat', 'cup', 'fan', 'heart']) {
      const m = MODELS.find((x) => x.id === id)!;
      const manual = m.steps.filter((s) => s.kind === 'fold' && !s.auto).length;
      expect(manual, id).toBeLessThanOrEqual(5);
    }
  });
});
