/**
 * Fully procedural sound: paper rustles and creases from filtered noise, FM
 * bells for magic, chirpy voices for the Foldlings and Kit, and a generative
 * music-box score. No audio files to download, nothing to license.
 */
import { Quaternion, Vector3 } from '@iwsdk/core';
import { seededRandom } from '../core/util.js';

type Pos = Vector3 | null | undefined;

// C major pentatonic across a few octaves (MIDI note numbers)
const PENTA = [0, 2, 4, 7, 9];
export const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
export const pentatonic = (degree: number, base = 72): number => {
  const oct = Math.floor(degree / 5);
  const d = ((degree % 5) + 5) % 5;
  return base + oct * 12 + PENTA[d];
};

export interface Loop {
  set(level: number, pitch?: number): void;
  stop(): void;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private voice!: GainNode;
  private noise!: AudioBuffer;
  private rnd = seededRandom(7);
  readonly music = new MusicBox(this);
  volumes = { master: 0.9, sfx: 1, music: 0.55, voice: 0.9 };
  private fwd = new Vector3();
  private up = new Vector3();

  /** Must be called from a user gesture (button press / entering XR). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master = c.createGain();
      this.master.gain.value = this.volumes.master;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.musicBus = c.createGain();
      this.voice = c.createGain();
      this.applyVolumes();
      this.sfx.connect(this.master);
      this.musicBus.connect(this.master);
      this.voice.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music * 0.32;
    this.voice.gain.value = this.volumes.voice;
  }

  get musicOut(): GainNode {
    return this.musicBus;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setListener(pos: Vector3, quat: Quaternion): void {
    const c = this.ctx;
    if (!c) return;
    const l = c.listener;
    this.fwd.set(0, 0, -1).applyQuaternion(quat);
    this.up.set(0, 1, 0).applyQuaternion(quat);
    if (l.positionX) {
      const t = c.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(this.fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(this.fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(this.fwd.z, t, 0.02);
      l.upX.setTargetAtTime(this.up.x, t, 0.02);
      l.upY.setTargetAtTime(this.up.y, t, 0.02);
      l.upZ.setTargetAtTime(this.up.z, t, 0.02);
    } else {
      (l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.x, pos.y, pos.z);
    }
  }

  /** Output node for a sound, spatialised when a position is given. */
  private out(pos: Pos, bus: 'sfx' | 'voice' = 'sfx', hrtf = false): AudioNode {
    const c = this.ctx!;
    const dest = bus === 'sfx' ? this.sfx : this.voice;
    if (!pos) return dest;
    const p = c.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 0.35;
    p.rolloffFactor = 1;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(dest);
    return p;
  }

  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = this.rnd() * 1.5;
    return s;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  // ---- paper ---------------------------------------------------------------

