/**
 * Flat-foldable paper simulation.
 *
 * The sheet is a set of convex facets. Each facet keeps its polygon in *paper
 * space* (coordinates on the unfolded sheet) plus an isometry that maps it into
 * the *folded frame* (the plane the paper lies in on the table). Folding a
 * crease splits facets along the line, picks the connected flap that moves,
 * reflects it across the crease and stacks it on top (valley) or below
 * (mountain). Partial "shaping" folds are kept as 3D hinges.
 */
import {
  Affine,
  EPS,
  IDENTITY,
  Line,
  Vec2,
  apply,
  bounds,
  centroid,
  collinearOverlap,
  compose,
  containsPoint,
  det,
  dist,
  invert,
  reflection,
  rotation,
  side,
  splitPolygon,
  sub,
  transformLine,
  translation,
} from './geom.js';

export type FoldDirection = 'valley' | 'mountain';

/** How the moving part of a fold is chosen. */
export type FoldSelect =
  /** every facet on the grab side of the crease */
  | 'all'
  /** the flap physically connected to the grabbed paper point (top-most layer at that point) */
  | 'flap'
  /** every layer stacked under the grabbed point plus what is connected to them */
  | 'stack'
  /** facets on the moving side whose paper-space centroid is inside a region */
  | { region: (paperPoint: Vec2) => boolean };

export interface Facet {
  id: number;
  /** polygon in paper space, counter-clockwise */
  poly: Vec2[];
  /** paper space → folded frame */
  m: Affine;
  /** stacking order in the folded frame, higher is on top */
  layer: number;
}

export interface Hinge {
  /** crease in the flat folded frame */
  line: Line;
  /** facets carried by this hinge */
  facets: Set<number>;
  /** +1 if the moving facets are on the positive side of `line` */
  movingSide: 1 | -1;
  dir: FoldDirection;
  /** current opening angle, radians (π would be a flat fold) */
  angle: number;
  /** a stationary facet adjacent to the crease; its 3D transform carries the axis */
  parent: number | null;
}

export interface CreaseMark {
  a: Vec2;
  b: Vec2;
  /** fold that produced it; used for animation of the sharpen effect */
  step: number;
}

export interface FoldPlan {
  /** state with facets already split along the crease, transforms untouched */
  state: PaperState;
  line: Line;
  movingSide: 1 | -1;
  dir: FoldDirection;
  moving: Set<number>;
  /** paper-space crease segments created by this fold */
  creases: [Vec2, Vec2][];
  /** stationary facets touching the crease (hinge parents) */
  hingeParents: number[];
}

export class FoldError extends Error {}

export class PaperState {
  facets: Facet[];
  creases: CreaseMark[];
  hinges: Hinge[];
  readonly width: number;
  readonly height: number;
  private nextId: number;
  /** number of committed folds, used to tag crease marks */
  foldCount: number;

  constructor(width: number, height: number, faceUp: 'front' | 'back' = 'front', startAngle = 0) {
    this.width = width;
    this.height = height;
    const hw = width / 2;
    const hh = height / 2;
    const m = initialTransform(faceUp, startAngle);
    this.facets = [
      {
        id: 0,
        poly: [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ],
        m,
        layer: 0,
      },
    ];
    this.creases = [];
    this.hinges = [];
    this.nextId = 1;
    this.foldCount = 0;
  }

  clone(): PaperState {
    const c = Object.create(PaperState.prototype) as PaperState;
    (c as { width: number }).width = this.width;
    (c as { height: number }).height = this.height;
    c.facets = this.facets.map((f) => ({ ...f, poly: f.poly.slice(), m: { ...f.m } }));
    c.creases = this.creases.slice();
    c.hinges = this.hinges.map((h) => ({ ...h, facets: new Set(h.facets) }));
    c.nextId = this.nextId;
    c.foldCount = this.foldCount;
    return c;
  }

  newId(): number {
    return this.nextId++;
  }

  facet(id: number): Facet {
    const f = this.facets.find((x) => x.id === id);
    if (!f) throw new FoldError(`no facet ${id}`);
    return f;
  }

  foldedPoly(f: Facet): Vec2[] {
    return f.poly.map((q) => apply(f.m, q));
  }

