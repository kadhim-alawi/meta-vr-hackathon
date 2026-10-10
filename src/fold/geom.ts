/**
 * Minimal 2D geometry for the fold engine. Pure functions, no Three.js, so the
 * engine can be unit-tested in Node and reused by the SVG step renderer.
 */

export type Vec2 = readonly [number, number];

export const EPS = 1e-7;

export const v2 = (x: number, y: number): Vec2 => [x, y];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
export const mid = (a: Vec2, b: Vec2): Vec2 => lerp(a, b, 0.5);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? [0, 0] : [a[0] / l, a[1] / l];
};
export const perp = (a: Vec2): Vec2 => [-a[1], a[0]];

/** A line through `p` with unit direction `d`. */
export interface Line {
  p: Vec2;
  d: Vec2;
}

export const lineThrough = (a: Vec2, b: Vec2): Line => ({ p: a, d: norm(sub(b, a)) });

/** Signed distance of `q` from the line; positive on the left of `d`. */
export const side = (l: Line, q: Vec2): number => cross(l.d, sub(q, l.p));

/** Perpendicular bisector of a→b, oriented so that `a` is on the positive side. */
export function bisector(a: Vec2, b: Vec2): Line {
  const m = mid(a, b);
  const n = norm(sub(a, b));
  // Direction d such that cross(d, a - m) > 0  →  d = -perp(n)
  const d: Vec2 = [n[1], -n[0]];
  return { p: m, d };
}

export function reflectPoint(l: Line, q: Vec2): Vec2 {
  const r = sub(q, l.p);
  const t = dot(r, l.d);
  const proj = scale(l.d, t);
  const perpPart = sub(r, proj);
  return add(l.p, sub(proj, perpPart));
}

export function projectPoint(l: Line, q: Vec2): Vec2 {
  const t = dot(sub(q, l.p), l.d);
  return add(l.p, scale(l.d, t));
}

/**
 * 2D affine map x' = A x + t with A = [[a, c], [b, d]] (column-major like
 * Three.js Matrix3). Fold transforms are isometries (det ±1).
 */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const apply = (m: Affine, q: Vec2): Vec2 => [
  m.a * q[0] + m.c * q[1] + m.e,
  m.b * q[0] + m.d * q[1] + m.f,
];

export const applyDir = (m: Affine, q: Vec2): Vec2 => [
  m.a * q[0] + m.c * q[1],
  m.b * q[0] + m.d * q[1],
];

/** compose(m2, m1) = m2 ∘ m1 (apply m1 first). */
export function compose(m2: Affine, m1: Affine): Affine {
  return {
    a: m2.a * m1.a + m2.c * m1.b,
    b: m2.b * m1.a + m2.d * m1.b,
    c: m2.a * m1.c + m2.c * m1.d,
    d: m2.b * m1.c + m2.d * m1.d,
    e: m2.a * m1.e + m2.c * m1.f + m2.e,
    f: m2.b * m1.e + m2.d * m1.f + m2.f,
  };
}

export const det = (m: Affine): number => m.a * m.d - m.b * m.c;

