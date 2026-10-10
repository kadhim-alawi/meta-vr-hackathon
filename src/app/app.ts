/**
 * The game shell: owns the shared services (hands, audio, desk, effects) and
 * runs whichever scene is active (title, story chapter, free fold, ...).
 */
import { Group, Quaternion, Vector3, VisibilityState, World } from '@iwsdk/core';
import { AudioEngine } from '../audio/audio.js';
import { Save } from '../core/save.js';
import { Environment } from '../render/environment.js';
import { Sparkles } from '../render/sparkles.js';
import { Desk, DeskSource } from '../xr/desk.js';
import { HandTracker } from '../xr/hands.js';
import { HandVisuals } from '../xr/hand-visual.js';

export interface Scene {
  readonly name: string;
  enter(): void;
  update(dt: number, time: number): void;
  exit(): void;
}

export type XRMode = 'ar' | 'vr' | 'none';

export class App {
  readonly root = new Group();
  readonly hands = new HandTracker();
  readonly handVisuals = new HandVisuals();
  readonly audio = new AudioEngine();
  readonly desk = new Desk();
  readonly sparkles = new Sparkles();
  readonly save = new Save();
  readonly env: Environment;
  /** scene graph layer that sits on the desk surface */
  get deskGroup(): Group {
    return this.desk.group;
  }
  mode: XRMode = 'none';
  scene: Scene | null = null;
  private pending: (() => Scene) | null = null;
  readonly headPos = new Vector3();
  readonly headQuat = new Quaternion();
  time = 0;
  /** scene constructors; `setScene('free:cup')` passes 'cup' as the argument */
  sceneFactory: Record<string, (arg?: string) => Scene> = {};
  /** scene to start when an XR session begins */
  firstScene = 'story';
  /** handlers for desk placement changes */
  onDeskPlaced: ((src: DeskSource) => void)[] = [];
  /** frame counter for perf sampling */
  frames = 0;
  /** game speed multiplier (automated tests only: ?ts=3) */
  timeScale = Number(new URLSearchParams(location.search).get('ts')) || 1;
  private lastSession: XRSession | undefined;

  constructor(readonly world: World) {
    world.scene.add(this.root);
    this.env = new Environment(world.renderer);
    this.root.add(this.env.lights, this.env.room, this.desk.group, this.handVisuals.group, this.sparkles.mesh);
    this.desk.group.add(this.env.deskDecor);
    this.desk.onPlaced = (src) => {
      this.env.setMode(this.mode === 'vr' ? 'vr' : src === 'default' ? 'mr-floating' : 'mr-table');
      for (const fn of this.onDeskPlaced) fn(src);
    };
    this.applySettings();
    this.quietBuiltInInput();
    world.visibilityState.subscribe((v) => this.onVisibility(v));
  }

  /**
   * We draw our own hands (occluders in MR, paper hands in VR) and our own
   * pointer feedback, so IWSDK's default hand meshes and rays are turned off.
   * Controller models stay on.
   */
  private quietBuiltInInput(): void {
    const input = this.world.input;
    input.visualAdapters.hand.left.toggleVisual(false);
    input.visualAdapters.hand.right.toggleVisual(false);
    for (const side of ['left', 'right'] as const) {
      for (const kind of ['ray', 'grab', 'touch'] as const) input.multiPointers[side].toggleSubPointer(kind, false);
    }
  }

  applySettings(): void {
    const s = this.save.data.settings;
    this.audio.volumes.music = s.music;
    this.audio.volumes.sfx = s.sfx;
    this.audio.volumes.voice = s.voice;
    this.audio.applyVolumes();
  }

  private onVisibility(v: VisibilityState): void {
    const session = this.world.session;
    if (v === VisibilityState.NonImmersive) {
      this.mode = 'none';
      this.hands.attach(null);
      this.audio.music.stop();
      this.lastSession = undefined;
      this.desk.reset();
      if (this.sceneFactory.idle) this.setScene('idle');
      document.body.classList.remove('in-xr');
      return;
    }
    if (session && session !== this.lastSession) {
      this.lastSession = session;
      this.hands.attach(session);
      this.quietBuiltInInput();
      const blend = session.environmentBlendMode;
      this.mode = blend === 'opaque' || !blend ? 'vr' : 'ar';
      if ((session as XRSession & { mode?: string }).mode === 'immersive-vr') this.mode = 'vr';
      this.handVisuals.setMode(this.mode === 'ar' ? 'occlude' : 'visible');
      this.env.setMode(this.mode === 'vr' ? 'vr' : 'mr-floating');
      this.desk.reset();
      try {
        session.updateTargetFrameRate?.(72).catch(() => undefined);
      } catch {
        /* not supported */
      }
      this.world.renderer.xr.setFoveation?.(0.5);
      document.body.classList.add('in-xr');
      // first frames of the session: let the desk settle, then begin
      this.setScene(this.firstScene);
    }
  }

  setScene(spec: string): void {
    const [name, arg] = spec.split(':');
    const make = this.sceneFactory[name];
    if (!make) throw new Error(`unknown scene ${name}`);
    this.pending = () => make(arg);
  }

  /** Called once per rendered frame by the game system. */
  update(dt: number, time: number, frame: XRFrame | undefined): void {
    this.time = time;
    this.frames++;
    // input runs on real time; the game clock may be sped up for tests
    const rawDt = Math.min(dt, 1 / 20);
    dt = rawDt * this.timeScale;
    const cam = this.world.camera;
    cam.getWorldPosition(this.headPos);
    cam.getWorldQuaternion(this.headQuat);

    const ref = this.world.renderer.xr.getReferenceSpace();
    const player = this.world.player;
    this.hands.update(frame, ref, player, time, rawDt);
    player.updateWorldMatrix(true, false);
    this.desk.update(frame, ref, { position: this.headPos, quaternion: this.headQuat }, this.hands, player.matrixWorld, this.mode === 'ar' ? 'ar' : 'vr', dt);
    this.desk.group.updateWorldMatrix(true, false);
    this.env.follow(this.desk.group.getWorldPosition(this.tmpV));

    if (this.pending) {
      const make = this.pending;
      this.pending = null;
      this.scene?.exit();
      this.scene = make();
      this.scene.enter();
    }
    this.scene?.update(dt, time);

    this.handVisuals.update(this.hands, this.headPos, () => false);
    this.sparkles.update(dt, this.headQuat);
    this.audio.setListener(this.headPos, this.headQuat);
  }

  private tmpV = new Vector3();

  /** Convert a world point into desk-local coordinates. */
  toDesk(world: Vector3, out = new Vector3()): Vector3 {
    this.desk.group.updateWorldMatrix(true, false);
    return this.desk.group.worldToLocal(out.copy(world));
  }

  /** Convert a desk-local point to world coordinates. */
  fromDesk(local: Vector3, out = new Vector3()): Vector3 {
    this.desk.group.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(this.desk.group.matrixWorld);
  }
}