  rustle(pos: Pos, intensity = 0.6): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200 + this.rnd() * 3000;
    bp.Q.value = 0.7;
    const g = c.createGain();
    this.env(g, t, 0.006, 0.35 * intensity, 0.09 + this.rnd() * 0.08);
    n.connect(bp).connect(g).connect(this.out(pos));
    n.start(t, this.rnd());
    n.stop(t + 0.3);
  }

  /** Continuous paper sound while a flap is moving. */
  dragLoop(pos: Pos): Loop {
    const c = this.ctx;
    if (!c) return { set() {}, stop() {} };
    const n = this.noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0;
    n.connect(bp).connect(g).connect(this.out(pos));
    n.start();
    let stopped = false;
    return {
      set: (level: number, pitch = 1) => {
        if (stopped) return;
        const t = c.currentTime;
        // crackly paper: jitter the band a little every update
        bp.frequency.setTargetAtTime((2400 + this.rnd() * 1800) * pitch, t, 0.03);
        g.gain.setTargetAtTime(Math.min(0.5, level) * 0.5, t, 0.04);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        g.gain.setTargetAtTime(0, c.currentTime, 0.05);
        n.stop(c.currentTime + 0.3);
      },
    };
  }

  /** The satisfying snap of a finished fold. */
  crease(pos: Pos, strength = 1): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const out = this.out(pos);
    // crisp click
    const n = this.noiseSrc();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = c.createGain();
    this.env(g, t, 0.002, 0.7 * strength, 0.045);
    n.connect(hp).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.1);
    // soft thump of paper landing
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    const g2 = c.createGain();
    this.env(g2, t, 0.004, 0.45 * strength, 0.12);
    o.connect(g2).connect(out);
    o.start(t);
    o.stop(t + 0.2);
    // a short "zip" sweep along the crease
    const n2 = this.noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(1800, t + 0.02);
    bp.frequency.exponentialRampToValueAtTime(6500, t + 0.16);
    const g3 = c.createGain();
    this.env(g3, t + 0.02, 0.01, 0.18 * strength, 0.14);
    n2.connect(bp).connect(g3).connect(out);
    n2.start(t + 0.02);
    n2.stop(t + 0.3);
  }

  /** Finger run along a crease. */
  zip(pos: Pos): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 5;
    bp.frequency.setValueAtTime(1500, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + 0.25);
    const g = c.createGain();
    this.env(g, t, 0.02, 0.3, 0.25);
    n.connect(bp).connect(g).connect(this.out(pos));
    n.start(t);
    n.stop(t + 0.4);
  }

  whoosh(pos: Pos, dur = 0.5, up = true): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const lp = c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(up ? 400 : 2500, t);
    lp.frequency.exponentialRampToValueAtTime(up ? 2500 : 400, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp).connect(g).connect(this.out(pos));
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  pageTurn(pos: Pos): void {
    this.whoosh(pos, 0.45, false);
    setTimeout(() => this.rustle(pos, 0.8), 300);
  }

  thump(pos: Pos, gain = 0.6): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = c.createGain();
    this.env(g, t, 0.005, gain, 0.25);
    o.connect(g).connect(this.out(pos));
    o.start(t);
    o.stop(t + 0.35);
    this.rustle(pos, 0.5);
  }

  /** Bubble-like pop for pop-up book elements. */
  pop(pos: Pos, pitch = 1): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(320 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(900 * pitch, t + 0.06);
    const g = c.createGain();
    this.env(g, t, 0.004, 0.25, 0.09);
    o.connect(g).connect(this.out(pos));
    o.start(t);
    o.stop(t + 0.15);
  }

  // ---- magic ---------------------------------------------------------------

  bell(pos: Pos, freq: number, vel = 0.5, when = 0, dur = 1.6, bus: 'sfx' | 'voice' = 'sfx'): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + when;
    const car = c.createOscillator();
    car.frequency.value = freq;
    const mod = c.createOscillator();
    mod.frequency.value = freq * 3.5;
    const mg = c.createGain();
    mg.gain.setValueAtTime(freq * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.5);
    mod.connect(mg).connect(car.frequency);
    const g = c.createGain();
    this.env(g, t, 0.003, vel * 0.3, dur);
    car.connect(g).connect(this.out(pos, bus));
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  sparkle(pos: Pos, count = 4): void {
    for (let i = 0; i < count; i++) {
      this.bell(pos, midi(pentatonic(8 + Math.floor(this.rnd() * 6), 72)), 0.25, i * 0.06 + this.rnd() * 0.03, 0.7);
    }
  }

  /** Rising arpeggio for a Foldling coming to life. */
  alive(pos: Pos): void {
    const degrees = [0, 2, 4, 5, 7, 9, 10];
    degrees.forEach((d, i) => this.bell(pos, midi(pentatonic(d, 67)), 0.45, i * 0.09, 1.4));
    this.whoosh(pos, 0.8, true);
  }

  success(pos: Pos): void {
    [0, 4, 7, 12].forEach((s, i) => this.bell(pos, midi(60 + s + 12), 0.4, i * 0.12, 2.2));
    [0, 4, 7].forEach((s) => this.bell(pos, midi(48 + s + 12), 0.25, 0.5, 2.5));
  }

  tick(pos: Pos): void {
    this.bell(pos, midi(96), 0.12, 0, 0.15);
  }

  tap(pos: Pos): void {
    this.bell(pos, midi(84), 0.3, 0, 0.35);
    this.rustle(pos, 0.3);
  }

  // ---- voices --------------------------------------------------------------

  /** A happy chirp; `base` is the creature's MIDI pitch. */
  chirp(pos: Pos, base = 76, syllables = 2, mood: 'happy' | 'curious' | 'sad' = 'happy'): void {
    const c = this.ctx;
    if (!c) return;
    let t = c.currentTime;
    const out = this.out(pos, 'voice', true);
    for (let i = 0; i < syllables; i++) {
      const o = c.createOscillator();
      o.type = 'triangle';
      const f0 = midi(base + (this.rnd() * 4 - 2));
      const rise = mood === 'sad' ? 0.8 : mood === 'curious' ? 1.35 : 1.18;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * rise, t + 0.09);
      const vib = c.createOscillator();
      vib.frequency.value = 22;
      const vg = c.createGain();
      vg.gain.value = f0 * 0.03;
      vib.connect(vg).connect(o.frequency);
      const g = c.createGain();
      this.env(g, t, 0.01, 0.22, 0.11);
      o.connect(g).connect(out);
      o.start(t);
      vib.start(t);
      o.stop(t + 0.16);
      vib.stop(t + 0.16);
      t += 0.12 + this.rnd() * 0.05;
    }
  }

  /** Animal-Crossing-style babble timed to a line of text. Returns its duration. */
  babble(pos: Pos, text: string, base = 70): number {
    const c = this.ctx;
    const syl = Math.max(2, Math.min(28, Math.round(text.replace(/[^a-z]/gi, '').length / 2.4)));
    const step = 0.075;
    if (!c) return syl * step;
    const out = this.out(pos, 'voice', true);
    let t = c.currentTime;
    const question = text.trim().endsWith('?');
    for (let i = 0; i < syl; i++) {
      const o = c.createOscillator();
      o.type = 'square';
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const contour = question && i > syl - 3 ? 4 : 0;
      o.frequency.value = midi(base + PENTA[Math.floor(this.rnd() * 5)] * 0.5 + contour);
      const g = c.createGain();
      this.env(g, t, 0.008, 0.07, 0.055);
      o.connect(lp).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.08);
      t += step + this.rnd() * 0.02;
    }
    return syl * (step + 0.01);
  }

  // ---- ambience ------------------------------------------------------------

  /** Filtered-noise loop (water, wind, rain, pouring). */
  noiseLoop(pos: Pos, kind: 'water' | 'wind' | 'rain' | 'pour'): Loop {
    const c = this.ctx;
    if (!c) return { set() {}, stop() {} };
    const n = this.noiseSrc();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    g.gain.value = 0;
    let base = 600;
    if (kind === 'water') {
      f.type = 'bandpass';
      base = 900;
      f.Q.value = 0.5;
    } else if (kind === 'wind') {
      f.type = 'lowpass';
      base = 500;
      f.Q.value = 4;
    } else if (kind === 'rain') {
      f.type = 'highpass';
      base = 3500;
    } else {
      f.type = 'bandpass';
      base = 1400;
      f.Q.value = 1.4;
    }
    f.frequency.value = base;
    // slow wobble for life
    const lfo = c.createOscillator();
    lfo.frequency.value = kind === 'wind' ? 0.35 : 2.3;
    const lg = c.createGain();
    lg.gain.value = base * 0.35;
    lfo.connect(lg).connect(f.frequency);
    n.connect(f).connect(g).connect(this.out(pos));
    n.start();
    lfo.start();
    let stopped = false;
    return {
      set: (level: number, pitch = 1) => {
        if (stopped) return;
        const t = c.currentTime;
        g.gain.setTargetAtTime(level * 0.35, t, 0.08);
        f.frequency.setTargetAtTime(base * pitch, t, 0.1);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        g.gain.setTargetAtTime(0, c.currentTime, 0.15);
        n.stop(c.currentTime + 0.8);
        lfo.stop(c.currentTime + 0.8);
      },
    };
  }

  splash(pos: Pos): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    const g = c.createGain();
    this.env(g, t, 0.005, 0.4, 0.35);
    n.connect(lp).connect(g).connect(this.out(pos));
    n.start(t);
    n.stop(t + 0.5);
    for (let i = 0; i < 3; i++) this.pop(pos, 1.6 + this.rnd());
  }
}

