import * as THREE from 'three';
import { Avatar } from './character';
import { toonMat } from './office';
import type { Call } from '../game/game';

const W = 480;
const H = 270;

const ROOMS = [
  { wall: '#e9d8c4', trim: '#b98a5f', glow: '#ffd9a0' },
  { wall: '#cfe0d2', trim: '#6d8f74', glow: '#fff1c4' },
  { wall: '#d9d4ec', trim: '#7d74a8', glow: '#ffe2c2' },
  { wall: '#f3d6cf', trim: '#b5655a', glow: '#ffe8b0' },
  { wall: '#d3e3ee', trim: '#5f88a8', glow: '#fff4d6' },
];

class CallerCam {
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 20);
  private avatar: Avatar | null = null;
  private room = new THREE.Group();
  private callId = '';
  private call: Call | null = null;
  private raf = 0;
  private clock = new THREE.Clock();
  private t = 0;
  private lookAt = 0;
  private nextLook = 0;
  private away = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'caller-cam';
    this.canvas.width = W;
    this.canvas.height = H;
    this.scene.add(new THREE.HemisphereLight('#fff6ea', '#8a7460', 1.6));
    const key = new THREE.DirectionalLight('#fff1d6', 1.3);
    key.position.set(1.5, 2.5, 2.5);
    this.scene.add(key, this.room);
    this.camera.position.set(0.05, 1.66, 2.6);
    this.camera.lookAt(0, 1.6, 0);
  }

  attach(call: Call): HTMLCanvasElement {
    this.call = call;
    if (call.id !== this.callId) this.setCaller(call);
    this.away = 0;
    if (!this.raf) {
      this.clock.getDelta();
      this.raf = requestAnimationFrame(this.loop);
    }
    return this.canvas;
  }

  private setCaller(call: Call) {
    this.callId = call.id;
    if (this.avatar) this.scene.remove(this.avatar.root);
    this.avatar = new Avatar(call.persona.look);
    this.avatar.root.position.set(0, 0, 0);
    this.scene.add(this.avatar.root);
    this.room.clear();
    const seed = [...call.persona.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const r = ROOMS[seed % ROOMS.length];
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), toonMat({ color: r.wall }));
    wall.position.set(0, 1.6, -1.2);
    this.room.add(wall);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.04), toonMat({ color: r.trim }));
    rail.position.set(0, 1.0, -1.17);
    this.room.add(rail);
    const side = seed % 2 ? 1 : -1;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.03), toonMat({ color: '#5a3a22' }));
    frame.position.set(side * 0.75, 1.85, -1.17);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), toonMat({ color: ['#8ecae6', '#f4a261', '#90be6d', '#cdb4db'][seed % 4] }));
    art.position.set(side * 0.75, 1.85, -1.15);
    this.room.add(frame, art);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.2, 16), toonMat({ color: '#fff1d6', emissive: r.glow, emissiveIntensity: 0.6 }));
    shade.position.set(-side * 0.85, 1.55, -0.8);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6), toonMat({ color: '#2b2d42' }));
    stem.position.set(-side * 0.85, 0.75, -0.8);
    this.room.add(shade, stem);
    this.scene.background = new THREE.Color(r.wall);
  }

  private loop = () => {
    if (!this.call || this.call.state !== 'active') {
      this.raf = 0;
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    if (!this.canvas.isConnected) {
      this.away += dt;
      if (this.away > 1) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
      return;
    }
    this.away = 0;
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        this.renderer.setSize(W, H, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      } catch {
        return;
      }
    }
    const a = this.avatar;
    const c = this.call;
    const away = !!c.job && c.job.holdUntil > performance.now() && !c.speaking;
    if (a) a.root.visible = !away;
    if (a && !away) {
      a.talking = c.speaking;
      a.mood = c.mood === 'angry' ? 'angry' : c.mood === 'scared' || c.mood === 'suspicious' ? 'scared' : c.mood === 'happy' || c.mood === 'excited' ? 'happy' : 'calm';
      if (this.t > this.nextLook) {
        this.lookAt = (Math.random() - 0.5) * (c.speaking ? 0.5 : 0.3);
        this.nextLook = this.t + 1.2 + Math.random() * 2.5;
      }
      a.lookYaw += (this.lookAt - a.lookYaw) * Math.min(1, dt * 3);
      a.lookPitch = c.speaking ? Math.sin(this.t * 3.1) * 0.05 : Math.sin(this.t * 0.7) * 0.02;
      a.root.rotation.y = Math.sin(this.t * 0.4) * 0.05;
      a.update(dt, this.t);
    }
    this.renderer.render(this.scene, this.camera);
  };
}

export const callerCam = new CallerCam();
