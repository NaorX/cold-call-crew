// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures';
import * as P from './props';
import { buildJukebox, type JukeboxView } from '../ao/jukebox';
import { buildCabinet } from '../ao/cabinet';

let ramp: THREE.DataTexture | null = null;
function gradient() {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}
export function toonMat(o: { color?: THREE.ColorRepresentation; map?: THREE.Texture; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; transparent?: boolean; opacity?: number }) {
  return new THREE.MeshToonMaterial({ gradientMap: gradient(), color: o.color ?? '#ffffff', ...(o.map ? { map: o.map } : {}), emissive: o.emissive ?? '#000000', emissiveIntensity: o.emissiveIntensity ?? 1, transparent: o.transparent ?? false, opacity: o.opacity ?? 1 });
}

class Batcher {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private shadow = new Map<THREE.Material, boolean>();
  add(geo: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, castShadow = true) {
    const g = geo.clone().applyMatrix4(matrix);
    let list = this.groups.get(material);
    if (!list) this.groups.set(material, (list = []));
    list.push(g);
    if (castShadow) this.shadow.set(material, true);
  }
  build(parent: THREE.Object3D) {
    for (const [material, list] of this.groups) {
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      for (const g of parts) for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      const merged = mergeGeometries(parts, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !!this.shadow.get(material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'static';
      parent.add(mesh);
    }
  }
}

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
function mtx(pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0], parent?: THREE.Matrix4) {
  E.set(rot[0], rot[1], rot[2]);
  Q.setFromEuler(E);
  M4.compose(new THREE.Vector3(...pos), Q, new THREE.Vector3(...scale));
  return parent ? parent.clone().multiply(M4) : M4.clone();
}

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
}

export interface DeskSlot {
  index: number;
  pos: THREE.Vector3;
  rot: number;
  chair: THREE.Vector3;
  screen: THREE.Mesh;
  screenCenter: THREE.Vector3;
  screenNormal: THREE.Vector3;
  webcam: THREE.Vector3;
  phone: THREE.Object3D;
  mug: THREE.Object3D;
  npc: boolean;
}

export interface AutoDoor {
  pivot: THREE.Object3D;
  at: THREE.Vector3;
  openTo: number;
  open: number;
}

export interface Lamp {
  x: number;
  y: number;
  z: number;
  reach: number;
  color: string;
  power: number;
  glow?: { x: number; y: number; z: number; size: number };
}

export interface NightParts {
  lamps: Lamp[];
  bulbs: { mat: THREE.MeshToonMaterial; day: number; night: number }[];
  wetGlass: THREE.MeshBasicMaterial;
}

export interface Hoop {
  rim: THREE.Vector3;
  rimR: number;
  boardX: number;
  boardZ: [number, number];
  boardY: [number, number];
  home: THREE.Vector3;
  room: { x0: number; x1: number; z0: number; z1: number; y1: number };
}

export interface Office {
  root: THREE.Group;
  desks: DeskSlot[];
  colliders: Collider[];
  walls: THREE.Object3D[];
  savers: T.ScreenSaver[];
  panelMat: THREE.MeshToonMaterial;
  ceilingLights: THREE.PointLight[];
  raidLights: THREE.PointLight[];
  emergency: THREE.PointLight;
  breaker: THREE.Mesh;
  breakerLamp: THREE.MeshToonMaterial;
  laptop: THREE.Object3D;
  coffeeMachine: THREE.Object3D;
  wallClock: { hour: THREE.Object3D; minute: THREE.Object3D };
  bossPath: THREE.Vector3[];
  spawn: THREE.Vector3;
  smokeSpot: THREE.Vector3;
  creatorSpot: THREE.Vector3;
  footprint: { x0: number; x1: number; z0: number; z1: number };
  boards: { day: T.Board; targets: T.Board; tv: T.Board; bossScreen: T.Board };
  doors: AutoDoor[];
  night: NightParts;
  jukebox: JukeboxView;
  jukeboxSpot: THREE.Vector3;
  arcade: { screen: THREE.Mesh; spot: THREE.Vector3; eye: THREE.Vector3; look: THREE.Vector3 };
  hoop: Hoop;
  meeting: {
    seats: { pos: THREE.Vector3; rot: number }[];
    boss: THREE.Vector3;
    bossRot: number;
    wide: [THREE.Vector3, THREE.Vector3];
    slide: [THREE.Vector3, THREE.Vector3];
    boss1: [THREE.Vector3, THREE.Vector3];
  };
  update(dt: number, people: Iterable<THREE.Vector3>): void;
}

export const FLOOR = { x0: -11, x1: 11, z0: -15, z1: 4 };
export const BREAK = { x0: -11, x1: 1.5, z0: 4, z1: 16 };
export const BOSS = { x0: 1.5, x1: 11, z0: 4, z1: 16 };
export const PATIO = { x0: -11, x1: -2.5, z0: 16, z1: 21.5 };
export const H = 4.2;
const DESK_W = 1.5;
const DESK_D = 0.75;
const DESK_H = 0.74;
const XS = [-8.05, -5.75, -3.45, -1.15, 1.15, 3.45, 5.75, 8.05];
const PODS = [0.6, -4.4, -9.4];
const DOOR = { x0: -3.6, x1: -2.0 };
const BOSS_DOOR = { x0: 2.6, x1: 3.8 };
const PATIO_DOOR = { x0: -9.6, x1: -8.2 };
const ENTRANCE = { x0: -0.8, x1: 1.0 };
const WIN_LO = 0.9;
const WIN_HI = 3.3;
const T_WALL = 0.22;

function planks(floor: string, alt: string, seam: string, w: number, d: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = floor;
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 128;
    for (let col = -1; col < 3; col++) {
      g.fillStyle = (row + col) % 3 === 0 ? alt : floor;
      g.fillRect(col * 256 + offset + 2, row * 64 + 2, 252, 60);
    }
    g.fillStyle = seam;
    g.fillRect(0, row * 64, 512, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 6, d / 6);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function tiles(a: string, b: string, seam: string, w: number, d: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * 128, y * 128, 128, 128);
    }
  g.fillStyle = seam;
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 128, 256, 3);
  g.fillRect(0, 0, 3, 256);
  g.fillRect(128, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 1.6, d / 1.6);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function noInk<T extends THREE.Material>(m: T): T {
  m.userData.outlineParameters = { visible: false };
  return m;
}