/**
 * Generative music box: a gentle chord loop with a pentatonic melody that
 * wanders over chord tones, plus a soft pad. Mood changes the density.
 */
export class MusicBox {
  private timer: number | null = null;
  private nextTime = 0;
  private beat = 0;
  private rnd = seededRandom(11);
  private lastDegree = 4;
  mood: 'calm' | 'playful' | 'night' | 'finale' | 'off' = 'calm';
  private bpm = 84;

  constructor(private audio: AudioEngine) {}

  // I – vi – IV – V in C, as MIDI roots and chord tones
  private chords = [
    [48, [60, 64, 67, 71]],
    [45, [57, 60, 64, 67]],
    [41, [57, 60, 65, 69]],
    [43, [59, 62, 67, 71]],
  ] as const;

  start(mood: MusicBox['mood'] = 'calm'): void {
    this.mood = mood;
    const c = this.audio.ctx;
    if (!c || this.timer !== null || mood === 'off') return;
    this.nextTime = c.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  setMood(mood: MusicBox['mood']): void {
    if (mood === 'off') {
      this.stop();
      return;
    }
    this.mood = mood;
    this.bpm = mood === 'playful' ? 96 : mood === 'finale' ? 90 : mood === 'night' ? 72 : 84;
    if (this.timer === null) this.start(mood);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const c = this.audio.ctx;
    if (!c) return;
    const spb = 60 / this.bpm / 2; // eighth notes
    while (this.nextTime < c.currentTime + 0.15) {
      this.playStep(this.nextTime, this.beat);
      this.nextTime += spb;
      this.beat++;
    }
  }

  private playStep(t: number, step: number): void {
    const bar = Math.floor(step / 8) % this.chords.length;
    const pos = step % 8;
    const [root, tones] = this.chords[bar];
    const out = this.audio.musicOut;
    const c = this.audio.ctx!;
    if (pos === 0) {
      this.pad(c, out, t, tones.map((n) => n - 12), (60 / this.bpm) * 4);
      this.pluck(c, out, t, midi(root), 0.28, 1.6, 'sine');
    }
    const density = this.mood === 'playful' ? 0.75 : this.mood === 'night' ? 0.35 : this.mood === 'finale' ? 0.8 : 0.5;
    const strong = pos % 2 === 0;
    if (this.rnd() < (strong ? density : density * 0.45)) {
      // wander the pentatonic, gravitating to chord tones on strong beats
      this.lastDegree += Math.round((this.rnd() - 0.5) * 3.2);
      this.lastDegree = Math.max(2, Math.min(12, this.lastDegree));
      let note = pentatonic(this.lastDegree, 60);
      if (strong) {
        const target = tones[Math.floor(this.rnd() * tones.length)] + 12;
        if (Math.abs(target - note) <= 3) note = target;
      }
      this.pluck(c, out, t, midi(note), strong ? 0.32 : 0.2, 1.1, 'musicbox');
    }
  }

  private pluck(c: AudioContext, out: AudioNode, t: number, f: number, vel: number, dur: number, kind: 'sine' | 'musicbox'): void {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (kind === 'musicbox') {
      // metallic overtone of a music-box tine
      const o2 = c.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = f * 4.02;
      const g2 = c.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(vel * 0.25, t + 0.002);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o2.connect(g2).connect(out);
      o2.start(t);
      o2.stop(t + 0.3);
    }
  }

  private pad(c: AudioContext, out: AudioNode, t: number, notes: readonly number[], dur: number): void {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    lp.connect(g).connect(out);
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }
}
