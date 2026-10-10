import { describe, expect, it } from 'vitest';
import {
  apply,
  bisector,
  centroid,
  lineThrough,
  polyArea,
  reflection,
  side,
  splitPolygon,
} from '../src/fold/geom.js';
import { applyStep, grabPoint, planStep, resolveMarks, runModel } from '../src/fold/model.js';
import { MODELS } from '../src/fold/models/index.js';
import { PaperState, commitFold, convexOverlap, planFold } from '../src/fold/paper.js';

describe('geometry', () => {
  it('reflects across a line', () => {
    const r = reflection(lineThrough([0, 0], [1, 1]));
    const q = apply(r, [1, 0]);
    expect(q[0]).toBeCloseTo(0);
    expect(q[1]).toBeCloseTo(1);
  });

  it('bisector puts the first point on the positive side', () => {
    const l = bisector([2, 0], [0, 0]);
    expect(side(l, [2, 0])).toBeGreaterThan(0);
    expect(side(l, [0, 0])).toBeLessThan(0);
  });

  it('splits a square into two halves of equal area', () => {
    const sq: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const [a, b] = splitPolygon(sq, lineThrough([0, -2], [0, 2]));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs(polyArea(a!))).toBeCloseTo(2);
    expect(Math.abs(polyArea(b!))).toBeCloseTo(2);
  });

  it('touching polygons do not overlap', () => {
    const a: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const b: [number, number][] = [
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
    ];
    expect(convexOverlap(a, b)).toBe(false);
    expect(convexOverlap(a, a)).toBe(true);
  });
});

describe('paper folding', () => {
  it('folds a square in half', () => {
    const s = new PaperState(1, 1);
    const plan = planFold(s, {
      line: lineThrough([0, -1], [0, 1]),
      grabFolded: [-0.5, 0],
      select: 'all',
      dir: 'valley',
    });
    expect(plan.state.facets).toHaveLength(2);
    expect(plan.moving.size).toBe(1);
    const out = commitFold(plan);
    const moved = out.facets.find((f) => plan.moving.has(f.id))!;
    const still = out.facets.find((f) => !plan.moving.has(f.id))!;
    expect(out.isFlipped(moved)).toBe(true);
    expect(moved.layer).toBeGreaterThan(still.layer);
    const b = out.foldedBounds();
    expect(b.min[0]).toBeCloseTo(0);
    expect(b.max[0]).toBeCloseTo(0.5);
    expect(out.creases.length).toBeGreaterThan(0);
  });

  it("'flap' moves only the connected top layer, 'all' moves the stack", () => {
    // fold in half (left over right), then fold the right edge region
    let s = new PaperState(1, 1);
    s = commitFold(
      planFold(s, {
        line: lineThrough([0, -1], [0, 1]),
        grabFolded: [-0.5, 0],
        select: 'all',
        dir: 'valley',
      }),
    );
    const line = lineThrough([0.3, -1], [0.3, 1]);
    // paper point (-0.5, 0) is the left edge, now the top layer at x=+0.5
    const flap = planFold(s, { line, grabFolded: [0.45, 0], grabPaper: [-0.45, 0], select: 'flap', dir: 'valley' });
    const all = planFold(s, { line, grabFolded: [0.45, 0], select: 'all', dir: 'valley' });
    expect(flap.moving.size).toBe(1);
    expect(all.moving.size).toBe(2);
  });

  it('keeps total paper area constant', () => {
    for (const def of MODELS) {
      const states = runModel(def);
      const final = states[states.length - 1];
      const area = final.facets.reduce((acc, f) => acc + Math.abs(polyArea(f.poly)), 0);
      expect(area, def.id).toBeCloseTo(def.paper.w * def.paper.h, 6);
    }
  });
});

describe('models', () => {
  for (const def of MODELS) {
    it(`${def.id}: every step folds something and stays connected`, () => {
      let s = runModel(def)[0];
      for (const step of def.steps) {
        if (step.kind === 'fold') {
          const plan = planStep(s, step);
          expect(plan.moving.size, `${def.id}: ${step.hint}`).toBeGreaterThan(0);
          expect(plan.moving.size).toBeLessThan(plan.state.facets.length);
          // the grab handle is on the paper
          const g = grabPoint(s, step);
          expect(s.facetsAtFolded(g, 1e-4).length, `${def.id}: grab on paper`).toBeGreaterThan(0);
        }
        s = applyStep(s, step);
      }
      // the finished model has a sensible size
      const b = s.foldedBounds();
      expect(b.max[0] - b.min[0]).toBeGreaterThan(0.05);
      expect(b.max[1] - b.min[1]).toBeGreaterThan(0.05);
    });

    it(`${def.id}: eyes sit on the visible top layer`, () => {
      const states = runModel(def);
      const final = states[states.length - 1];
      const marks = resolveMarks(final, def.eyes);
      expect(marks.length).toBe(def.eyes?.length ?? 0);
      for (const m of marks) {
        const f = final.facet(m.facet);
        const c = apply(f.m, m.at);
        const top = final.facetsAtFolded(c)[0];
        // hinge (3D) models can show eyes on a lower layer that opens up
        if (final.hinges.length === 0) expect(top.id, `${def.id} eye visible`).toBe(f.id);
      }
    });
  }

  it('plane keeps two separate wing hinges', () => {
    const plane = MODELS.find((m) => m.id === 'plane')!;
    const final = runModel(plane).at(-1)!;
    expect(final.hinges).toHaveLength(2);
    const [a, b] = final.hinges;
    for (const id of a.facets) expect(b.facets.has(id)).toBe(false);
    expect(centroid(final.foldedPoly(final.facet([...a.facets][0])))[0]).toBeGreaterThan(0);
  });
});