export function buildOffice(quality: 'low' | 'medium' | 'high'): Office {
  void quality;
  const root = new THREE.Group();
  const B = new Batcher();
  const colliders: Collider[] = [];
  const walls: THREE.Object3D[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
  const cylLo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const sph = new THREE.SphereGeometry(1, 14, 10);
  const plane = new THREE.PlaneGeometry(1, 1);
  const solid = (x0: number, x1: number, z0: number, z1: number, top = 3) =>
    colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), top });
  const prop = (o: THREE.Object3D, x: number, z: number, rotY = 0, y = 0, foot?: [number, number], top = 2) => {
    const baked = P.bake(o);
    P.place(baked, x, z, rotY, y);
    baked.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.receiveShadow = true;
    });
    root.add(baked);
    if (foot) {
      const quarter = Math.abs(Math.sin(rotY)) > 0.5;
      const hw = (quarter ? foot[1] : foot[0]) / 2;
      const hd = (quarter ? foot[0] : foot[1]) / 2;
      solid(x - hw, x + hw, z - hd, z + hd, top);
    }
    return baked;
  };

  const night: NightParts = {
    lamps: [],
    bulbs: [],
    wetGlass: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, visible: false }),
  };
  night.wetGlass.userData.outlineParameters = { visible: false };
  const glowing = (mat: THREE.MeshToonMaterial, day: number, nightLevel: number) => {
    night.bulbs.push({ mat, day, night: nightLevel });
    return mat;
  };

  const M = {
    floor: noInk(toonMat({ map: planks('#e8c99f', '#dfbb8c', '#cfa97c', FLOOR.x1 - FLOOR.x0, FLOOR.z1 - FLOOR.z0) })),
    vinyl: noInk(toonMat({ map: tiles('#fffaf0', '#f3ead9', '#e6dcc8', BREAK.x1 - BREAK.x0, BREAK.z1 - BREAK.z0) })),
    bossFloor: noInk(toonMat({ map: planks('#aa7650', '#9b6845', '#7c5236', BOSS.x1 - BOSS.x0, BOSS.z1 - BOSS.z0) })),
    deck: noInk(toonMat({ map: planks('#d9a066', '#cf9259', '#b97b45', PATIO.x1 - PATIO.x0, PATIO.z1 - PATIO.z0) })),
    ceiling: noInk(toonMat({ map: T.ceilingTexture(), color: '#ffffff' })),
    wall: noInk(toonMat({ color: '#fff6ea' })),
    wallWarm: noInk(toonMat({ color: '#ffefe6' })),
    bossWall: noInk(toonMat({ color: '#e9eef3' })),
    exterior: noInk(toonMat({ color: '#e07a5f' })),
    facadeTrim: toonMat({ color: '#fffaf3' }),
    accent: noInk(toonMat({ color: '#e8a87c' })),
    baseboard: noInk(toonMat({ color: '#e8a87c' })),
    roof: noInk(toonMat({ color: '#d3d6dd' })),
    desk: toonMat({ color: '#f7f3ea' }),
    deskEdge: toonMat({ color: '#3d405b' }),
    trim: toonMat({ color: '#e6e0d4' }),
    plastic: toonMat({ color: '#eceae4' }),
    plasticDark: toonMat({ color: '#2c2d33' }),
    keycaps: toonMat({ color: '#3a3b42' }),
    metal: toonMat({ color: '#a7abb3' }),
    paper: toonMat({ map: T.paperTexture() }),
    white: toonMat({ color: '#ffffff' }),
    bottle: new THREE.MeshStandardMaterial({ color: '#cfe3f0', roughness: 0.15, transparent: true, opacity: 0.8 }),
    trash: toonMat({ color: '#9aa0a6' }),
    plant: toonMat({ color: '#4fa24a' }),
    plant2: toonMat({ color: '#6cbf55' }),
    pot: toonMat({ color: '#d9734a' }),
    redTable: toonMat({ color: '#d1453b' }),
    wood: toonMat({ map: T.woodTexture() }),
    door: toonMat({ color: '#e5483b' }),
    mug: toonMat({ color: '#f26b4f' }),
    phone: toonMat({ color: '#3b3d45' }),
    breaker: toonMat({ color: '#9aa0a8' }),
    cork: toonMat({ map: T.corkTexture() }),
    glass: new THREE.MeshBasicMaterial({ color: '#d6f1ff', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
    frame: toonMat({ color: '#ffffff' }),
    darkFrame: toonMat({ color: '#3d405b' }),
    leather: toonMat({ color: '#5a3424' }),
    tvBlack: toonMat({ color: '#18191d' }),
    rail: toonMat({ color: '#2f3138' }),
    court: noInk(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false })),
  };
  M.glass.userData.outlineParameters = { visible: false };
  const ceilingTex = M.ceiling.map!;
  ceilingTex.repeat.set(22 / 1.2, 31 / 1.2);
  ceilingTex.anisotropy = 8;
  M.ceiling.emissive.set('#a39d92');
  M.ceiling.emissiveMap = ceilingTex;
  const stickies = Array.from({ length: 6 }, (_, i) => toonMat({ map: T.stickyTexture(i) }));
  const panelMat = noInk(toonMat({ color: '#ffffff', emissive: '#fff6e4', emissiveIntensity: 0.6 }));
  const chairCols = ['#ff8a5b', '#5bc0eb', '#9bc53d', '#b388eb', '#ffb400', '#f7aef8'].map((c) => toonMat({ color: c }));
  const panelCols = ['#bde0fe', '#ffd6a5', '#caffbf', '#ffc6ff'].map((c) => toonMat({ color: c }));

  const floorPlane = (mat: THREE.Material, r: { x0: number; x1: number; z0: number; z1: number }, y = 0) => {
    const f = new THREE.Mesh(plane, mat);
    f.rotation.x = -Math.PI / 2;
    f.scale.set(r.x1 - r.x0, r.z1 - r.z0, 1);
    f.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    f.receiveShadow = true;
    root.add(f);
  };
  floorPlane(M.floor, FLOOR);
  floorPlane(M.vinyl, BREAK);
  floorPlane(M.bossFloor, BOSS);
  B.add(box, M.deck, mtx([(PATIO.x0 + PATIO.x1) / 2, 0.03, (PATIO.z0 + PATIO.z1) / 2], [PATIO.x1 - PATIO.x0, 0.06, PATIO.z1 - PATIO.z0]), false);
  const ceil = new THREE.Mesh(plane, M.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.scale.set(FLOOR.x1 - FLOOR.x0, BREAK.z1 - FLOOR.z0, 1);
  ceil.position.set(0, H, (FLOOR.z0 + BREAK.z1) / 2);
  root.add(ceil);
  const fx = (FLOOR.x0 + FLOOR.x1) / 2;
  const fz = (FLOOR.z0 + BREAK.z1) / 2;
  const fw = FLOOR.x1 - FLOOR.x0 + 0.5;
  const fd = BREAK.z1 - FLOOR.z0 + 0.5;
  B.add(box, M.roof, mtx([fx, H + 0.26, fz], [fw, 0.4, fd]), false);
  B.add(box, M.facadeTrim, mtx([fx, H + 0.55, FLOOR.z0 - 0.2], [fw + 0.2, 0.5, 0.25]), false);
  B.add(box, M.facadeTrim, mtx([fx, H + 0.55, BREAK.z1 + 0.2], [fw + 0.2, 0.5, 0.25]), false);
  B.add(box, M.facadeTrim, mtx([FLOOR.x0 - 0.2, H + 0.55, fz], [0.25, 0.5, fd]), false);
  B.add(box, M.facadeTrim, mtx([FLOOR.x1 + 0.2, H + 0.55, fz], [0.25, 0.5, fd]), false);
  for (const [x, z, w, d] of [[-6, -6, 2.2, 1.6], [5, 2, 1.6, 1.6], [-2, 10, 2.6, 1.4]]) {
    B.add(box, toonMat({ color: '#b9bfc8' }), mtx([x, H + 0.46 + 0.45, z], [w, 0.9, d]));
    B.add(cylLo, M.rail, mtx([x, H + 1.37, z], [0.3, 0.06, 0.3]), false);
  }

  const wall = (x0: number, z0: number, x1: number, z1: number, opts: { windows?: [number, number][]; doors?: [number, number][]; mat?: THREE.Material; band?: THREE.Material; out?: 1 | -1; solidDoors?: boolean } = {}) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const rotY = -Math.atan2(dz, dx);
    const mat = opts.mat || M.wall;
    const at = (d: number, y: number) => new THREE.Vector3(x0 + dx * d, y, z0 + dz * d);
    const outward = new THREE.Vector3(-dz, 0, dx).multiplyScalar(opts.out ?? 0);
    const piece = (d0: number, d1: number, y0: number, y1: number) => {
      if (d1 - d0 < 0.01 || y1 - y0 < 0.01) return;
      const c = at((d0 + d1) / 2, (y0 + y1) / 2);
      const w = new THREE.Mesh(box, mat);
      w.scale.set(d1 - d0, y1 - y0, T_WALL);
      w.position.copy(c);
      w.rotation.y = rotY;
      w.castShadow = true;
      w.receiveShadow = true;
      w.name = 'wall';
      root.add(w);
      walls.push(w);
      if (opts.out) {
        const o = outward.clone().multiplyScalar(T_WALL / 2 + 0.02);
        const ends = d0 <= 0.001 || d1 >= len - 0.001 ? 0.08 : 0;
        B.add(box, M.exterior, mtx([c.x + o.x, c.y, c.z + o.z], [d1 - d0 + ends, y1 - y0, 0.04], [0, rotY, 0]), false);
      }
    };
    const holes = [...(opts.windows || []).map(([a, b]) => ({ a, b, kind: 'win' as const })), ...(opts.doors || []).map(([a, b]) => ({ a, b, kind: 'door' as const }))].sort((p, q) => p.a - q.a);
    let cur = 0;
    for (const hole of holes) {
      piece(cur, hole.a, 0, H);
      if (hole.kind === 'win') {
        piece(hole.a, hole.b, 0, WIN_LO);
        piece(hole.a, hole.b, WIN_HI, H);
        const ww = hole.b - hole.a;
        const wh = WIN_HI - WIN_LO;
        const c = at((hole.a + hole.b) / 2, (WIN_LO + WIN_HI) / 2);
        const g = new THREE.Mesh(plane, M.glass);
        g.scale.set(ww, wh, 1);
        g.position.copy(c);
        g.rotation.y = rotY;
        g.renderOrder = 3;
        root.add(g);
        if (opts.out) {
          const geo = new THREE.PlaneGeometry(ww, wh);
          const uv = geo.attributes.uv as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * ww) / 0.9, (uv.getY(i) * wh) / 0.9);
          const wet = new THREE.Mesh(geo, night.wetGlass);
          wet.position.copy(c).addScaledVector(outward, 0.03);
          wet.rotation.y = rotY;
          wet.renderOrder = 4;
          root.add(wet);
        }
        for (let d = hole.a; d <= hole.b + 0.001; d += Math.max(0.6, ww / Math.max(1, Math.round(ww / 2)))) {
          const p = at(Math.min(d, hole.b), (WIN_LO + WIN_HI) / 2);
          B.add(box, M.frame, mtx([p.x, p.y, p.z], [0.07, wh, 0.1], [0, rotY, 0]));
        }
        for (const y of [WIN_LO, WIN_HI]) {
          const p = at((hole.a + hole.b) / 2, y);
          B.add(box, M.frame, mtx([p.x, p.y, p.z], [ww, 0.07, 0.12], [0, rotY, 0]));
        }
        const sill = at((hole.a + hole.b) / 2, WIN_LO - 0.012);
        B.add(box, M.trim, mtx([sill.x, sill.y, sill.z], [ww, 0.04, 0.34], [0, rotY, 0]), false);
      } else {
        piece(hole.a, hole.b, 2.3, H);
        for (const d of [hole.a, hole.b]) {
          const p = at(d, 1.15);
          B.add(box, M.darkFrame, mtx([p.x, p.y, p.z], [0.08, 2.3, T_WALL + 0.06], [0, rotY, 0]));
        }
        const top = at((hole.a + hole.b) / 2, 2.3);
        B.add(box, M.darkFrame, mtx([top.x, top.y, top.z], [hole.b - hole.a + 0.08, 0.08, T_WALL + 0.06], [0, rotY, 0]));
      }
      cur = hole.b;
    }
    piece(cur, len, 0, H);
    for (const side of opts.out ? [-opts.out] : [1, -1]) {
      const off = new THREE.Vector3(-dz, 0, dx).multiplyScalar((T_WALL / 2 + 0.012) * side);
      let c0 = 0;
      for (const hole of [...holes, { a: len, b: len, kind: 'end' as const }]) {
        if (hole.a - c0 > 0.05) {
          const mid = at((c0 + hole.a) / 2, 0.06).add(off);
          B.add(box, M.baseboard, mtx([mid.x, mid.y, mid.z], [hole.a - c0, 0.14, 0.02], [0, rotY, 0]), false);
          if (opts.band) {
            const b = at((c0 + hole.a) / 2, 1.0).add(off);
            B.add(box, opts.band, mtx([b.x, b.y, b.z], [hole.a - c0, 0.1, 0.02], [0, rotY, 0]), false);
          }
        }
        c0 = hole.b;
      }
    }
    let s = 0;
    const gaps = opts.solidDoors ? [] : (opts.doors || []).slice().sort((p, q) => p[0] - q[0]);
    for (const d of [...gaps, [len, len] as [number, number]]) {
      if (d[0] - s > 0.01) {
        const pa = at(s, 0);
        const pb = at(d[0], 0);
        solid(Math.min(pa.x, pb.x) - T_WALL / 2, Math.max(pa.x, pb.x) + T_WALL / 2, Math.min(pa.z, pb.z) - T_WALL / 2, Math.max(pa.z, pb.z) + T_WALL / 2);
      }
      s = d[1];
    }
  };
  const winsAlong = (from: number, to: number, w: number, gap: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let d = from; d + w <= to + 0.01; d += w + gap) out.push([d, d + w]);
    return out;
  };
  const along = (x: number) => x - FLOOR.x0;
  const zSouth = (z: number) => BREAK.z1 - z;
  wall(FLOOR.x0, FLOOR.z0, FLOOR.x1, FLOOR.z0, {
    windows: [[0.8, 4.7], [5.4, 9.3], [13.1, 17.0], [17.7, 21.2]],
    doors: [[along(ENTRANCE.x0), along(ENTRANCE.x1)]],
    solidDoors: true,
    band: M.accent,
    out: -1,
  });
  wall(FLOOR.x1, FLOOR.z0, FLOOR.x1, BREAK.z1, { windows: [...winsAlong(1.0, 18.2, 3.6, 0.8), [21.5, 27.5]], band: M.accent, out: -1 });
  wall(FLOOR.x0, BREAK.z1, FLOOR.x0, FLOOR.z0, { windows: [[zSouth(1), zSouth(-2.5)], [zSouth(-4), zSouth(-7.5)], [zSouth(-9), zSouth(-12.5)]], band: M.accent, out: -1 });
  wall(FLOOR.x0, BREAK.z1, FLOOR.x1, BREAK.z1, { doors: [[along(PATIO_DOOR.x0), along(PATIO_DOOR.x1)]], windows: [[along(3.5), along(9.5)]], band: M.accent, out: 1 });
  wall(FLOOR.x0, 4, BREAK.x1, 4, { doors: [[along(DOOR.x0), along(DOOR.x1)]], mat: M.wallWarm, band: M.accent });
  wall(BREAK.x1, 4, BREAK.x1, BREAK.z1, { mat: M.wallWarm });
  const glassFront = (x0: number, x1: number) => {
    const g = new THREE.Mesh(plane, M.glass);
    g.scale.set(x1 - x0, H - 0.2, 1);
    g.position.set((x0 + x1) / 2, (H - 0.2) / 2 + 0.05, 4);
    g.renderOrder = 3;
    root.add(g);
    for (let x = x0; x <= x1 + 0.01; x += 1.5) B.add(box, M.darkFrame, mtx([Math.min(x, x1), H / 2, 4], [0.06, H, 0.1]));
    B.add(box, M.darkFrame, mtx([(x0 + x1) / 2, 0.06, 4], [x1 - x0, 0.12, 0.1]));
    B.add(box, M.darkFrame, mtx([(x0 + x1) / 2, H - 0.1, 4], [x1 - x0, 0.08, 0.1]));
    solid(x0, x1, 3.9, 4.1);
  };
  glassFront(BOSS.x0, BOSS_DOOR.x0);
  glassFront(BOSS_DOOR.x1, BOSS.x1);
  B.add(box, M.darkFrame, mtx([(BOSS_DOOR.x0 + BOSS_DOOR.x1) / 2, 2.3, 4], [BOSS_DOOR.x1 - BOSS_DOOR.x0, 0.08, 0.1]));
  const glassAbove = new THREE.Mesh(plane, M.glass);
  glassAbove.scale.set(BOSS_DOOR.x1 - BOSS_DOOR.x0, H - 2.35, 1);
  glassAbove.position.set((BOSS_DOOR.x0 + BOSS_DOOR.x1) / 2, (H + 2.35) / 2, 4);
  root.add(glassAbove);

  const doors: AutoDoor[] = [];
  const glassLeaf = (w: number, h: number) => {
    const g = new THREE.Group();
    const parts: [number, number, number, number][] = [
      [w / 2, h - 0.04, w, 0.08],
      [w / 2, 0.06, w, 0.12],
      [0.04, h / 2, 0.08, h],
      [w - 0.04, h / 2, 0.08, h],
    ];
    for (const [x, y, sw, sh] of parts) {
      const m = new THREE.Mesh(box, M.darkFrame);
      m.position.set(x, y, 0);
      m.scale.set(sw, sh, 0.05);
      m.castShadow = true;
      g.add(m);
    }
    const pane = new THREE.Mesh(plane, M.glass);
    pane.position.set(w / 2, h / 2, 0);
    pane.scale.set(w - 0.14, h - 0.18, 1);
    pane.renderOrder = 3;
    g.add(pane);
    const bar = new THREE.Mesh(box, toonMat({ color: '#e4e8ee' }));
    bar.position.set(w - 0.2, 1.05, 0.05);
    bar.scale.set(0.03, 0.4, 0.03);
    g.add(bar);
    return g;
  };
  const solidLeaf = (w: number, h: number, color: string) => {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(box, toonMat({ color }));
    slab.position.set(w / 2, h / 2, 0);
    slab.scale.set(w, h, 0.05);
    slab.castShadow = true;
    g.add(slab);
    const win = new THREE.Mesh(plane, M.glass);
    win.position.set(w / 2, 1.55, 0.03);
    win.scale.set(0.3, 0.7, 1);
    g.add(win);
    for (const s of [-1, 1]) {
      const lever = new THREE.Mesh(box, toonMat({ color: '#e4e8ee' }));
      lever.position.set(w - 0.12, 1.02, s * 0.05);
      lever.scale.set(0.14, 0.025, 0.025);
      g.add(lever);
    }
    return g;
  };
  const swing = (leaf: THREE.Object3D, hingeX: number, z: number, w: number, openTo: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, z);
    pivot.add(leaf);
    root.add(pivot);
    doors.push({ pivot, at: new THREE.Vector3(hingeX + w / 2, 0, z), openTo, open: 0 });
  };
  swing(solidLeaf(DOOR.x1 - DOOR.x0 - 0.04, 2.24, '#e5483b'), DOOR.x0 + 0.02, 4, DOOR.x1 - DOOR.x0, -Math.PI / 2);
  swing(glassLeaf(BOSS_DOOR.x1 - BOSS_DOOR.x0 - 0.04, 2.24), BOSS_DOOR.x0 + 0.02, 4, BOSS_DOOR.x1 - BOSS_DOOR.x0, -Math.PI / 2);
  swing(glassLeaf(PATIO_DOOR.x1 - PATIO_DOOR.x0 - 0.04, 2.24), PATIO_DOOR.x0 + 0.02, BREAK.z1, PATIO_DOOR.x1 - PATIO_DOOR.x0, -Math.PI / 2);
  const ew = (ENTRANCE.x1 - ENTRANCE.x0) / 2 - 0.02;
  const leftLeaf = glassLeaf(ew, 2.24);
  leftLeaf.position.set(ENTRANCE.x0 + 0.02, 0, FLOOR.z0);
  root.add(leftLeaf);
  const rightLeaf = glassLeaf(ew, 2.24);
  rightLeaf.position.set(ENTRANCE.x1 - 0.02, 0, FLOOR.z0);
  rightLeaf.rotation.y = Math.PI;
  root.add(rightLeaf);

  const ceilingLights: THREE.PointLight[] = [];
  const panels: [number, number][] = [];
  for (const lx of [-8, -4, 0, 4, 8]) for (const lz of [2, -2, -6.5, -11]) panels.push([lx, lz]);
  panels.push([-8.5, 6.5], [-4.5, 6.5], [-1.5, 6.5], [-8.5, 10.5], [-4.5, 10.5], [-1.5, 10.5], [-8.5, 14], [-4.5, 14], [-1.5, 14], [4, 7], [8.5, 7], [4, 12], [8.5, 12]);
  for (const [lx, lz] of panels) {
    const p = new THREE.Mesh(box, panelMat);
    p.scale.set(1.4, 0.04, 0.7);
    p.position.set(lx, H - 0.03, lz);
    root.add(p);
    B.add(box, M.trim, mtx([lx, H - 0.019, lz], [1.56, 0.03, 0.86]), false);
  }
  for (const [vx, vz] of [[-6, 0], [2, 0], [-2, -9], [6, -9], [-6, 12], [6, 10]]) {
    B.add(box, toonMat({ color: '#d9dde2' }), mtx([vx, H - 0.012, vz], [0.6, 0.02, 0.6]), false);
    for (let i = -2; i <= 2; i++) B.add(box, toonMat({ color: '#b7bdc5' }), mtx([vx + i * 0.1, H - 0.025, vz], [0.02, 0.01, 0.5]), false);
  }
  for (let x = -9; x <= 9; x += 4.5) for (const z of [0, -8.5, 10]) B.add(cylLo, M.metal, mtx([x, H - 0.03, z], [0.03, 0.06, 0.03]), false);

  const desks: DeskSlot[] = [];
  const savers = [0, 1, 2, 3].map((k) => new T.ScreenSaver(k));
  const screenGeo = new THREE.PlaneGeometry(0.5, 0.31);
  let seed = 0;
  const desk = (x: number, z: number, rot: number, alt: boolean, npc: boolean) => {
    const O = mtx([x, 0, z], [1, 1, 1], [0, rot, 0]);
    const at = (p: [number, number, number], s: [number, number, number] = [1, 1, 1], r: [number, number, number] = [0, 0, 0]) => mtx(p, s, r, O);
    const v = (p: [number, number, number]) => new THREE.Vector3(...p).applyMatrix4(O);
    seed++;
    B.add(box, M.desk, at([0, DESK_H - 0.02, 0], [DESK_W, 0.04, DESK_D]));
    B.add(box, M.deskEdge, at([0, DESK_H - 0.05, 0.37], [DESK_W, 0.03, 0.02]));
    B.add(box, M.deskEdge, at([0.72, DESK_H / 2, 0], [0.04, DESK_H - 0.04, DESK_D - 0.05]));
    B.add(box, M.deskEdge, at([-0.72, DESK_H / 2, 0], [0.04, DESK_H - 0.04, DESK_D - 0.05]));
    B.add(box, M.deskEdge, at([0.45, 0.4, 0], [0.5, 0.64, DESK_D - 0.08]));
    const fab = panelCols[(seed + (alt ? 1 : 0)) % panelCols.length];
    if (rot === 0) {
      B.add(box, fab, at([0, 0.55, -0.42], [DESK_W + 0.3, 1.1, 0.06]));
      B.add(box, M.white, at([0, 1.11, -0.42], [DESK_W + 0.32, 0.03, 0.09]));
    }
    B.add(box, fab, at([0.78, 0.5, -0.08], [0.05, 1.0, 0.72]));
    B.add(box, M.white, at([0.78, 1.01, -0.08], [0.07, 0.03, 0.74]));
    B.add(box, M.plastic, at([0, DESK_H + 0.01, -0.22], [0.22, 0.02, 0.16]));
    B.add(box, M.plastic, at([0, DESK_H + 0.12, -0.24], [0.05, 0.22, 0.04]));
    B.add(box, M.plasticDark, at([0, DESK_H + 0.4, -0.21], [0.58, 0.39, 0.06]));
    const screen = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ map: savers[seed % 4].texture, toneMapped: false }));
    screen.applyMatrix4(at([0, DESK_H + 0.405, -0.172]));
    root.add(screen);
    B.add(box, M.plasticDark, at([0, DESK_H + 0.615, -0.2], [0.08, 0.04, 0.04]));
    B.add(box, M.plastic, at([0, DESK_H + 0.012, 0.08], [0.44, 0.022, 0.15], [0.04, 0, 0]));
    B.add(box, M.keycaps, at([0, DESK_H + 0.025, 0.08], [0.41, 0.012, 0.12], [0.04, 0, 0]));
    B.add(sph, M.plastic, at([0.32, DESK_H + 0.012, 0.1], [0.03, 0.018, 0.05]));
    const phone = new THREE.Group();
    const base = new THREE.Mesh(box, M.phone);
    base.scale.set(0.18, 0.06, 0.16);
    base.position.y = 0.03;
    phone.add(base);
    const handset = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.14, 4, 8), M.phone);
    handset.rotation.z = Math.PI / 2;
    handset.position.set(0, 0.075, -0.03);
    phone.add(handset);
    phone.applyMatrix4(at([-0.5, DESK_H, -0.05], [1, 1, 1], [0, 0.4, 0]));
    root.add(phone);
    const mug = new THREE.Mesh(cyl, M.mug);
    mug.scale.set(0.04, 0.1, 0.04);
    mug.applyMatrix4(at([0.5, DESK_H + 0.05, 0.12]));
    root.add(mug);
    if (seed % 2) B.add(cyl, M.bottle, at([0.6, DESK_H + 0.12, -0.25], [0.035, 0.24, 0.035]));
    B.add(plane, M.paper, at([-0.3 + Math.sin(seed) * 0.1, DESK_H + 0.006, 0.15], [0.21, 0.28, 1], [-Math.PI / 2, 0, seed * 0.7]), false);
    for (let i = 0; i < 2 + (seed % 3); i++)
      B.add(plane, stickies[(seed + i) % stickies.length], at([-0.6 + i * 0.17, 0.92 + (i % 2) * 0.15, -0.38], [0.12, 0.12, 1], [0, 0, (i - 1) * 0.12]), false);
    if (seed % 3 === 0) {
      B.add(cyl, M.pot, at([-0.62, DESK_H + 0.06, -0.28], [0.06, 0.12, 0.06]));
      for (let k = 0; k < 5; k++) B.add(sph, k % 2 ? M.plant : M.plant2, at([-0.62 + Math.cos(k * 1.3) * 0.05, DESK_H + 0.17 + (k % 2) * 0.05, -0.28 + Math.sin(k * 1.3) * 0.05], [0.06, 0.08, 0.06]));
    } else if (seed % 3 === 1) {
      B.add(box, M.darkFrame, at([-0.62, DESK_H + 0.08, -0.26], [0.12, 0.15, 0.015], [-0.2, 0.3, 0]));
      B.add(cylLo, M.deskEdge, at([0.66, DESK_H + 0.01, -0.28], [0.06, 0.02, 0.06]));
      B.add(cylLo, M.deskEdge, at([0.66, DESK_H + 0.2, -0.28], [0.01, 0.38, 0.01]));
      B.add(new THREE.ConeGeometry(1, 1, 12, 1, true), M.deskEdge, at([0.6, DESK_H + 0.38, -0.2], [0.07, 0.1, 0.07], [0.9, 0, 0]));
    }
    B.add(cylLo, M.trash, at([-0.55, 0.16, -0.2], [0.13, 0.32, 0.13]));
    const chairM = chairCols[seed % chairCols.length];
    const C = (p: [number, number, number], s: [number, number, number], r: [number, number, number] = [0, 0, 0]) => at([p[0], p[1], p[2] + 0.62], s, r);
    B.add(box, chairM, C([0, 0.45, 0], [0.48, 0.08, 0.46]));
    B.add(box, chairM, C([0, 0.82, 0.24], [0.46, 0.55, 0.07], [-0.12, 0, 0]));
    B.add(cylLo, M.metal, C([0, 0.25, 0], [0.03, 0.38, 0.03]));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      B.add(box, M.metal, C([Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15], [0.3, 0.03, 0.04], [0, -a, 0]));
    }
    const c1 = v([-0.8, 0, -0.46]);
    const c2 = v([0.82, 0, 0.4]);
    solid(c1.x, c2.x, c1.z, c2.z, 1.3);
    desks.push({
      index: desks.length,
      pos: v([0, 0, 0]),
      rot: rot + Math.PI,
      chair: v([0, 0, 0.6]),
      screen,
      screenCenter: v([0, DESK_H + 0.405, -0.177]),
      screenNormal: new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot),
      webcam: v([0, DESK_H + 0.62, -0.16]),
      phone,
      mug,
      npc,
    });
  };
  for (const pz of PODS)
    for (const x of XS) {
      const alt = (Math.round(x * 10) + Math.round(pz * 10)) % 3 === 0;
      const front = pz === PODS[0];
      desk(x, pz + 0.42, 0, alt, !front);
      desk(x, pz - 0.42, Math.PI, !alt, !front);
    }

  const IN = T_WALL / 2;
  prop(P.credenza(8.0, 1), -5.8, FLOOR.z0 + IN + 0.23, 0, 0, [8.0, 0.46], 0.8);
  prop(P.credenza(7.8, 2), 5.9, FLOOR.z0 + IN + 0.23, 0, 0, [7.8, 0.46], 0.8);
  prop(P.credenza(15.4, 3), FLOOR.x1 - IN - 0.23, -5.7, -Math.PI / 2, 0, [15.4, 0.46], 0.8);
  prop(P.credenza(13.6, 4), FLOOR.x0 + IN + 0.23, -6.4, Math.PI / 2, 0, [13.6, 0.46], 0.8);
  prop(P.copier().group, FLOOR.x1 - IN - 0.36, 3.2, -Math.PI / 2, 0, [0.72, 0.64], 1.2);
  prop(P.filingCabinet('#8d99ae'), FLOOR.x0 + IN + 0.3, 3.55, Math.PI, 0, [0.48, 0.62], 1.3);
  prop(P.filingCabinet('#7d8da0'), FLOOR.x0 + IN + 0.8, 3.55, Math.PI, 0, [0.48, 0.62], 1.3);
  prop(P.waterCooler(), -8.6, 4 - IN - 0.25, Math.PI, 0, [0.36, 0.36], 1.4);
  prop(P.extinguisher(), -7.6, 4 - IN, Math.PI, 0);
  prop(P.whiteboard(2.4, 1.2, ['TODAY: 40 DIALS EACH', 'Gift cards > wire', 'NO CALLING COPS AGAIN', '- mgmt']), -5.1, 4 - IN, Math.PI, 1.55);
  prop(P.poster('SMILE & DIAL', 'They can hear it.', '#e07a5f'), 0.6, 4 - IN, Math.PI, 1.7);
  prop(P.poster('CLOSE MORE', 'Every call is a chance.', '#457b9d'), FLOOR.x0 + IN, -3.25, Math.PI / 2, 1.9);
  prop(P.poster('TRUST ME', 'Our core value.', '#2a9d8f'), FLOOR.x0 + IN, -8.25, Math.PI / 2, 1.9);
  prop(P.bins(), FLOOR.x1 - IN - 0.3, 3.0 - 0.9, -Math.PI / 2, 0, [0.8, 0.36], 0.6);
  prop(P.plantTall('fig', 1.1), -10.35, -14.35, 0, 0, [0.4, 0.4]);
  prop(P.plantTall('snake'), 10.35, -14.35, 0, 0, [0.4, 0.4]);
  prop(P.plantTall('snake'), -1.6, FLOOR.z0 + IN + 0.3, 0, 0, [0.4, 0.4]);
  prop(P.plantTall('snake'), 1.8, FLOOR.z0 + IN + 0.3, 0, 0, [0.4, 0.4]);
  const exit = P.exitSign();
  glowing(exit.glow, 0.6, 1.4);
  prop(exit.group, (ENTRANCE.x0 + ENTRANCE.x1) / 2, FLOOR.z0 + IN, 0, 2.6);
  prop(P.rug(2.2, 1.0, '#3d405b', '#2b2d42'), 0.1, FLOOR.z0 + 0.75);

  const KX = BREAK.x0 + IN + 0.3;
  prop(P.kitchenRun(5.4, 3.8), KX, 7.1, Math.PI / 2);
  solid(BREAK.x0, KX + 0.32, 4.35, 9.85, 1);
  const espresso = prop(P.espressoMachine(), KX - 0.02, 8.4, Math.PI / 2, 0.9);
  prop(P.grinder(), KX - 0.05, 9.0, Math.PI / 2, 0.9);
  prop(P.mugTree(), KX - 0.05, 7.75, 0, 0.9);
  prop(P.fruitBowl(), KX + 0.02, 7.25, 0, 0.9);
  prop(P.kettle(), KX - 0.05, 6.85, Math.PI / 2, 0.9);
  prop(P.toaster(), KX - 0.05, 5.4, Math.PI / 2, 0.9);
  prop(P.microwave(), KX - 0.06, 4.78, Math.PI / 2, 0.9);
  prop(P.towelRoll(), KX - 0.1, 9.55, 0, 0.9);
  prop(P.fridge(), BREAK.x0 + IN + 0.37, 10.35, Math.PI / 2, 0, [0.76, 0.74], 2);
  const coffeeMachine = espresso;
  const tx = -6.6;
  const tz = 7.4;
  B.add(box, M.redTable, mtx([tx, 0.74, tz], [2.2, 0.06, 1.2]));
  for (const [dx, dz] of [[-0.95, -0.45], [0.95, -0.45], [-0.95, 0.45], [0.95, 0.45]]) B.add(cylLo, M.metal, mtx([tx + dx, 0.36, tz + dz], [0.04, 0.72, 0.04]));
  solid(tx - 1.12, tx + 1.12, tz - 0.62, tz + 0.62, 0.8);
  for (const [dx, dz, r] of [[-0.6, -0.95, 0], [0.6, -0.95, 0], [-0.6, 0.95, Math.PI], [0.6, 0.95, Math.PI]] as [number, number, number][]) {
    const O = mtx([tx + dx, 0, tz + dz], [1, 1, 1], [0, r, 0]);
    B.add(box, M.white, mtx([0, 0.46, 0], [0.45, 0.06, 0.45], [0, 0, 0], O));
    B.add(box, M.white, mtx([0, 0.75, -0.22], [0.45, 0.55, 0.05], [-0.1, 0, 0], O));
    B.add(cylLo, M.metal, mtx([0, 0.23, 0], [0.025, 0.46, 0.025], [0, 0, 0], O));
  }
  const pendantBulb = glowing(toonMat({ color: '#fff6dc', emissive: '#ffe7b0', emissiveIntensity: 0.2 }), 0.2, 1.4);
  const pendantShade = glowing(toonMat({ color: '#ffd166', emissive: '#ffe08a', emissiveIntensity: 0.15 }), 0.15, 1.1);
  for (const dx of [-0.6, 0.6]) {
    B.add(cylLo, M.rail, mtx([tx + dx, H - 0.6, tz], [0.008, 1.2, 0.008]), false);
    B.add(new THREE.ConeGeometry(1, 1, 18, 1, true), pendantShade, mtx([tx + dx, H - 1.3, tz], [0.32, 0.3, 0.32]), false);
    B.add(cylLo, M.rail, mtx([tx + dx, H - 1.17, tz], [0.05, 0.05, 0.05]), false);
    B.add(sph, pendantBulb, mtx([tx + dx, H - 1.38, tz], [0.07, 0.08, 0.07]), false);
    night.lamps.push({ x: tx + dx, y: H - 1.5, z: tz, reach: 2.6, color: '#ffd49c', power: 0.9, glow: { x: tx + dx, y: H - 1.4, z: tz, size: 0.5 } });
  }
  const laptop = new THREE.Group();
  const lb = new THREE.Mesh(box, M.plasticDark);
  lb.scale.set(0.42, 0.025, 0.3);
  laptop.add(lb);
  const lid = new THREE.Group();
  lid.position.set(0, 0.012, -0.15);
  const lidMesh = new THREE.Mesh(box, M.plasticDark);
  lidMesh.scale.set(0.42, 0.28, 0.015);
  lidMesh.position.y = 0.14;
  lid.add(lidMesh);
  const lscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.24), new THREE.MeshBasicMaterial({ color: '#4a7dff', toneMapped: false }));
  lscreen.position.set(0, 0.14, 0.009);
  lid.add(lscreen);
  lid.rotation.x = -0.25;
  laptop.add(lid);
  laptop.position.set(tx, 0.79, tz + 0.3);
  laptop.name = 'laptop';
  root.add(laptop);

  const NW = 4 + IN;
  const logo = T.logoSignTexture();
  const sign = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: logo, toneMapped: false }));
  sign.scale.set(2.6, 1.3, 1);
  sign.position.set(-0.3, 2.35, NW + 0.07);
  root.add(sign);
  B.add(box, M.wood, mtx([-0.3, 2.35, NW + 0.03], [2.8, 1.45, 0.06]));
  const targets = new T.Board(512, 320);
  const tb = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: targets.texture }));
  tb.scale.set(1.9, 1.2, 1);
  tb.position.set(-7.2, 1.75, NW + 0.05);
  root.add(tb);
  B.add(box, M.trim, mtx([-7.2, 1.75, NW + 0.02], [2.0, 1.3, 0.04]));
  const day = new T.Board(256, 96);
  const dayMat = new THREE.MeshBasicMaterial({ map: day.texture, toneMapped: false });
  for (const [dz, r] of [[IN + 0.01, 0], [-IN - 0.01, Math.PI]]) {
    const s = new THREE.Mesh(plane, dayMat);
    s.scale.set(0.9, 0.34, 1);
    s.position.set((DOOR.x0 + DOOR.x1) / 2, 2.62, 4 + dz);
    s.rotation.y = r;
    root.add(s);
  }
  prop(P.picture(1.0, 0.75, ['#f4f1de', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'], 3), -9.6, NW, 0, 1.9);

  const EW = BREAK.x1 - IN;
  const hoopZ = 8.0;
  const boardX = EW - 0.62;
  const rim = new THREE.Vector3(boardX - 0.4, 3.05, hoopZ);
  {
    const ink = toonMat({ color: '#2b2d42' });
    const board = new THREE.Group();
    const backboard = new THREE.Mesh(box, toonMat({ color: '#ffffff' }));
    backboard.position.set(boardX + 0.025, 3.405, hoopZ);
    backboard.scale.set(0.05, 1.05, 1.4);
    board.add(backboard);
    const red = toonMat({ color: '#e5483b' });
    for (const [y, z, h, w] of [[3.42, hoopZ, 0.04, 0.59], [2.98, hoopZ, 0.04, 0.59], [3.2, hoopZ - 0.275, 0.48, 0.04], [3.2, hoopZ + 0.275, 0.48, 0.04]]) {
      const strip = new THREE.Mesh(box, red);
      strip.position.set(boardX - 0.012, y, z);
      strip.scale.set(0.012, h, w);
      board.add(strip);
    }
    board.children.forEach((c) => (c.castShadow = true));
    for (const dz of [-0.4, 0.4]) {
      const arm = new THREE.Mesh(box, ink);
      arm.position.set((EW + boardX + 0.06) / 2, 3.3, hoopZ + dz);
      arm.scale.set(EW - boardX - 0.06, 0.05, 0.05);
      board.add(arm);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.018, 8, 28), toonMat({ color: '#ff6b1a' }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(rim);
    board.add(ring);
    const bracket = new THREE.Mesh(box, toonMat({ color: '#ff6b1a' }));
    bracket.position.set(boardX - 0.09, 3.03, hoopZ);
    bracket.scale.set(0.18, 0.04, 0.1);
    board.add(bracket);
    const net = new THREE.Group();
    const netMat = noInk(new THREE.MeshBasicMaterial({ color: '#f1f1f1' }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const top = new THREE.Vector3(Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23);
      const bot = new THREE.Vector3(Math.cos(a + 0.3) * 0.15, -0.4, Math.sin(a + 0.3) * 0.15);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, top.distanceTo(bot), 4), netMat);
      s.position.copy(top).add(bot).multiplyScalar(0.5);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bot.clone().sub(top).normalize());
      net.add(s);
    }
    for (const [y, r] of [[-0.14, 0.2], [-0.28, 0.17], [-0.4, 0.15]]) {
      const hoopRing = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 4, 24), netMat);
      hoopRing.rotation.x = Math.PI / 2;
      hoopRing.position.y = y;
      net.add(hoopRing);
    }
    net.position.copy(rim);
    board.add(net);
    root.add(board);
    const line = (x: number, z: number, w: number, d: number) => {
      const l = new THREE.Mesh(plane, M.court);
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.006, z);
      l.scale.set(w, d, 1);
      root.add(l);
    };
    const keyFar = EW - 4.6 - 0.62 + 0.2;
    line((EW + keyFar) / 2, hoopZ - 1.8, EW - keyFar, 0.06);
    line((EW + keyFar) / 2, hoopZ + 1.8, EW - keyFar, 0.06);
    line(keyFar, hoopZ, 0.06, 3.6);
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.77, 1.83, 40, 1, Math.PI / 2, Math.PI), M.court);
    arc.rotation.x = -Math.PI / 2;
    arc.position.set(keyFar, 0.006, hoopZ);
    root.add(arc);
  }
  const hoop: Hoop = {
    rim,
    rimR: 0.23,
    boardX,
    boardZ: [hoopZ - 0.7, hoopZ + 0.7],
    boardY: [2.88, 3.93],
    home: new THREE.Vector3(EW - 0.5, 0.12, hoopZ + 2.3),
    room: { x0: BREAK.x0 + IN + 0.75, x1: EW, z0: 4 + IN, z1: BREAK.z1 - IN, y1: H },
  };
  prop(P.vendingMachine().group, EW - 0.4, 11.0, -Math.PI / 2, 0, [0.92, 0.78], 1.9);
  B.add(box, M.wood, mtx([EW - 0.03, 1.6, 12.4], [0.04, 1.0, 1.5]));
  B.add(plane, M.cork, mtx([EW - 0.06, 1.6, 12.4], [1.4, 0.9, 1], [0, -Math.PI / 2, 0]), false);

  const BW = BREAK.z1 - IN;
  prop(P.rug(4.2, 3.0, '#f4d7b5', '#e07a5f'), -5.0, 13.5);
  prop(P.sofa(2.8, '#5b8def'), -5.0, 12.2, 0, 0, [2.8, 1.0], 0.9);
  prop(P.coffeeTable(0.6), -5.0, 13.75, 0, 0, [1.2, 1.2], 0.5);
  prop(P.beanbag('#06d6a0'), -7.2, 14.2, 0, 0, [1.0, 1.0], 0.6);
  prop(P.beanbag('#ffd166'), -2.8, 14.2, 0, 0, [1.0, 1.0], 0.6);
  const tv = new T.Board(512, 288);
  B.add(box, M.tvBlack, mtx([-5.0, 1.75, BW - 0.04], [1.7, 0.98, 0.06]));
  const tvMesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tv.texture, toneMapped: false }));
  tvMesh.scale.set(1.6, 0.9, 1);
  tvMesh.position.set(-5.0, 1.75, BW - 0.075);
  tvMesh.rotation.y = Math.PI;
  root.add(tvMesh);
  B.add(box, M.wood, mtx([-5.0, 0.3, BW - 0.25], [2.0, 0.5, 0.42]));
  prop(P.plantTall('fig'), -3.3, BW - 0.35, 0, 0, [0.4, 0.4]);
  prop(P.bookshelf(1.6, 2.1, 5), BREAK.x0 + IN + 0.17, 13.0, Math.PI / 2, 0, [1.6, 0.36], 2.1);
  prop(P.waterCooler(), BREAK.x0 + IN + 0.25, 14.6, Math.PI / 2, 0, [0.36, 0.36], 1.4);
  const lamp = P.floorLamp();
  glowing(lamp.bulb, 0.15, 1.2);
  prop(lamp.group, BREAK.x0 + IN + 0.35, 15.5, 0, 0, [0.4, 0.4]);
  night.lamps.push({ x: BREAK.x0 + IN + 0.35, y: 1.5, z: 15.5, reach: 3, color: '#ffd49c', power: 1.2, glow: { x: BREAK.x0 + IN + 0.35, y: 1.6, z: 15.5, size: 0.6 } });
  prop(P.coatRack(), -7.5, BW - 0.3, 0, 0, [0.4, 0.4]);
  prop(P.picture(1.2, 0.8, ['#e9f5db', '#457b9d', '#e63946', '#f1faee', '#1d3557'], 7), -7.5, BW, Math.PI, 2.5);
  const jukebox = buildJukebox();
  P.place(jukebox.group, -0.6, BW - 0.4, Math.PI);
  root.add(jukebox.group);
  solid(-1.3, 0.1, BW - 0.8, BW, 1.9);
  const cab = buildCabinet();
  P.place(cab.group, EW - 0.42, 14.2, -Math.PI / 2);
  root.add(cab.group);
  solid(EW - 0.85, EW, 13.78, 14.62, 1.9);
  const arcadeSpot = new THREE.Vector3(EW - 1.5, 0, 14.2);
  cab.group.updateMatrixWorld(true);
  const arcadeLook = cab.screen.getWorldPosition(new THREE.Vector3());
  const arcadeEye = arcadeLook.clone().add(new THREE.Vector3(-0.78, 0.12, 0));
  prop(P.plantTall('snake'), EW - 0.3, BW - 0.3, 0, 0, [0.4, 0.4]);
  prop(P.bins(), -4.9, 4 + IN + 0.25, Math.PI, 0, [0.8, 0.36], 0.6);

  const bx = 6.2;
  const bzz = 8.6;
  B.add(box, M.wood, mtx([bx, 0.76, bzz], [2.2, 0.08, 1.0]));
  B.add(box, M.wood, mtx([bx, 0.38, bzz - 0.45], [2.1, 0.72, 0.06]));
  B.add(box, M.wood, mtx([bx - 1.0, 0.38, bzz], [0.06, 0.72, 0.95]));
  B.add(box, M.wood, mtx([bx + 1.0, 0.38, bzz], [0.06, 0.72, 0.95]));
  solid(bx - 1.15, bx + 1.15, bzz - 0.55, bzz + 0.55, 0.85);
  prop(P.officeChair('#5a3424', true), bx, bzz + 1.1, Math.PI, 0, [0.7, 0.7], 1.2);
  B.add(box, M.plasticDark, mtx([bx + 0.4, 1.06, bzz + 0.15], [0.6, 0.36, 0.04]));
  B.add(box, M.plasticDark, mtx([bx + 0.4, 0.84, bzz + 0.2], [0.18, 0.04, 0.14]));
  B.add(cyl, toonMat({ color: '#f2c14e' }), mtx([bx - 0.7, 0.9, bzz], [0.05, 0.22, 0.05]));
  B.add(box, toonMat({ color: '#f2c14e' }), mtx([bx - 0.2, 0.84, bzz - 0.38], [0.36, 0.08, 0.04], [-0.4, 0, 0]));
  const bankers = glowing(toonMat({ color: '#2a9d8f', emissive: '#bff5e6', emissiveIntensity: 0.1 }), 0.1, 0.9);
  B.add(new THREE.CylinderGeometry(0.06, 0.12, 0.07, 14, 1, false, 0, Math.PI), bankers, mtx([bx - 0.75, 1.15, bzz + 0.15], [1, 1, 1], [0, 0, Math.PI / 2]), false);
  B.add(cylLo, toonMat({ color: '#f2c14e' }), mtx([bx - 0.75, 0.97, bzz + 0.15], [0.012, 0.28, 0.012]));
  prop(P.rug(3.6, 2.6, '#7d2e2e', '#3d1f1f'), bx, bzz + 0.3);
  const bossScreen = new T.Board(1280, 720);
  const bsX = BOSS.x0 + IN;
  const MZ = 13.2;
  const bsMesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: bossScreen.texture, toneMapped: false }));
  bsMesh.scale.set(3.2, 1.8, 1);
  bsMesh.position.set(bsX + 0.075, 1.9, MZ);
  bsMesh.rotation.y = Math.PI / 2;
  root.add(bsMesh);
  B.add(box, M.tvBlack, mtx([bsX + 0.035, 1.9, MZ], [0.05, 1.9, 3.3]));
  B.add(box, M.plasticDark, mtx([bsX + 0.06, 0.92, MZ], [0.08, 0.05, 0.5]));
  for (const y of [1.2, 1.7]) B.add(box, M.wood, mtx([bsX + 0.15, y, 6.4], [0.3, 0.04, 1.8]));
  for (const z of [5.5, 7.3]) B.add(box, M.wood, mtx([bsX + 0.15, 1.45, z], [0.3, 0.54, 0.04]));
  [[1.22, 5.8, 1.2], [1.22, 6.4, 1.5, '#d9d9d9'], [1.22, 7.0, 1.0, '#cd7f32'], [1.72, 5.9, 1.1], [1.72, 6.7, 1.3]].forEach(([y, z, s, c], i) => {
    const t = P.trophy(s as number, (c as string) || '#f2c14e');
    prop(t, bsX + 0.15, z as number, Math.PI / 2 + i * 0.2, y as number);
  });
  const TX0 = 3.3;
  const TX1 = 8.6;
  const tcx = (TX0 + TX1) / 2;
  const tableTop = toonMat({ color: '#4a3226' });
  const tableEdge = toonMat({ color: '#2f1f17' });
  B.add(box, tableTop, mtx([tcx, 0.745, MZ], [TX1 - TX0, 0.05, 1.3]));
  B.add(box, tableEdge, mtx([tcx, 0.71, MZ], [TX1 - TX0 - 0.04, 0.03, 1.26]));
  for (const x of [TX0 + 0.5, TX1 - 0.5]) {
    B.add(box, tableEdge, mtx([x, 0.36, MZ], [0.12, 0.7, 0.9]));
    B.add(box, tableEdge, mtx([x, 0.03, MZ], [0.5, 0.06, 1.0]));
  }
  B.add(box, M.plasticDark, mtx([tcx, 0.775, MZ], [1.2, 0.012, 0.16]));
  solid(TX0, TX1, MZ - 0.65, MZ + 0.65, 0.8);
  const padM = toonMat({ color: '#fdfaf0' });
  const glassM = toonMat({ color: '#cfe8ff', transparent: true, opacity: 0.55 });
  const meetingSeats: { pos: THREE.Vector3; rot: number }[] = [];
  const execChair = toonMat({ color: '#2b2d42' });
  const seatChair = (x: number, z: number, rot: number) => {
    const O = mtx([x, 0, z], [1, 1, 1], [0, rot, 0]);
    const C = (p: [number, number, number], sc: [number, number, number], r: [number, number, number] = [0, 0, 0]) => mtx(p, sc, r, O);
    B.add(box, execChair, C([0, 0.47, 0.02], [0.5, 0.09, 0.48]));
    B.add(box, execChair, C([0, 0.9, 0.26], [0.48, 0.66, 0.08], [-0.1, 0, 0]));
    B.add(box, M.metal, C([0.27, 0.62, 0.04], [0.04, 0.04, 0.34]));
    B.add(box, M.metal, C([-0.27, 0.62, 0.04], [0.04, 0.04, 0.34]));
    B.add(cylLo, M.metal, C([0, 0.25, 0.02], [0.03, 0.4, 0.03]));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      B.add(box, M.metal, C([Math.cos(a) * 0.16, 0.05, 0.02 + Math.sin(a) * 0.16], [0.32, 0.03, 0.04], [0, -a, 0]));
    }
    const fwd = new THREE.Vector3(-Math.sin(rot), 0, -Math.cos(rot));
    const pad = new THREE.Vector3(x, 0, z).addScaledVector(fwd, 0.62);
    B.add(box, padM, mtx([pad.x, 0.776, pad.z], [0.22, 0.012, 0.3], [0, rot + 0.12, 0]));
    B.add(cylLo, glassM, mtx([pad.x + 0.2, 0.83, pad.z], [0.035, 0.12, 0.035]), false);
    meetingSeats.push({ pos: new THREE.Vector3(x, 0, z), rot: rot === Math.PI ? 0 : Math.PI });
  };
  for (const x of [4.0, 5.25, 6.5, 7.75]) {
    seatChair(x, MZ - 1.0, Math.PI);
    seatChair(x, MZ + 1.0, 0);
  }
  const meeting = {
    seats: meetingSeats,
    boss: new THREE.Vector3(2.45, 0, MZ - 1.85),
    bossRot: Math.atan2(tcx - 2.45, 1.85),
    wide: [new THREE.Vector3(10.2, 2.55, MZ + 0.15), new THREE.Vector3(3.6, 1.15, MZ - 0.1)] as [THREE.Vector3, THREE.Vector3],
    slide: [new THREE.Vector3(5.5, 2.3, MZ - 0.05), new THREE.Vector3(1.6, 1.8, MZ - 0.3)] as [THREE.Vector3, THREE.Vector3],
    boss1: [new THREE.Vector3(5.6, 2.25, MZ - 2.7), new THREE.Vector3(2.0, 1.55, MZ - 0.55)] as [THREE.Vector3, THREE.Vector3],
  };
  prop(P.bookshelf(1.6, 2.2, 11), BOSS.x1 - IN - 0.17, 14.2, -Math.PI / 2, 0, [1.6, 0.36], 2.2);
  prop(P.filingCabinet('#3d405b'), BOSS.x1 - IN - 0.3, 4.6, -Math.PI / 2, 0, [0.48, 0.62], 1.3);
  prop(P.plantTall('fig', 1.15), BOSS.x0 + IN + 0.4, BOSS.z1 - IN - 0.4, 0, 0, [0.4, 0.4]);
  prop(P.coatRack(), BOSS.x0 + IN + 0.35, 4.55, 0, 0, [0.4, 0.4]);
  prop(P.picture(1.4, 0.9, ['#1d3557', '#f1faee', '#e63946', '#a8dadc'], 21, '#c9a227'), BOSS.x1 - IN, 9.4, -Math.PI / 2, 3.6);

  const fz2 = 4 - IN - 0.01;
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), toonMat({ map: T.clockFaceTexture() }));
  clockFace.position.set(-0.9, 2.5, fz2 - 0.02);
  clockFace.rotation.y = Math.PI;
  root.add(clockFace);
  B.add(new THREE.TorusGeometry(0.31, 0.03, 8, 32), M.darkFrame, mtx([-0.9, 2.5, fz2 - 0.02]));
  const hand = (len: number, w: number) => {
    const g = new THREE.Group();
    const hm = new THREE.Mesh(box, M.plasticDark);
    hm.scale.set(w, len, 0.01);
    hm.position.y = len / 2;
    g.add(hm);
    g.position.set(-0.9, 2.5, fz2 - 0.035);
    g.rotation.y = Math.PI;
    root.add(g);
    return g;
  };
  const wallClock = { hour: hand(0.16, 0.025), minute: hand(0.23, 0.015) };
  const breaker = new THREE.Mesh(box, M.breaker);
  breaker.scale.set(0.08, 0.8, 0.6);
  breaker.position.set(FLOOR.x0 + IN + 0.04, 1.3, 1.6);
  breaker.name = 'breaker';
  root.add(breaker);
  const breakerLamp = toonMat({ color: '#600', emissive: '#ff2a1a', emissiveIntensity: 0 });
  const lampBulb = new THREE.Mesh(sph, breakerLamp);
  lampBulb.scale.setScalar(0.09);
  lampBulb.position.set(FLOOR.x0 + IN + 0.05, 1.95, 1.6);
  root.add(lampBulb);

  const PA = PATIO;
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    B.add(box, M.rail, mtx([(x0 + x1) / 2, 1.0, (z0 + z1) / 2], [len, 0.06, 0.08], [0, ry, 0]));
    B.add(box, M.wood, mtx([(x0 + x1) / 2, 1.045, (z0 + z1) / 2], [len, 0.03, 0.12], [0, ry, 0]));
    B.add(box, M.rail, mtx([(x0 + x1) / 2, 0.12, (z0 + z1) / 2], [len, 0.04, 0.05], [0, ry, 0]));
    for (let d = 0; d <= len + 0.01; d += 0.12) B.add(box, M.rail, mtx([x0 + ((x1 - x0) * d) / len, 0.56, z0 + ((z1 - z0) * d) / len], [0.02, 0.88, 0.02], [0, ry, 0]));
    for (let d = 0; d <= len + 0.01; d += len / Math.max(1, Math.round(len / 1.6))) B.add(box, M.rail, mtx([x0 + ((x1 - x0) * d) / len, 0.53, z0 + ((z1 - z0) * d) / len], [0.07, 1.06, 0.07]));
    solid(Math.min(x0, x1) - 0.08, Math.max(x0, x1) + 0.08, Math.min(z0, z1) - 0.08, Math.max(z0, z1) + 0.08, 1.1);
  };
  rail(PA.x0, PA.z1, PA.x1, PA.z1);
  rail(PA.x1, PA.z0 + 0.15, PA.x1, PA.z1);
  rail(PA.x0, PA.z0 + 0.15, PA.x0, PA.z1);
  const benchX = -6.6;
  B.add(box, M.wood, mtx([benchX, 0.45, PA.z1 - 0.55], [2.4, 0.07, 0.45]));
  for (let i = 0; i < 3; i++) B.add(box, M.wood, mtx([benchX, 0.62 + i * 0.13, PA.z1 - 0.3], [2.4, 0.08, 0.04], [0.12, 0, 0]));
  for (const dx of [-1.05, 1.05]) B.add(box, M.rail, mtx([benchX + dx, 0.36, PA.z1 - 0.45], [0.06, 0.72, 0.5]));
  solid(benchX - 1.25, benchX + 1.25, PA.z1 - 0.8, PA.z1 - 0.1, 0.9);
  B.add(cylLo, M.metal, mtx([-4.0, 0.52, PA.z1 - 0.75], [0.06, 1.0, 0.06]));
  B.add(cyl, M.metal, mtx([-4.0, 1.04, PA.z1 - 0.75], [0.18, 0.06, 0.18]));
  B.add(cyl, M.plasticDark, mtx([-4.0, 1.075, PA.z1 - 0.75], [0.15, 0.02, 0.15]));
  B.add(cyl, M.metal, mtx([-4.0, 0.08, PA.z1 - 0.75], [0.2, 0.04, 0.2]));
  solid(-4.25, -3.75, PA.z1 - 1.0, PA.z1 - 0.5, 1.1);
  prop(P.bistroSet(), -8.6, 18.7, 0, 0.06, [0.8, 0.8], 0.8);
  prop(P.umbrella('#e07a5f', '#fffaf3'), -8.6, 18.7, 0, 0.06);
  prop(P.bistroSet(), -4.6, 17.9, Math.PI / 2, 0.06, [0.8, 0.8], 0.8);
  prop(P.planterBox(1.6), PA.x1 - 0.5, 17.0, Math.PI / 2, 0.06, [1.6, 0.46], 0.8);
  prop(P.planterBox(1.6), PA.x0 + 0.5, 20.6, Math.PI / 2, 0.06, [1.6, 0.46], 0.8);
  const ink = toonMat({ color: '#2b2d42' });
  const posts = [new THREE.Vector3(PA.x0 + 0.15, 0, PA.z1 - 0.15), new THREE.Vector3(PA.x1 - 0.15, 0, PA.z1 - 0.15)];
  for (const p of posts) {
    B.add(cylLo, ink, mtx([p.x, 1.45, p.z], [0.05, 2.9, 0.05]));
    B.add(sph, ink, mtx([p.x, 2.92, p.z], [0.06, 0.06, 0.06]));
  }
  const hooks = [new THREE.Vector3(PA.x0 + 0.4, 3.2, BREAK.z1 + IN + 0.05), new THREE.Vector3(PA.x1 - 0.3, 3.2, BREAK.z1 + IN + 0.05)];
  for (const h of hooks) B.add(box, ink, mtx([h.x, h.y, h.z - 0.03], [0.05, 0.05, 0.08]));
  const bulbMat = glowing(toonMat({ color: '#fff3d6', emissive: '#ffd27a', emissiveIntensity: 0.25 }), 0.25, 1.6);
  const wire = (a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
    }
    B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.008, 4), ink, new THREE.Matrix4(), false);
    const n = Math.round(a.distanceTo(b) / 0.5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0));
      B.add(cylLo, ink, mtx([p.x, p.y - 0.04, p.z], [0.006, 0.08, 0.006]), false);
      B.add(sph, bulbMat, mtx([p.x, p.y - 0.11, p.z], [0.045, 0.06, 0.045]), false);
    }
  };
  const topOf = (p: THREE.Vector3) => p.clone().setY(2.88);
  wire(hooks[0], topOf(posts[1]), 0.45);
  wire(hooks[1], topOf(posts[0]), 0.45);
  wire(topOf(posts[0]), topOf(posts[1]), 0.35);
  night.lamps.push({ x: -8.6, y: 2.4, z: 19.2, reach: 4.5, color: '#ffcf8a', power: 1.6 }, { x: -4.6, y: 2.4, z: 19.2, reach: 4.5, color: '#ffcf8a', power: 1.6 });
  const lantern = (x: number, y: number, z: number, rotY: number) => {
    const l = P.wallLantern();
    glowing(l.bulb, 0.2, 1.6);
    prop(l.group, x, z, rotY, y);
    night.lamps.push({ x: x + Math.sin(rotY) * 0.4, y: y - 0.2, z: z + Math.cos(rotY) * 0.4, reach: 3.2, color: '#ffd49c', power: 1.6, glow: { x: x + Math.sin(rotY) * 0.17, y: y - 0.04, z: z + Math.cos(rotY) * 0.17, size: 0.55 } });
  };
  lantern(PATIO_DOOR.x1 + 0.35, 2.3, BREAK.z1 + IN + 0.02, 0);
  lantern(ENTRANCE.x0 - 0.45, 2.4, FLOOR.z0 - IN - 0.02, Math.PI);
  lantern(ENTRANCE.x1 + 0.45, 2.4, FLOOR.z0 - IN - 0.02, Math.PI);
  const OUT = FLOOR.z0 - IN - 0.04;
  B.add(box, toonMat({ color: '#2b2d42' }), mtx([(ENTRANCE.x0 + ENTRANCE.x1) / 2, 2.75, OUT - 0.55], [3.0, 0.1, 1.1]));
  for (const sx of [-1.4, 1.4]) B.add(box, toonMat({ color: '#2b2d42' }), mtx([(ENTRANCE.x0 + ENTRANCE.x1) / 2 + sx, 2.62, OUT - 0.55], [0.04, 0.2, 1.0]));
  const name = T.logoSignTexture();
  const nameSign = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: name, toneMapped: false, transparent: true }));
  nameSign.scale.set(2.4, 1.2, 1);
  nameSign.position.set((ENTRANCE.x0 + ENTRANCE.x1) / 2, 3.45, OUT - 0.01);
  nameSign.rotation.y = Math.PI;
  root.add(nameSign);
  prop(P.rug(1.8, 0.9, '#3d405b', '#2b2d42'), (ENTRANCE.x0 + ENTRANCE.x1) / 2, OUT - 0.55);
  prop(P.planterBox(1.0), ENTRANCE.x0 - 1.2, OUT - 0.35, 0);
  prop(P.planterBox(1.0), ENTRANCE.x1 + 1.2, OUT - 0.35, 0);

  B.build(root);

  const raidRed = new THREE.PointLight('#ff1a1a', 0, 20, 1.2);
  raidRed.position.set(-7, 2.4, 2.5);
  const raidBlue = new THREE.PointLight('#2a5bff', 0, 20, 1.2);
  raidBlue.position.set(7, 2.4, -5);
  root.add(raidRed, raidBlue);
  const emergency = new THREE.PointLight('#ff3020', 0, 16, 1.4);
  emergency.position.set(FLOOR.x0 + 0.6, 2.2, 1.6);
  root.add(emergency);

  const bossPath = [new THREE.Vector3(-9.6, 0, 2.9), new THREE.Vector3(9.6, 0, 2.9), new THREE.Vector3(9.6, 0, -1.9), new THREE.Vector3(-9.6, 0, -1.9), new THREE.Vector3(-9.6, 0, -6.9), new THREE.Vector3(9.6, 0, -6.9), new THREE.Vector3(9.6, 0, 2.9)];

  const update = (dt: number, people: Iterable<THREE.Vector3>) => {
    const list = [...people];
    for (const d of doors) {
      const near = list.some((p) => Math.hypot(p.x - d.at.x, p.z - d.at.z) < 1.7);
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 5);
      d.pivot.rotation.y = d.openTo * d.open * (2 - d.open);
    }
  };

  return {
    root,
    desks,
    colliders,
    walls,
    savers,
    panelMat,
    ceilingLights,
    raidLights: [raidRed, raidBlue],
    emergency,
    breaker,
    breakerLamp,
    laptop,
    coffeeMachine,
    wallClock,
    bossPath,
    spawn: new THREE.Vector3(-3.4, 0, 10.6),
    smokeSpot: new THREE.Vector3(-4.0, 0, PA.z1 - 1.5),
    creatorSpot: new THREE.Vector3(-2.2, 0, 12.6),
    footprint: { x0: FLOOR.x0 - 0.3, x1: FLOOR.x1 + 0.3, z0: FLOOR.z0 - 0.3, z1: BREAK.z1 + 0.3 },
    boards: { day, targets, tv, bossScreen },
    doors,
    night,
    jukebox,
    jukeboxSpot: new THREE.Vector3(-0.6, 0, BW - 1.5),
    arcade: { screen: cab.screen, spot: arcadeSpot, eye: arcadeEye, look: arcadeLook },
    hoop,
    meeting,
    update,
  };
}
