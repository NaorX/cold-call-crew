// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import { toonMat } from './office';

export const SMOKE_CYCLE = 6;
export const EXHALE_AT = 2.5;

export function dragCurve(c: number): number {
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (c < 0.7) return ease(c / 0.7);
  if (c < 1.7) return 1;
  if (c < 2.3) return 1 - ease((c - 1.7) / 0.6);
  return 0;
}

export function cigarette(): { group: THREE.Group; ember: THREE.MeshToonMaterial } {
  const group = new THREE.Group();
  const part = (len: number, r: number, mat: THREE.Material, z: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8).rotateX(Math.PI / 2), mat);
    m.position.z = z;
    group.add(m);
  };
  part(0.12, 0.016, toonMat({ color: '#fffaf3' }), 0.01);
  part(0.045, 0.017, toonMat({ color: '#e9a03b' }), -0.07);
  const ember = toonMat({ color: '#ff6a2b', emissive: '#ff3b00', emissiveIntensity: 0.3 });
  part(0.02, 0.017, ember, 0.078);
  return { group, ember };
}

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size0: number;
  size1: number;
  alpha: number;
  spin: number;
}

const MAX = 160;
const tmp = new THREE.Vector3();

export class Smoke {
  readonly group = new THREE.Group();
  private live: Puff[] = [];
  private free: Puff[] = [];
  private geo = new THREE.PlaneGeometry(1, 1);
  private tex = puffTexture();

  wisp(at: THREE.Vector3) {
    tmp.set((Math.random() - 0.5) * 0.06, 0.3 + Math.random() * 0.1, (Math.random() - 0.5) * 0.06);
    this.emit(at, tmp, 0.06, 0.4, 2.4, 0.5);
  }

  exhale(at: THREE.Vector3, dir: THREE.Vector3) {
    for (let i = 0; i < 8; i++) {
      tmp.copy(dir).multiplyScalar(0.95 - i * 0.08);
      tmp.x += (Math.random() - 0.5) * 0.15;
      tmp.y += 0.12 + (Math.random() - 0.5) * 0.1;
      tmp.z += (Math.random() - 0.5) * 0.15;
      this.emit(at.clone().addScaledVector(dir, i * 0.03), tmp, 0.12, 0.75 + Math.random() * 0.35, 2.6 + Math.random() * 0.8, 0.6);
    }
  }

  private emit(at: THREE.Vector3, vel: THREE.Vector3, size0: number, size1: number, life: number, alpha: number) {
    let p = this.free.pop();
    if (!p) {
      if (this.live.length >= MAX) p = this.live.shift()!;
      else {
        const mat = new THREE.MeshBasicMaterial({ map: this.tex, color: '#dde2e8', transparent: true, depthWrite: false, opacity: 0 });
        mat.userData.outlineParameters = { visible: false };
        const mesh = new THREE.Mesh(this.geo, mat);
        mesh.renderOrder = 2;
        p = { mesh, vel: new THREE.Vector3(), age: 0, life: 1, size0: 0, size1: 0, alpha: 0, spin: 0 };
      }
    }
    p.mesh.position.copy(at);
    p.spin = Math.random() * Math.PI * 2;
    p.vel.copy(vel);
    p.age = 0;
    p.life = life;
    p.size0 = size0;
    p.size1 = size1;
    p.alpha = alpha;
    p.mesh.scale.setScalar(size0);
    p.mesh.material.opacity = 0;
    this.group.add(p.mesh);
    this.live.push(p);
  }

  update(dt: number, camera: THREE.Camera) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.group.remove(p.mesh);
        this.live.splice(i, 1);
        this.free.push(p);
        continue;
      }
      const k = p.age / p.life;
      p.vel.multiplyScalar(Math.exp(-dt * 1.1));
      p.vel.y += dt * 0.12;
      p.vel.x += dt * 0.06;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(p.size0 + (p.size1 - p.size0) * (1 - (1 - k) ** 2));
      p.mesh.material.opacity = p.alpha * Math.min(1, p.age * 8) * (1 - k) ** 1.5;
      p.mesh.quaternion.copy(camera.quaternion);
      p.mesh.rotateZ(p.spin + p.age * 0.3);
    }
  }
}