export function invert(m: Affine): Affine {
  const D = det(m);
  const a = m.d / D;
  const b = -m.b / D;
  const c = -m.c / D;
  const d = m.a / D;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

export function reflection(l: Line): Affine {
  const [dx, dy] = l.d;
  const a = 2 * dx * dx - 1;
  const b = 2 * dx * dy;
  const c = b;
  const d = 2 * dy * dy - 1;
  // x' = A(x - p) + p
  const e = l.p[0] - (a * l.p[0] + c * l.p[1]);
  const f = l.p[1] - (b * l.p[0] + d * l.p[1]);
  return { a, b, c, d, e, f };
}

export function rotation(angle: number, about: Vec2 = [0, 0]): Affine {
  const cs = Math.cos(angle);
  const sn = Math.sin(angle);
  const e = about[0] - (cs * about[0] - sn * about[1]);
  const f = about[1] - (sn * about[0] + cs * about[1]);
  return { a: cs, b: sn, c: -sn, d: cs, e, f };
}

export const translation = (t: Vec2): Affine => ({ a: 1, b: 0, c: 0, d: 1, e: t[0], f: t[1] });

export function transformLine(m: Affine, l: Line): Line {
  return { p: apply(m, l.p), d: norm(applyDir(m, l.d)) };
}

export function polyArea(poly: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function centroid(poly: readonly Vec2[]): Vec2 {
  // Area-weighted centroid; falls back to vertex mean for degenerate polygons.
  let cx = 0;
  let cy = 0;
  let a2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const w = p[0] * q[1] - q[0] * p[1];
    a2 += w;
    cx += (p[0] + q[0]) * w;
    cy += (p[1] + q[1]) * w;
  }
  if (Math.abs(a2) < EPS) {
    let mx = 0;
    let my = 0;
    for (const p of poly) {
      mx += p[0];
      my += p[1];
    }
    return [mx / poly.length, my / poly.length];
  }
  return [cx / (3 * a2), cy / (3 * a2)];
}

/** Point-in-convex-or-simple polygon with an inclusive tolerance on edges. */
export function containsPoint(poly: readonly Vec2[], q: Vec2, tol = 1e-6): boolean {
  if (distanceToPolygonEdge(poly, q) <= tol) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi[1] > q[1] !== pj[1] > q[1]) {
      const x = ((pj[0] - pi[0]) * (q[1] - pi[1])) / (pj[1] - pi[1]) + pi[0];
      if (q[0] < x) inside = !inside;
    }
  }
  return inside;
}

export function distanceToSegment(a: Vec2, b: Vec2, q: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS * EPS) return dist(a, q);
  const t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / l2));
  return dist(add(a, scale(ab, t)), q);
}

export function distanceToPolygonEdge(poly: readonly Vec2[], q: Vec2): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, distanceToSegment(poly[i], poly[(i + 1) % poly.length], q));
  }
  return best;
}

/**
 * Split a polygon by a line. Returns [positiveSide, negativeSide]; either may
 * be null when the polygon lies (within tolerance) entirely on one side.
 * Splitting a convex polygon always yields convex pieces.
 */
export function splitPolygon(
  poly: readonly Vec2[],
  l: Line,
  tol = 1e-6,
): [Vec2[] | null, Vec2[] | null] {
  const s = poly.map((q) => side(l, q));
  let hasPos = false;
  let hasNeg = false;
  for (const v of s) {
    if (v > tol) hasPos = true;
    else if (v < -tol) hasNeg = true;
  }
  if (!hasNeg) return [poly.slice(), null];
  if (!hasPos) return [null, poly.slice()];

  const pos: Vec2[] = [];
  const neg: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = Math.abs(s[i]) <= tol ? 0 : s[i];
    const sb = Math.abs(s[(i + 1) % poly.length]) <= tol ? 0 : s[(i + 1) % poly.length];
    if (sa >= 0) pos.push(a);
    if (sa <= 0) neg.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      const x = lerp(a, b, t);
      pos.push(x);
      neg.push(x);
    }
  }
  return [dedupe(pos), dedupe(neg)];
}

export function dedupe(poly: Vec2[], tol = 1e-9): Vec2[] {
  const out: Vec2[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > tol) out.push(p);
  }
  if (out.length > 1 && dist(out[0], out[out.length - 1]) <= tol) out.pop();
  return out;
}

/** Length of the collinear overlap between segments ab and cd (0 if not collinear). */
export function collinearOverlap(a: Vec2, b: Vec2, c: Vec2, d: Vec2, tol = 1e-6): number {
  const ab = sub(b, a);
  const L = len(ab);
  if (L < tol) return 0;
  const u = scale(ab, 1 / L);
  if (Math.abs(cross(u, sub(c, a))) > tol || Math.abs(cross(u, sub(d, a))) > tol) return 0;
  const t0 = 0;
  const t1 = L;
  const tc = dot(sub(c, a), u);
  const td = dot(sub(d, a), u);
  const lo = Math.max(t0, Math.min(tc, td));
  const hi = Math.min(t1, Math.max(tc, td));
  return Math.max(0, hi - lo);
}

export function bounds(points: Iterable<Vec2>): { min: Vec2; max: Vec2 } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return { min: [x0, y0], max: [x1, y1] };
}
