// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import type { Collider } from './office';

const RADIUS = 0.3;
const WALK = 3.4;
const RUN = 6.2;
const JUMP_V = 5.2;
const GRAVITY = 16;
const LOOK = 0.0024;

export class PlayerController {
  pos = new THREE.Vector3();
  vy = 0;
  facing = Math.PI;
  moving = false;
  running = false;
  grounded = true;
  camYaw = 0;
  camPitch = 0.28;
  camDist = 2.6;
  firstPerson = false;
  onViewChange: ((firstPerson: boolean) => void) | null = null;
  enabled = true;
  private keys = new Set<string>();
  onInteract: (() => void) | null = null;
  onClick: (() => void) | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    public colliders: Collider[],
    private walls: THREE.Object3D[],
  ) {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyE' && !e.repeat) this.onInteract?.();
      if (e.code === 'KeyF' && !e.repeat) this.setFirstPerson(!this.firstPerson);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!this.locked) this.lock();
      else this.onClick?.();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.locked || !this.enabled) return;
      const clamp = (v: number) => THREE.MathUtils.clamp(v, -200, 200);
      this.camYaw -= clamp(e.movementX) * LOOK;
      this.camPitch = this.firstPerson ? THREE.MathUtils.clamp(this.camPitch + clamp(e.movementY) * LOOK, -1.3, 1.3) : THREE.MathUtils.clamp(this.camPitch + clamp(e.movementY) * LOOK, -0.35, 1.2);
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        if (this.firstPerson) {
          if (e.deltaY > 0) this.setFirstPerson(false);
        } else if (e.deltaY < 0 && this.camDist <= 1.3) this.setFirstPerson(true);
        else this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.004, 1.3, 5);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  setFirstPerson(on: boolean) {
    if (on === this.firstPerson) return;
    this.firstPerson = on;
    this.camPitch = on ? 0 : 0.28;
    if (!on) this.camDist = Math.max(this.camDist, 1.8);
    this.onViewChange?.(on);
  }

  get locked() {
    return document.pointerLockElement === this.dom;
  }
  lock() {
    try {
      const p = this.dom.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
    }
  }
  unlock() {
    if (this.locked) document.exitPointerLock();
  }
  holding(...codes: string[]) {
    return this.enabled && codes.some((c) => this.keys.has(c));
  }
  clearKeys() {
    this.keys.clear();
  }

  place(x: number, z: number, facing: number) {
    this.pos.set(x, 0, z);
    this.facing = facing;
    this.camYaw = facing + Math.PI;
    this.vy = 0;
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    let ix = 0;
    let iz = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    }
    this.moving = ix !== 0 || iz !== 0;
    this.running = this.moving && (k.has('ShiftLeft') || k.has('ShiftRight'));
    if (this.moving) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const dx = ix * cos + iz * sin;
      const dz = -ix * sin + iz * cos;
      const speed = this.running ? RUN : WALK;
      this.tryMove(this.pos.x + dx * speed * dt, this.pos.z);
      this.tryMove(this.pos.x, this.pos.z + dz * speed * dt);
      const want = this.firstPerson ? this.camYaw + Math.PI : Math.atan2(dx, dz);
      let diff = want - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 12);
    }
    if (this.enabled && k.has('Space') && this.grounded) {
      this.vy = JUMP_V;
      this.grounded = false;
    }
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vy = 0;
      this.grounded = true;
    }
  }

  private ray = new THREE.Raycaster();
  updateCamera(lerp = 0.3) {
    if (this.firstPerson) {
      const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      const eye = new THREE.Vector3(this.pos.x, this.pos.y + 1.62, this.pos.z).addScaledVector(fwd, 0.12);
      this.camera.position.copy(eye);
      const look = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), -Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
      this.camera.lookAt(eye.add(look));
      if (!this.moving) this.facing = this.camYaw + Math.PI;
      return;
    }
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z);
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    target.addScaledVector(right, 0.32);
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    let dist = this.camDist;
    this.ray.set(target, dir);
    this.ray.far = dist + 0.3;
    const hit = this.ray.intersectObjects(this.walls, false)[0];
    if (hit) dist = Math.max(0.4, hit.distance - 0.25);
    const cam = target.clone().addScaledVector(dir, dist);
    cam.y = THREE.MathUtils.clamp(cam.y, 0.4, 2.7);
    this.camera.position.lerp(cam, lerp);
    this.camera.lookAt(target);
  }

  private blocker(x: number, z: number): Collider | null {
    for (const c of this.colliders) {
      if (this.pos.y >= c.top - 0.05) continue;
      const nx = THREE.MathUtils.clamp(x, c.minX, c.maxX);
      const nz = THREE.MathUtils.clamp(z, c.minZ, c.maxZ);
      if ((x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS) {
        const cx = THREE.MathUtils.clamp(this.pos.x, c.minX, c.maxX);
        const cz = THREE.MathUtils.clamp(this.pos.z, c.minZ, c.maxZ);
        const was = (this.pos.x - cx) ** 2 + (this.pos.z - cz) ** 2;
        const now = (x - nx) ** 2 + (z - nz) ** 2;
        if (was < RADIUS * RADIUS && now > was) continue;
        return c;
      }
    }
    return null;
  }

  private tryMove(x: number, z: number) {
    if (!this.blocker(x, z)) {
      this.pos.x = x;
      this.pos.z = z;
      return;
    }
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    let free = 0;
    let blocked = 1;
    for (let i = 0; i < 10; i++) {
      const f = (free + blocked) / 2;
      if (this.blocker(this.pos.x + dx * f, this.pos.z + dz * f)) blocked = f;
      else free = f;
    }
    this.pos.x += dx * free;
    this.pos.z += dz * free;
  }
}

export function isTyping(e?: Event): boolean {
  const el = (e?.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