  /** True when the facet shows its back side upward in the folded frame. */
  isFlipped(f: Facet): boolean {
    return det(f.m) < 0;
  }

  /**
   * Facets containing a paper-space point, top-most first. A point on a fold
   * edge belongs to several facets; continuity makes them agree on position.
   */
  facetsAtPaper(q: Vec2, tol = 1e-6): Facet[] {
    return this.facets
      .filter((f) => containsPoint(f.poly, q, tol))
      .sort((a, b) => b.layer - a.layer);
  }

  /** Where a paper-space point currently lies in the folded frame. */
  foldedPoint(q: Vec2): Vec2 {
    const fs = this.facetsAtPaper(q, 1e-5);
    if (fs.length === 0) throw new FoldError(`paper point ${q} is outside the sheet`);
    return apply(fs[0].m, q);
  }

  /** Facets whose folded polygon contains a folded-frame point, top-most first. */
  facetsAtFolded(q: Vec2, tol = 1e-6): Facet[] {
    return this.facets
      .filter((f) => containsPoint(this.foldedPoly(f), q, tol))
      .sort((a, b) => b.layer - a.layer);
  }

  foldedBounds(): { min: Vec2; max: Vec2 } {
    const pts: Vec2[] = [];
    for (const f of this.facets) for (const q of this.foldedPoly(f)) pts.push(q);
    return bounds(pts);
  }

  /** Paper-space adjacency (shared edge with positive length) = physical connection. */
  adjacency(): Map<number, number[]> {
    const adj = new Map<number, number[]>();
    for (const f of this.facets) adj.set(f.id, []);
    for (let i = 0; i < this.facets.length; i++) {
      const fi = this.facets[i];
      for (let j = i + 1; j < this.facets.length; j++) {
        const fj = this.facets[j];
        if (sharesEdge(fi.poly, fj.poly)) {
          adj.get(fi.id)!.push(fj.id);
          adj.get(fj.id)!.push(fi.id);
        }
      }
    }
    return adj;
  }

  /** Apply an isometry of the whole folded frame (turning or flipping the sheet). */
  transformAll(t: Affine, reverseLayers: boolean): void {
    for (const f of this.facets) f.m = compose(t, f.m);
    for (const h of this.hinges) h.line = transformLine(t, h.line);
    if (reverseLayers) {
      const maxL = Math.max(...this.facets.map((f) => f.layer));
      for (const f of this.facets) f.layer = maxL - f.layer;
    }
  }

  /** Move the folded paper so its bounding box is centred on the origin. */
  recenter(): Vec2 {
    const b = this.foldedBounds();
    const c: Vec2 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    this.transformAll(translation([-c[0], -c[1]]), false);
    return c;
  }

  /** Turn the sheet over around a line through the folded centre (axis 'y' = left↔right). */
  flip(axis: 'x' | 'y' = 'y'): void {
    const b = this.foldedBounds();
    const c: Vec2 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    const l: Line = axis === 'y' ? { p: c, d: [0, 1] } : { p: c, d: [1, 0] };
    this.transformAll(reflection(l), true);
  }

  /** Rotate the sheet on the table about the folded centre. */
  rotate(angle: number): void {
    const b = this.foldedBounds();
    const c: Vec2 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    this.transformAll(rotation(angle, c), false);
  }

  /**
   * Local stacking height of every facet (in layer units): a facet sits one
   * unit above the highest lower-layer facet it overlaps. Keeps single flaps
   * thin instead of stacking by global layer index.
   */
  stackHeights(): Map<number, number> {
    const order = this.facets.slice().sort((a, b) => a.layer - b.layer);
    const polys = new Map(order.map((f) => [f.id, this.foldedPoly(f)]));
    const h = new Map<number, number>();
    for (let i = 0; i < order.length; i++) {
      const f = order[i];
      let z = 0;
      const pf = polys.get(f.id)!;
      for (let j = 0; j < i; j++) {
        const g = order[j];
        if (g.layer === f.layer) continue;
        if (convexOverlap(pf, polys.get(g.id)!)) z = Math.max(z, h.get(g.id)! + 1);
      }
      h.set(f.id, z);
    }
    return h;
  }

