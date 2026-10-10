/**
 * Renders every model's fold sequence to an SVG/PNG contact sheet so designs
 * can be checked without a headset:  npx vite-node scripts/render-models.ts [id]
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { apply, reflectPoint } from '../src/fold/geom.js';
import {
  FoldStep,
  ModelDef,
  initialState,
  applyStep,
  grabPoint,
  planStep,
  resolveMarks,
} from '../src/fold/model.js';
import { PaperState } from '../src/fold/paper.js';
import { MODELS } from '../src/fold/models/index.js';

const CELL = 220;
const OUT = path.resolve('docs/model-sheets');

function drawState(
  def: ModelDef,
  s: PaperState,
  next: FoldStep | null,
  title: string,
  showEyes: boolean,
): string {
  const scale = CELL * 0.62;
  const tx = (x: number) => CELL / 2 + x * scale;
  const ty = (y: number) => CELL / 2 + 12 - y * scale;
  let out = `<rect width="${CELL}" height="${CELL}" fill="#fffdf8" stroke="#ddd"/>`;
  out += `<text x="6" y="14" font-family="sans-serif" font-size="11" fill="#333">${title}</text>`;
  const facets = s.facets.slice().sort((a, b) => a.layer - b.layer);
  const hinged = new Set<number>();
  for (const h of s.hinges) for (const id of h.facets) hinged.add(id);
  for (const f of facets) {
    const pts = s
      .foldedPoly(f)
      .map((q) => `${tx(q[0]).toFixed(1)},${ty(q[1]).toFixed(1)}`)
      .join(' ');
    const fill = s.isFlipped(f) ? def.paper.back : def.paper.front;
    const op = hinged.has(f.id) ? 0.75 : 1;
    out += `<polygon points="${pts}" fill="${fill}" fill-opacity="${op}" stroke="#444" stroke-width="0.6"/>`;
  }
  for (const h of s.hinges) {
    const a = [h.line.p[0] - h.line.d[0], h.line.p[1] - h.line.d[1]];
    const b = [h.line.p[0] + h.line.d[0], h.line.p[1] + h.line.d[1]];
    out += `<line x1="${tx(a[0])}" y1="${ty(a[1])}" x2="${tx(b[0])}" y2="${ty(b[1])}" stroke="#a0a" stroke-width="1" stroke-dasharray="2 2"/>`;
  }
  if (next) {
    try {
      const l = next.line(s);
      const a = [l.p[0] - l.d[0] * 2, l.p[1] - l.d[1] * 2];
      const b = [l.p[0] + l.d[0] * 2, l.p[1] + l.d[1] * 2];
      out += `<line x1="${tx(a[0])}" y1="${ty(a[1])}" x2="${tx(b[0])}" y2="${ty(b[1])}" stroke="#e33" stroke-width="1.2" stroke-dasharray="5 3"/>`;
      const g = grabPoint(s, next);
      const target = reflectPoint(l, g);
      out += `<circle cx="${tx(g[0])}" cy="${ty(g[1])}" r="4" fill="#1b2"/>`;
      out += `<circle cx="${tx(target[0])}" cy="${ty(target[1])}" r="4" fill="none" stroke="#25f" stroke-width="1.5"/>`;
      const plan = planStep(s, next);
      out += `<text x="6" y="${CELL - 6}" font-family="sans-serif" font-size="9" fill="#555">moves ${plan.moving.size}/${plan.state.facets.length}</text>`;
    } catch (e) {
      out += `<text x="6" y="${CELL - 6}" font-family="sans-serif" font-size="9" fill="#c00">ERR ${(e as Error).message}</text>`;
    }
  }
  if (showEyes) {
    const marks = [
      ...resolveMarks(s, def.eyes).map((m) => ({ ...m, fill: '#222' })),
      ...resolveMarks(s, def.cheeks).map((m) => ({ ...m, fill: '#f59' })),
    ];
    for (const mk of marks) {
      const f = s.facet(mk.facet);
      const c = apply(f.m, mk.at);
      // only draw if this facet is the top-most at that folded spot
      const visible = s.facetsAtFolded(c)[0]?.id === f.id;
      out += `<circle cx="${tx(c[0])}" cy="${ty(c[1])}" r="${mk.r * scale}" fill="${visible ? mk.fill : '#f0f'}"/>`;
    }
  }
  return out;
}

async function renderModel(def: ModelDef) {
  const cells: string[] = [];
  let s = initialState(def);
  const steps = def.steps;
  cells.push(drawState(def, s, steps[0]?.kind === 'fold' ? steps[0] : null, '0 start', false));
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      s = applyStep(s, step);
    } catch (e) {
      cells.push(
        `<rect width="${CELL}" height="${CELL}" fill="#fee"/><text x="6" y="20" font-size="11">step ${i + 1} failed: ${(e as Error).message}</text>`,
      );
      break;
    }
    const nxt = steps[i + 1];
    const label = `${i + 1} ${step.kind === 'flip' ? 'flip' : step.hint.slice(0, 30)}`;
    cells.push(drawState(def, s, nxt && nxt.kind === 'fold' ? nxt : null, label, i === steps.length - 1));
  }
  const cols = Math.min(cells.length, 5);
  const rows = Math.ceil(cells.length / cols);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * CELL}" height="${rows * CELL}">` +
    cells
      .map((c, i) => `<g transform="translate(${(i % cols) * CELL},${Math.floor(i / cols) * CELL})">${c}</g>`)
      .join('') +
    `</svg>`;
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${def.id}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log(`${def.id}: ${steps.length} steps, ${s.facets.length} facets → ${file}`);
}

const only = process.argv[2];
for (const def of MODELS) {
  if (only && def.id !== only) continue;
  await renderModel(def);
}
