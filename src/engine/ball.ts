// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import type { Hoop } from './office';

export const BALL_R = 0.12;
const G = 9.8;
const STEP = 1 / 120;

export interface Shot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  by?: string;
  at: number;
}

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8702a';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#2b1a10';
  g.lineWidth = 4;
  for (const x of [0, 64, 128, 192, 256]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, 64);
  g.lineTo(256, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Basketball {
  readonly mesh: THREE.Mesh;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  state: 'home' | 'held' | 'flying' | 'rest' = 'home';
  shot: Shot | null = null;
  private acc = 0;
  private scoredThis = false;
  private wasAbove = false;
  private restFor = 0;
  onScore: ((shot: Shot) => void) | null = null;
  onBounce: ((k: number) => void) | null = null;
  onRim: (() => void) | null = null;

  constructor(private hoop: Hoop) {
    const mat = new THREE.MeshToonMaterial({ map: ballTexture() });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), mat);
    this.mesh.castShadow = true;
    this.goHome();
  }

  goHome() {
    this.state = 'home';
    this.shot = null;
    this.pos.copy(this.hoop.home);
    this.vel.set(0, 0, 0);
    this.mesh.position.copy(this.pos);
  }

  hold(at: THREE.Vector3) {
    this.state = 'held';
    this.shot = null;
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.mesh.position.copy(at);
  }

  throw(shot: Shot) {
    this.shot = shot;
    this.state = 'flying';
    this.pos.set(shot.x, shot.y, shot.z);
    this.vel.set(shot.vx, shot.vy, shot.vz);
    this.scoredThis = false;
    this.wasAbove = this.pos.y > this.hoop.rim.y;
    this.restFor = 0;
    this.acc = 0;
    const behind = Math.min(6, Math.max(0, (Date.now() - shot.at) / 1000));
    const quiet = { score: this.onScore, bounce: this.onBounce, rim: this.onRim };
    this.onBounce = this.onRim = null;
    this.onScore = null;
    for (let t = 0; t < behind; t += STEP) this.step(STEP);
    this.onScore = quiet.score;
    this.onBounce = quiet.bounce;
    this.onRim = quiet.rim;
  }

  update(dt: number) {
    if (this.state === 'flying' || this.state === 'rest') {
      this.acc += Math.min(dt, 0.1);
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.step(STEP);
      }
      if (this.shot && Date.now() - this.shot.at > 12_000) this.goHome();
    }
    this.mesh.position.copy(this.pos);
    if (this.state !== 'held') this.mesh.rotation.x += this.vel.length() * dt * 4;
  }

  private step(dt: number) {
    const p = this.pos;
    const v = this.vel;
    const h = this.hoop;
    const r = BALL_R;
    v.y -= G * dt;
    v.multiplyScalar(1 - 0.05 * dt);
    p.addScaledVector(v, dt);

    if (p.y < r) {
      p.y = r;
      if (v.y < -0.6) this.onBounce?.(Math.min(1, -v.y / 6));
      v.y = Math.abs(v.y) < 0.6 ? 0 : -v.y * 0.68;
      v.x *= 0.92;
      v.z *= 0.92;
    }
    if (p.y <= r + 0.001 && v.y === 0) {
      v.x *= 1 - 1.2 * dt;
      v.z *= 1 - 1.2 * dt;
    }
    const R = h.room;
    if (p.x < R.x0 + r) ((p.x = R.x0 + r), (v.x = Math.abs(v.x) * 0.6));
    if (p.x > R.x1 - r) ((p.x = R.x1 - r), (v.x = -Math.abs(v.x) * 0.6));
    if (p.z < R.z0 + r) ((p.z = R.z0 + r), (v.z = Math.abs(v.z) * 0.6));
    if (p.z > R.z1 - r) ((p.z = R.z1 - r), (v.z = -Math.abs(v.z) * 0.6));
    if (p.y > R.y1 - r) ((p.y = R.y1 - r), (v.y = -Math.abs(v.y) * 0.5));
    if (p.z > h.boardZ[0] - r && p.z < h.boardZ[1] + r && p.y > h.boardY[0] - r && p.y < h.boardY[1] + r && p.x > h.boardX - r && p.x < h.boardX + 0.1) {
      p.x = h.boardX - r;
      if (v.x > 0) v.x = -v.x * 0.55;
      this.onRim?.();
    }
    const dx = p.x - h.rim.x;
    const dz = p.z - h.rim.z;
    const flat = Math.hypot(dx, dz);
    if (flat > 1e-4) {
      const cx = h.rim.x + (dx / flat) * h.rimR;
      const cz = h.rim.z + (dz / flat) * h.rimR;
      const ox = p.x - cx;
      const oy = p.y - h.rim.y;
      const oz = p.z - cz;
      const d = Math.hypot(ox, oy, oz);
      const min = r + 0.018;
      if (d < min && d > 1e-4) {
        const nx = ox / d;
        const ny = oy / d;
        const nz = oz / d;
        p.set(cx + nx * min, h.rim.y + ny * min, cz + nz * min);
        const vn = v.x * nx + v.y * ny + v.z * nz;
        if (vn < 0) {
          v.x -= 1.5 * vn * nx;
          v.y -= 1.5 * vn * ny;
          v.z -= 1.5 * vn * nz;
          if (vn < -0.8) this.onRim?.();
        }
      }
    }
    const above = p.y > h.rim.y;
    if (this.wasAbove && !above && flat < h.rimR - r * 0.4 && v.y < 0 && !this.scoredThis && this.shot) {
      this.scoredThis = true;
      v.x *= 0.3;
      v.z *= 0.3;
      this.onScore?.(this.shot);
    }
    this.wasAbove = above;
    if (p.y <= r + 0.001 && v.lengthSq() < 0.02) {
      this.restFor += dt;
      if (this.restFor > 0.5) {
        this.state = 'rest';
        v.set(0, 0, 0);
      }
    } else this.restFor = 0;
  }
}

export function idealThrow(from: THREE.Vector3, rim: THREE.Vector3, lift = 0.9, ceiling = 3.95): THREE.Vector3 | null {
  const flat = new THREE.Vector3(rim.x - from.x, 0, rim.z - from.z);
  const D = flat.length();
  if (D < 0.3) return null;
  const apex = Math.min(ceiling, Math.max(rim.y + lift, from.y + 0.6));
  const vy = Math.sqrt(2 * G * (apex - from.y)) * 1.012;
  const reach = (vh: number) => {
    let x = 0;
    let y = from.y;
    let u = vh;
    let w = vy;
    for (let i = 0; i < 2000; i++) {
      w -= G * STEP;
      u *= 1 - 0.05 * STEP;
      w *= 1 - 0.05 * STEP;
      x += u * STEP;
      const ny = y + w * STEP;
      if (w < 0 && ny <= rim.y + 0.02) return x;
      y = ny;
    }
    return x;
  };
  let lo = 0.2;
  let hi = 20;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) < D) lo = mid;
    else hi = mid;
  }
  const vh = (lo + hi) / 2;
  flat.normalize();
  return new THREE.Vector3(flat.x * vh, vy, flat.z * vh);
}
