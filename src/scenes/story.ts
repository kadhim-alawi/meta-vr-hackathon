/**
 * Story mode: Kit has a letter for Mo at the end of the book. Every page is a
 * problem; the player folds the helper Kit needs, and the helper comes alive.
 *
 *   Prologue  – the book is stuck: fold a paper plane, throw it to knock it open
 *   1 Stream  – fold a sailboat, set it on the river, wave to blow it along
 *   2 Garden  – fold a cup, dip it in the well, pour on the thirsty flowers
 *   3 Hill    – fold a fan, wave it at the windmill to wind the basket lift
 *   4 Night   – fold a heart, give it to Kit, and Mo finally comes outside
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from '@iwsdk/core';
import type { App, Scene } from '../app/app.js';
import { Cancelled, Script } from '../core/script.js';
import { clamp, damp, easeInOutCubic } from '../core/util.js';
import { MODEL_BY_ID } from '../fold/models/index.js';
import { Book } from '../game/book.js';
import { Foldling } from '../game/foldling.js';
import { Kit, Mo } from '../game/kit.js';
import { paperMat } from '../game/popups.js';
import { PAGE_Y, gardenSpread, hillSpread, nightSpread, streamSpread } from '../game/spreads.js';
import { TextCard } from '../ui/text.js';
import { Stage } from './stage.js';
import { PauseMenu } from '../ui/pause.js';

const BOOK_FAR = new Vector3(0, 0, -0.42);
const BOOK_NEAR = new Vector3(0, 0, -0.15);
const WAIT_SPOT = new Vector3(0.27, 0, 0.03);

export class StoryScene implements Scene {
  readonly name = 'story';
  private script = new Script();
  private stage: Stage;
  private pause: PauseMenu;
  private book: Book;
  private kit: Kit;
  private mo: Mo | null = null;
  private title = new TextCard(0.34, 2400);
  private ring: Mesh;
  private hooks: ((dt: number, t: number) => void)[] = [];
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private q = new Quaternion();
  /** current story beat, exposed for automated playthrough tests */
  private beatName = 'intro';
  private beatTargets: () => Record<string, Vector3 | Vector3[]> = () => ({});

  private beat(name: string, targets: () => Record<string, Vector3 | Vector3[]> = () => ({})): void {
    this.beatName = name;
    this.beatTargets = targets;
  }

  /** World-space positions relevant to the current beat (test/debug helper). */
  debugState(): { beat: string; targets: Record<string, number[] | number[][]> } {
    const out: Record<string, number[] | number[][]> = {};
    const t = this.beatTargets();
    for (const [k, v] of Object.entries(t)) {
      out[k] = Array.isArray(v) ? v.map((p) => this.app.fromDesk(p).toArray()) : this.app.fromDesk(v).toArray();
    }
    if (this.beatName === 'fold' && this.stage.fold) out.path = this.stage.fold.debugPath(14).path;
    return { beat: this.beatName, targets: out };
  }

  get foldController() {
    return this.stage.fold;
  }

  /** chapter to start from (0 = prologue) */
  constructor(
    private app: App,
    private startChapter = 0,
  ) {
    this.stage = new Stage(app);
    this.pause = new PauseMenu(app, {
      canSkip: () => !!this.stage.fold && !this.stage.fold.done,
      skip: () => this.stage.fold?.skipAll(),
    });
    this.book = new Book(app);
    this.kit = new Kit(app);
    this.ring = new Mesh(
      new RingGeometry(0.03, 0.038, 40),
      new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.0, blending: AdditiveBlending, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 8;
  }

  enter(): void {
    const app = this.app;
    app.deskGroup.add(this.book.group, this.ring, this.title.mesh, this.pause.group);
    this.book.group.add(this.kit.group);
    this.kit.captions = app.save.data.settings.captions;
    this.title.opacity = 0;
    this.book.setSlot(BOOK_FAR, 0.32, true);
    this.updateSurfaces();
    app.audio.music.setMood('calm');
    this.run().catch((e) => {
      if (!(e instanceof Cancelled)) console.error(e);
    });
  }

  exit(): void {
    this.script.cancel();
    this.pause.dispose();
    this.stage.dispose();
    this.kit.dispose();
    this.mo?.dispose();
    this.book.group.removeFromParent();
    this.ring.removeFromParent();
    this.title.mesh.removeFromParent();
    this.title.dispose();
  }

  update(dt: number, time: number): void {
    this.script.tick(dt);
    this.pause.update(dt);
    this.book.update(dt, time);
    this.stage.update(dt, time);
    this.kit.update(dt, this.app.headPos);
    this.mo?.update(dt, this.app.headPos);
    for (const h of this.hooks) h(dt, time);
    // keep the title card facing the player
    this.title.mesh.lookAt(this.app.headPos);
    const rm = this.ring.material as MeshBasicMaterial;
    this.ring.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
    rm.opacity += ((this.ring.visible ? 0.8 : 0) - rm.opacity) * damp(6, dt);
  }

  // ---- helpers ----------------------------------------------------------------

  private bookToDesk(v: Vector3, out = new Vector3()): Vector3 {
    this.book.group.updateWorldMatrix(true, false);
    out.copy(v).applyMatrix4(this.book.group.matrixWorld);
    return this.app.toDesk(out, out);
  }

  private deskToBook(v: Vector3, out = new Vector3()): Vector3 {
    this.app.fromDesk(v, out);
    this.book.group.updateWorldMatrix(true, false);
    return this.book.group.worldToLocal(out);
  }

  private updateSurfaces(): void {
    const near = this.book.group.position.distanceTo(BOOK_NEAR) < 0.05;
    this.stage.surfaces.length = 0;
    if (near) {
      this.stage.surfaces.push({
        x0: -0.225,
        x1: 0.225,
        z0: BOOK_NEAR.z - 0.145,
        z1: BOOK_NEAR.z + 0.145,
        y: PAGE_Y,
      });
    }
  }

  private async bookNear(): Promise<void> {
    this.book.setSlot(BOOK_NEAR, 0);
    this.stage.matTo('aside');
    await this.script.wait(0.9);
    this.updateSurfaces();
  }

  private async bookFar(): Promise<void> {
    this.book.setSlot(BOOK_FAR, 0.32);
    this.updateSurfaces();
    await this.script.wait(0.6);
  }

  private say(text: string, who: 'kit' | 'mo' = 'kit'): Promise<void> {
    const c = who === 'kit' ? this.kit : this.mo!;
    return this.script.guard(c.say(text));
  }

  private async showTitle(lines: { text: string; size?: number; font?: 'title' | 'body' | 'bold'; color?: string }[], dur: number, at: Vector3): Promise<void> {
    this.title.set(lines, { bg: 'none', shadow: false });
    this.title.mesh.position.copy(at);
    for (let t = 0; t < 0.6; t += 1 / 60) {
      this.title.opacity = t / 0.6;
      await this.script.wait(1 / 60);
    }
    this.title.opacity = 1;
    await this.script.wait(dur);
    for (let t = 0; t < 0.6; t += 1 / 60) {
      this.title.opacity = 1 - t / 0.6;
      await this.script.wait(1 / 60);
    }
    this.title.opacity = 0;
  }

  private hook(fn: (dt: number, t: number) => void): () => void {
    this.hooks.push(fn);
    return () => {
      const i = this.hooks.indexOf(fn);
      if (i >= 0) this.hooks.splice(i, 1);
    };
  }

  private remember(f: Foldling): void {
    this.app.save.addFoldling(f.def.id, f.def.name);
  }

  private async turnPage(next: ReturnType<typeof gardenSpread> | ReturnType<typeof hillSpread> | ReturnType<typeof nightSpread>): Promise<void> {
    let turned = false;
    this.book.onTurned = () => {
      turned = true;
    };
    this.book.offerTurn(next);
    this.beat('turn', () => ({ corner: this.book.cornerLocal() }));
    this.stage.showHint('Pinch the glowing corner and turn the page.');
    this.stage.hintAt(this.tmp.set(0.12, 0.2, BOOK_NEAR.z - 0.05));
    const start = this.script.time;
    await this.script.until(() => {
      // after a while, offer to turn it for them
      if (this.script.time - start > 30 && this.book.phase === 'open') this.book.autoTurn();
      return turned;
    });
    this.beat('talk');
    this.stage.hideHint();
  }

  // ---- the story ----------------------------------------------------------------

  private async run(): Promise<void> {
    const ch = this.startChapter;
    if (ch <= 0) await this.prologue();
    else {
      this.book.open(ch === 1 ? streamSpread() : ch === 2 ? gardenSpread() : ch === 3 ? hillSpread() : nightSpread());
      await this.script.wait(1.2);
    }
    if (ch <= 1) await this.chapterStream();
    if (ch <= 2) await this.chapterGarden(ch === 2);
    if (ch <= 3) await this.chapterHill(ch === 3);
    await this.chapterNight(ch === 4);
    await this.finale();
  }

  /**
   * In mixed reality without a detected table, invite the player to lay a
   * hand flat on their table; the desk snaps onto it. Runs alongside the
   * opening, never blocks it.
   */
  private offerTableCalibration(): void {
    const s = this.script;
    const desk = this.app.desk;
    if (this.app.mode !== 'ar' || desk.source !== 'default') return;
    desk.beginPalmCalibration();
    this.stage.showHint('Sitting at a table? Lay one hand flat on it for a moment.', 'or just carry on — your desk floats in front of you');
    this.stage.hintAt(this.tmp.set(0, 0.12, -0.05));
    const t0 = s.time;
    void s
      .until(() => !desk.calibrating || s.time - t0 > 14)
      .then(async () => {
        desk.calibrating = false;
        if (desk.source === 'palm') {
          this.app.audio.success(this.app.fromDesk(this.tmp.set(0, 0, 0)));
          this.app.sparkles.burst(this.app.fromDesk(this.tmp.set(0, 0.01, 0)), 30, undefined, 0.3, 0.012);
          this.stage.showHint('Your desk is on your table now!');
          await s.wait(2);
        }
        if (this.beatName === 'intro') this.stage.hideHint();
      })
      .catch(() => undefined);
  }

  private async prologue(): Promise<void> {
    const s = this.script;
    const kit = this.kit;
    kit.setBodyVisible(false);
    kit.group.position.set(0, 0.04, 0);
    await s.wait(0.8);
    this.offerTableCalibration();
    await this.showTitle(
      [
        { text: 'Foldlings', size: 2.6, font: 'title', color: '#fff4dc' },
        { text: 'Whatever you fold comes alive.', size: 0.95, color: '#ffe6b0' },
      ],
      2.8,
      this.tmp.set(0, 0.24, BOOK_FAR.z - 0.05),
    );
    this.book.rattle();
    this.app.audio.thump(this.app.fromDesk(this.book.group.position), 0.4);
    await s.wait(0.25);
    this.app.audio.thump(this.app.fromDesk(this.book.group.position), 0.4);
    await this.say('Hello? Is somebody out there?');
    this.book.rattle();
    await this.say('This book is stuck shut, and I’m stuck inside it!');
    await this.say('Could you fold something and give the cover a good knock?');

    this.beat('fold');
    const plane = await this.stage.foldAndWake(s, MODEL_BY_ID.plane);
    this.remember(plane);
    plane.chirp('happy', 3);
    await s.wait(0.4);
    // throw it at the book
    let hit = false;
    const coverTop = (out: Vector3) => out.copy(this.book.group.position).add(this.tmp2.set(0, 0.05, 0));
    plane.homeTarget = null;
    const tryThrow = () => {
      this.stage.showHint('Pinch the plane and toss it at the book!', 'a gentle throw is plenty');
      this.stage.hintAt(this.tmp.set(0, 0.17, -0.18));
    };
    tryThrow();
    this.beat('throw', () => ({ obj: plane.centreLocal(new Vector3()), to: coverTop(new Vector3()) }));
    plane.onRelease = (vel) => {
      const toBook = coverTop(new Vector3()).sub(plane.group.position).normalize();
      const along = vel.dot(toBook);
      if (along > 0.35) {
        this.stage.hideHint();
        plane.flyTo(coverTop(new Vector3()), vel);
        this.app.audio.whoosh(this.app.fromDesk(plane.group.position), 0.6, true);
      }
    };
    plane.onLand = (onTarget) => {
      if (onTarget) {
        hit = true;
        return;
      }
      // missed: hop back to the mat and try again
      plane.chirp('curious', 2);
      void plane.moveToPos(new Vector3(0, 0, 0), 0.8, 0.06).then(tryThrow);
    };
    const start = s.time;
    let nudged = false;
    await s.until(() => {
      if (!nudged && s.time - start > 35 && plane.mode === 'idle') {
        // the plane gets impatient and flies on its own
        nudged = true;
        this.stage.showHint('The plane got impatient!');
        plane.flyTo(coverTop(new Vector3()), new Vector3(0, 0.6, -1.1));
      }
      return hit;
    });
    this.beat('talk');
    plane.onRelease = null;
    plane.onLand = null;
    plane.homeTarget = null;
    // BANG — the book bursts open
    const at = this.app.fromDesk(this.book.group.position.clone().add(this.tmp.set(0, 0.04, 0)));
    this.app.sparkles.burst(at, 50, new Color(0xffe2a0), 0.5, 0.016);
    this.app.audio.success(at);
    this.app.audio.music.setMood('playful');
    const stream = streamSpread();
    this.book.open(stream);
    plane.mode = 'idle';
    plane.group.position.copy(this.book.group.position).add(this.tmp.set(0.05, 0.12, 0));
    plane.launch(new Vector3(-0.3, 0.2, 0.2));
    await s.wait(1.4);
    void this.stage.toShelf(plane);
    // Kit pops out
    kit.setBodyVisible(true);
    kit.group.position.copy(stream.kitStart).setY(0.1);
    await s.guard(kit.hopTo(stream.kitStart, 0.6, 0.05));
    kit.setEmote('wave');
    kit.faceAngle(0);
    await this.say('Whee! It’s open! Thank you!');
    kit.setEmote('jump');
    await this.say('I’m Kit, the paper post-courier.');
    await this.say('I have a very important letter for my friend Mo, at the very end of this book.');
    kit.setEmote('cheer');
    await this.say('Will you help me get there? You fold, I’ll walk!');
  }

  private async chapterStream(): Promise<void> {
    const s = this.script;
    const kit = this.kit;
    const sp = this.book.spread as ReturnType<typeof streamSpread>;
    this.app.save.data.chapter = Math.max(this.app.save.data.chapter, 0);
    kit.group.position.copy(sp.kitStart);
    kit.faceAngle(0);
    await this.say('This river runs all the way to Mo’s house.');
    kit.setEmote('think');
    await this.say('But paper and water don’t mix. I’d get soggy!');
    await this.say('If only I had a boat…');
    kit.setEmote('idle');

    this.beat('fold');
    const boat = await this.stage.foldAndWake(s, MODEL_BY_ID.boat);
    this.remember(boat);
    boat.chirp('happy', 2);
    await this.bookNear();
    await s.guard(boat.moveToPos(WAIT_SPOT, 0.7, 0.05));
    boat.faceTowards(this.tmp.set(0, 0, 0.5));

    // put it on the river
    const startDesk = this.bookToDesk(sp.start);
    this.ring.position.copy(startDesk).setY(startDesk.y + 0.002);
    this.ring.visible = true;
    this.stage.showHint('Pick up the boat and set it on the river by Kit.');
    this.stage.hintAt(this.tmp.set(0, 0.2, BOOK_NEAR.z - 0.08));
    let placed = false;
    this.beat('place', () => ({ obj: boat.centreLocal(new Vector3()), to: startDesk }));
    boat.onRelease = () => {
      if (boat.group.position.distanceTo(startDesk) < 0.085) placed = true;
    };
    await s.until(() => placed);
    this.beat('talk');
    boat.onRelease = null;
    this.ring.visible = false;
    boat.grabbable = false;
    boat.mode = 'scripted';
    await s.guard(boat.moveToPos(startDesk, 0.35, 0.02));
    boat.mode = 'scripted';
    boat.group.rotation.set(0, Math.PI / 2, 0);
    boat.facing = Math.PI / 2;
    this.app.audio.splash(this.app.fromDesk(startDesk));
    this.app.sparkles.droplets(this.app.fromDesk(startDesk), new Vector3(0, 0.4, 0), 10);
    // Kit hops aboard
    const deck = () => this.deskToBook(boat.group.position.clone().add(this.tmp.set(0, 0.006, 0.016)));
    await s.guard(kit.hopTo(deck(), 0.6, 0.05));
    kit.setEmote('cheer');
    await this.say('All aboard! Now we just need some wind…');
    this.stage.showHint('Wave your hand behind the sail to blow it along!', 'or pinch the boat and pull it');

    // sailing
    this.beat('wind', () => ({ at: boat.group.position.clone() }));
    let progress = 0;
    const endDesk = this.bookToDesk(sp.end);
    const wind = this.app.audio.noiseLoop(this.app.fromDesk(startDesk), 'wind');
    const water = this.app.audio.noiseLoop(this.app.fromDesk(startDesk), 'water');
    water.set(0.25);
    boat.grabbable = false;
    const deskQ = new Quaternion();
    let held: ReturnType<typeof this.app.hands.get> | null = null;
    const off = this.hook((dt, t) => {
      let push = 0;
      this.app.desk.group.getWorldQuaternion(deskQ).invert();
      for (const h of this.app.hands.hands) {
        if (!h.tracked) continue;
        this.app.toDesk(h.palm, this.tmp);
        const d = this.tmp.distanceTo(boat.group.position);
        // wind from a hand sweeping towards +x behind (left of) the boat
        if (d < 0.2 && this.tmp.x < boat.group.position.x + 0.08) {
          const v = this.tmp2.copy(h.velocity).applyQuaternion(deskQ);
          push = Math.max(push, clamp(v.x, 0, 1.2));
        }
        // fallback: pinch the boat and drag it along the river
        if (!held && h.freshPinch) {
          this.app.toDesk(h.pinchPoint, this.tmp);
          if (this.tmp.distanceTo(boat.group.position) < 0.06) {
            held = h;
            h.claimedBy = boat;
          }
        }
      }
      if (held) {
        if (!held.tracked || !held.pinching) {
          held.claimedBy = null;
          held = null;
        } else {
          this.app.toDesk(held.pinchPoint, this.tmp);
          const k = clamp((this.tmp.x - startDesk.x) / (endDesk.x - startDesk.x), 0, 1);
          if (k > progress) progress += Math.min(k - progress, dt * 0.35);
        }
      }
      progress = Math.min(1, progress + push * dt * 0.38);
      wind.set(clamp(push * 1.2, 0, 1));
      if (push > 0.15 && Math.random() < 0.5) {
        this.app.sparkles.drift(this.app.fromDesk(boat.group.position.clone().add(this.tmp.set(-0.05, 0.03, 0))), new Color(0xdff6ff), 0.04);
      }
      boat.group.position.lerpVectors(startDesk, endDesk, easeInOutCubic(progress));
      boat.group.position.y = startDesk.y + Math.sin(t * 3) * 0.002;
      boat.group.rotation.set(Math.sin(t * 2.3) * 0.05, Math.PI / 2, Math.sin(t * 1.7) * 0.06);
      kit.group.position.copy(deck());
    });
    await s.until(() => progress >= 1);
    this.beat('talk');
    off();
    wind.stop();
    water.stop();
    if (held) (held as { claimedBy: unknown }).claimedBy = null;
    this.stage.hideHint();
    await s.guard(kit.hopTo(sp.end.clone().add(this.tmp.set(0.02, 0.002, 0.04)), 0.6, 0.05));
    kit.setEmote('cheer');
    kit.faceAngle(0);
    this.app.audio.success(this.app.fromDesk(endDesk));
    boat.chirp('happy', 3);
    await this.say('We made it! Thank you, Sailboat!');
    boat.mode = 'idle';
    boat.grabbable = true;
    void this.stage.toShelf(boat);
    this.app.save.data.chapter = Math.max(this.app.save.data.chapter, 1);
    this.app.save.write();
    await this.say('Mo’s garden is just over the page.');
    await this.turnPage(gardenSpread());
  }

  private async chapterGarden(fresh: boolean): Promise<void> {
    const s = this.script;
    const kit = this.kit;
    const sp = this.book.spread as ReturnType<typeof gardenSpread>;
    if (!fresh) await s.wait(0.6);
    kit.group.position.copy(sp.kitStart);
    kit.faceAngle(0.4);
    kit.setEmote('sad');
    await this.say('Oh no… Mo’s flowers are all droopy.');
    await this.say('There’s water in the well, but nothing to carry it in.');
    kit.setEmote('idle');
    await this.bookFar();
    this.beat('fold');
    const cup = await this.stage.foldAndWake(s, MODEL_BY_ID.cup);
    this.remember(cup);
    await this.bookNear();
    await s.guard(cup.moveToPos(WAIT_SPOT, 0.7, 0.05));

    const wellDesk = this.bookToDesk(sp.well.clone().add(this.tmp.set(0, 0.015, 0)));
    this.ring.position.copy(wellDesk).setY(wellDesk.y + 0.04);
    this.ring.visible = true;
    this.stage.showHint('Dip the cup into the well.');
    this.stage.hintAt(this.tmp.set(-0.05, 0.2, BOOK_NEAR.z - 0.08));
    // water inside the cup
    const waterDisc = new Mesh(new CircleGeometry(0.02, 18), new MeshLambertMaterial({ color: 0x4f9fd8 }));
    waterDisc.rotation.x = -Math.PI / 2;
    waterDisc.visible = false;
    cup.group.add(waterDisc);
    let filled = false;
    this.beat('dip', () => ({ obj: cup.centreLocal(new Vector3()), to: wellDesk }));
    const flowersDesk = sp.flowers.map((f) => {
      f.updateWorldMatrix(true, false);
      return this.app.toDesk(f.getWorldPosition(new Vector3()));
    });
    const watered = sp.flowers.map(() => 0);
    const pour = this.app.audio.noiseLoop(this.app.fromDesk(wellDesk), 'pour');
    const up = new Vector3();
    const off = this.hook((dt) => {
      waterDisc.position.set(0, cup.size.y * 1.65, 0);
      if (!filled && cup.mode === 'held') {
        if (cup.group.position.distanceTo(wellDesk) < 0.045 || (Math.hypot(cup.group.position.x - wellDesk.x, cup.group.position.z - wellDesk.z) < 0.03 && cup.group.position.y < wellDesk.y + 0.03)) {
          filled = true;
          waterDisc.visible = true;
          this.ring.visible = false;
          this.app.audio.splash(this.app.fromDesk(wellDesk));
          this.app.sparkles.droplets(this.app.fromDesk(wellDesk), new Vector3(0, 0.5, 0), 12);
          this.stage.showHint('Now tip the water onto the flowers!', 'hold the cup over each flower and pour');
          this.beat('pour', () => ({ obj: cup.centreLocal(new Vector3()), flowers: flowersDesk.filter((_, i) => watered[i] < 0.7) }));
          this.stage.hintAt(this.tmp.set(0.12, 0.2, BOOK_NEAR.z - 0.08));
          cup.chirp('happy', 2);
        }
      }
      let pouring = false;
      if (filled && cup.mode === 'held') {
        up.set(0, 1, 0).applyQuaternion(cup.group.quaternion);
        const tilt = Math.acos(clamp(up.y, -1, 1));
        if (tilt > 0.75) {
          // water falls from the cup lip
          const lip = cup.group.position.clone().add(this.tmp.copy(up).multiplyScalar(cup.size.y * 1.5 * cup.s));
          pouring = true;
          if (Math.random() < 0.6) this.app.sparkles.droplets(this.app.fromDesk(lip), new Vector3(up.x * 0.3, -0.2, up.z * 0.3), 1);
          flowersDesk.forEach((fp, i) => {
            if (watered[i] >= 0.7) return;
            if (Math.hypot(lip.x - fp.x, lip.z - fp.z) < 0.055 && lip.y > fp.y && lip.y < fp.y + 0.2) {
              watered[i] += dt;
              if (watered[i] >= 0.7) {
                sp.flowers[i].water();
                this.app.audio.sparkle(this.app.fromDesk(fp), 5);
                this.app.sparkles.burst(this.app.fromDesk(fp.clone().setY(fp.y + 0.05)), 16, new Color(0xffd0e8), 0.2, 0.01);
              }
            }
          });
        }
      }
      pour.set(pouring ? 0.7 : 0);
      void dt;
    });
    await s.until(() => watered.every((w) => w >= 0.7));
    this.beat('talk');
    off();
    pour.stop();
    await s.wait(0.6);
    waterDisc.removeFromParent();
    sp.butterfly.visible = true;
    this.stage.hideHint();
    this.app.audio.success(this.app.fromDesk(flowersDesk[1]));
    kit.setEmote('cheer');
    cup.chirp('happy', 3);
    await this.say('They’re beautiful! Mo will love them.');
    await this.say('I’ll bring one along. Thank you, Cup!');
    cup.grabbable = true;
    if (cup.mode === 'held') cup.release();
    await s.until(() => cup.mode === 'idle');
    void this.stage.toShelf(cup);
    this.app.save.data.chapter = Math.max(this.app.save.data.chapter, 2);
    this.app.save.write();
    await this.say('Mo lives up on Windy Hill. Onwards!');
    await this.turnPage(hillSpread());
  }

  private async chapterHill(fresh: boolean): Promise<void> {
    const s = this.script;
    const kit = this.kit;
    const sp = this.book.spread as ReturnType<typeof hillSpread>;
    if (!fresh) await s.wait(0.6);
    kit.group.position.copy(sp.kitStart);
    kit.faceAngle(0.6);
    await this.say('Mo’s house is at the top of that cliff.');
    kit.setEmote('think');
    await this.say('This basket lift runs on wind power… but the air is so still today.');
    const basketTop = () => sp.basket.position.clone().add(this.tmp.set(0, PAGE_Y + 0.004, 0));
    await s.guard(kit.walkToPos(basketTop(), 0.08));
    kit.faceAngle(0);
    kit.setEmote('idle');
    await this.bookFar();
    this.beat('fold');
    const fan = await this.stage.foldAndWake(s, MODEL_BY_ID.fan);
    this.remember(fan);
    await this.bookNear();
    await s.guard(fan.moveToPos(WAIT_SPOT, 0.7, 0.05));
    this.stage.showHint('Pick up the fan and wave it at the windmill!', 'big friendly waves');
    this.stage.hintAt(this.tmp.set(-0.06, 0.22, BOOK_NEAR.z - 0.08));
    const millDesk = this.bookToDesk(new Vector3(-0.12, PAGE_Y + 0.11, -0.05));
    let spin = 0;
    let lift = 0;
    this.beat('fan', () => ({ obj: fan.centreLocal(new Vector3()), to: millDesk }));
    const wind = this.app.audio.noiseLoop(this.app.fromDesk(millDesk), 'wind');
    const off = this.hook((dt) => {
      let power = 0;
      for (const h of this.app.hands.hands) {
        if (!h.tracked) continue;
        this.app.toDesk(h.palm, this.tmp);
        const d = this.tmp.distanceTo(millDesk);
        if (d > 0.4) continue;
        const speed = h.velocity.length();
        // the fan makes much more wind than a bare hand; full strength within
        // 20 cm of the mill, fading out by 40 cm
        const holdingFan = fan.holder === h;
        power = Math.max(power, speed * (holdingFan ? 1 : 0.45) * clamp((0.4 - d) / 0.2, 0, 1));
        if (holdingFan && speed > 0.3 && Math.random() < 0.5) {
          this.app.sparkles.drift(this.app.fromDesk(fan.group.position.clone().add(this.tmp.set(0, 0.04, 0))), new Color(0xe6f7ff), 0.05);
        }
      }
      spin += power * 9 * dt;
      spin *= Math.exp(-0.7 * dt);
      spin = Math.min(spin, 14);
      sp.rotor.rotation.z -= spin * dt;
      // a few seconds of steady fanning lifts the basket all the way
      lift = Math.min(1, lift + Math.max(0, spin - 1) * 0.03 * dt);
      sp.basket.position.y = sp.basketBottom.y + lift * 0.1;
      kit.group.position.copy(basketTop());
      wind.set(clamp(spin / 10, 0, 0.8), 0.7 + spin / 14);
    });
    await s.until(() => lift >= 1);
    this.beat('talk');
    off();
    wind.stop();
    this.stage.hideHint();
    await s.guard(kit.hopTo(sp.cliffTop.clone(), 0.6, 0.04));
    kit.setEmote('cheer');
    this.app.audio.success(this.app.fromDesk(millDesk));
    fan.chirp('happy', 3);
    await this.say('Up we go! Thank you, Fan!');
    if (fan.mode === 'held') fan.release();
    await s.until(() => fan.mode === 'idle');
    void this.stage.toShelf(fan);
    this.app.save.data.chapter = Math.max(this.app.save.data.chapter, 3);
    this.app.save.write();
    await this.say('I can see Mo’s roof from here! Next page!');
    await this.turnPage(nightSpread());
  }

  private async chapterNight(fresh: boolean): Promise<void> {
    const s = this.script;
    const kit = this.kit;
    const sp = this.book.spread as ReturnType<typeof nightSpread>;
    if (!fresh) await s.wait(0.6);
    this.app.audio.music.setMood('night');
    const rain = this.app.audio.noiseLoop(this.app.fromDesk(this.book.group.position), 'rain');
    rain.set(0.35);
    kit.group.position.copy(sp.kitStart);
    kit.faceAngle(0.8);
    await this.say('There’s Mo’s house… but it’s so dark and rainy.');
    kit.setEmote('sad');
    await this.say('Mo hasn’t come outside since the rain started.');
    await this.say('A letter might not be enough. Maybe something… from the heart?');
    kit.setEmote('idle');
    await this.bookFar();
    this.beat('fold');
    const heart = await this.stage.foldAndWake(s, MODEL_BY_ID.heart);
    this.remember(heart);
    await this.bookNear();
    await s.guard(heart.moveToPos(WAIT_SPOT, 0.7, 0.05));
    const kitDesk = () => this.bookToDesk(kit.group.position.clone());
    this.ring.position.copy(kitDesk()).setY(kitDesk().y + 0.003);
    this.ring.visible = true;
    this.stage.showHint('Give the heart to Kit.', 'pinch it and set it down beside Kit');
    this.stage.hintAt(this.tmp.set(-0.08, 0.2, BOOK_NEAR.z - 0.08));
    let given = false;
    this.beat('give', () => ({ obj: heart.centreLocal(new Vector3()), to: kitDesk() }));
    heart.onRelease = () => {
      if (heart.group.position.distanceTo(kitDesk()) < 0.09) given = true;
    };
    const start = s.time;
    await s.until(() => {
      // accessibility: Kit walks over to fetch it after a while
      if (!given && s.time - start > 40 && heart.mode === 'idle') given = true;
      return given;
    });
    this.beat('talk');
    heart.onRelease = null;
    this.ring.visible = false;
    this.stage.hideHint();
    heart.grabbable = false;
    heart.mode = 'scripted';
    // the heart floats above Kit's head and follows along
    const offFollow = this.hook(() => {
      const p = kitDesk().add(this.tmp.set(0, 0.075, 0));
      heart.group.position.lerp(p, 0.12);
    });
    kit.setEmote('jump');
    await this.say('It’s perfect. Let’s go!');
    await s.guard(kit.walkToPos(sp.door.clone().add(this.tmp.set(-0.02, 0, 0.035)), 0.07));
    kit.faceAngle(Math.PI);
    for (let i = 0; i < 3; i++) {
      this.app.audio.thump(this.app.fromDesk(this.bookToDesk(sp.door)), 0.35);
      await s.wait(0.32);
    }
    // Mo comes out
    this.mo = new Mo(this.app);
    this.mo.captions = this.kit.captions;
    this.book.group.add(this.mo.group);
    this.mo.group.position.copy(sp.door).add(this.tmp.set(0, 0, -0.01));
    await s.guard(this.mo.hopTo(sp.door.clone().add(this.tmp.set(0.01, 0, 0.03)), 0.5, 0.02));
    this.mo.face(kit.group.position);
    kit.faceAngle(0);
    kit.face(this.mo.group.position);
    await this.say('Kit? Is that really you?', 'mo');
    kit.setEmote('wave');
    await this.say('Special delivery! A letter… and a heart.');
    offFollow();
    await s.guard(heart.moveToPos(this.bookToDesk(this.mo.group.position.clone().add(this.tmp.set(0, 0.075, 0))), 0.8, 0.02));
    // the rain stops, the sun comes out
    rain.stop();
    this.app.audio.music.setMood('finale');
    this.app.audio.success(this.app.fromDesk(this.book.group.position));
    for (const p of sp.dayProps) this.book.reveal(p as never);
    const dayStart = s.time;
    const offDay = this.hook(() => sp.setDay(clamp((s.time - dayStart) / 2, 0, 1)));
    this.app.sparkles.burst(this.app.fromDesk(heart.group.position), 40, new Color(0xffb3c8), 0.4, 0.014);
    this.mo.setEmote('cheer');
    await this.say('Someone folded this… just for me?', 'mo');
    await this.say('Our friend did. With their own two hands!');
    kit.setEmote('dance');
    this.mo.setEmote('dance');
    heart.mode = 'idle';
    await s.wait(3.2);
    kit.setEmote('idle');
    this.mo.setEmote('idle');
    offDay();
    void this.stage.toShelf(heart);
  }

  private async finale(): Promise<void> {
    const s = this.script;
    const kit = this.kit;
    kit.faceAngle(0);
    await this.say('Oh! I nearly forgot. This last letter… is for you.');
    // the envelope floats to the player
    const env = envelope();
    this.app.deskGroup.add(env);
    env.position.copy(this.bookToDesk(kit.group.position.clone().add(this.tmp.set(0, 0.06, 0))));
    const dest = this.app.toDesk(this.app.headPos.clone()).add(this.tmp.set(0, -0.2, -0.0));
    dest.z = Math.min(dest.z - 0.28, 0.02);
    const from = env.position.clone();
    for (let t = 0; t <= 1; t += 1 / 60) {
      env.position.lerpVectors(from, dest, easeInOutCubic(t));
      env.position.y += Math.sin(t * Math.PI) * 0.08;
      env.rotation.set(-0.5, Math.sin(t * 6) * 0.3, 0);
      await s.wait(1 / 60);
    }
    this.stage.showHint('Pinch the letter to open it.');
    this.stage.hintAt(dest.clone().add(this.tmp.set(0, 0.08, -0.02)));
    let opened = false;
    this.beat('letter', () => ({ at: env.position.clone() }));
    const startOpen = s.time;
    await s.until(() => {
      env.position.y = dest.y + Math.sin(s.time * 2) * 0.005;
      for (const h of this.app.hands.hands) {
        if (!h.freshPinch) continue;
        this.app.toDesk(h.pinchPoint, this.tmp);
        if (this.tmp.distanceTo(env.position) < 0.08) {
          h.claimedBy = env;
          opened = true;
        }
      }
      if (s.time - startOpen > 30) opened = true;
      return opened;
    });
    this.beat('talk');
    this.stage.hideHint();
    this.app.audio.rustle(this.app.fromDesk(env.position), 0.9);
    this.app.audio.alive(this.app.fromDesk(env.position));
    env.visible = false;
    const card = new TextCard(0.3, 2600);
    card.set(
      [
        { text: 'Dear friend,', size: 1.1, font: 'title', color: '#b4473a' },
        { text: 'Thank you for lending us your hands.', size: 0.95 },
        { text: 'Every fold you made is still here on your desk. Come visit them any time — there’s always something new to fold.', size: 0.85 },
        { text: 'With love, Kit & Mo', size: 0.95, font: 'title', color: '#3d7be0' },
      ],
      { bg: '#fff8ea', radius: 0.05, border: 'rgba(180,71,58,0.35)' },
    );
    card.mesh.position.copy(dest).add(this.tmp.set(0, 0.06, -0.02));
    this.app.deskGroup.add(card.mesh);
    card.opacity = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      card.opacity = t;
      card.mesh.lookAt(this.app.headPos);
      await s.wait(1 / 60);
    }
    this.app.save.data.storyDone = true;
    this.app.save.data.chapter = 4;
    this.app.save.write();
    const tEnd = s.time;
    await s.until(() => {
      card.mesh.lookAt(this.app.headPos);
      return s.time - tEnd > 9;
    });
    for (let t = 0; t < 1; t += 1 / 60) {
      card.opacity = 1 - t;
      await s.wait(1 / 60);
    }
    card.mesh.removeFromParent();
    card.dispose();
    env.removeFromParent();
    this.book.close();
    this.kit.setEmote('wave');
    this.mo?.setEmote('wave');
    await s.wait(1.4);
    this.kit.group.visible = false;
    if (this.mo) this.mo.group.visible = false;
    await this.showTitle(
      [
        { text: 'The End', size: 2.2, font: 'title', color: '#fff4dc' },
        { text: '…of this story. Your Foldlings are waiting.', size: 0.9, color: '#ffe6b0' },
      ],
      2.5,
      this.tmp.set(0, 0.22, BOOK_FAR.z),
    );
    this.beat('end');
    this.app.setScene('menu');
  }
}

function envelope(): Group {
  const g = new Group();
  const body = new Mesh(new BoxGeometry(0.07, 0.0025, 0.048), paperMat(0xfbf3e2));
  body.castShadow = true;
  g.add(body);
  const flap = new Mesh(new CircleGeometry(0.036, 3), paperMat(0xf1e4c9));
  flap.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  flap.position.set(0, 0.0015, -0.012);
  flap.scale.set(0.75, 1, 1);
  g.add(flap);
  const seal = new Mesh(new CircleGeometry(0.007, 16), new MeshLambertMaterial({ color: 0xc8344a }));
  seal.rotation.x = -Math.PI / 2;
  seal.position.set(0, 0.0018, 0.004);
  g.add(seal);
  return g;
}
