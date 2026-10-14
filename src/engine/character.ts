import * as THREE from 'three';
import type { Look } from '../game/types';
import { toonMat } from './office';
import { cigarette, dragCurve, EXHALE_AT, SMOKE_CYCLE } from './smoke';

const v1 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const Q3 = new THREE.Quaternion();
const REST_Q = new THREE.Quaternion();
const REST_E = new THREE.Euler(-0.35, 0, 0);
const REST_P = new THREE.Vector3(0, -0.33, 0.05);
const Z = new THREE.Vector3(0, 0, 1);
const v2 = new THREE.Vector3();

const mats = new Map<string, THREE.Material>();
function mat(color: string, rough = 0.75, metal = 0) {
  const key = `${color}|${rough}|${metal}`;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = metal > 0.3 || rough < 0.3 ? new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }) : toonMat({ color })));
  return m;
}

const G = {
  sphere: new THREE.SphereGeometry(1, 28, 20),
  sphereLo: new THREE.SphereGeometry(1, 12, 9),
  cap: new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.46),
  dome: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
  lowerHalf: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  cone: new THREE.ConeGeometry(1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.16, 8, 24),
  arc: new THREE.TorusGeometry(1, 0.06, 6, 24, Math.PI),
  halfTorus: new THREE.TorusGeometry(1, 0.35, 8, 20, Math.PI),
};
const capsules = new Map<string, THREE.CapsuleGeometry>();
function capsule(r: number, len: number) {
  const k = `${r.toFixed(3)}|${len.toFixed(3)}`;
  let g = capsules.get(k);
  if (!g) capsules.set(k, (g = new THREE.CapsuleGeometry(r, len, 6, 14)));
  return g;
}

function m(geo: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: number | [number, number, number] = 1, rot?: [number, number, number]) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...pos);
  if (typeof scale === 'number') mesh.scale.setScalar(scale);
  else mesh.scale.set(...scale);
  if (rot) mesh.rotation.set(...rot);
  mesh.castShadow = true;
  return mesh;
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

export const DEFAULT_LOOK: Required<Look> = {
  skin: '#f08a3c',
  hair: 'curly',
  hairColor: '#2a1d14',
  facial: 'none',
  glasses: false,
  shirt: '#3f9b4a',
  body: 'normal',
  height: 1,
  head: 1,
  nose: 1,
  eyes: 1,
  brows: 'normal',
  top: 'tee',
  pants: '#3b5b8c',
  shoes: '#2b2b2b',
  headset: '#1e1e1e',
  hat: 'none',
  hatColor: '#c8432f',
};
export function fullLook(l: Look | null | undefined): Required<Look> {
  return { ...DEFAULT_LOOK, ...(l || {}) } as Required<Look>;
}

export type Pose = 'stand' | 'walk' | 'run' | 'sit';
export const SEAT_HEIGHT = 0.5;
const HIP_Y = 0.84;

interface Limb {
  a: THREE.Group;
  b: THREE.Group;
}

export class Avatar {
  root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private head = new THREE.Group();
  private headInner = new THREE.Group();
  private mouth!: THREE.Mesh;
  private eyes: THREE.Object3D[] = [];
  private brows: THREE.Mesh[] = [];
  private armL!: Limb;
  private armR!: Limb;
  private legL!: Limb;
  private legR!: Limb;
  private chest!: THREE.Mesh;
  private cig!: THREE.Group;
  private ember!: THREE.MeshToonMaterial;
  private smokeT = -1;
  private wispIn = 0;
  onSmoke: ((kind: 'wisp' | 'exhale', at: THREE.Vector3, dir: THREE.Vector3) => void) | null = null;
  look: Required<Look>;

  pose: Pose = 'stand';
  speed = 1;
  typing = false;
  talk = 0;
  talking = false;
  lookYaw = 0;
  lookPitch = 0;
  mood: 'calm' | 'happy' | 'angry' | 'scared' = 'calm';
  private yaw = 0;
  private pitch = 0;
  private open = 0;
  private blinkIn = 2 + Math.random() * 3;
  private phase = Math.random() * 10;
  private stride = 0;
  private layer = 0;

  constructor(look: Look) {
    this.look = fullLook(look);
    this.root.add(this.body);
    this.build();
  }