  normalizeLayers(): void {
    const distinct = [...new Set(this.facets.map((f) => f.layer))].sort((a, b) => a - b);
    const rank = new Map(distinct.map((l, i) => [l, i]));
    for (const f of this.facets) f.layer = rank.get(f.layer)!;
  }
}

/**
 * Paper → folded frame before any fold. Turning the sheet over (back up) is a
 * mirror about the vertical axis; `startAngle` turns it on the table (e.g. π/4
 * for a diamond).
 */
export function initialTransform(faceUp: 'front' | 'back', startAngle: number): Affine {
  const mirror: Affine = faceUp === 'front' ? IDENTITY : { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  return compose(rotation(startAngle), mirror);
}

/** Do two paper-space polygons share an edge segment of positive length? */
export function sharesEdge(a: readonly Vec2[], b: readonly Vec2[], tol = 1e-6): boolean {
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b0 = b[j];
      const b1 = b[(j + 1) % b.length];
      if (collinearOverlap(a0, a1, b0, b1, tol) > 1e-5) return true;
    }
  }
  return false;
}

/** Separating-axis test for convex polygons; touching edges do not count. */
export function convexOverlap(a: readonly Vec2[], b: readonly Vec2[], tol = 1e-5): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const n: Vec2 = [-(q[1] - p[1]), q[0] - p[0]];
      const nl = Math.hypot(n[0], n[1]);
      if (nl < EPS) continue;
      let amin = Infinity;
      let amax = -Infinity;
      for (const v of a) {
        const s = (v[0] * n[0] + v[1] * n[1]) / nl;
        amin = Math.min(amin, s);
        amax = Math.max(amax, s);
      }
      let bmin = Infinity;
      let bmax = -Infinity;
      for (const v of b) {
        const s = (v[0] * n[0] + v[1] * n[1]) / nl;
        bmin = Math.min(bmin, s);
        bmax = Math.max(bmax, s);
      }
      if (amax <= bmin + tol || bmax <= amin + tol) return false;
    }
  }
  return true;
}

export interface FoldSpec {
  /** crease in the folded frame */
  line: Line;
  /** folded-frame point the player pinches; decides the moving side */
  grabFolded: Vec2;
  /** paper-space identity of the grabbed point (needed for 'flap') */
  grabPaper?: Vec2;
  select: FoldSelect;
  dir: FoldDirection;
}

/**
 * Split facets along the crease and work out which ones move. Does not change
 * any transform, so the result can be rendered while the player drags.
 */
