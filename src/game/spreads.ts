/**
 * The four pop-up spreads of the story. Positions are page-local: the right
 * page spans x ∈ [0, PAGE_W], the left page x ∈ [−PAGE_W, 0]; +z points at
 * the player. Named markers expose interaction spots to the story script.
 */
import { Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3, BoxGeometry, CylinderGeometry } from '@iwsdk/core';
import { PAGE_D, PAGE_W, Spread } from './book.js';
import {
  Flower,
  Water,
  cloud,
  cutout,
  grassTufts,
  hill,
  houseShape,
  moon,
  paperMat,
  rainbow,
  rectShape,
  sign,
  star,
  sun,
  tree,
  well,
  windmill,
} from './popups.js';
import { seededRandom } from '../core/util.js';

export interface StreamSpread extends Spread {
  water: Water[];
  start: Vector3; // book space, where the boat goes in
  end: Vector3; // where Kit hops off
  kitStart: Vector3;
}

const PAGE_TINT_DAY = 0xfdf6e8;

/** Book-space y of the page surface. */
export const PAGE_Y = 0.0185;

export function streamSpread(): StreamSpread {
  const sp = new Spread() as StreamSpread;
  // the river runs left → right across both pages
  const rz = 0.012;
  const wl = new Water(PAGE_W - 0.01, 0.05);
  wl.position.set(-PAGE_W / 2, 0.0004, rz);
  const wr = new Water(PAGE_W - 0.01, 0.05);
  wr.position.set(PAGE_W / 2, 0.0004, rz);
  sp.left.add(wl);
  sp.right.add(wr);
  sp.water = [wl, wr];
  // banks
  sp.add('left', hill(0.2, 0.06, 0x8cc47a, 2), -0.11, -0.11, 0.0);
  sp.add('right', hill(0.22, 0.075, 0x7db86b, 5), 0.11, -0.115, 0.1);
  sp.add('left', tree(0.075, 0x4f9a55), -0.17, -0.07, 0.25);
  sp.add('left', tree(0.06, 0x5fae62, true), -0.07, -0.08, 0.35);
  sp.add('right', tree(0.07, 0x4f9a55), 0.06, -0.075, 0.45);
  sp.add('right', tree(0.085, 0x3f8a4a), 0.19, -0.07, 0.5);
  sp.add('right', sign("Mo's", 0.045), 0.17, 0.065, 0.7);
  const c1 = cloud(0.06);
  c1.position.y = 0.09;
  sp.add('left', c1 as unknown as Group, -0.12, -0.12, 0.6);
  const c2 = cloud(0.05);
  c2.position.y = 0.1;
  sp.add('right', c2 as unknown as Group, 0.13, -0.125, 0.65);
  // docks
  const dockL = new Mesh(new BoxGeometry(0.03, 0.002, 0.03), paperMat(0xa47148));
  dockL.position.set(-0.19, 0.001, rz);
  sp.left.add(dockL);
  const dockR = new Mesh(new BoxGeometry(0.03, 0.002, 0.03), paperMat(0xa47148));
  dockR.position.set(0.19, 0.001, rz);
  sp.right.add(dockR);
  sp.left.add(grassTufts(26, [PAGE_W - 0.02, PAGE_D - 0.08], 0x7fbf6a, 4));
  sp.right.add(grassTufts(26, [PAGE_W - 0.02, PAGE_D - 0.08], 0x7fbf6a, 8));
  // keep tufts out of the river
  for (const g of [sp.left.children.at(-1)!, sp.right.children.at(-1)!]) {
    for (const t of [...g.children]) if (Math.abs(t.position.z - rz) < 0.035) g.remove(t);
    g.position.x = g === sp.left.children.at(-1) ? -PAGE_W / 2 : PAGE_W / 2;
  }
  sp.start = new Vector3(-0.15, PAGE_Y, rz);
  sp.end = new Vector3(0.165, PAGE_Y, rz);
  sp.kitStart = new Vector3(-0.19, PAGE_Y + 0.002, rz + 0.03);
  sp.tick = (dt) => {
    for (const w of sp.water) w.flow(dt, 0.08, 0);
  };
  return sp;
}

export interface GardenSpread extends Spread {
  flowers: Flower[];
  well: Vector3;
  kitStart: Vector3;
  butterfly: Object3D;
}