  setLook(look: Look) {
    this.look = fullLook(look);
    this.body.clear();
    this.build();
    this.setLayer(this.layer);
  }

  setLayer(layer: number) {
    this.layer = layer;
    this.root.traverse((o) => o.layers.set(layer));
  }

  private limb(x: number, y: number, z: number): Limb {
    const a = new THREE.Group();
    const b = new THREE.Group();
    a.position.set(x, y, z);
    a.add(b);
    return { a, b };
  }

  private build() {
    const L = this.look;
    const skin = mat(L.skin, 0.6);
    const skinDark = mat(shade(L.skin, 0.86), 0.6);
    const shirt = mat(L.shirt, 0.9);
    const shirtDark = mat(shade(L.shirt, 0.75), 0.9);
    const pants = mat(L.pants, 0.95);
    const shoes = mat(L.shoes, 0.6);
    const hair = mat(L.hairColor, 0.85);
    const black = mat('#141414', 0.4);
    const white = mat('#fbfbf6', 0.35);
    const fat = L.body === 'chubby' ? 1.25 : L.body === 'slim' ? 0.88 : 1;
    const hs = L.head;
    const longSleeves = L.top === 'hoodie' || L.top === 'shirtTie';
    const sleeve = L.top === 'tank' ? skin : shirt;

    this.hips = new THREE.Group();
    this.spine = new THREE.Group();
    this.head = new THREE.Group();
    this.headInner = new THREE.Group();
    this.eyes = [];
    this.brows = [];
    this.body.scale.setScalar(L.height);
    this.body.add(this.hips);
    this.hips.position.set(0, HIP_Y, 0);

    this.hips.add(m(G.sphere, pants, [0, 0.02, 0], [0.19 * fat, 0.12, 0.14 * fat]));
    this.legL = this.limb(0.1 * fat, 0, 0);
    this.legR = this.limb(-0.1 * fat, 0, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.a.add(m(capsule(0.085 * Math.sqrt(fat), 0.26), pants, [0, -0.2, 0]));
      leg.b.position.set(0, -0.4, 0);
      leg.b.add(m(capsule(0.075, 0.26), pants, [0, -0.18, 0]));
      leg.b.add(m(G.sphere, shoes, [0, -0.39, 0.05], [0.075, 0.055, 0.13]));
      leg.a.add(leg.b);
      this.hips.add(leg.a);
    }

    this.hips.add(this.spine);
    this.spine.position.set(0, 0.03, 0);
    this.chest = m(capsule(0.19, 0.22), shirt, [0, 0.29, -0.01], [1.15 * fat, 1, 0.88 * fat]);
    this.spine.add(this.chest);
    this.spine.add(m(G.sphere, shirt, [0, 0.18, 0.05 * fat], [0.2 * fat, 0.17, 0.15 * fat]));
    if (L.top === 'hoodie') {
      this.spine.add(m(G.halfTorus, shirtDark, [0, 0.5, -0.1], [0.14, 0.1, 0.1], [Math.PI / 2 + 0.3, 0, 0]));
      this.spine.add(m(G.box, shirtDark, [0, 0.14, 0.17 * fat], [0.22, 0.09, 0.02]));
    } else if (L.top === 'polo') {
      this.spine.add(m(G.box, shirtDark, [0.06, 0.55, 0.11], [0.09, 0.02, 0.07], [0.5, 0.4, 0]));
      this.spine.add(m(G.box, shirtDark, [-0.06, 0.55, 0.11], [0.09, 0.02, 0.07], [0.5, -0.4, 0]));
    } else if (L.top === 'shirtTie') {
      this.spine.add(m(G.box, mat('#b3261e', 0.6), [0, 0.38, 0.165 * fat], [0.05, 0.26, 0.02]));
      this.spine.add(m(G.box, mat('#b3261e', 0.6), [0, 0.52, 0.15], [0.07, 0.05, 0.03]));
    } else {
      this.spine.add(m(G.box, white, [-0.09, 0.4, 0.165 * fat], [0.07, 0.05, 0.01]));
      this.spine.add(m(G.box, mat('#d24c3c'), [-0.09, 0.43, 0.168 * fat], [0.07, 0.012, 0.01]));
    }
    this.spine.add(m(G.cyl, skin, [0, 0.58, 0], [0.07, 0.1, 0.07]));

    this.armL = this.limb(0.25 * fat, 0.49, -0.01);
    this.armR = this.limb(-0.25 * fat, 0.49, -0.01);
    for (const arm of [this.armL, this.armR]) {
      arm.a.add(m(G.sphere, sleeve, [0, 0, 0], 0.08));
      arm.a.add(m(capsule(0.058, 0.2), sleeve, [0, -0.15, 0]));
      arm.b.position.set(0, -0.3, 0);
      arm.b.add(m(capsule(0.05, 0.2), longSleeves ? shirt : skin, [0, -0.14, 0]));
      arm.b.add(m(G.sphere, skin, [0, -0.3, 0.01], [0.065, 0.075, 0.05]));
      arm.a.add(arm.b);
      this.spine.add(arm.a);
    }
    {
      const c = cigarette();
      this.cig = c.group;
      this.ember = c.ember;
      this.cig.position.set(0.0, -0.33, 0.05);
      this.cig.rotation.x = -0.35;
      this.cig.visible = this.smokeT >= 0;
      this.armR.b.add(this.cig);
    }

    this.head.position.set(0, 0.64, 0);
    this.head.add(this.headInner);
    const H = this.headInner;
    H.scale.setScalar(hs);
    H.position.set(0, 0.2 * hs, 0.02);
    H.add(m(G.sphere, skin, [0, 0, 0], [0.21, 0.225, 0.205]));
    H.add(m(G.sphere, skin, [0, -0.09, 0.03], [0.18, 0.13, 0.17]));
    H.add(m(G.sphere, skinDark, [0, -0.01, 0.205], [0.052 * L.nose, 0.05 * L.nose, 0.07 * L.nose]));
    H.add(m(G.sphere, skin, [0.205, 0, 0], [0.028, 0.055, 0.045]));
    H.add(m(G.sphere, skin, [-0.205, 0, 0], [0.028, 0.055, 0.045]));

    const browColor = mat(shade(L.hairColor === '#e8e2d6' ? '#9a9a9a' : L.hairColor, 0.8));
    const bt = L.brows === 'thin' ? 0.6 : L.brows === 'bushy' ? 1.6 : 1;
    for (const x of [0.078, -0.078]) {
      const eye = new THREE.Group();
      eye.position.set(x, 0.045, 0.165);
      eye.scale.setScalar(L.eyes);
      eye.add(m(G.sphere, white, [0, 0, 0], [0.052, 0.058, 0.035]));
      eye.add(m(G.sphereLo, black, [0, -0.005, 0.03], [0.024, 0.027, 0.012]));
      eye.add(m(G.sphereLo, white, [0.008, 0.008, 0.04], 0.007));
      H.add(eye);
      this.eyes.push(eye);
      const brow = m(G.box, browColor, [x, 0.125, 0.19], [L.brows === 'unibrow' ? 0.13 : 0.095, 0.022 * bt, 0.03]);
      H.add(brow);
      this.brows.push(brow);
    }
    if (L.brows === 'unibrow') H.add(m(G.box, browColor, [0, 0.13, 0.198], [0.06, 0.02, 0.025]));

    this.mouth = m(G.sphere, mat('#5a1414', 0.5), [0, -0.115, 0.185], [0.06, 0.012, 0.02]);
    H.add(this.mouth);
    H.add(m(G.box, white, [0, -0.1, 0.197], [0.06, 0.012, 0.01]));

    if (L.facial === 'mustache' || L.facial === 'beard') {
      H.add(m(capsule(0.024, 0.11), hair, [0, -0.07, 0.205], 1, [0, 0, Math.PI / 2]));
      H.add(m(G.sphere, hair, [0.065, -0.085, 0.19], [0.03, 0.03, 0.025]));
      H.add(m(G.sphere, hair, [-0.065, -0.085, 0.19], [0.03, 0.03, 0.025]));
    }
    if (L.facial === 'beard') H.add(m(G.lowerHalf, hair, [0, 0, 0], [0.215, 0.24, 0.212]));
    if (L.facial === 'goatee') H.add(m(G.sphere, hair, [0, -0.19, 0.13], [0.05, 0.06, 0.04]));

    const cap = (s = 1.04, y = 0.02, tilt = -0.25) => H.add(m(G.cap, hair, [0, y, -0.01], [0.21 * s, 0.225 * s, 0.205 * s], [tilt, 0, 0]));
    switch (L.hair) {
      case 'short':
        cap();
        break;
      case 'buzz':
        cap(1.01, 0.01, -0.2);
        break;
      case 'bun':
        cap(1.03);
        H.add(m(G.sphere, hair, [0, 0.19, -0.12], 0.085));
        break;
      case 'ponytail':
        cap(1.03);
        H.add(m(G.sphere, hair, [0, 0.08, -0.2], 0.05));
        H.add(m(capsule(0.05, 0.18), hair, [0, -0.06, -0.24], 1, [0.3, 0, 0]));
        break;
      case 'curly':
        cap(1.02);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const r = i % 2 ? 0.17 : 0.1;
          H.add(m(G.sphereLo, hair, [Math.cos(a) * r, 0.16 + (i % 3) * 0.025, Math.sin(a) * r - 0.03], 0.075));
        }
        break;
      case 'afro':
        H.add(m(G.sphere, hair, [0, 0.13, -0.04], [0.32, 0.27, 0.3]));
        break;
      case 'spiky':
        cap(1.02);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          H.add(m(G.cone, hair, [Math.cos(a) * 0.1, 0.22, Math.sin(a) * 0.1 - 0.02], [0.045, 0.14, 0.045], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]));
        }
        break;
      case 'long':
        cap();
        H.add(m(capsule(0.15, 0.2), hair, [0, -0.08, -0.1], [1.25, 1, 0.6]));
        break;
      case 'mohawk':
        for (let i = 0; i < 6; i++) H.add(m(G.box, hair, [0, 0.21 - Math.abs(i - 2.5) * 0.012, 0.13 - i * 0.055], [0.04, 0.09, 0.05], [-0.3 + i * 0.12, 0, 0]));
        break;
      case 'cap':
        cap(1.02);
        break;
      case 'side':
        cap();
        H.add(m(G.sphere, hair, [0.07, 0.17, 0.1], [0.14, 0.06, 0.1], [0, 0, -0.3]));
        break;
      case 'bald':
        H.add(m(G.sphere, hair, [0.17, 0.02, -0.06], [0.05, 0.07, 0.1]));
        H.add(m(G.sphere, hair, [-0.17, 0.02, -0.06], [0.05, 0.07, 0.1]));
        break;
    }

    const hatC = mat(L.hatColor, 0.8);
    const hat = L.hair === 'cap' && L.hat === 'none' ? 'cap' : L.hat;
    if (hat === 'cap') {
      H.add(m(G.cap, hatC, [0, 0.03, 0], [0.222, 0.2, 0.217], [-0.1, 0, 0]));
      H.add(m(G.cyl, hatC, [0, 0.1, 0.2], [0.13, 0.012, 0.11], [0.1, 0, 0]));
    } else if (hat === 'beanie') {
      H.add(m(G.dome, hatC, [0, 0.06, -0.01], [0.225, 0.24, 0.22], [-0.15, 0, 0]));
      H.add(m(G.cyl, mat(shade(L.hatColor, 0.8)), [0, 0.07, -0.01], [0.228, 0.06, 0.222], [-0.15, 0, 0]));
      H.add(m(G.sphereLo, hatC, [0, 0.31, -0.05], 0.045));
    } else if (hat === 'cowboy') {
      H.add(m(G.cyl, hatC, [0, 0.13, -0.01], [0.36, 0.015, 0.34]));
      H.add(m(G.cyl, hatC, [0, 0.22, -0.01], [0.17, 0.17, 0.16]));
      H.add(m(G.cyl, mat('#3a2a1a'), [0, 0.15, -0.01], [0.175, 0.03, 0.165]));
    } else if (hat === 'headband') {
      H.add(m(G.cyl, hatC, [0, 0.1, 0], [0.214, 0.04, 0.208], [-0.15, 0, 0]));
    }

    if (L.glasses) {
      const frame = mat('#1b1b1b', 0.3, 0.2);
      for (const x of [0.078, -0.078]) H.add(m(G.torus, frame, [x, 0.045, 0.215], [0.06, 0.06, 0.06]));
      H.add(m(G.cyl, frame, [0, 0.05, 0.215], [0.006, 0.04, 0.006], [0, 0, Math.PI / 2]));
    }

    if (L.headset !== 'none') {
      const hsM = mat(L.headset, 0.4, 0.3);
      if (hat !== 'cowboy') H.add(m(G.arc, hsM, [0, 0.03, -0.01], [0.235, 0.245, 0.235]));
      H.add(m(G.cyl, hsM, [0.215, 0, 0], [0.068, 0.045, 0.068], [0, 0, Math.PI / 2]));
      H.add(m(G.cyl, hsM, [-0.215, 0, 0], [0.068, 0.045, 0.068], [0, 0, Math.PI / 2]));
      H.add(m(G.cyl, mat('#3a3a3a'), [0.24, 0, 0], [0.05, 0.01, 0.05], [0, 0, Math.PI / 2]));
      H.add(m(G.cyl, hsM, [0.18, -0.08, 0.12], [0.008, 0.2, 0.008], [Math.PI / 2.6, 0, 0.5]));
      H.add(m(G.sphereLo, hsM, [0.09, -0.13, 0.2], 0.022));
    }
    this.spine.add(this.head);
  }

  get smoking() {
    return this.smokeT >= 0;
  }

  setSmoking(on: boolean) {
    if (on === this.smoking) return;
    this.smokeT = on ? 0 : -1;
    this.cig.visible = on;
  }

  private aimCig(k: number) {
    const c = this.cig;
    REST_Q.setFromEuler(REST_E);
    if (k < 0.01) {
      c.quaternion.copy(REST_Q);
      c.position.copy(REST_P);
      return;
    }
    this.root.updateMatrixWorld(true);
    const want = v1.set(-0.75, 0.15, 0.65).normalize().applyQuaternion(this.root.getWorldQuaternion(Q1));
    const parent = this.armR.b.getWorldQuaternion(Q2).invert();
    Q3.setFromUnitVectors(Z, want).premultiply(parent);
    c.quaternion.copy(REST_Q).slerp(Q3, k);
    const filter = v2.set(0, 0, 0.07).applyQuaternion(c.quaternion);
    c.position.set(0, -0.31, 0.02).add(filter).lerp(REST_P, 1 - k);
  }

  private smokeStep(dt: number, walking: boolean) {
    const prev = this.smokeT % SMOKE_CYCLE;
    this.smokeT += dt;
    const c = this.smokeT % SMOKE_CYCLE;
    const k = walking || this.pose === 'sit' ? 0 : dragCurve(c);
    if (this.pose !== 'sit') {
      const lerp = THREE.MathUtils.lerp;
      this.armR.a.rotation.set(lerp(walking ? this.armR.a.rotation.x : -0.25, -1.45, k), lerp(0, 0.4, k), lerp(-0.14, 0.35, k));
      this.armR.b.rotation.set(lerp(-1.25, -1.65, k), 0, 0);
    }
    this.aimCig(k);
    const glow = k > 0.9 ? 1.4 : 0.3;
    this.ember.emissiveIntensity += (glow - this.ember.emissiveIntensity) * Math.min(1, dt * 6);
    if (!this.onSmoke) return;
    this.wispIn -= dt;
    const exhale = prev < EXHALE_AT && c >= EXHALE_AT;
    if (this.wispIn > 0 && !exhale) return;
    this.root.updateMatrixWorld(true);
    if (this.wispIn <= 0) {
      this.wispIn = 0.16 + Math.random() * 0.12;
      this.onSmoke('wisp', this.cig.localToWorld(v1.set(0, 0, 0.09)), v2.set(0, 1, 0));
    }
    if (exhale) {
      const dir = v2.set(0, 0.25, 1).applyQuaternion(this.root.quaternion).normalize();
      this.onSmoke('exhale', this.head.localToWorld(v1.set(0, -0.1, 0.3)), dir);
    }
  }

  update(dt: number, t: number) {
    const ph = t + this.phase;
    const L = this.look;
    this.chest.scale.y = 1 + Math.sin(ph * 1.6) * 0.015;

    let lean = 0;
    if (this.pose === 'sit') {
      this.hips.position.y = SEAT_HEIGHT;
      this.legL.a.rotation.set(-Math.PI / 2, 0, 0.06);
      this.legR.a.rotation.set(-Math.PI / 2, 0, -0.06);
      this.legL.b.rotation.x = this.legR.b.rotation.x = Math.PI / 2 - 0.1;
      if (this.typing) {
        this.armL.a.rotation.set(-0.42, 0, 0.12);
        this.armR.a.rotation.set(-0.42, 0, -0.12);
        this.armL.b.rotation.set(-1.15 + Math.max(0, Math.sin(ph * 17)) * 0.12, 0, 0.35);
        this.armR.b.rotation.set(-1.15 + Math.max(0, Math.sin(ph * 15 + 1)) * 0.12, 0, -0.35);
      } else {
        this.armL.a.rotation.set(-0.3, 0, 0.16);
        this.armR.a.rotation.set(-0.3, 0, -0.16);
        this.armL.b.rotation.set(-1.0 + Math.sin(ph * 0.7) * 0.04, 0, 0.3);
        this.armR.b.rotation.set(-1.0, 0, -0.3);
      }
      this.body.position.y = 0;
    } else {
      const moving = this.pose === 'walk' || this.pose === 'run';
      const run = this.pose === 'run';
      const cadence = (run ? 11 : 7.5) * this.speed;
      if (moving) this.stride += dt * cadence;
      const s = moving ? Math.sin(this.stride) : 0;
      const amp = run ? 0.75 : 0.5;
      this.hips.position.y = HIP_Y + (moving ? Math.abs(Math.cos(this.stride)) * (run ? 0.05 : 0.025) : 0);
      this.legL.a.rotation.set(s * amp, 0, 0.03);
      this.legR.a.rotation.set(-s * amp, 0, -0.03);
      this.legL.b.rotation.x = moving ? Math.max(0, -Math.sin(this.stride + 0.6)) * (run ? 1.3 : 0.8) : 0;
      this.legR.b.rotation.x = moving ? Math.max(0, Math.sin(this.stride + 0.6)) * (run ? 1.3 : 0.8) : 0;
      const idle = moving ? 0 : Math.sin(ph * 1.2) * 0.03;
      this.armL.a.rotation.set(-s * amp * 0.9 + idle, 0, 0.14);
      this.armR.a.rotation.set(s * amp * 0.9 - idle, 0, -0.14);
      this.armL.b.rotation.set(run ? -1.1 : -0.25 - Math.max(0, s) * 0.3, 0, 0);
      this.armR.b.rotation.set(run ? -1.1 : -0.25 - Math.max(0, -s) * 0.3, 0, 0);
      this.spine.rotation.y = s * 0.12;
      lean = run ? 0.18 : moving ? 0.05 : 0;
    }
    this.spine.rotation.x = lean;
    if (this.smokeT >= 0) this.smokeStep(dt, this.pose === 'walk' || this.pose === 'run');

    const k = 1 - Math.exp(-dt * 6);
    this.yaw += (this.lookYaw + Math.sin(ph * 0.4) * 0.05 - this.yaw) * k;
    this.pitch += (this.lookPitch + Math.sin(ph * 0.53) * 0.03 - this.pitch) * k;
    this.head.rotation.set(this.pitch - lean, this.yaw - this.spine.rotation.y, Math.sin(ph * 0.3) * 0.03);

    let target = this.talk;
    if (this.talking) target = Math.max(target, 0.25 + 0.75 * Math.abs(Math.sin(ph * 11) * Math.sin(ph * 4.3)));
    this.open += (target - this.open) * (1 - Math.exp(-dt * 18));
    this.mouth.scale.y = 0.012 + this.open * 0.05;
    this.mouth.position.y = -0.115 - this.open * 0.02;

    this.blinkIn -= dt;
    const blink = this.blinkIn < 0 ? 0.1 : 1;
    if (this.blinkIn < -0.12) this.blinkIn = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = blink * L.eyes;

    const browY = this.mood === 'angry' ? 0.11 : this.mood === 'scared' ? 0.14 : 0.125;
    const tilt = this.mood === 'angry' ? 0.35 : this.mood === 'scared' ? -0.25 : 0.1;
    this.brows[0].position.y = this.brows[1].position.y = browY;
    this.brows[0].rotation.z = -tilt;
    this.brows[1].rotation.z = tilt;
  }
}
