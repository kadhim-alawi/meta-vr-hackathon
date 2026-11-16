/**
 * The hub: your Foldlings live along the desk, Kit sits on the closed book,
 * and paper-tag buttons lead to the story, free folding, the daily fold and
 * settings.
 */
import { Group, Vector3 } from '@iwsdk/core';
import type { App, Scene } from '../app/app.js';
import { Cancelled, Script } from '../core/script.js';
import { MODEL_BY_ID, MODELS } from '../fold/models/index.js';
import { Book } from '../game/book.js';
import { Kit } from '../game/kit.js';
import { PokeButton } from '../ui/button.js';
import { TextCard } from '../ui/text.js';
import { Stage } from './stage.js';
import { dailyPick } from './daily.js';

type Panel = 'main' | 'pick' | 'settings';

export class MenuScene implements Scene {
  readonly name = 'menu';
  private stage: Stage;
  private book: Book;
  private kit: Kit;
  private script = new Script();
  private panel = new Group();
  private buttons: PokeButton[] = [];
  private header = new TextCard(0.3, 2400);
  private current: Panel = 'main';
  private tmp = new Vector3();

  constructor(private app: App) {
    this.stage = new Stage(app);
    this.book = new Book(app);
    this.kit = new Kit(app);
  }

  enter(): void {
    const app = this.app;
    app.audio.music.setMood('calm');
    this.book.setSlot(new Vector3(0, 0, -0.42), 0.25, true);
    app.deskGroup.add(this.book.group, this.panel);
    this.book.group.add(this.kit.group);
    this.kit.group.position.set(0.0, 0.041, 0.02);
    this.kit.captions = app.save.data.settings.captions;
    this.panel.position.set(0, 0.11, -0.12);
    this.panel.add(this.header.mesh);
    this.header.mesh.position.set(0, 0.09, 0);
    this.populateShelf();
    this.show('main');
    void this.greet();
  }