export function gardenSpread(): GardenSpread {
  const sp = new Spread() as GardenSpread;
  sp.add('left', hill(0.21, 0.05, 0x9ccc7f, 3), -0.11, -0.115, 0.0);
  sp.add('right', hill(0.21, 0.055, 0x8cc47a, 6), 0.11, -0.115, 0.05);
  sp.add('left', well(), -0.12, -0.02, 0.2);
  sp.add('left', tree(0.08, 0x5fae62, true), -0.19, -0.08, 0.3);
  // fence
  const fence = new Group();
  for (let i = 0; i < 7; i++) {
    const post = cutout(rectShape(0.005, 0.025), 0xf3e3c3, 0.0012);
    post.position.x = i * 0.018;
    fence.add(post);
  }
  const rail = cutout(rectShape(0.115, 0.004), 0xf3e3c3, 0.0012);
  rail.position.set(0.054, 0.015, 0.001);
  fence.add(rail);
  sp.add('right', fence, 0.05, -0.09, 0.35);
  const colors = [0xe85d9a, 0xf2a03a, 0x8a6fd6];
  const spots: [number, number][] = [
    [0.07, 0.03],
    [0.12, -0.035],
    [0.17, 0.035],
  ];
  sp.flowers = spots.map(([x, z], i) => {
    const f = new Flower(colors[i]);
    sp.add('right', f, x, z, 0.45 + i * 0.1);
    return f;
  });
  sp.left.add(grassTufts(20, [PAGE_W - 0.03, PAGE_D - 0.06], 0x8ac476, 11));
  sp.left.children.at(-1)!.position.x = -PAGE_W / 2;
  sp.right.add(grassTufts(20, [PAGE_W - 0.03, PAGE_D - 0.06], 0x8ac476, 12));
  sp.right.children.at(-1)!.position.x = PAGE_W / 2;
  sp.well = new Vector3(-0.12, PAGE_Y, -0.02);
  sp.kitStart = new Vector3(-0.04, PAGE_Y, 0.06);
  // a butterfly that appears when everything blooms
  const bf = new Group();
  for (const sx of [-1, 1]) {
    const wing = new Mesh(new PlaneGeometry(0.012, 0.016), paperMat(0xf2c23c));
    wing.position.x = sx * 0.006;
    wing.name = sx < 0 ? 'wingL' : 'wingR';
    bf.add(wing);
  }
  bf.visible = false;
  sp.right.add(bf);
  sp.butterfly = bf;
  sp.tick = (dt, t) => {
    for (const f of sp.flowers) f.update(dt, t);
    if (bf.visible) {
      bf.position.set(0.12 + Math.sin(t * 0.9) * 0.05, 0.07 + Math.sin(t * 2.1) * 0.012, Math.cos(t * 0.7) * 0.04);
      const flap = Math.sin(t * 22) * 0.9;
      bf.children[0].rotation.y = flap;
      bf.children[1].rotation.y = -flap;
    }
  };
  return sp;
}

export interface HillSpread extends Spread {
  windmill: Group;
  rotor: Group;
  basket: Group;
  cliffTop: Vector3;
  basketBottom: Vector3;
  kitStart: Vector3;
}

export function hillSpread(): HillSpread {
  const sp = new Spread() as HillSpread;
  sp.add('left', hill(0.22, 0.07, 0x9ccc7f, 9), -0.11, -0.1, 0.0);
  const wm = windmill();
  wm.scale.setScalar(1.25);
  sp.add('left', wm, -0.12, -0.05, 0.2);
  sp.windmill = wm;
  sp.rotor = wm.userData.rotor as Group;
  // the cliff: a tall layered cut-out with a flat top platform
  const cliff = new Group();
  const cliffShape = rectShape(0.08, 0.1);
  const c1 = cutout(cliffShape, 0xa98c6a, 0.002);
  cliff.add(c1);
  const c2 = cutout(rectShape(0.07, 0.092), 0xc2a47e, 0.002);
  c2.position.z = 0.012;
  cliff.add(c2);
  const top = new Mesh(new BoxGeometry(0.085, 0.004, 0.05), paperMat(0x8cc47a));
  top.position.set(0, 0.1, 0.012);
  cliff.add(top);
  const t1 = tree(0.04, 0x4f9a55, true);
  t1.position.set(0.025, 0.102, 0.0);
  cliff.add(t1);
  sp.add('right', cliff, 0.15, -0.06, 0.3);
  // pulley rope and basket (not a pop-up: it moves)
  const pulley = new Mesh(new CylinderGeometry(0.005, 0.005, 0.004, 12), paperMat(0x5a4636));
  pulley.rotation.x = Math.PI / 2;
  pulley.position.set(0.09, PAGE_Y + 0.115, -0.03);
  sp.right.add(pulley);
  const rope = new Mesh(new CylinderGeometry(0.0008, 0.0008, 1, 4), paperMat(0x6b5440));
  rope.name = 'rope';
  sp.right.add(rope);
  const basket = new Group();
  const b = new Mesh(new CylinderGeometry(0.016, 0.013, 0.014, 10, 1, true), paperMat(0xc8955a));
  b.position.y = 0.007;
  basket.add(b);
  const floor = new Mesh(new CylinderGeometry(0.013, 0.013, 0.001, 10), paperMat(0xa47148));
  basket.add(floor);
  basket.position.set(0.09, 0.001, -0.03);
  sp.right.add(basket);
  sp.basket = basket;
  sp.basketBottom = new Vector3(0.09, 0.001, -0.03);
  sp.cliffTop = new Vector3(0.14, PAGE_Y + 0.104, -0.045);
  sp.kitStart = new Vector3(-0.05, PAGE_Y, 0.07);
  sp.left.add(grassTufts(18, [PAGE_W - 0.03, PAGE_D - 0.06], 0x8ac476, 21));
  sp.left.children.at(-1)!.position.x = -PAGE_W / 2;
  const c = cloud(0.06);
  c.position.y = 0.11;
  sp.add('right', c as unknown as Group, 0.05, -0.12, 0.6);
  sp.tick = () => {
    rope.position.set(0.09, (basket.position.y + 0.012 + PAGE_Y + 0.115 - PAGE_Y) / 2 + 0.006, -0.03);
    const len = Math.max(0.001, 0.115 - basket.position.y - 0.012);
    rope.scale.y = len;
    rope.position.y = basket.position.y + 0.012 + len / 2;
  };
  return sp;
}

