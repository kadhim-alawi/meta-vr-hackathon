/**
 * A small paper tag at the front-left corner of the desk. Poke it to open a
 * menu: resume, skip the current fold (accessibility / time-pressed judges),
 * move the desk in front of you, or go back to the main menu.
 */
import { Group, Vector3 } from '@iwsdk/core';
import type { App } from '../app/app.js';
import { PokeButton } from './button.js';

export interface PauseActions {
  canSkip: () => boolean;
  skip: () => void;
}

export class PauseMenu {
  readonly group = new Group();
  private tag: PokeButton;
  private items: PokeButton[] = [];
  private open = false;
  private panel = new Group();
  private skipButton: PokeButton;

  constructor(
    private app: App,
    private actions: PauseActions,
  ) {
    this.tag = new PokeButton({
      width: 0.06,
      height: 0.026,
      lines: [{ text: '☰ Menu', size: 1.25, font: 'title' }],
      color: '#efe2c8',
      onPress: () => this.toggle(),
    });
    this.tag.group.position.set(-0.24, 0.035, 0.12);
    this.group.add(this.tag.group);
    this.panel.position.set(-0.2, 0.12, 0.02);
    this.panel.visible = false;
    this.group.add(this.panel);
    const mk = (label: string, sub: string | null, y: number, fn: () => void, color?: string) => {
      const b = new PokeButton({
        width: 0.12,
        height: 0.034,
        lines: sub ? [{ text: label, size: 1.2, font: 'title' }, { text: sub, size: 0.8, color: '#8a6a50' }] : [{ text: label, size: 1.3, font: 'title' }],
        color,
        onPress: () => {
          this.app.audio.tap(null);
          fn();
        },
      });
      b.group.position.set(0, y, 0);
      this.panel.add(b.group);
      this.items.push(b);
      return b;
    };
    mk('Resume', null, 0.08, () => this.toggle(false), '#ffe7b8');
    this.skipButton = mk('Skip this fold', 'the paper folds itself', 0.04, () => {
      this.actions.skip();
      this.toggle(false);
    });
    mk('Move desk here', 'in front of you', 0.0, () => {
      this.app.desk.recenterHere();
      this.toggle(false);
    });
    mk('Main menu', 'your progress is saved', -0.04, () => this.app.setScene('menu'), '#e6dcf7');
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.panel.visible = this.open;
    this.app.audio.tap(null);
  }

  update(dt: number): void {
    this.tag.group.lookAt(this.app.headPos);
    this.panel.lookAt(this.app.headPos);
    this.skipButton.visible = this.actions.canSkip();
    this.tag.update(this.app.hands, dt);
    if (this.open) for (const b of this.items) b.update(this.app.hands, dt);
  }

  get isOpen(): boolean {
    return this.open;
  }

  dispose(): void {
    this.tag.dispose();
    for (const b of this.items) b.dispose();
    this.group.removeFromParent();
  }
}

export const _v = Vector3;
