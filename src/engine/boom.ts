import * as THREE from 'three';

interface Bit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  life: number;
  kind: 'fire' | 'smoke' | 'paper';
  size: number;
}

const FIRE = ['#fff3b0', '#ffd23f', '#ff9f1c', '#ff5a1f'];

export class Booms {
  readonly group = new THREE.Group();
  private bits: Bit[] = [];
  private flashes: { light: THREE.PointLight; age: number }[] = [];
  private ball = new THREE.IcosahedronGeometry(1, 1);
  private sheet = new THREE.PlaneGeometry(0.21, 0.28);

  spawn(at: THREE.Vector3) {
    const c = at.clone().setY(at.y + 0.9);
    for (let i = 0; i < 26; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize();
      const mat = new THREE.MeshToonMaterial({ color: FIRE[Math.min(3, Math.floor((i / 26) * 4 + Math.random()))], emissive: '#ff7a00', emissiveIntensity: 0.6, transparent: true });
      this.add('fire', mat, this.ball, c.clone().addScaledVector(dir, 0.15), dir.multiplyScalar(2.0 + Math.random() * 1.8), 0.6 + Math.random() * 0.45, 0.2 + Math.random() * 0.22);
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0.35 + Math.random() * 0.8, Math.sin(a));
      const mat = new THREE.MeshToonMaterial({ color: Math.random() < 0.5 ? '#5e5e68' : '#83838e', transparent: true });
      this.add('smoke', mat, this.ball, c.clone(), dir.multiplyScalar(1.1 + Math.random() * 1.2), 1.8 + Math.random() * 1.0, 0.22 + Math.random() * 0.2);
    }
    for (let i = 0; i < 30; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, 0.8 + Math.random(), Math.random() - 0.5).normalize();
      const mat = new THREE.MeshToonMaterial({ color: Math.random() < 0.8 ? '#f5f3ee' : '#ffe9a8', side: THREE.DoubleSide });
      this.add('paper', mat, this.sheet, c.clone(), dir.multiplyScalar(3 + Math.random() * 3.5), 3.5 + Math.random() * 1.5, 1);
    }
    const light = new THREE.PointLight('#ffb347', 60, 14, 1.6);
    light.position.copy(c);
    this.group.add(light);
    this.flashes.push({ light, age: 0 });
  }

  private add(kind: Bit['kind'], mat: THREE.Material, geo: THREE.BufferGeometry, at: THREE.Vector3, vel: THREE.Vector3, life: number, size: number) {
    mat.userData.outlineParameters = { visible: kind === 'paper' };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(at);
    mesh.scale.setScalar(kind === 'paper' ? 1 : size * 0.3);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.group.add(mesh);
    this.bits.push({ mesh, vel, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(12), age: 0, life, kind, size });
  }

  update(dt: number) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.age += dt;
      const k = b.age / b.life;
      const m = b.mesh.material as THREE.MeshToonMaterial;
      if (k >= 1) {
        this.group.remove(b.mesh);
        m.dispose();
        this.bits.splice(i, 1);
        continue;
      }
      if (b.kind === 'paper') {
        b.vel.y -= 9.8 * dt * (b.vel.y > 0 ? 1 : 0.12);
        b.vel.x *= 1 - dt * 1.4;
        b.vel.z *= 1 - dt * 1.4;
        if (b.vel.y < 0) b.vel.y = Math.max(b.vel.y, -0.7);
        b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.position.x += Math.sin(b.age * 5 + b.spin.x) * dt * 0.4;
        if (b.mesh.position.y < 0.02) {
          b.mesh.position.y = 0.02;
          b.vel.set(0, 0, 0);
          b.spin.set(0, 0, 0);
          b.mesh.rotation.set(-Math.PI / 2, 0, b.mesh.rotation.z);
        }
        b.mesh.rotation.x += b.spin.x * dt;
        b.mesh.rotation.y += b.spin.y * dt;
        b.mesh.rotation.z += b.spin.z * dt;
        m.opacity = 1;
        if (k > 0.85) (m.transparent = true), (m.opacity = (1 - k) / 0.15);
        continue;
      }
      b.vel.multiplyScalar(1 - dt * (b.kind === 'fire' ? 3.2 : 1.6));
      b.vel.y += dt * (b.kind === 'fire' ? 1.2 : 0.5);
      b.mesh.position.addScaledVector(b.vel, dt);
      const grow = b.kind === 'fire' ? 0.3 + Math.sqrt(k) * 1.2 : 0.4 + k * 1.8;
      b.mesh.scale.setScalar(b.size * grow);
      m.opacity = b.kind === 'fire' ? (k < 0.6 ? 1 : (1 - k) / 0.4) : k < 0.55 ? 0.95 : (0.95 * (1 - k)) / 0.45;
      m.depthWrite = m.opacity > 0.9;
      if (b.kind === 'fire') m.emissiveIntensity = 0.9 * (1 - k);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      f.light.intensity = 60 * Math.max(0, 1 - f.age / 0.6);
      if (f.age > 0.6) {
        this.group.remove(f.light);
        this.flashes.splice(i, 1);
      }
    }
  }
}
