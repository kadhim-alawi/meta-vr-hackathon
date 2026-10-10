/**
 * Builds Three.js meshes for a PaperState.
 *
 * Folded frame (x, y) maps to local (x·S, height, −y·S): +y on the table points
 * away from the player. Facets are stacked by local overlap so flaps stay thin,
 * and 3D shaping hinges are resolved with forward kinematics.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Texture,
  Vector3,
} from '@iwsdk/core';
import { Vec2 } from '../fold/geom.js';
import { FoldPlan, PaperState } from '../fold/paper.js';

/** Thickness used to separate stacked layers (metres). */
export const LAYER_GAP = 0.0007;
/** Height of the bottom paper layer above the desk surface (metres). */
export const PAPER_BASE = 0.0018;

export interface PaperMaterialOptions {
  front: Texture;
  back: Texture;
}

/**
 * Lambert material that samples a different texture for each face of the
 * paper, so the coloured and plain sides read correctly after every fold.
 */
export function createPaperMaterial(opts: PaperMaterialOptions): MeshLambertMaterial {
  const mat = new MeshLambertMaterial({ map: opts.front, side: DoubleSide });
  const backUniform = { value: opts.back };
  const glow = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.backMap = backUniform;
    shader.uniforms.paperGlow = glow;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D backMap;\nuniform float paperGlow;',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = gl_FrontFacing ? texture2D( map, vMapUv ) : texture2D( backMap, vMapUv );
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * paperGlow;',
      );
  };
  // Expose uniforms so callers can swap textures / pulse a glow.
  (mat.userData as PaperMaterialData).backMap = backUniform;
  (mat.userData as PaperMaterialData).glow = glow;
  mat.customProgramCacheKey = () => 'foldlings-paper';
  return mat;
}

export interface PaperMaterialData {
  backMap: { value: Texture };
  glow: { value: number };
}

export function setPaperGlow(mat: MeshLambertMaterial, v: number): void {
  (mat.userData as PaperMaterialData).glow.value = v;
}

/** 3D transform of every facet after applying shaping hinges (local units: metres). */
export function facetTransforms(state: PaperState, S: number, angleOverride?: Map<number, number>): Map<number, Matrix4> {
  const T = new Map<number, Matrix4>();
  for (const f of state.facets) T.set(f.id, new Matrix4());
  const axisP = new Vector3();
  const axisD = new Vector3();
  const tmp = new Matrix4();
  const q = new Quaternion();
  state.hinges.forEach((h, i) => {
    axisP.set(h.line.p[0] * S, 0, -h.line.p[1] * S);
    axisD.set(h.line.d[0], 0, -h.line.d[1]);
    if (h.parent !== null && T.has(h.parent)) {
      const P = T.get(h.parent)!;
      axisP.applyMatrix4(P);
      axisD.transformDirection(P);
    }
    const angle = angleOverride?.get(i) ?? h.angle;
    const signed = hingeSign(h.movingSide, h.dir) * angle;
    q.setFromAxisAngle(axisD, signed);
    // R = Tr(p) · Rot · Tr(−p)
    const R = new Matrix4().makeTranslation(axisP.x, axisP.y, axisP.z);
    R.multiply(tmp.makeRotationFromQuaternion(q));
    R.multiply(new Matrix4().makeTranslation(-axisP.x, -axisP.y, -axisP.z));
    for (const id of h.facets) {
      const m = T.get(id);
      if (m) m.premultiply(R);
    }
  });
  return T;
}

/** +1 rotates the moving side upward (towards the viewer) for a valley fold. */
export function hingeSign(movingSide: 1 | -1, dir: 'valley' | 'mountain'): number {
  return movingSide * (dir === 'valley' ? 1 : -1);
}

interface BuildOptions {
  S: number;
  /** only include these facet ids (undefined → all) */
  include?: (id: number) => boolean;
  /** per-facet lift in metres, overrides local stacking */
  lift?: Map<number, number>;
  /** apply hinge transforms */
  transforms?: Map<number, Matrix4>;
  /** offset subtracted from positions (to put a pivot at the origin) */
  origin?: Vector3;
}

