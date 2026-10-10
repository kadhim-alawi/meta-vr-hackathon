/** Small math helpers shared across the game. */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutCubic = (t: number): number => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (t: number, s = 1.70158): number => {
  t = clamp01(t) - 1;
  return t * t * ((s + 1) * t + s) + 1;
};
export const easeOutElastic = (t: number): number => {
  t = clamp01(t);
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);

/** Critically damped spring on a scalar; returns [value, velocity]. */
export function spring(
  value: number,
  velocity: number,
  target: number,
  omega: number,
  dt: number,
): [number, number] {
  // Exact solution of a critically damped oscillator (stable for any dt).
  const x = value - target;
  const exp = Math.exp(-omega * dt);
  const nv = (velocity - omega * omega * dt * x - omega * velocity * dt) * exp;
  const nx = (x + (velocity + omega * x) * dt) * exp;
  return [target + nx, nv];
}

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAU = Math.PI * 2;

/** Local calendar day number, used for the daily fold. */
export function dayNumber(date = new Date()): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

/** Wraps an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
