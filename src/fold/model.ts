/**
 * Declarative origami models. Steps reference paper-space points (stable
 * names on the unfolded sheet) so they stay valid however the sheet has been
 * turned or flipped.
 */
import { Line, Vec2, apply, bisector, invert, lineThrough, mid } from './geom.js';
import {
  FoldDirection,
  FoldPlan,
  FoldSelect,
  PaperState,
  commitCreaseOnly,
  commitFold,
  commitHinge,
  initialTransform,
  planFold,
} from './paper.js';

export type LineFn = (s: PaperState) => Line;

export interface FoldStep {
  kind: 'fold';
  /** short instruction shown to the player */
  hint: string;
  /**
   * Point the player pinches: a paper-space point, or a function giving a
   * folded-frame position (for 'all'/'region' folds where identity is moot).
   */
  grab: Vec2 | ((s: PaperState) => Vec2);
  line: LineFn;
  select?: FoldSelect;
  dir?: FoldDirection;
  /** fold and open again, leaving only a crease */
  unfold?: boolean;
  /** stop at this angle and keep a 3D hinge (shaping); π means flat */
  angle?: number;
  /** performed automatically with an animation (e.g. the mirror wing) */
  auto?: boolean;
}

export interface FlipStep {
  kind: 'flip';
  hint?: string;
  axis?: 'x' | 'y';
}

export type Step = FoldStep | FlipStep;

export type AliveKind =
  | 'glider'
  | 'boat'
  | 'cup'
  | 'fan'
  | 'heart'
  | 'hopper'
  | 'swimmer'
  | 'flower'
  | 'waddler'
  | 'face';

export interface EyeSpec {
  /** paper-space position of the eye centre */
  at?: Vec2;
  /** or: position in the finished model's flat folded frame */
  fold?: Vec2;
  /** radius in paper units */
  r: number;
}

export interface ResolvedMark {
  /** paper-space centre */
  at: Vec2;
  r: number;
  /** which face of the paper shows the mark */
  face: 'front' | 'back';
  facet: number;
}

/** Turn eye/cheek specs into paper-space marks on the visible face of the finished model. */
export function resolveMarks(final: PaperState, marks: EyeSpec[] | undefined): ResolvedMark[] {
  const out: ResolvedMark[] = [];
  for (const m of marks ?? []) {
    let facet;
    let at: Vec2;
    if (m.fold) {
      facet = final.facetsAtFolded(m.fold)[0];
      if (!facet) continue;
      at = apply(invert(facet.m), m.fold);
    } else if (m.at) {
      facet = final.facetsAtPaper(m.at)[0];
      if (!facet) continue;
      at = m.at;
    } else continue;
    out.push({ at, r: m.r, face: final.isFlipped(facet) ? 'back' : 'front', facet: facet.id });
  }
  return out;
}

export interface ModelDef {
  id: string;
  name: string;
  /** one-line personality shown when it comes alive */
  blurb: string;
  paper: {
    w: number;
    h: number;
    /** colour of the front (patterned) face */
    front: string;
    /** colour of the back face */
    back: string;
    pattern?: 'plain' | 'dots' | 'waves' | 'stripes' | 'stars' | 'hearts' | 'leaves';
  };
  /** which face is up before the first fold */
  start: 'front' | 'back';
  /** initial turn of the sheet on the table, radians (π/4 = diamond) */
  startAngle?: number;
  steps: Step[];
  eyes?: EyeSpec[];
  /** cheek blush marks, paper space */
  cheeks?: EyeSpec[];
  alive: AliveKind;
  /**
   * Euler XYZ rotation (radians) that stands the finished model up in its
   * living pose, applied after the folded frame is laid in the XZ plane.
   */
  pose?: [number, number, number];
  /** uniform scale of the living creature relative to the folding sheet */
  aliveScale?: number;
}

// ---- line builders -------------------------------------------------------

/** Fold so that paper point `grab` lands on paper point `target`. */
export const onto =
  (grab: Vec2, target: Vec2): LineFn =>
  (s) =>
    bisector(s.foldedPoint(grab), s.foldedPoint(target));

/** Fold so that paper point `grab` lands on a folded-frame point. */
export const ontoXY =
  (grab: Vec2, target: (s: PaperState) => Vec2): LineFn =>
  (s) =>
    bisector(s.foldedPoint(grab), target(s));

/** Fold along the line through two paper points. */
export const along =
  (a: Vec2, b: Vec2): LineFn =>
  (s) =>
    lineThrough(s.foldedPoint(a), s.foldedPoint(b));

/** Fold along a line through two folded-frame points computed from the state. */
export const alongXY =
  (f: (s: PaperState) => [Vec2, Vec2]): LineFn =>
  (s) => {
    const [a, b] = f(s);
    return lineThrough(a, b);
  };

export const fp = (s: PaperState, q: Vec2): Vec2 => s.foldedPoint(q);
export const midXY = (s: PaperState, a: Vec2, b: Vec2): Vec2 => mid(s.foldedPoint(a), s.foldedPoint(b));

// ---- running -------------------------------------------------------------

export function initialState(def: ModelDef): PaperState {
  return new PaperState(def.paper.w, def.paper.h, def.start, def.startAngle ?? 0);
}

/**
 * Returns a converter from positions in the *initial view* (how the sheet lies
 * before the first fold) to paper-space coordinates, so steps can be authored
 * the way an origami diagram is read.
 */
export function viewToPaper(
  start: 'front' | 'back',
  startAngle = 0,
): (x: number, y: number) => Vec2 {
  const inv = invert(initialTransform(start, startAngle));
  return (x, y) => apply(inv, [x, y]);
}

/** Folded-frame position of the step's grab handle. */
export function grabPoint(s: PaperState, step: FoldStep): Vec2 {
  return typeof step.grab === 'function' ? step.grab(s) : s.foldedPoint(step.grab);
}

export function planStep(s: PaperState, step: FoldStep): FoldPlan {
  return planFold(s, {
    line: step.line(s),
    grabFolded: grabPoint(s, step),
    grabPaper: typeof step.grab === 'function' ? undefined : step.grab,
    select: step.select ?? 'all',
    dir: step.dir ?? 'valley',
  });
}

export function commitStep(plan: FoldPlan, step: FoldStep): PaperState {
  if (step.unfold) return commitCreaseOnly(plan);
  if (step.angle !== undefined && Math.abs(step.angle - Math.PI) > 1e-6) {
    return commitHinge(plan, step.angle);
  }
  return commitFold(plan);
}

export function applyStep(s: PaperState, step: Step): PaperState {
  if (step.kind === 'flip') {
    const n = s.clone();
    n.flip(step.axis ?? 'y');
    return n;
  }
  return commitStep(planStep(s, step), step);
}

/** Run every step; returns the state before the first step and after each one. */
export function runModel(def: ModelDef): PaperState[] {
  const states = [initialState(def)];
  for (const step of def.steps) states.push(applyStep(states[states.length - 1], step));
  return states;
}

/** Number of steps the player performs by hand (flips happen automatically). */
export function handSteps(def: ModelDef): number {
  return def.steps.filter((s) => s.kind === 'fold').length;
}