/** Triangulated geometry for a set of facets. UVs are paper space in [0,1]. */
export function buildPaperGeometry(state: PaperState, opts: BuildOptions): BufferGeometry {
  const { S } = opts;
  const heights = opts.lift ?? stackLift(state);
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const v = new Vector3();
  const n = new Vector3();
  for (const f of state.facets) {
    if (opts.include && !opts.include(f.id)) continue;
    const fp = state.foldedPoly(f);
    const h = heights.get(f.id) ?? 0;
    const M = opts.transforms?.get(f.id);
    const flipped = state.isFlipped(f);
    // Facet normal in local space (+Y for an unflipped facet: front face up).
    n.set(0, flipped ? -1 : 1, 0);
    if (M) n.transformDirection(M);
    const pts: Vector3[] = fp.map((q) => {
      const p = new Vector3(q[0] * S, h, -q[1] * S);
      if (M) p.applyMatrix4(M);
      if (opts.origin) p.sub(opts.origin);
      return p;
    });
    const uvs = f.poly.map((q) => paperUV(state, q));
    // Fan triangulation; facets are convex. Paper polygons are CCW in paper
    // space, and every fold is an isometry, so the geometric front face is
    // always the paper's front face (seen from above it is CCW when the front
    // is up and CW once the facet has been turned over).
    for (let i = 1; i < pts.length - 1; i++) {
      for (const k of [0, i, i + 1]) {
        v.copy(pts[k]);
        pos.push(v.x, v.y, v.z);
        uv.push(uvs[k][0], uvs[k][1]);
        nrm.push(n.x, n.y, n.z);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.computeBoundingSphere();
  return g;
}

export function paperUV(state: PaperState, q: Vec2): [number, number] {
  return [q[0] / state.width + 0.5, q[1] / state.height + 0.5];
}

export function stackLift(state: PaperState): Map<number, number> {
  const h = state.stackHeights();
  const out = new Map<number, number>();
  // base lift keeps the bottom layer clear of the folding mat (at 0.6 mm)
  for (const [id, z] of h) out.set(id, z * LAYER_GAP + PAPER_BASE);
  return out;
}

/**
 * A rendered sheet: a static mesh plus, while a fold is in progress, a moving
 * flap parented to a pivot on the crease that rotates about it.
 */
export class PaperView {
  readonly group = new Group();
  /** rotate this to animate the current fold */
  readonly pivot = new Group();
  staticMesh: Mesh;
  movingMesh: Mesh | null = null;
  /** world-ish (group-local) axis of the current pivot */
  readonly axisDir = new Vector3(1, 0, 0);
  pivotSign = 1;
  private plan: FoldPlan | null = null;
  /** lift of the flap when it lands, metres */
  landLift = 0;
  private tmpQ = new Quaternion();

  constructor(
    public state: PaperState,
    public readonly material: MeshLambertMaterial,
    public readonly S: number,
  ) {
    this.staticMesh = new Mesh(new BufferGeometry(), material);
    this.staticMesh.castShadow = true;
    this.staticMesh.receiveShadow = true;
    this.group.add(this.staticMesh);
    this.group.add(this.pivot);
    this.rebuild();
  }

  /** Rebuild meshes for the committed state (no fold in progress). */
  rebuild(state: PaperState = this.state): void {
    this.state = state;
    this.plan = null;
    this.clearMoving();
    const T = state.hinges.length ? facetTransforms(state, this.S) : undefined;
    this.staticMesh.geometry.dispose();
    this.staticMesh.geometry = buildPaperGeometry(state, { S: this.S, transforms: T });
  }

  /** Split meshes for an upcoming fold. */
  beginFold(plan: FoldPlan): void {
    this.plan = plan;
    const s = plan.state;
    this.clearMoving();
    const T = s.hinges.length ? facetTransforms(s, this.S) : undefined;
    const lift = stackLift(s);
    this.staticMesh.geometry.dispose();
    this.staticMesh.geometry = buildPaperGeometry(s, {
      S: this.S,
      transforms: T,
      lift,
      include: (id) => !plan.moving.has(id),
    });

    // Pivot sits on the crease. If the crease belongs to a hinged part
    // (shaping after shaping), carry the axis with its parent facet.
    const axisP = new Vector3(plan.line.p[0] * this.S, 0, -plan.line.p[1] * this.S);
    this.axisDir.set(plan.line.d[0], 0, -plan.line.d[1]);
    const parentT = T && plan.hingeParents.length ? T.get(plan.hingeParents[0]) : undefined;
    if (parentT) {
      axisP.applyMatrix4(parentT);
      this.axisDir.transformDirection(parentT);
    }
    // Moving facets keep their relative stacking but start from the
    // crease height; the whole flap is raised to land on the stack top.
    let minMoving = Infinity;
    let maxStationaryUnderneath = 0;
    for (const f of s.facets) {
      const z = lift.get(f.id) ?? 0;
      if (plan.moving.has(f.id)) minMoving = Math.min(minMoving, z);
      else maxStationaryUnderneath = Math.max(maxStationaryUnderneath, z);
    }
    if (!isFinite(minMoving)) minMoving = 0;
    axisP.y += minMoving;
    this.landLift = Math.max(0, maxStationaryUnderneath - minMoving) + 0.0009;

    this.pivot.position.copy(axisP);
    this.pivot.quaternion.identity();
    const geo = buildPaperGeometry(s, {
      S: this.S,
      transforms: T,
      lift,
      include: (id) => plan.moving.has(id),
      origin: axisP,
    });
    this.movingMesh = new Mesh(geo, this.material);
    this.movingMesh.castShadow = true;
    this.movingMesh.receiveShadow = true;
    this.pivot.add(this.movingMesh);
    this.pivotSign = hingeSign(plan.movingSide, plan.dir);
  }

  /** Pose the flap at a fold angle in [0, π]. */
  setFoldAngle(angle: number, landing: number): void {
    if (!this.movingMesh) return;
    this.pivot.quaternion.setFromAxisAngle(this.axisDir, this.pivotSign * angle);
    // Ease the flap up onto the stack as it lands so it never sinks into it.
    this.movingMesh.position.set(0, 0, 0);
    const up = this.landLift * landing;
    this.pivot.updateMatrix();
    // translate in group space: move the pivot's child in pivot-local coords
    this.tmpQ.copy(this.pivot.quaternion).invert();
    this.movingMesh.position.set(0, up, 0).applyQuaternion(this.tmpQ);
  }

  get folding(): boolean {
    return this.plan !== null;
  }

  private clearMoving(): void {
    if (this.movingMesh) {
      this.pivot.remove(this.movingMesh);
      this.movingMesh.geometry.dispose();
      this.movingMesh = null;
    }
    this.pivot.quaternion.identity();
  }

  dispose(): void {
    this.clearMoving();
    this.staticMesh.geometry.dispose();
  }
}