  private async greet(): Promise<void> {
    try {
      await this.script.wait(0.8);
      this.kit.setEmote('wave');
      const n = this.app.save.data.foldlings.length;
      const line = this.app.save.data.storyDone
        ? n > 0
          ? `Welcome back! Your ${n} Foldlings missed you.`
          : 'Welcome back! What shall we fold today?'
        : 'Shall we keep going? Mo is still waiting for that letter!';
      await this.script.guard(this.kit.say(line));
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  }

  private populateShelf(): void {
    const saved = this.app.save.data.foldlings.slice(-10);
    for (const f of saved) {
      const def = MODEL_BY_ID[f.model];
      if (!def) continue;
      const spot = this.stage.shelfSpot();
      const fl = this.stage.materialize(def, spot, f.color ? { front: f.color, back: def.paper.back } : undefined);
      fl.faceTowards(this.tmp.set(0, 0, 0.4));
      fl.name = f.name;
    }
  }

  private clearButtons(): void {
    for (const b of this.buttons) {
      this.panel.remove(b.group);
      b.dispose();
    }
    this.buttons = [];
  }

  private addButton(label: string, sub: string | null, x: number, y: number, onPress: () => void, color?: string, w = 0.15, h = 0.045): PokeButton {
    const lines = sub ? [{ text: label, size: 1.25, font: 'title' as const }, { text: sub, size: 0.85, color: '#8a6a50' }] : [{ text: label, size: 1.35, font: 'title' as const }];
    const b = new PokeButton({ width: w, height: h, lines, color, onPress: () => {
      this.app.audio.tap(this.app.fromDesk(this.panel.position));
      onPress();
    } });
    b.onHover = () => this.app.audio.tick(this.app.fromDesk(this.panel.position));
    b.group.position.set(x, y, 0);
    this.panel.add(b.group);
    this.buttons.push(b);
    return b;
  }

  private show(p: Panel): void {
    this.current = p;
    this.clearButtons();
    const save = this.app.save.data;
    if (p === 'main') {
      this.header.set([{ text: 'Foldlings', size: 2, font: 'title', color: '#fff4dc' }], { bg: 'none', shadow: false });
      const storyLabel = save.storyDone ? 'Story' : save.chapter > 0 ? 'Continue story' : 'Start the story';
      const storySub = save.storyDone ? 'read it again' : `chapter ${Math.min(4, save.chapter + 1)} of 4`;
      this.addButton(storyLabel, storySub, -0.085, 0.03, () => {
        const start = save.storyDone ? 0 : save.chapter > 0 ? save.chapter + 1 : 0;
        this.app.setScene(start >= 1 && start <= 4 ? `story:${start}` : 'story');
      }, '#ffe7b8');
      this.addButton('Free fold', 'any model you like', 0.085, 0.03, () => this.show('pick'));
      const daily = dailyPick();
      const streak = save.daily.streak;
      this.addButton(
        this.app.save.dailyDoneToday ? 'Daily fold ✓' : 'Daily fold',
        this.app.save.dailyDoneToday ? `come back tomorrow · ${streak} day streak` : `today: ${daily.def.name}${streak ? ` · ${streak} day streak` : ''}`,
        -0.085,
        -0.025,
        () => this.app.setScene('daily'),
        '#d8f0ff',
      );
      this.addButton('Settings', null, 0.085, -0.025, () => this.show('settings'));
    } else if (p === 'pick') {
      this.header.set([{ text: 'What will you fold?', size: 1.4, font: 'title', color: '#fff4dc' }], { bg: 'none', shadow: false });
      const list = MODELS;
      list.forEach((m, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        this.addButton(m.name, m.blurb.split('.')[0], -0.105 + col * 0.105, 0.04 - row * 0.05, () => this.app.setScene(`free:${m.id}`), m.paper.front + '', 0.1, 0.044);
      });
      this.addButton('Back', null, 0, 0.04 - Math.ceil(list.length / 3) * 0.05, () => this.show('main'), undefined, 0.08, 0.035);
    } else {
      const s = save.settings;
      this.header.set([{ text: 'Settings', size: 1.5, font: 'title', color: '#fff4dc' }], { bg: 'none', shadow: false });
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      this.addButton('Music', pct(s.music), -0.11, 0.035, () => {
        s.music = s.music >= 0.99 ? 0 : Math.min(1, s.music + 0.25);
        this.app.applySettings();
        this.app.save.write();
        this.show('settings');
      }, undefined, 0.1);
      this.addButton('Sounds', pct(s.sfx), 0, 0.035, () => {
        s.sfx = s.sfx >= 0.99 ? 0 : Math.min(1, s.sfx + 0.25);
        this.app.applySettings();
        this.app.save.write();
        this.show('settings');
      }, undefined, 0.1);
      this.addButton('Captions', s.captions ? 'on' : 'off', 0.11, 0.035, () => {
        s.captions = !s.captions;
        this.kit.captions = s.captions;
        this.app.save.write();
        this.show('settings');
      }, undefined, 0.1);
      this.addButton('Move desk here', 'recentre in front of you', -0.11, -0.015, () => {
        this.app.desk.recenterHere();
      }, undefined, 0.1);
      this.addButton('Desk on my table', 'lay your palm flat on it', 0, -0.015, () => {
        this.app.desk.beginPalmCalibration();
        this.stage.showHint('Lay your hand flat on your table and hold still…');
      }, undefined, 0.1);
      this.addButton('Start over', 'clears your progress', 0.11, -0.015, () => {
        this.app.save.reset();
        this.app.setScene('menu');
      }, '#ffd9d2', 0.1);
      this.addButton('Large text', s.bigUI ? 'on' : 'off', -0.11, -0.06, () => {
        s.bigUI = !s.bigUI;
        this.app.applySettings();
        this.app.save.write();
        this.show('settings');
      }, undefined, 0.1);
      this.addButton('Back', null, 0.11, -0.06, () => {
        this.app.desk.cancelCalibration();
        this.show('main');
      }, undefined, 0.08, 0.035);
    }
  }

  update(dt: number, time: number): void {
    this.script.tick(dt);
    this.book.update(dt, time);
    this.stage.update(dt, time);
    this.kit.update(dt, this.app.headPos);
    // panel faces the player
    this.panel.lookAt(this.app.headPos);
    // a pressed button may rebuild the list, so stop at the first press
    for (let i = 0; i < this.buttons.length; i++) {
      if (this.buttons[i].update(this.app.hands, dt)) break;
    }
    if (this.app.desk.calibrating === false && this.stage.hint.opacity > 0.5 && this.current === 'settings') this.stage.hideHint();
  }

  exit(): void {
    this.script.cancel();
    this.clearButtons();
    this.stage.dispose();
    this.kit.dispose();
    this.book.dispose();
    this.panel.removeFromParent();
    this.header.dispose();
  }
}
