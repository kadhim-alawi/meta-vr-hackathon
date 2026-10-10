/**
 * Free fold and the daily fold: fold one model on the mat, watch it come
 * alive, and it joins your desk. The daily fold picks a model and a special
 * paper colour from the date, and keeps a streak.
 */
import { Vector3 } from '@iwsdk/core';
import type { App, Scene } from '../app/app.js';
import { Cancelled, Script } from '../core/script.js';
import { dayNumber, seededRandom } from '../core/util.js';
import { ModelDef } from '../fold/model.js';
import { MODEL_BY_ID, MODELS } from '../fold/models/index.js';
import { PokeButton } from '../ui/button.js';
import { Stage } from './stage.js';
import { PauseMenu } from '../ui/pause.js';

const DAILY_PAPERS = [
  { front: '#3aa6a0', back: '#f3fbf9', name: 'Lagoon' },
  { front: '#d9643a', back: '#fdf1e8', name: 'Ember' },
  { front: '#7a6fd6', back: '#f2f0fd', name: 'Twilight' },
  { front: '#e2a83b', back: '#fff7e6', name: 'Honey' },
  { front: '#4f9a55', back: '#f1f8ef', name: 'Fern' },
  { front: '#c8344a', back: '#fdeef0', name: 'Berry' },
  { front: '#2f6fb3', back: '#eef4fb', name: 'Ink' },
];

export function dailyPick(day = dayNumber()): { def: ModelDef; paper: { front: string; back: string; name: string } } {
  const rnd = seededRandom(day * 7919 + 13);
  const def = MODELS[Math.floor(rnd() * MODELS.length)];
  const paper = DAILY_PAPERS[Math.floor(rnd() * DAILY_PAPERS.length)];
  return { def, paper };
}

export class FoldOneScene implements Scene {
  readonly name: string;
  private stage: Stage;
  private pause: PauseMenu;
  private script = new Script();
  private done: PokeButton | null = null;
  private tmp = new Vector3();

  constructor(
    private app: App,
    private mode: 'free' | 'daily',
    private modelId?: string,
  ) {
    this.name = mode;
    this.stage = new Stage(app);
    this.pause = new PauseMenu(app, {
      canSkip: () => !!this.stage.fold && !this.stage.fold.done,
      skip: () => this.stage.fold?.skipAll(),
    });
  }

  enter(): void {
    this.app.deskGroup.add(this.pause.group);
    this.app.audio.music.setMood('playful');
    this.run().catch((e) => {
      if (!(e instanceof Cancelled)) console.error(e);
    });
  }

  private async run(): Promise<void> {
    const s = this.script;
    let def: ModelDef;
    let colors: { front: string; back: string } | undefined;
    if (this.mode === 'daily') {
      const pick = dailyPick();
      def = pick.def;
      colors = pick.paper;
      this.stage.showHint(`Today’s fold: ${def.name}`, `on ${pick.paper.name} paper`);
      this.stage.hintAt(this.tmp.set(0, 0.17, -0.2));
      await s.wait(2.2);
    } else {
      def = MODEL_BY_ID[this.modelId ?? 'plane'] ?? MODELS[0];
    }
    const f = await this.stage.foldAndWake(s, def, colors);
    f.chirp('happy', 3);
    this.app.save.addFoldling(def.id, def.name, colors?.front);
    let msg = `${def.name} is alive! ${def.blurb}`;
    if (this.mode === 'daily') {
      const streak = this.app.save.completeDaily();
      msg = `${def.name} is alive! Daily streak: ${streak} day${streak === 1 ? '' : 's'}.`;
      this.app.audio.success(this.app.fromDesk(f.group.position));
    }
    this.stage.showHint(msg, 'pinch it to pick it up — poke it to say hi');
    this.stage.hintAt(this.tmp.set(0, 0.2, -0.2));
    await s.wait(1.5);
    this.done = new PokeButton({
      width: 0.11,
      height: 0.04,
      lines: [{ text: 'Done', size: 1.4, font: 'title' }],
      color: '#ffe7b8',
      onPress: () => {
        this.app.audio.tap(null);
        this.app.setScene('menu');
      },
    });
    this.done.group.position.set(0.2, 0.08, -0.08);
    this.app.deskGroup.add(this.done.group);
  }

  update(dt: number, time: number): void {
    this.script.tick(dt);
    this.pause.update(dt);
    this.stage.update(dt, time);
    if (this.done) {
      this.done.group.lookAt(this.app.headPos);
      this.done.update(this.app.hands, dt);
    }
  }

  exit(): void {
    this.script.cancel();
    this.pause.dispose();
    this.stage.dispose();
    if (this.done) {
      this.done.group.removeFromParent();
      this.done.dispose();
    }
  }
}