export function planFold(state: PaperState, spec: FoldSpec): FoldPlan {
  const s = state.clone();
  const { line } = spec;
  const { grabFolded } = spec;
  const gs = side(line, grabFolded);
  if (Math.abs(gs) < 1e-6) throw new FoldError('grab point lies on the crease');
  const movingSide: 1 | -1 = gs > 0 ? 1 : -1;

  // 1. Split every facet that straddles the crease.
  const next: Facet[] = [];
  for (const f of s.facets) {
    const inv = invert(f.m);
    const paperLine = transformLine(inv, line);
    const [pos, neg] = splitPolygon(f.poly, paperLine, 1e-7);
    if (pos && neg) {
      const a = { id: s.newId(), poly: pos, m: f.m, layer: f.layer };
      const b = { id: s.newId(), poly: neg, m: f.m, layer: f.layer };
      next.push(a, b);
      // Earlier shaping hinges keep carrying both halves.
      for (const h of s.hinges) {
        if (h.facets.delete(f.id)) h.facets.add(a.id).add(b.id);
        if (h.parent === f.id) h.parent = a.id;
      }
    } else {
      next.push(f);
    }
  }
  s.facets = next;

  // 2. Classify sides in the folded frame.
  const sideOf = new Map<number, number>();
  for (const f of s.facets) {
    const c = centroid(s.foldedPoly(f));
    sideOf.set(f.id, side(line, c) * movingSide > 0 ? 1 : -1);
  }
  const onMoving = (id: number) => sideOf.get(id) === 1;

  // 3. Choose the moving facets.
  let moving: Set<number>;
  if (spec.select === 'all') {
    moving = new Set(s.facets.filter((f) => onMoving(f.id)).map((f) => f.id));
  } else if (typeof spec.select === 'object') {
    const inRegion = spec.select.region;
    moving = new Set(
      s.facets.filter((f) => onMoving(f.id) && inRegion(centroid(f.poly))).map((f) => f.id),
    );
  } else {
    const seeds: number[] = [];
    if (spec.select === 'flap') {
      if (!spec.grabPaper) throw new FoldError('flap folds need a paper grab point');
      const at = s.facetsAtPaper(spec.grabPaper, 1e-5).filter((f) => onMoving(f.id));
      if (at.length === 0) throw new FoldError('grab point is not on the moving side');
      seeds.push(at[0].id);
    } else {
      const at = s.facetsAtFolded(grabFolded, 1e-5).filter((f) => onMoving(f.id));
      if (at.length === 0) throw new FoldError('nothing stacked under the grab point');
      for (const f of at) seeds.push(f.id);
    }
    moving = floodFill(s, seeds, onMoving);
  }
  if (moving.size === 0) throw new FoldError('fold moves nothing');

  // 4. Crease segments: edges of moving facets lying on the line.
  const creases: [Vec2, Vec2][] = [];
  const parents = new Set<number>();
  const adj = s.adjacency();
  for (const f of s.facets) {
    if (!moving.has(f.id)) continue;
    const fp = s.foldedPoly(f);
    for (let i = 0; i < fp.length; i++) {
      const j = (i + 1) % fp.length;
      if (Math.abs(side(line, fp[i])) < 1e-6 && Math.abs(side(line, fp[j])) < 1e-6) {
        if (dist(fp[i], fp[j]) > 1e-6) creases.push([f.poly[i], f.poly[j]]);
      }
    }
    for (const n of adj.get(f.id) ?? []) if (!moving.has(n)) parents.add(n);
  }

  return {
    state: s,
    line,
    movingSide,
    dir: spec.dir,
    moving,
    creases,
    hingeParents: [...parents],
  };
}

function floodFill(s: PaperState, seeds: number[], allowed: (id: number) => boolean): Set<number> {
  const adj = s.adjacency();
  const out = new Set<number>();
  const stack = seeds.filter(allowed);
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const n of adj.get(id) ?? []) if (!out.has(n) && allowed(n)) stack.push(n);
  }
  return out;
}

/** Finish a flat fold: reflect the moving facets and stack them. */
export function commitFold(plan: FoldPlan): PaperState {
  const s = plan.state.clone();
  const R = reflection(plan.line);
  const movingFacets = s.facets.filter((f) => plan.moving.has(f.id));
  const stationary = s.facets.filter((f) => !plan.moving.has(f.id));
  const allLayers = s.facets.map((f) => f.layer);
  const maxAll = Math.max(...allLayers);
  const minAll = Math.min(...allLayers);
  const maxMoving = Math.max(...movingFacets.map((f) => f.layer));
  const minMoving = Math.min(...movingFacets.map((f) => f.layer));
  for (const f of movingFacets) {
    f.m = compose(R, f.m);
    if (plan.dir === 'valley') {
      // land on top, in reverse order
      f.layer = maxAll + 1 + (maxMoving - f.layer);
    } else {
      f.layer = minAll - 1 - (f.layer - minMoving);
    }
  }
  void stationary;
  s.foldCount += 1;
  for (const [a, b] of plan.creases) s.creases.push({ a, b, step: s.foldCount });
  s.normalizeLayers();
  return s;
}

/** Fold-and-unfold: keep the split and the crease marks, move nothing. */
export function commitCreaseOnly(plan: FoldPlan): PaperState {
  const s = plan.state.clone();
  s.foldCount += 1;
  for (const [a, b] of plan.creases) s.creases.push({ a, b, step: s.foldCount });
  return s;
}

/** Keep a partial fold as a 3D hinge (used for final shaping, e.g. plane wings). */
export function commitHinge(plan: FoldPlan, angle: number): PaperState {
  const s = plan.state.clone();
  s.foldCount += 1;
  for (const [a, b] of plan.creases) s.creases.push({ a, b, step: s.foldCount });
  s.hinges.push({
    line: plan.line,
    facets: new Set(plan.moving),
    movingSide: plan.movingSide,
    dir: plan.dir,
    angle,
    parent: plan.hingeParents[0] ?? null,
  });
  return s;
}

export { sub };
