// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { buildOffice, type Office, type DeskSlot } from './office';
import { Environment, type Weather } from './environment';
import { Smoke, cigarette, dragCurve, SMOKE_CYCLE } from './smoke';
import { Booms } from './boom';
import { Avatar } from './character';
import { PlayerController } from './player';
import { randomLook } from '../game/personas';
import type { Look } from '../game/types';
import { webcamTargets } from '../os/webcam';

export type Mode = 'menu' | 'creator' | 'play' | 'seated' | 'screen' | 'laptop' | 'arcade' | 'meeting';
export type MeetingShot = 'wide' | 'slide' | 'boss1';

export interface RemotePose {
  x: number;
  z: number;
  f: number;
  a: 'stand' | 'walk' | 'run' | 'sit';
  s: number | null;
  y?: number;
  sm?: boolean;
}

interface Remote {
  avatar: Avatar;
  target: RemotePose;
  name: string;
  tag: THREE.Sprite;
  lookKey: string;
}

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  label: () => string | null;
  act: () => void;
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 1, 0.15, 700);
  webcamCam = new THREE.PerspectiveCamera(66, 4 / 3, 0.05, 30);
  office: Office;
  env!: Environment;
  private ink: OutlineEffect | null = null;
  private raidTint: HTMLDivElement;
  mode: Mode = 'menu';
  private clock = new THREE.Clock();
  t = 0;
  jukeboxBeat = 0;
  camOverride: THREE.Object3D | null = null;
  private tween: { from: THREE.Vector3; fromLook: THREE.Vector3; t: number; dur: number; done?: () => void } | null = null;
  private camLook = new THREE.Vector3(0, 1.2, -5);

  meeting: { seats: Map<string, number>; shot: MeetingShot; bossTalking: boolean; glance: number } | null = null;
  slidesOn = false;
  meetingPaint: (() => void) | null = null;

  me: Avatar;
  player: PlayerController;
  seat: number | null = null;
  occupied = new Set<number>();
  remotes = new Map<string, Remote>();
  npcs: { avatar: Avatar; typingUntil: number; talkingUntil: number }[] = [];
  boss: Avatar;
  private bossLeg = 0;
  private bossPos = new THREE.Vector3();
  interactables: Interactable[] = [];
  focus: Interactable | null = null;

  myScreenTex: THREE.CanvasTexture;
  private myScreenCanvas: HTMLCanvasElement;
  raid = 0;
  outage = false;
  frozen = false;
  webcamTarget: HTMLCanvasElement | null = null;
  private webcamAcc = 0;
  private saverTimer = 0;
  shiftMinutes = 0;
  creatorSpin = 0;
  creatorDrag = 0;
  creatorZoom = 0;
  private zoomS = 0;
  quality: 'low' | 'medium' | 'high';
  onFrame: (dt: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement, quality: 'low' | 'medium' | 'high', myLook: Look) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = new THREE.Fog('#bfe3ff', 55, 190);
    this.raidTint = document.createElement('div');
    Object.assign(this.raidTint.style, { position: 'fixed', inset: '0', pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(255,40,40,0.05), rgba(255,20,20,0.45))', opacity: '0', zIndex: '1' });
    canvas.after(this.raidTint);
    this.webcamCam.layers.enable(1);

    this.office = buildOffice(quality);
    this.scene.add(this.office.root);
    this.env = new Environment(this.scene, quality, this.office.footprint, this.office.night);
    this.env.update(0, 0, this.camera, false);

    this.myScreenCanvas = document.createElement('canvas');
    this.myScreenCanvas.width = 256;
    this.myScreenCanvas.height = 160;
    this.myScreenTex = new THREE.CanvasTexture(this.myScreenCanvas);
    this.myScreenTex.colorSpace = THREE.SRGBColorSpace;

    this.me = new Avatar(myLook);
    this.me.onSmoke = (kind, at, dir) => {
      if (!(this.mode === 'play' && this.player.firstPerson)) this.smokeTo(kind, at, dir);
    };
    this.scene.add(this.smoke.group, this.booms.group, this.camera);
    this.fpCig.group.visible = false;
    this.fpCig.group.traverse((o) => (o.renderOrder = 5));
    this.camera.add(this.fpCig.group);
    this.scene.add(this.me.root);
    this.player = new PlayerController(this.camera, canvas, this.office.colliders, this.office.walls);
    this.player.enabled = false;
    const sp = this.office.spawn;
    this.player.place(sp.x, sp.z, Math.PI);
    this.me.root.position.copy(this.player.pos);

    const npcDesks = this.office.desks.filter((d) => d.npc);
    const count = quality === 'low' ? 10 : quality === 'medium' ? 18 : 28;
    for (const d of npcDesks.sort(() => Math.random() - 0.5).slice(0, count)) {
      const a = new Avatar(randomLook(Math.random() < 0.5 ? 'f' : 'm'));
      a.pose = 'sit';
      a.root.position.copy(d.chair);
      a.root.rotation.y = d.rot;
      a.typing = Math.random() < 0.6;
      this.scene.add(a.root);
      this.npcs.push({ avatar: a, typingUntil: 0, talkingUntil: 0 });
    }
    this.boss = new Avatar({ skin: '#e8b08a', hair: 'side', hairColor: '#1d1612', facial: 'mustache', glasses: true, shirt: '#e8e8e0', top: 'shirtTie', body: 'chubby', pants: '#2b2b33', headset: 'none' });
    this.boss.pose = 'walk';
    this.boss.speed = 0.8;
    this.bossPos.copy(this.office.bossPath[0]);
    this.scene.add(this.boss.root);

    this.setupPost();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.drawMyScreen('boot');
    this.updateBoards({ day: 1, quota: 600, team: 0, phase: 'lobby', crew: [] });
  }

  setupPost() {
    if (this.quality === 'low') return;
    this.ink = new OutlineEffect(this.renderer, { defaultThickness: 0.0032, defaultColor: [0.17, 0.18, 0.26] });
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const flat = m.geometry instanceof THREE.PlaneGeometry || m.geometry instanceof THREE.CircleGeometry;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material])
        if (flat || mat instanceof THREE.MeshBasicMaterial || mat.transparent) mat.userData.outlineParameters = { visible: false };
    });
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  get desk(): DeskSlot | null {
    return this.seat === null ? null : this.office.desks[this.seat];
  }

  setMyLook(look: Look) {
    this.me.setLook(look);
  }

  readonly smoke = new Smoke();
  readonly booms = new Booms();
  private fpCig = cigarette();
  private fpSmokeT = 0;
  get smoking() {
    return this.me.smoking;
  }
  setSmoking(on: boolean) {
    this.me.setSmoking(on);
    this.fpSmokeT = 0;
  }
  private smokeTo = (kind: 'wisp' | 'exhale', at: THREE.Vector3, dir: THREE.Vector3) => (kind === 'wisp' ? this.smoke.wisp(at) : this.smoke.exhale(at, dir));

  private updateFirstPersonCig(dt: number) {
    const fp = this.mode === 'play' && this.player.firstPerson;
    const on = fp && this.me.smoking;
    this.fpCig.group.visible = on;
    if (!on) return;
    const prev = this.fpSmokeT % SMOKE_CYCLE;
    this.fpSmokeT += dt;
    const c = this.fpSmokeT % SMOKE_CYCLE;
    const k = this.player.moving ? 0 : dragCurve(c);
    const g = this.fpCig.group;
    g.position.set(THREE.MathUtils.lerp(0.2, 0.04, k), THREE.MathUtils.lerp(-0.2, -0.09, k), THREE.MathUtils.lerp(-0.42, -0.22, k));
    g.rotation.set(THREE.MathUtils.lerp(0.5, 0.1, k), THREE.MathUtils.lerp(0.5, 0.9, k), 0);
    this.fpCig.ember.emissiveIntensity = k > 0.9 ? 1.4 : 0.3;
    if (Math.random() < dt * 5) this.smoke.wisp(g.localToWorld(new THREE.Vector3(0, 0, 0.09)));
    if (prev < 2.5 && c >= 2.5) this.smoke.exhale(this.camera.localToWorld(new THREE.Vector3(0, -0.12, -0.3)), this.camera.getWorldDirection(new THREE.Vector3()).setY(0.1).normalize());
  }

  setSky(hour: number, weather: Weather) {
    this.env.set(hour, weather);
  }

  private ghostMat = (() => {
    const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    m.userData.outlineParameters = { visible: false };
    return m;
  })();
  private ghostOf = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private ghosted = false;
  private ghost(on: boolean) {
    if (!on && !this.ghosted) return;
    this.ghosted = on;
    this.me.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (on && m.material !== this.ghostMat) {
        this.ghostOf.set(m, m.material);
        m.material = this.ghostMat;
      } else if (!on && m.material === this.ghostMat) m.material = this.ghostOf.get(m) ?? m.material;
    });
  }

  setMode(mode: Mode, done?: () => void, dur = 0.8) {
    const prev = this.mode;
    this.mode = mode;
    this.player.enabled = mode === 'play';
    if (mode !== 'play') this.player.unlock();
    this.tween = { from: this.camera.position.clone(), fromLook: this.camLook.clone(), t: 0, dur: prev === mode ? 0.01 : dur, done };
    if (mode === 'creator') {
      this.me.root.position.copy(this.office.creatorSpot);
      this.me.pose = 'stand';
      this.creatorSpin = 0;
      this.creatorDrag = 0;
    }
    if (mode === 'menu') {
      this.me.root.position.copy(this.player.pos);
    }
  }

  spawn() {
    const sp = this.office.spawn;
    this.seat = null;
    this.me.pose = 'stand';
    this.player.place(sp.x + (Math.random() - 0.5) * 1.5, sp.z, Math.PI);
    this.player.camPitch = 0.28;
    this.syncMeToPlayer();
  }

  private syncMeToPlayer() {
    this.me.root.position.copy(this.player.pos);
    this.me.root.rotation.y = this.player.facing;
  }

  sitAt(index: number) {
    const d = this.office.desks[index];
    if (!d) return;
    this.seat = index;
    this.me.pose = 'sit';
    this.me.root.position.copy(d.chair);
    this.me.root.rotation.y = d.rot;
    for (const slot of this.office.desks) {
      const m = slot.screen.material as THREE.MeshBasicMaterial;
      if (slot === d) m.map = this.myScreenTex;
      else if (m.map === this.myScreenTex) m.map = this.office.savers[slot.index % 4].texture;
      m.needsUpdate = true;
    }
    this.setMode('seated');
  }

  standUp() {
    const d = this.desk;
    if (!d) return;
    const fwd = new THREE.Vector3(Math.sin(d.rot), 0, Math.cos(d.rot));
    this.player.place(d.chair.x - fwd.x * 0.8, d.chair.z - fwd.z * 0.8, d.rot + Math.PI);
    this.seat = null;
    this.me.pose = 'stand';
    this.syncMeToPlayer();
    this.setMode('play', undefined, 0.5);
  }

  startMeeting(order: string[], meId: string) {
    const seats = new Map<string, number>();
    order.forEach((id, i) => i < this.office.meeting.seats.length && seats.set(id, i));
    if (!seats.has(meId)) seats.set(meId, Math.min(seats.size, this.office.meeting.seats.length - 1));
    seats.set('me', seats.get(meId)!);
    this.meeting = { seats, shot: 'wide', bossTalking: false, glance: 0 };
    this.seat = null;
    const mine = this.office.meeting.seats[seats.get(meId)!];
    this.me.pose = 'sit';
    this.me.typing = false;
    this.me.root.position.copy(mine.pos);
    this.me.root.rotation.y = mine.rot;
    this.setMode('meeting', undefined, 0.01);
  }

  blast(id: string | null, meId: string) {
    const r = id && id !== meId ? this.remotes.get(id) : null;
    const at = r ? r.avatar.root.position.clone() : id === meId ? this.me.root.position.clone() : null;
    if (at) this.booms.spawn(at);
    return !!at;
  }

  meetingShot(shot: MeetingShot, dur = 1.1) {
    if (!this.meeting || this.meeting.shot === shot) return;
    this.meeting.shot = shot;
    this.tween = { from: this.camera.position.clone(), fromLook: this.camLook.clone(), t: 0, dur };
  }

  endMeeting() {
    if (!this.meeting) return;
    const mine = this.office.meeting.seats[this.meeting.seats.get('me') ?? 0] || this.office.meeting.seats[0];
    this.meeting = null;
    this.slidesOn = false;
    this.meetingPaint = null;
    this.me.pose = 'stand';
    const p = this.me.root.position;
    const fwd = new THREE.Vector3(Math.sin(mine.rot), 0, Math.cos(mine.rot));
    this.player.place(p.x - fwd.x * 0.75, p.z - fwd.z * 0.75, mine.rot + Math.PI);
    this.syncMeToPlayer();
    this.setMode('play', undefined, 0.9);
  }

  private meetingSit(a: Avatar, seat: number, dt: number) {
    const s = this.office.meeting.seats[seat];
    a.root.position.set(s.pos.x, 0, s.pos.z);
    a.root.rotation.y = s.rot;
    a.pose = 'sit';
    a.typing = false;
    const toScreen = Math.abs(s.rot) > 1.5 ? 0.6 : -0.6;
    const want = this.meeting!.shot === 'boss1' ? toScreen * 0.8 : toScreen;
    a.lookYaw += (want - a.lookYaw) * Math.min(1, dt * 3);
    a.lookPitch = 0.04;
  }

  private goal(): [THREE.Vector3, THREE.Vector3] {
    const t = this.t;
    switch (this.mode) {
      case 'menu':
        return [new THREE.Vector3(Math.sin(t * 0.05) * 2.4 - 1, 1.7 + Math.sin(t * 0.13) * 0.08, 2.8), new THREE.Vector3(Math.sin(t * 0.07 + 1) * 3, 1.05, -8)];
      case 'creator': {
        const a = this.me.root.position;
        this.zoomS += (this.creatorZoom - this.zoomS) * 0.08;
        const z = this.zoomS;
        const pos = new THREE.Vector3(a.x + 0.55 - 0.35 * z, 1.15 + 0.45 * z, a.z - 2.7 + 1.65 * z);
        const look = new THREE.Vector3(a.x + 0.55 - 0.35 * z, 0.95 + 0.62 * z, a.z);
        return [pos, look];
      }
      case 'seated': {
        const d = this.desk!;
        const fwd = new THREE.Vector3(Math.sin(d.rot), 0, Math.cos(d.rot));
        const right = new THREE.Vector3(-Math.cos(d.rot), 0, Math.sin(d.rot));
        const pos = d.chair.clone().addScaledVector(fwd, -0.75).addScaledVector(right, 0.6);
        pos.y = 1.85;
        return [pos, d.screenCenter.clone().addScaledVector(right, 0.12).add(new THREE.Vector3(0, -0.12, 0))];
      }
      case 'screen': {
        const d = this.desk!;
        const fov = THREE.MathUtils.degToRad(this.camera.fov);
        const dist = Math.max(0.31 / 2 / Math.tan(fov / 2), 0.5 / 2 / (Math.tan(fov / 2) * this.camera.aspect)) * 0.93;
        return [d.screenCenter.clone().addScaledVector(d.screenNormal, dist), d.screenCenter.clone()];
      }
      case 'arcade':
        return [this.office.arcade.eye.clone(), this.office.arcade.look.clone()];
      case 'meeting': {
        const [e, l] = this.office.meeting[this.meeting?.shot || 'wide'];
        return [e.clone().add(new THREE.Vector3(Math.sin(t * 0.21) * 0.06, Math.sin(t * 0.17) * 0.03, Math.sin(t * 0.13) * 0.08)), l.clone()];
      }
      case 'laptop': {
        const scr = this.office.laptop.children[1].children[1];
        const c = scr.getWorldPosition(new THREE.Vector3());
        const n = scr.getWorldDirection(new THREE.Vector3());
        return [c.clone().addScaledVector(n, 0.34), c];
      }
      default: {
        const p = this.player.pos;
        return [this.camera.position.clone(), new THREE.Vector3(p.x, p.y + 1.45, p.z)];
      }
    }
  }

  syncCrew(players: { id: string; name: string; look: Look | null; pose?: RemotePose | null }[], meId: string) {
    const seen = new Set<string>();
    for (const p of players) {
      if (p.id === meId) continue;
      seen.add(p.id);
      let r = this.remotes.get(p.id);
      const look = p.look || randomLook('m');
      const key = JSON.stringify(look);
      if (!r) {
        const avatar = new Avatar(look);
        avatar.onSmoke = this.smokeTo;
        const tag = nameTag(p.name);
        avatar.root.add(tag);
        r = { avatar, target: p.pose || { x: this.office.spawn.x, z: this.office.spawn.z, f: Math.PI, a: 'stand', s: null }, name: p.name, tag, lookKey: key };
        avatar.root.position.set(r.target.x, 0, r.target.z);
        this.remotes.set(p.id, r);
        this.scene.add(avatar.root);
      } else if (r.lookKey !== key) {
        r.avatar.setLook(look);
        r.avatar.root.add(r.tag);
        r.lookKey = key;
      }
      if (p.pose) r.target = p.pose;
    }
    for (const [id, r] of this.remotes)
      if (!seen.has(id)) {
        this.scene.remove(r.avatar.root);
        this.remotes.delete(id);
      }
    this.refreshOccupied();
  }

  remotePose(id: string, pose: RemotePose | null, talking?: boolean) {
    const r = this.remotes.get(id);
    if (!r) return;
    if (pose) r.target = pose;
    if (talking !== undefined) r.avatar.talking = talking;
    this.refreshOccupied();
  }

  private refreshOccupied() {
    this.occupied.clear();
    for (const x of this.remotes.values()) if (x.target.s !== null && x.target.s !== undefined) this.occupied.add(x.target.s);
  }

  myPose(): RemotePose {
    if (this.seat !== null) {
      const d = this.desk!;
      return { x: +d.chair.x.toFixed(2), z: +d.chair.z.toFixed(2), f: +d.rot.toFixed(2), a: 'sit', s: this.seat };
    }
    const p = this.player;
    return { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), y: +p.pos.y.toFixed(2), f: +p.facing.toFixed(2), a: p.moving ? (p.running ? 'run' : 'walk') : 'stand', s: null, sm: this.me.smoking };
  }

  private findFocus(): Interactable | null {
    if (this.mode !== 'play') return null;
    const p = this.player.pos;
    const fx = Math.sin(this.player.facing);
    const fz = Math.cos(this.player.facing);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.interactables) {
      const dx = it.pos.x - p.x;
      const dz = it.pos.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > it.radius) continue;
      const dot = dist > 0.2 ? (dx * fx + dz * fz) / dist : 1;
      if (dot < -0.1) continue;
      const score = dist - dot * 0.6;
      if (score < bestScore && it.label()) {
        best = it;
        bestScore = score;
      }
    }
    return best;
  }

  pickSeated(clientX: number, clientY: number): 'monitor' | 'phone' | 'mug' | null {
    const d = this.desk;
    if (!d || this.mode !== 'seated') return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1), this.camera);
    const hits = ray.intersectObjects([d.screen, d.phone, d.mug], true);
    if (!hits.length) return null;
    let o: THREE.Object3D | null = hits[0].object;
    while (o) {
      if (o === d.screen) return 'monitor';
      if (o === d.phone) return 'phone';
      if (o === d.mug) return 'mug';
      o = o.parent;
    }
    return null;
  }

  drawMyScreen(state: 'boot' | 'desktop' | 'off' | 'raid') {
    const c = this.myScreenCanvas.getContext('2d')!;
    const W = 256;
    const H = 160;
    if (state === 'off') {
      c.fillStyle = '#050505';
      c.fillRect(0, 0, W, H);
    } else if (state === 'boot') {
      c.fillStyle = '#140d08';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#c8361d';
      c.beginPath();
      c.arc(W / 2, 64, 26, 0, 7);
      c.fill();
      c.fillStyle = '#ffe7b0';
      c.font = 'bold 20px Inter, sans-serif';
      c.textAlign = 'center';
      c.fillText('BoilerRoom OS', W / 2, 122);
      c.font = '11px Inter, sans-serif';
      c.fillText('click to log in', W / 2, 142);
    } else {
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#1d74c4');
      g.addColorStop(1, '#2f8ad8');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let i = -H; i < W; i += 14) {
        c.beginPath();
        c.moveTo(i, H);
        c.lineTo(i + H, 0);
        c.stroke();
      }
      ['#f39c12', '#e6b422', '#27ae60', '#5865f2', '#e67e22', '#16a085'].forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(10 + (i % 2) * 26, 10 + Math.floor(i / 2) * 28, 18, 18);
      });
      c.fillStyle = '#1b2633';
      c.fillRect(0, H - 14, W, 14);
      if (state === 'raid') {
        c.fillStyle = 'rgba(200,0,0,0.55)';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#fff';
        c.font = 'bold 26px Inter, sans-serif';
        c.textAlign = 'center';
        c.fillText('RAID!', W / 2, 90);
      }
    }
    this.myScreenTex.needsUpdate = true;
  }

  updateBoards(info: { day: number; quota: number; team: number; phase: string; crew: { name: string; today: number }[] }) {
    const { day, targets, tv, bossScreen } = this.office.boards;
    const INK = '#2b2d42';
    const font = (w: number, px: number) => `${w} ${px}px "Inter Variable", Inter, system-ui, sans-serif`;
    const round = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      c.beginPath();
      c.roundRect(x, y, w, h, r);
    };
    const pct = Math.min(1, info.team / Math.max(1, info.quota));
    day.draw((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = INK;
      c.font = font(800, 52);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`DAY ${info.day}`, w / 2, h / 2 + 2);
    });
    targets.draw((c, w, h) => {
      c.fillStyle = '#fbfbf8';
      c.fillRect(0, 0, w, h);
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      c.fillStyle = INK;
      c.font = font(800, 40);
      c.fillText('Today', 34, 62);
      c.fillStyle = '#8d99ae';
      c.font = font(600, 24);
      c.textAlign = 'right';
      c.fillText(`Day ${info.day}`, w - 34, 60);
      c.textAlign = 'left';
      const row = (label: string, value: string, y: number, color = INK) => {
        c.fillStyle = '#8d99ae';
        c.font = font(600, 24);
        c.fillText(label, 34, y);
        c.fillStyle = color;
        c.font = font(800, 40);
        c.textAlign = 'right';
        c.fillText(value, w - 34, y + 4);
        c.textAlign = 'left';
      };
      row('Quota', `$${info.quota.toLocaleString()}`, 130);
      row('Team so far', `$${info.team.toLocaleString()}`, 190, pct >= 1 ? '#2a9d8f' : '#e76f51');
      round(c, 34, 228, w - 68, 26, 13);
      c.fillStyle = '#edf0f4';
      c.fill();
      if (pct > 0) {
        round(c, 34, 228, Math.max(26, (w - 68) * pct), 26, 13);
        c.fillStyle = pct >= 1 ? '#2a9d8f' : '#4f7fe0';
        c.fill();
      }
      c.fillStyle = INK;
      c.font = font(700, 24);
      c.fillText(pct >= 1 ? 'Quota made. Keep going.' : `${Math.round(pct * 100)}% of quota`, 34, 296);
    });
    const board = (c: CanvasRenderingContext2D, w: number, h: number, title: string) => {
      c.fillStyle = '#1d2235';
      c.fillRect(0, 0, w, h);
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      c.fillStyle = '#ffffff';
      c.font = font(800, 30);
      c.fillText(title, 32, 52);
      c.fillStyle = '#8d99ae';
      c.font = font(600, 18);
      c.textAlign = 'right';
      c.fillText(`DAY ${info.day}`, w - 32, 50);
      const rows = info.crew.length ? info.crew : [{ name: 'Nobody yet', today: 0 }];
      rows.slice(0, 5).forEach((r, i) => {
        const y = 82 + i * 38;
        if (i % 2 === 0) {
          c.fillStyle = 'rgba(255,255,255,0.05)';
          c.fillRect(20, y, w - 40, 36);
        }
        c.textAlign = 'left';
        c.fillStyle = i === 0 ? '#ffd166' : '#8d99ae';
        c.font = font(800, 22);
        c.fillText(String(i + 1), 34, y + 26);
        c.fillStyle = '#ffffff';
        c.font = font(600, 22);
        c.fillText(r.name, 70, y + 26);
        c.textAlign = 'right';
        c.font = font(800, 22);
        c.fillText(`$${r.today.toLocaleString()}`, w - 34, y + 26);
      });
      round(c, 32, h - 34, w - 64, 12, 6);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fill();
      if (pct > 0) {
        round(c, 32, h - 34, Math.max(12, (w - 64) * pct), 12, 6);
        c.fillStyle = pct >= 1 ? '#2a9d8f' : '#5bc0eb';
        c.fill();
      }
    };
    tv.draw((c, w, h) => board(c, w, h, 'Top earners'));
    if (!this.slidesOn)
      bossScreen.draw((c, w, h) => {
        c.save();
        c.scale(w / 512, h / 288);
        board(c, 512, 288, 'Leaderboard');
        c.restore();
      });
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  step(n: number, dt = 1 / 30) {
    for (let i = 0; i < n; i++) this.frame(dt);
  }

  private frame(forced?: number) {
    const dt = forced ?? Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    const t = this.t;
    this.onFrame(dt);

    if (this.mode === 'play') {
      this.player.update(dt);
      this.syncMeToPlayer();
      this.me.pose = this.player.moving ? (this.player.running ? 'run' : 'walk') : 'stand';
      this.me.root.position.y = this.player.pos.y;
    } else if (this.mode === 'creator') {
      this.creatorSpin += dt * 0.35;
      this.me.root.rotation.y = Math.PI + Math.sin(this.creatorSpin) * 0.6 + this.creatorDrag;
    }
    if (this.mode === 'meeting' && this.meeting) {
      this.meetingSit(this.me, this.meeting.seats.get('me') ?? 0, dt);
    } else {
      this.me.lookYaw = 0;
      this.me.lookPitch = this.mode === 'screen' ? 0.12 : 0;
    }
    this.me.update(dt, t);

    if (this.mode === 'play' && !this.tween) {
      this.player.updateCamera();
      this.camLook.set(this.player.pos.x, this.player.pos.y + 1.45, this.player.pos.z);
    } else {
      const [gp, gl] = this.goal();
      if (this.mode === 'play') {
        const keep = this.camera.position.clone();
        this.player.updateCamera(1);
        gp.copy(this.camera.position);
        this.camera.position.copy(keep);
      }
      if (this.tween) {
        const tw = this.tween;
        tw.t += dt / tw.dur;
        const e = tw.t >= 1 ? 1 : tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
        this.camera.position.copy(tw.from.clone().lerp(gp, e));
        this.camLook.copy(tw.fromLook.clone().lerp(gl, e));
        if (tw.t >= 1) {
          this.tween = null;
          tw.done?.();
        }
      } else {
        this.camera.position.copy(gp);
        this.camLook.copy(gl);
      }
      this.camera.lookAt(this.camLook);
    }

    for (const [id, r] of this.remotes) {
      const a = r.avatar;
      const tg = r.target;
      const k = 1 - Math.exp(-dt * 10);
      a.root.position.x += (tg.x - a.root.position.x) * k;
      a.root.position.z += (tg.z - a.root.position.z) * k;
      a.root.position.y += ((tg.y || 0) - a.root.position.y) * k;
      let df = tg.f - a.root.rotation.y;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      a.root.rotation.y += df * k;
      a.pose = tg.a;
      a.typing = tg.a === 'sit' && a.talking;
      a.setSmoking(!!tg.sm);
      const seat = this.meeting?.seats.get(id);
      if (this.mode === 'meeting' && seat !== undefined) {
        a.setSmoking(false);
        this.meetingSit(a, seat, dt);
      }
      a.update(dt, t);
    }
    for (const n of this.npcs) {
      if (t > n.typingUntil) {
        n.avatar.typing = Math.random() < 0.65;
        n.typingUntil = t + 3 + Math.random() * 8;
      }
      if (t > n.talkingUntil) {
        n.avatar.talking = Math.random() < 0.45;
        n.avatar.lookYaw = (Math.random() - 0.5) * 0.6;
        n.talkingUntil = t + 2 + Math.random() * 6;
      }
      n.avatar.update(dt, t);
    }
    this.updateBoss(dt, t);
    if (this.mode === 'meeting') this.meetingPaint?.();
    this.focus = this.findFocus();
    this.smoke.update(dt, this.camera);
    this.booms.update(dt);
    this.updateFirstPersonCig(dt);
    this.ghost(this.mode === 'play' && this.player.firstPerson && !this.tween);
    const people = [this.player.pos];
    for (const r of this.remotes.values()) people.push(r.avatar.root.position);
    this.office.update(dt, people);
    this.office.jukebox.update(t, dt, this.jukeboxBeat);

    this.saverTimer += dt;
    if (this.saverTimer > 0.08 && !this.frozen) {
      this.saverTimer = 0;
      for (const s of this.office.savers) s.draw(t);
    }

    const minutes = this.env.currentHour * 60;
    this.office.wallClock.minute.rotation.z = -((minutes % 60) / 60) * Math.PI * 2;
    this.office.wallClock.hour.rotation.z = -(((minutes / 60) % 12) / 12) * Math.PI * 2;

    const [red, blue] = this.office.raidLights;
    red.intensity = this.raid * (Math.sin(t * 12) > 0 ? 40 : 0);
    blue.intensity = this.raid * (Math.sin(t * 12) <= 0 ? 40 : 0);
    const on = this.outage ? 0 : 1;
    this.env.update(dt, t, this.camera, this.outage);
    this.office.panelMat.emissiveIntensity = THREE.MathUtils.lerp(0.6, 1.5, this.env.lampsOn) * on;
    this.office.emergency.intensity = this.outage ? 6 + Math.sin(t * 6) * 3 : 0;
    this.office.breakerLamp.emissiveIntensity = this.outage ? 2 + Math.sin(t * 8) * 1.5 : 0;
    this.raidTint.style.opacity = this.raid ? String(this.raid * (0.6 + 0.4 * Math.sin(t * 12))) : '0';

    if (webcamTargets.size && this.desk) {
      this.webcamAcc += dt;
      if (this.webcamAcc > 1 / 20) {
        this.webcamAcc = 0;
        this.renderWebcam();
      }
    }

    if (this.frozen) return;
    if (this.camOverride) this.camera.position.copy(this.camOverride.position), this.camera.quaternion.copy(this.camOverride.quaternion);
    if (this.ink) this.ink.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  private updateBoss(dt: number, t: number) {
    const m = this.meeting;
    if (m && this.mode === 'meeting') {
      const b = this.boss;
      b.root.position.copy(this.office.meeting.boss);
      b.root.rotation.y = this.office.meeting.bossRot;
      b.pose = 'stand';
      b.talking = m.bossTalking;
      b.mood = 'angry';
      m.glance = Math.max(0, m.glance - dt);
      const want = m.glance > 0 ? -1.0 : Math.sin(t * 0.6) * 0.25;
      b.lookYaw += (want - b.lookYaw) * Math.min(1, dt * 4);
      b.lookPitch = m.bossTalking ? Math.sin(t * 2.3) * 0.04 : 0;
      b.update(dt, t);
      this.bossPos.copy(this.office.meeting.boss);
      return;
    }
    const path = this.office.bossPath;
    const target = path[(this.bossLeg + 1) % path.length];
    const dir = target.clone().sub(this.bossPos);
    const dist = dir.length();
    if (dist < 0.05) this.bossLeg = (this.bossLeg + 1) % path.length;
    else this.bossPos.add(dir.multiplyScalar(Math.min(1, (0.9 * dt) / dist)));
    this.boss.root.position.set(this.bossPos.x, 0, this.bossPos.z);
    const heading = Math.atan2(target.x - this.bossPos.x, target.z - this.bossPos.z);
    let dh = heading - this.boss.root.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.boss.root.rotation.y += dh * Math.min(1, dt * 5);
    this.boss.mood = this.raid > 0 ? 'scared' : 'angry';
    this.boss.update(dt, t);
  }

  private renderWebcam() {
    const targets = [...webcamTargets].filter((c) => c.isConnected);
    if (!targets.length) return;
    const target = targets[0];
    const w = target.width;
    const h = target.height;
    const d = this.desk!;
    this.webcamCam.position.copy(d.webcam);
    this.webcamCam.lookAt(d.chair.x, 1.1, d.chair.z);
    this.webcamCam.aspect = w / h;
    this.webcamCam.updateProjectionMatrix();
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const vw = Math.min(w, size.x / pr);
    const vh = Math.min(h, size.y / pr);
    const y = size.y / pr - vh;
    r.setScissorTest(true);
    r.setViewport(0, y, vw, vh);
    r.setScissor(0, y, vw, vh);
    r.render(this.scene, this.webcamCam);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x / pr, size.y / pr);
    for (const t of targets) t.getContext('2d')!.drawImage(r.domElement, 0, 0, vw * pr, vh * pr, 0, 0, t.width, t.height);
  }
}

function nameTag(name: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.font = 'bold 30px Inter, sans-serif';
  const w = Math.min(250, x.measureText(name).width + 28);
  x.fillStyle = 'rgba(20,12,6,0.75)';
  x.beginPath();
  x.roundRect((256 - w) / 2, 8, w, 46, 14);
  x.fill();
  x.fillStyle = '#ffe7b0';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.9, 0.225, 1);
  s.position.y = 2.15;
  s.renderOrder = 10;
  return s;
}