export interface NightSpread extends Spread {
  door: Vector3;
  window: Vector3;
  kitStart: Vector3;
  rain: Group;
  dayProps: Group[];
  setDay(k: number): void;
}

export function nightSpread(): NightSpread {
  const sp = new Spread() as NightSpread;
  // dusky tint on the page via a flat sheet
  const tint = (side: 'left' | 'right', x: number) => {
    const m = new Mesh(new PlaneGeometry(PAGE_W, PAGE_D), new MeshBasicMaterial({ color: 0x2a3566, transparent: true, opacity: 0.55 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.0003, 0);
    m.name = 'night-tint';
    (side === 'left' ? sp.left : sp.right).add(m);
    return m;
  };
  const tints = [tint('left', -PAGE_W / 2), tint('right', PAGE_W / 2)];
  sp.add('left', hill(0.22, 0.05, 0x557a5a, 13), -0.11, -0.115, 0.0);
  sp.add('right', hill(0.22, 0.06, 0x4f7356, 14), 0.11, -0.12, 0.05);
  // Mo's house
  const house = new Group();
  const walls = cutout(houseShape(0.075, 0.085), 0xe9d2b0, 0.002);
  house.add(walls);
  const roof = cutout(houseShape(0.085, 0.03), 0xb4473a, 0.003);
  roof.position.y = 0.052;
  roof.scale.set(1, 1.1, 1);
  house.add(roof);
  const door = cutout(rectShape(0.018, 0.03), 0x7a5232, 0.0025);
  door.position.set(-0.016, 0, 0.002);
  house.add(door);
  const win = new Mesh(new PlaneGeometry(0.02, 0.018), new MeshBasicMaterial({ color: 0xffd98a }));
  win.position.set(0.017, 0.03, 0.0026);
  house.add(win);
  sp.add('right', house, 0.13, -0.04, 0.25);
  // just in front of the door on the house wall (house at z -0.04)
  sp.door = new Vector3(0.114, PAGE_Y, -0.034);
  sp.window = new Vector3(0.147, PAGE_Y + 0.03, -0.035);
  const m = moon();
  m.position.y = 0.1;
  sp.add('left', m as unknown as Group, -0.09, -0.12, 0.4);
  const rnd = seededRandom(31);
  for (let i = 0; i < 8; i++) {
    const s = star(0.004 + rnd() * 0.003);
    s.position.y = 0.07 + rnd() * 0.06;
    sp.add(i % 2 ? 'left' : 'right', s as unknown as Group, (i % 2 ? -1 : 1) * (0.03 + rnd() * 0.17), -0.13, 0.45 + i * 0.04);
  }
  // rain: a cloud with paper streaks that fall
  const rain = new Group();
  const rc = cloud(0.07);
  rc.position.y = 0.12;
  rain.add(rc);
  for (let i = 0; i < 18; i++) {
    const d = new Mesh(new PlaneGeometry(0.0012, 0.008), new MeshBasicMaterial({ color: 0x9fc7ee }));
    d.position.set((rnd() - 0.5) * 0.08, rnd() * 0.11, (rnd() - 0.5) * 0.04);
    d.userData.speed = 0.12 + rnd() * 0.05;
    rain.add(d);
  }
  rain.position.set(0.12, 0, 0.0);
  sp.right.add(rain);
  sp.rain = rain;
  // daytime props appear at the happy ending
  const sunG = sun(0.02);
  sunG.position.y = 0.11;
  const sunPop = sp.add('left', sunG, -0.05, -0.12, 99);
  const rb = rainbow(0.1);
  const rbPop = sp.add('right', rb, 0.02, -0.125, 99);
  sp.dayProps = [sunPop, rbPop];
  for (const p of sp.dayProps) p.visible = false;
  sp.kitStart = new Vector3(-0.15, PAGE_Y, 0.05);
  let day = 0;
  sp.setDay = (k: number) => {
    day = k;
  };
  sp.tick = (dt) => {
    for (const t of tints) (t.material as MeshBasicMaterial).opacity = 0.55 * (1 - day);
    rain.visible = day < 0.5;
    for (const d of rain.children) {
      if (!d.userData.speed) continue;
      d.position.y -= d.userData.speed * dt;
      if (d.position.y < 0.002) d.position.y = 0.11;
    }
  };
  return sp;
}

/** Closed-book placeholder spread (used before the first opening). */
export function blankSpread(): Spread {
  const sp = new Spread();
  void PAGE_TINT_DAY;
  return sp;
}

export function sceneMarker(name: string): Object3D {
  const o = new Object3D();
  o.name = name;
  return o;
}
