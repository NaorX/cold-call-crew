// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh, roundedBox, toon } from '../ao/toon';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
const rbox = (w: number, h: number, d: number, r = 0.03) => roundedBox(w, h, d, r).translate(0, h / 2, 0);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const flatMat = (map: THREE.Texture) => {
  const m = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  return m;
};
const plane = (w: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  p.position.set(x, y, z);
  return p;
};

export function bake(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const out = new THREE.Group();
  const byKey = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material & { map?: THREE.Texture | null };
    const local = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    if (mat.map || o.userData.keep) {
      const c = new THREE.Mesh(m.geometry, mat);
      c.applyMatrix4(local);
      c.castShadow = m.castShadow;
      c.receiveShadow = m.receiveShadow;
      c.renderOrder = m.renderOrder;
      out.add(c);
      return;
    }
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.applyMatrix4(local);
    const key = `${mat.uuid}${m.castShadow ? '+' : '-'}`;
    if (!byKey.has(key)) byKey.set(key, { mat, cast: m.castShadow, geos: [] });
    byKey.get(key)!.geos.push(geo);
  });
  for (const { mat, cast, geos } of byKey.values()) {
    const merged = mergeGeometries(geos);
    if (merged) out.add(mesh(merged, mat, 0, 0, 0, cast));
    for (const geo of geos) geo.dispose();
  }
  return out;
}

export function place<T extends THREE.Object3D>(o: T, x: number, z: number, rotY = 0, y = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  return o;
}

const INK = '#2b2d42';
const STEEL = '#c9ced6';
const CHROME = '#e4e8ee';

export function espressoMachine(): THREE.Group {
  const g = new THREE.Group();
  const steel = toon(STEEL);
  const dark = toon(INK);
  const chrome = toon(CHROME);
  g.add(mesh(rbox(0.56, 0.42, 0.42, 0.04), steel, 0, 0, 0));
  g.add(mesh(box(0.54, 0.02, 0.4), dark, 0, 0.43, 0));
  const cup = toon('#fffaf3');
  for (const [x, z] of [[-0.16, -0.06], [-0.04, 0.05], [0.1, -0.04], [0.19, 0.07]]) {
    g.add(mesh(cyl(0.032, 0.026, 0.06), cup, x, 0.47, z));
  }
  g.add(mesh(box(0.5, 0.06, 0.01), toon('#e5483b'), 0, 0.36, 0.215, false));
  g.add(mesh(cyl(0.045, 0.045, 0.02, 24).rotateX(Math.PI / 2), chrome, 0, 0.29, 0.215, false));
  g.add(mesh(new THREE.CircleGeometry(0.037, 24), toon('#fffaf3'), 0, 0.29, 0.232, false));
  g.add(mesh(box(0.004, 0.032, 0.002), toon('#e5483b'), 0.008, 0.297, 0.236, false).rotateZ(-0.6));
  for (const x of [-0.14, 0.14]) {
    g.add(mesh(cyl(0.045, 0.05, 0.05), chrome, x, 0.2, 0.2));
    g.add(mesh(cyl(0.04, 0.035, 0.03), dark, x, 0.165, 0.2));
    const handle = mesh(cyl(0.014, 0.018, 0.16, 10), dark, x, 0.16, 0.3);
    handle.rotation.x = Math.PI / 2 - 0.25;
    g.add(handle);
    ['#06d6a0', '#ffd166'].forEach((c, i) => g.add(mesh(cyl(0.012, 0.012, 0.01, 10).rotateX(Math.PI / 2), toon(c, { emissive: c }), x - 0.025 + i * 0.05, 0.31, 0.216, false)));
  }
  const wand = mesh(cyl(0.007, 0.007, 0.2, 8), chrome, 0.26, 0.17, 0.2);
  wand.rotation.z = 0.25;
  g.add(wand);
  g.add(mesh(box(0.5, 0.03, 0.12), dark, 0, 0.03, 0.26));
  for (let i = 0; i < 7; i++) g.add(mesh(box(0.46, 0.004, 0.006), chrome, 0, 0.05, 0.21 + i * 0.016, false));
  g.add(mesh(cyl(0.028, 0.022, 0.045), cup, -0.14, 0.07, 0.24));
  g.add(mesh(cyl(0.022, 0.022, 0.004), toon('#5a3424'), -0.14, 0.096, 0.24, false));
  return g;
}

export function grinder(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.16, 0.22, 0.2, 0.03), toon(INK), 0, 0, 0));
  g.add(mesh(cyl(0.07, 0.04, 0.14), toon('#7a4a2b'), 0, 0.29, 0));
  g.add(mesh(cyl(0.075, 0.075, 0.02), toon(CHROME), 0, 0.37, 0));
  g.add(mesh(box(0.08, 0.04, 0.05), toon(STEEL), 0, 0.08, 0.12));
  return g;
}

export function microwave(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.52, 0.3, 0.38, 0.02), toon('#f2f2ee'), 0, 0, 0));
  g.add(mesh(box(0.33, 0.21, 0.01), toon('#1b1d2e'), -0.07, 0.15, 0.192, false));
  g.add(mesh(box(0.012, 0.18, 0.02), toon(STEEL), 0.105, 0.15, 0.2, false));
  g.add(mesh(box(0.09, 0.05, 0.004), toon('#3a5a40', { emissive: '#06d6a0' }), 0.18, 0.245, 0.192, false));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.add(mesh(box(0.022, 0.016, 0.006), toon('#d9d4cc'), 0.155 + c * 0.026, 0.19 - r * 0.026, 0.193, false));
  return g;
}

export function kettle(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.075, 0.075, 0.015), toon(INK), 0, 0.008, 0));
  g.add(mesh(cyl(0.06, 0.075, 0.19), toon('#e5483b'), 0, 0.11, 0));
  g.add(mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 16, Math.PI), toon(INK), 0, 0.2, -0.04).rotateY(Math.PI / 2));
  const spout = mesh(cyl(0.012, 0.022, 0.07, 8), toon('#e5483b'), 0, 0.16, 0.08);
  spout.rotation.x = 0.8;
  g.add(spout);
  return g;
}

export function toaster(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.26, 0.17, 0.15, 0.04), toon(CHROME), 0, 0, 0));
  for (const x of [-0.05, 0.05]) g.add(mesh(box(0.03, 0.01, 0.11), toon(INK), x, 0.172, 0, false));
  g.add(mesh(box(0.03, 0.015, 0.02), toon(INK), 0.14, 0.12, 0, false));
  return g;
}

export function fruitBowl(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.13, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, 0.13, 0), toon('#fffaf3'), 0, 0, 0));
  const fruit = [['#e63946', 0.05], ['#ffd166', 0.045], ['#9bc53d', 0.05], ['#ff8a5b', 0.045], ['#e63946', 0.045]] as const;
  fruit.forEach(([c, r], i) => g.add(mesh(sph(r), toon(c), Math.cos(i * 1.3) * 0.055, 0.13 + (i === 4 ? 0.06 : 0.02), Math.sin(i * 1.3) * 0.055)));
  g.add(mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 12, Math.PI * 0.7), toon('#ffd166'), 0, 0.2, 0).rotateX(-0.4));
  return g;
}

export function mugTree(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon('#c98b5a');
  g.add(mesh(cyl(0.08, 0.08, 0.02), wood, 0, 0.01, 0));
  g.add(mesh(cyl(0.01, 0.01, 0.32, 8), wood, 0, 0.17, 0));
  g.add(mesh(sph(0.018), wood, 0, 0.34, 0));
  ['#ef476f', '#4cc9f0', '#ffd166', '#06d6a0'].forEach((c, i) => {
    const a = (i / 4) * Math.PI * 2;
    const y = 0.2 + (i % 2) * 0.08;
    const arm = mesh(cyl(0.005, 0.005, 0.08, 6), wood, Math.cos(a) * 0.04, y + 0.03, Math.sin(a) * 0.04);
    arm.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(arm);
    const mug = new THREE.Group();
    mug.add(mesh(cyl(0.035, 0.03, 0.08), toon(c), 0, 0, 0));
    mug.add(mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 12), toon(c), 0, 0.005, -0.04));
    mug.position.set(Math.cos(a) * 0.1, y - 0.01, Math.sin(a) * 0.1);
    mug.rotation.y = -a - Math.PI / 2;
    g.add(mug);
  });
  return g;
}

export function fridge(): THREE.Group {
  const g = new THREE.Group();
  const body = toon('#dfe3e8');
  g.add(mesh(rbox(0.76, 1.92, 0.72, 0.04), body, 0, 0, 0));
  g.add(mesh(box(0.74, 0.012, 0.02), toon('#9aa3ad'), 0, 1.3, 0.365, false));
  const handle = toon(CHROME);
  for (const [y, h] of [[1.55, 0.3], [0.85, 0.6]]) {
    g.add(mesh(cyl(0.013, 0.013, h, 8), handle, -0.3, y, 0.41));
    for (const dy of [-h / 2 + 0.02, h / 2 - 0.02]) g.add(mesh(box(0.02, 0.02, 0.05), handle, -0.3, y + dy, 0.385, false));
  }
  ['#ef476f', '#ffd166', '#4cc9f0', '#06d6a0'].forEach((c, i) => g.add(mesh(cyl(0.018, 0.018, 0.012, 10).rotateX(Math.PI / 2), toon(c), 0.05 + (i % 2) * 0.16, 1.05 - Math.floor(i / 2) * 0.32, 0.367, false)));
  const note = canvasTex(64, 80, (c) => {
    c.fillStyle = '#fff8dc';
    c.fillRect(0, 0, 64, 80);
    c.fillStyle = '#e5483b';
    c.fillRect(0, 0, 64, 14);
    c.fillStyle = '#8d99ae';
    for (let i = 0; i < 6; i++) c.fillRect(8, 22 + i * 9, 30 + ((i * 13) % 20), 3);
  });
  g.add(plane(0.13, 0.16, flatMat(note), 0.07, 0.95, 0.372));
  const photo = canvasTex(64, 48, (c) => {
    c.fillStyle = '#9ed0ff';
    c.fillRect(0, 0, 64, 48);
    c.fillStyle = '#7cc46a';
    c.fillRect(0, 30, 64, 18);
    c.fillStyle = '#ffd166';
    c.beginPath();
    c.arc(48, 12, 7, 0, 7);
    c.fill();
    c.fillStyle = '#ffffff';
    c.lineWidth = 5;
    c.strokeStyle = '#ffffff';
    c.strokeRect(2, 2, 60, 44);
  });
  g.add(plane(0.14, 0.105, flatMat(photo), 0.2, 0.68, 0.372));
  return g;
}

export function kitchenRun(len: number, sinkAt: number | null): THREE.Group {
  const g = new THREE.Group();
  const carcass = toon('#ffffff');
  const door = toon('#f4f1ea');
  const handle = toon('#3d405b');
  const top = toon('#5b6b7a');
  const D = 0.6;
  g.add(mesh(box(len, 0.08, D - 0.06), toon(INK), 0, 0.04, -0.02, false));
  g.add(mesh(box(len, 0.78, D), carcass, 0, 0.47, 0));
  const n = Math.max(1, Math.round(len / 0.6));
  const w = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + w * (i + 0.5);
    g.add(mesh(box(w - 0.02, 0.62, 0.02), door, x, 0.45, D / 2 + 0.005, false));
    g.add(mesh(box(w - 0.02, 0.13, 0.02), door, x, 0.83, D / 2 + 0.005, false));
    g.add(mesh(box(0.12, 0.014, 0.02), handle, x, 0.83, D / 2 + 0.025, false));
    g.add(mesh(box(0.014, 0.14, 0.02), handle, x + (i % 2 ? -1 : 1) * (w / 2 - 0.06), 0.62, D / 2 + 0.025, false));
  }
  g.add(mesh(box(len + 0.02, 0.04, D + 0.03), top, 0, 0.88, 0.01));
  const tiles = canvasTex(256, 64, (c) => {
    c.fillStyle = '#e8f1f2';
    c.fillRect(0, 0, 256, 64);
    c.strokeStyle = '#c6d4d8';
    c.lineWidth = 2;
    for (let y = 0; y <= 64; y += 16) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(256, y);
      c.stroke();
      for (let x = (y / 16) % 2 ? 16 : 0; x <= 256; x += 32) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 16);
        c.stroke();
      }
    }
  });
  tiles.wrapS = THREE.RepeatWrapping;
  tiles.repeat.set(len / 1, 1);
  const splash = plane(len, 0.5, new THREE.MeshToonMaterial({ map: tiles, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap }), 0, 1.15, -D / 2 + 0.005);
  splash.material.userData.outlineParameters = { visible: false };
  g.add(splash);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + w * (i + 0.5);
    g.add(mesh(box(w - 0.01, 0.7, 0.36), carcass, x, 1.85, -D / 2 + 0.18));
    g.add(mesh(box(w - 0.03, 0.66, 0.02), door, x, 1.85, -D / 2 + 0.37, false));
    g.add(mesh(box(0.014, 0.12, 0.02), handle, x + (i % 2 ? -1 : 1) * (w / 2 - 0.06), 1.6, -D / 2 + 0.39, false));
  }
  g.add(mesh(box(len, 0.03, 0.38), toon('#e8e2d6'), 0, 1.49, -D / 2 + 0.19, false));
  if (sinkAt !== null) {
    const x = -len / 2 + sinkAt;
    g.add(mesh(box(0.5, 0.012, 0.36), toon('#9aa3ad'), x, 0.905, 0.02, false));
    g.add(mesh(box(0.44, 0.012, 0.3), toon('#6c757d'), x, 0.913, 0.02, false));
    const chrome = toon(CHROME);
    g.add(mesh(cyl(0.022, 0.026, 0.05), chrome, x, 0.925, -0.2));
    g.add(mesh(cyl(0.012, 0.012, 0.28, 8), chrome, x, 1.04, -0.2));
    g.add(mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 16, Math.PI), chrome, x, 1.18, -0.12).rotateY(Math.PI / 2));
    g.add(mesh(box(0.08, 0.012, 0.025), chrome, x + 0.07, 0.96, -0.2, false));
    g.add(mesh(cyl(0.022, 0.025, 0.14), toon('#06d6a0'), x + 0.32, 0.97, -0.18));
    g.add(mesh(box(0.08, 0.025, 0.05), toon('#ffd166'), x + 0.32, 0.913, -0.08, false));
  }
  return g;
}

export function towelRoll(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.06, 0.06, 0.01), toon(STEEL), 0, 0.005, 0));
  g.add(mesh(cyl(0.008, 0.008, 0.3, 6), toon(STEEL), 0, 0.15, 0));
  g.add(mesh(cyl(0.055, 0.055, 0.26), toon('#ffffff'), 0, 0.15, 0));
  return g;
}

export function extinguisher(): THREE.Group {
  const g = new THREE.Group();
  const red = toon('#d62828');
  const ink = toon(INK);
  g.add(mesh(box(0.12, 0.08, 0.04), ink, 0, 0.95, 0.02));
  g.add(mesh(new THREE.TorusGeometry(0.085, 0.01, 6, 20, Math.PI), ink, 0, 0.62, 0.1).rotateX(Math.PI / 2));
  g.add(mesh(cyl(0.08, 0.08, 0.5, 20), red, 0, 0.75, 0.1));
  g.add(mesh(new THREE.SphereGeometry(0.08, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 1.0, 0.1));
  g.add(mesh(cyl(0.086, 0.086, 0.14, 20), toon('#fffaf3'), 0, 0.78, 0.1, false));
  g.add(mesh(cyl(0.025, 0.03, 0.06, 10), ink, 0, 1.1, 0.1));
  g.add(mesh(box(0.13, 0.016, 0.03), ink, 0.04, 1.14, 0.1).rotateZ(-0.15));
  g.add(mesh(box(0.11, 0.014, 0.028), ink, 0.04, 1.11, 0.1).rotateZ(0.1));
  g.add(mesh(cyl(0.018, 0.018, 0.012, 12).rotateX(Math.PI / 2), toon('#fffaf3'), -0.03, 1.07, 0.15, false));
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.03, 1.1, 0.12), new THREE.Vector3(0.11, 1.0, 0.13), new THREE.Vector3(0.11, 0.7, 0.14), new THREE.Vector3(0.09, 0.56, 0.15)]);
  g.add(mesh(new THREE.TubeGeometry(curve, 16, 0.012, 6), ink, 0, 0, 0));
  g.add(mesh(cyl(0.02, 0.012, 0.06, 8), ink, 0.09, 0.53, 0.15));
  const sign = canvasTex(128, 128, (c) => {
    c.fillStyle = '#d62828';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#ffffff';
    c.fillRect(54, 30, 22, 66);
    c.fillRect(48, 22, 34, 12);
    c.fillRect(76, 26, 20, 6);
    c.font = '800 16px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('FIRE', 64, 116);
  });
  g.add(plane(0.2, 0.2, flatMat(sign), 0, 1.42, 0.014));
  return g;
}

export function waterCooler(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.34, 1.0, 0.34, 0.03), toon('#f2f4f6'), 0, 0, 0));
  g.add(mesh(box(0.3, 0.06, 0.3), toon('#9aa3ad'), 0, 0.03, 0));
  g.add(mesh(box(0.22, 0.02, 0.1), toon('#9aa3ad'), 0, 0.72, 0.18));
  ['#e63946', '#4f86f7'].forEach((c, i) => g.add(mesh(box(0.04, 0.05, 0.04), toon(c), -0.05 + i * 0.1, 0.82, 0.18)));
  const water = new THREE.MeshToonMaterial({ color: '#7cc4f2', transparent: true, opacity: 0.75, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  water.userData.outlineParameters = { visible: false };
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 20), water, 0, 1.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.13, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), water, 0, 1.05, 0));
  g.add(mesh(new THREE.SphereGeometry(0.13, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), water, 0, 1.35, 0));
  g.add(mesh(cyl(0.04, 0.04, 0.06), water, 0, 1.0, 0));
  g.add(mesh(cyl(0.04, 0.04, 0.3, 12), toon('#fffaf3'), 0.21, 0.6, 0.05));
  return g;
}

export function exitSign(): { group: THREE.Group; glow: THREE.MeshToonMaterial } {
  const g = new THREE.Group();
  g.add(mesh(box(0.42, 0.18, 0.06), toon('#f2f4f6'), 0, 0, 0.03));
  const tex = canvasTex(256, 96, (c) => {
    c.fillStyle = '#0a8f3c';
    c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#ffffff';
    c.font = '900 56px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('EXIT', 150, 50);
    c.beginPath();
    c.moveTo(30, 48);
    c.lineTo(62, 26);
    c.lineTo(62, 70);
    c.fill();
  });
  const glow = toon('#ffffff', { emissive: '#ffffff' }).clone();
  glow.map = tex;
  glow.emissiveMap = tex;
  glow.emissiveIntensity = 0.6;
  glow.userData.outlineParameters = { visible: false };
  g.add(plane(0.38, 0.14, glow, 0, 0, 0.07));
  return { group: g, glow };
}

export function sofa(w: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(color);
  const c = (sw: number, sh: number, sd: number, r: number, x: number, y: number, z: number, m: THREE.Material = mat) => g.add(mesh(roundedBox(sw, sh, sd, r), m, x, y, z));
  c(w, 0.45, 1, 0.2, 0, 0.3, 0);
  c(w, 0.9, 0.35, 0.15, 0, 0.55, -0.45);
  c(0.35, 0.7, 1, 0.15, -w / 2 + 0.12, 0.45, 0);
  c(0.35, 0.7, 1, 0.15, w / 2 - 0.12, 0.45, 0);
  if (w > 1.4) ['#ffd166', '#ef476f'].forEach((col, i) => c(0.5, 0.45, 0.2, 0.1, (i ? 1 : -1) * (w / 2 - 0.62), 0.75, -0.2, toon(col)));
  return g;
}

export function beanbag(color: string): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(0.6, 16, 12), toon(color), 0, 0.35, 0);
  b.scale.y = 0.6;
  g.add(b);
  return g;
}

export function coffeeTable(r = 0.6): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, 0.08, 28), toon('#c98b5a'), 0, 0.42, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.4, 12), toon('#3d405b'), 0, 0.2, 0));
  g.add(mesh(box(0.22, 0.012, 0.3), toon('#ef476f'), -r * 0.35, 0.466, 0.05).rotateY(0.3));
  g.add(mesh(cyl(0.06, 0.05, 0.1), toon('#fffaf3'), r * 0.4, 0.51, -0.05));
  g.add(mesh(sph(0.09), toon('#5fb760'), r * 0.4, 0.6, -0.05));
  return g;
}

export function officeChair(color: string, exec = false): THREE.Group {
  const g = new THREE.Group();
  const ink = toon('#2b2d42');
  const chrome = toon(CHROME);
  const pad = toon(color);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = mesh(box(0.05, 0.04, 0.32), ink, Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15);
    leg.rotation.y = a;
    g.add(leg);
    g.add(mesh(sph(0.035), ink, Math.sin(a) * 0.3, 0.035, Math.cos(a) * 0.3));
  }
  g.add(mesh(cyl(0.035, 0.035, 0.34), chrome, 0, 0.27, 0));
  g.add(mesh(rbox(0.56, 0.1, 0.54, 0.08), pad, 0, 0.44, 0));
  const backH = exec ? 0.85 : 0.55;
  const back = mesh(rbox(0.52, backH, 0.09, 0.08), pad, 0, 0.56, -0.26);
  back.rotation.x = -0.1;
  g.add(back);
  if (exec) g.add(mesh(rbox(0.34, 0.16, 0.1, 0.06), pad, 0, 0.56 + backH + 0.02, -0.3).rotateX(-0.1));
  for (const s of [-1, 1]) {
    g.add(mesh(box(0.04, 0.2, 0.04), ink, s * 0.3, 0.6, -0.02));
    g.add(mesh(rbox(0.07, 0.04, 0.32, 0.02), exec ? pad : ink, s * 0.3, 0.7, 0.0));
  }
  return g;
}

export function rug(w: number, d: number, field: string, border: string): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTex(256, 256, (c) => {
    c.fillStyle = border;
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = field;
    c.fillRect(18, 18, 220, 220);
    c.strokeStyle = border;
    c.lineWidth = 6;
    c.strokeRect(40, 40, 176, 176);
    c.globalAlpha = 0.18;
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) c.fillRect(60 + i * 24, 60, 8, 136);
  });
  const m = new THREE.MeshToonMaterial({ map: tex, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  m.userData.outlineParameters = { visible: false };
  const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  r.rotation.x = -Math.PI / 2;
  r.position.y = 0.012;
  r.receiveShadow = true;
  g.add(r);
  return g;
}

export function floorLamp(): { group: THREE.Group; bulb: THREE.MeshToonMaterial } {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.16, 0.18, 0.04), toon(INK), 0, 0.02, 0));
  g.add(mesh(cyl(0.012, 0.012, 1.5, 8), toon(INK), 0, 0.78, 0));
  const shade = toon('#fff1d6', { emissive: '#ffd49c' }).clone();
  shade.emissiveIntensity = 0.15;
  g.add(mesh(cyl(0.16, 0.22, 0.26, 20, ), shade, 0, 1.6, 0));
  return { group: g, bulb: shade };
}

export function bookshelf(w: number, h: number, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const wood = toon('#c98b5a');
  const back = toon('#a8724a');
  const D = 0.34;
  g.add(mesh(box(w, h, 0.02), back, 0, h / 2, -D / 2 + 0.01));
  for (const s of [-1, 1]) g.add(mesh(box(0.035, h, D), wood, s * (w / 2 - 0.0175), h / 2, 0));
  const shelves = Math.max(2, Math.round(h / 0.38));
  const step = (h - 0.06) / shelves;
  let r = seed * 9301;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#8d99ae', '#b388eb', '#06d6a0', '#ef476f'];
  for (let i = 0; i <= shelves; i++) {
    const y = 0.03 + i * step;
    g.add(mesh(box(w - 0.07, 0.03, D), wood, 0, y, 0));
    if (i === shelves) break;
    let x = -w / 2 + 0.06;
    while (x < w / 2 - 0.12) {
      if (rnd() < 0.12) {
        g.add(mesh(rnd() < 0.5 ? sph(0.05) : cyl(0.04, 0.05, 0.12), toon(COLORS[Math.floor(rnd() * COLORS.length)]), x + 0.06, y + 0.07, 0));
        x += 0.16;
        continue;
      }
      const bw = 0.025 + rnd() * 0.03;
      const bh = step * (0.55 + rnd() * 0.32);
      const lean = rnd() < 0.08 ? 0.2 : 0;
      g.add(mesh(box(bw, bh, D * 0.78), toon(COLORS[Math.floor(rnd() * COLORS.length)]), x + bw / 2, y + 0.015 + bh / 2, 0.02).rotateZ(lean));
      x += bw + 0.004;
    }
  }
  return g;
}

export function filingCabinet(color = '#8d99ae'): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.46, 1.3, 0.6, 0.015), toon(color), 0, 0, 0));
  for (let i = 0; i < 4; i++) {
    const y = 0.17 + i * 0.32;
    g.add(mesh(box(0.42, 0.29, 0.012), toon(new THREE.Color(color).multiplyScalar(1.08)), 0, y, 0.305, false));
    g.add(mesh(box(0.14, 0.02, 0.03), toon(CHROME), 0, y + 0.02, 0.32, false));
    g.add(mesh(box(0.08, 0.035, 0.006), toon('#fffaf3'), 0, y + 0.09, 0.313, false));
  }
  return g;
}

export function copier(): { group: THREE.Group; screen: THREE.MeshToonMaterial } {
  const g = new THREE.Group();
  const body = toon('#eceae4');
  const grey = toon('#8d99ae');
  g.add(mesh(rbox(0.7, 0.9, 0.62, 0.02), body, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    g.add(mesh(box(0.66, 0.2, 0.012), toon('#d9d4cc'), 0, 0.15 + i * 0.22, 0.313, false));
    g.add(mesh(box(0.2, 0.025, 0.03), grey, 0, 0.21 + i * 0.22, 0.325, false));
  }
  g.add(mesh(rbox(0.72, 0.18, 0.62, 0.02), body, 0, 0.9, 0));
  g.add(mesh(box(0.6, 0.04, 0.45), toon(INK), 0, 1.1, -0.02));
  g.add(mesh(box(0.34, 0.012, 0.3), grey, -0.42, 0.98, 0, false));
  g.add(mesh(box(0.28, 0.006, 0.24), toon('#ffffff'), -0.42, 0.992, 0, false));
  const screen = toon('#4cc9f0', { emissive: '#4cc9f0' }).clone();
  screen.emissiveIntensity = 0.5;
  g.add(mesh(box(0.22, 0.02, 0.14), toon(INK), 0.18, 1.1, 0.27).rotateX(0.4));
  g.add(mesh(box(0.13, 0.004, 0.08), screen, 0.16, 1.116, 0.27, false).rotateX(0.4));
  return { group: g, screen };
}

export function credenza(len: number, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const D = 0.45;
  g.add(mesh(box(len, 0.72, D), toon('#f4f1ea'), 0, 0.38, 0));
  g.add(mesh(box(len, 0.04, D - 0.04), toon(INK), 0, 0.02, -0.01, false));
  g.add(mesh(box(len + 0.02, 0.03, D + 0.02), toon('#c98b5a'), 0, 0.755, 0));
  const n = Math.max(1, Math.round(len / 0.8));
  const w = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + w * (i + 0.5);
    g.add(mesh(box(w - 0.03, 0.6, 0.012), toon('#ffffff'), x, 0.38, D / 2 + 0.004, false));
    g.add(mesh(box(0.12, 0.016, 0.02), toon('#3d405b'), x, 0.6, D / 2 + 0.018, false));
  }
  let r = seed * 7919;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#264653'];
  for (let x = -len / 2 + 0.25; x < len / 2 - 0.3; x += 0.9 + rnd() * 0.6) {
    const k = rnd();
    if (k < 0.45) {
      for (let b = 0; b < 3 + Math.floor(rnd() * 3); b++) g.add(mesh(box(0.05, 0.3, 0.26), toon(COLORS[Math.floor(rnd() * COLORS.length)]), x + b * 0.055, 0.92, 0));
    } else if (k < 0.75) {
      g.add(mesh(cyl(0.09, 0.07, 0.16), toon('#e07a5f'), x, 0.85, 0));
      for (let l = 0; l < 6; l++) g.add(mesh(sph(0.08), toon(l % 2 ? '#5fb760' : '#3f8f45'), x + Math.cos(l) * 0.06, 0.97 + (l % 3) * 0.05, Math.sin(l) * 0.05));
    } else {
      for (let t = 0; t < 3; t++) g.add(mesh(box(0.32, 0.05, 0.26), toon(t % 2 ? '#8d99ae' : INK), x, 0.8 + t * 0.07, 0));
    }
  }
  return g;
}

export function whiteboard(w: number, h: number, lines: string[]): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTex(512, Math.round((512 * h) / w), (c) => {
    const H = c.canvas.height;
    c.fillStyle = '#fbfbf8';
    c.fillRect(0, 0, 512, H);
    c.font = '700 34px "Comic Sans MS", "Segoe Print", cursive';
    const pens = ['#1d4ed8', '#c62828', '#2e7d32', '#1d1d1f'];
    lines.forEach((l, i) => {
      c.fillStyle = pens[i % pens.length];
      c.fillText(l, 26, 56 + i * 48);
    });
    c.strokeStyle = '#c62828';
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(420, H - 60, 60, 32, -0.2, 0, Math.PI * 2);
    c.stroke();
  });
  g.add(mesh(box(w + 0.06, h + 0.06, 0.03), toon('#c4cbd3'), 0, 0, 0.015));
  g.add(plane(w, h, flatMat(tex), 0, 0, 0.038));
  g.add(mesh(box(w * 0.6, 0.03, 0.07), toon('#c4cbd3'), 0, -h / 2 - 0.02, 0.05));
  ['#1d4ed8', '#c62828', '#2e7d32'].forEach((c, i) => g.add(mesh(cyl(0.01, 0.01, 0.13, 8).rotateZ(Math.PI / 2), toon(c), -0.15 + i * 0.16, -h / 2 + 0.005, 0.06)));
  return g;
}

export function picture(w: number, h: number, palette: string[], seed = 1, frame = '#2b2d42'): THREE.Group {
  const g = new THREE.Group();
  let r = seed * 104729;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const tex = canvasTex(256, Math.round((256 * h) / w), (c) => {
    const H = c.canvas.height;
    c.fillStyle = palette[0];
    c.fillRect(0, 0, 256, H);
    for (let i = 0; i < 7; i++) {
      c.fillStyle = palette[1 + (i % (palette.length - 1))];
      c.globalAlpha = 0.9;
      const k = rnd();
      if (k < 0.4) {
        c.beginPath();
        c.arc(rnd() * 256, rnd() * H, 20 + rnd() * 60, 0, Math.PI * 2);
        c.fill();
      } else if (k < 0.75) c.fillRect(rnd() * 200, rnd() * H, 30 + rnd() * 120, 10 + rnd() * 40);
      else {
        c.beginPath();
        c.moveTo(rnd() * 256, H);
        c.quadraticCurveTo(rnd() * 256, rnd() * H, rnd() * 256, 0);
        c.lineWidth = 10 + rnd() * 16;
        c.strokeStyle = c.fillStyle;
        c.stroke();
      }
    }
  });
  g.add(mesh(box(w + 0.08, h + 0.08, 0.04), toon(frame), 0, 0, 0.02));
  g.add(mesh(box(w + 0.01, h + 0.01, 0.01), toon('#fffaf3'), 0, 0, 0.044, false));
  g.add(plane(w - 0.06, h - 0.06, flatMat(tex), 0, 0, 0.056));
  return g;
}

export function poster(title: string, sub: string, bg: string, fg = '#ffffff'): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTex(256, 340, (c) => {
    c.fillStyle = '#111318';
    c.fillRect(0, 0, 256, 340);
    const grad = c.createLinearGradient(0, 20, 0, 220);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, '#111318');
    c.fillStyle = grad;
    c.fillRect(20, 20, 216, 200);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.moveTo(20, 220);
    c.lineTo(100, 120);
    c.lineTo(150, 170);
    c.lineTo(190, 110);
    c.lineTo(236, 220);
    c.fill();
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.font = '900 34px Anton, Impact, sans-serif';
    c.fillText(title, 128, 270);
    c.font = '500 14px Inter, system-ui, sans-serif';
    c.fillStyle = '#c9ced6';
    c.fillText(sub, 128, 300);
  });
  g.add(mesh(box(0.66, 0.86, 0.025), toon('#1b1d24'), 0, 0, 0.0125));
  g.add(plane(0.6, 0.8, flatMat(tex), 0, 0, 0.034));
  return g;
}

export function coatRack(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon('#8a5a3b');
  g.add(mesh(cyl(0.2, 0.22, 0.04), wood, 0, 0.02, 0));
  g.add(mesh(cyl(0.025, 0.03, 1.75, 10), wood, 0, 0.9, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.add(mesh(cyl(0.012, 0.012, 0.18, 6), wood, Math.cos(a) * 0.07, 1.7, Math.sin(a) * 0.07).rotateOnAxis(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), 0.7));
  }
  g.add(mesh(rbox(0.36, 0.7, 0.16, 0.06), toon('#3d5a80'), 0.05, 0.98, 0.1));
  g.add(mesh(box(0.08, 0.5, 0.05), toon('#e63946'), -0.1, 1.2, 0.08).rotateZ(0.2));
  return g;
}

export function trophy(scale = 1, color = '#f2c14e'): THREE.Group {
  const g = new THREE.Group();
  const gold = toon(color);
  g.add(mesh(box(0.12, 0.04, 0.12), toon('#3d2b1f'), 0, 0.02, 0));
  g.add(mesh(box(0.09, 0.03, 0.09), toon('#3d2b1f'), 0, 0.055, 0));
  g.add(mesh(cyl(0.012, 0.03, 0.08, 10), gold, 0, 0.11, 0));
  const pts = [0, 0.02, 0.05, 0.065, 0.07, 0.068].map((r, i) => new THREE.Vector2(r, i * 0.025));
  g.add(mesh(new THREE.LatheGeometry(pts, 18), gold, 0, 0.15, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI), gold, s * 0.07, 0.22, 0).rotateZ(s * Math.PI / 2));
  g.scale.setScalar(scale);
  return g;
}

export function plantTall(kind: 'fig' | 'snake', scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.2, 0.15, 0.36, 16), toon('#f4f1ea'), 0, 0.18, 0));
  g.add(mesh(cyl(0.175, 0.175, 0.02, 16), toon('#5a3a22'), 0, 0.37, 0));
  if (kind === 'snake') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const h = 0.5 + ((i * 37) % 10) * 0.05;
      const leaf = mesh(box(0.06, h, 0.015), toon(i % 2 ? '#3f8f45' : '#6fae5a'), Math.cos(a) * 0.07, 0.36 + h / 2, Math.sin(a) * 0.07);
      leaf.rotation.set(Math.sin(a) * 0.18, a, -Math.cos(a) * 0.18);
      g.add(leaf);
    }
  } else {
    g.add(mesh(cyl(0.02, 0.025, 1.0, 8), toon('#7a5236'), 0, 0.85, 0));
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const y = 0.75 + (i / 14) * 0.75;
      const leaf = mesh(sph(0.12, 10, 8), toon(i % 3 ? '#3f8f45' : '#5fb760'), Math.cos(a) * 0.16, y, Math.sin(a) * 0.16);
      leaf.scale.set(1, 0.35, 0.75);
      leaf.rotation.y = -a;
      g.add(leaf);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

export function bins(): THREE.Group {
  const g = new THREE.Group();
  [['#457b9d', -0.2], ['#2b2d42', 0.2]].forEach(([c, x]) => {
    g.add(mesh(cyl(0.16, 0.13, 0.55, 14), toon(c as string), x as number, 0.275, 0));
    g.add(mesh(cyl(0.17, 0.17, 0.04, 14), toon(new THREE.Color(c as string).multiplyScalar(0.8)), x as number, 0.57, 0));
  });
  return g;
}

export function vendingMachine(): { group: THREE.Group; glow: THREE.MeshToonMaterial } {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.9, 1.85, 0.75, 0.03), toon('#e63946'), 0, 0, 0));
  const tex = canvasTex(256, 512, (c) => {
    c.fillStyle = '#dfeef7';
    c.fillRect(0, 0, 256, 512);
    const SN = ['#ffd166', '#06d6a0', '#ef476f', '#4cc9f0', '#ff8a5b', '#b388eb', '#2a9d8f'];
    for (let r = 0; r < 6; r++) {
      const y = 30 + r * 80;
      c.fillStyle = '#9aa3ad';
      c.fillRect(8, y + 58, 240, 6);
      for (let k = 0; k < 5; k++) {
        c.fillStyle = SN[(r * 3 + k) % SN.length];
        c.fillRect(16 + k * 46, y + 6, 36, 50);
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.fillRect(20 + k * 46, y + 10, 8, 40);
        c.fillStyle = '#2b2d42';
        c.font = '600 11px Inter, sans-serif';
        c.fillText(`${r + 1}${k + 1}`, 26 + k * 46, y + 74);
      }
    }
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.moveTo(150, 0);
    c.lineTo(210, 0);
    c.lineTo(90, 512);
    c.lineTo(30, 512);
    c.fill();
  });
  const glow = toon('#ffffff', { emissive: '#ffffff' }).clone();
  glow.map = tex;
  glow.emissiveMap = tex;
  glow.emissiveIntensity = 0.15;
  glow.userData.outlineParameters = { visible: false };
  g.add(mesh(box(0.6, 1.36, 0.03), toon('#2b2d42'), -0.1, 1.12, 0.37, false));
  g.add(plane(0.56, 1.3, glow, -0.1, 1.12, 0.389));
  g.add(mesh(box(0.2, 0.52, 0.03), toon('#2b2d42'), 0.31, 1.25, 0.37, false));
  for (let i = 0; i < 9; i++) g.add(mesh(box(0.04, 0.03, 0.012), toon('#d9d4cc'), 0.26 + (i % 3) * 0.05, 1.38 - Math.floor(i / 3) * 0.05, 0.39, false));
  g.add(mesh(box(0.08, 0.02, 0.012), toon('#06d6a0', { emissive: '#06d6a0' }), 0.31, 1.45, 0.39, false));
  g.add(mesh(box(0.6, 0.2, 0.04), toon('#2b2d42'), -0.1, 0.27, 0.37, false));
  g.add(mesh(box(0.52, 0.04, 0.02), toon('#e4e8ee'), -0.1, 0.36, 0.392, false));
  return { group: g, glow };
}

export function umbrella(color = '#f2a03d', stripe = '#fffaf3'): THREE.Group {
  const g = new THREE.Group();
  const ink = toon(INK);
  g.add(mesh(cyl(0.22, 0.25, 0.08, 20), ink, 0, 0.04, 0));
  g.add(mesh(cyl(0.025, 0.025, 2.35, 10), toon('#d9d4cc'), 0, 1.2, 0));
  const R = 1.25;
  const H = 0.45;
  const top = 2.35;
  const panels = [color, stripe].map((c) => {
    const m = toon(c).clone();
    m.side = THREE.DoubleSide;
    return m;
  });
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.ConeGeometry(R, H, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4);
    g.add(mesh(geo, panels[i % 2], 0, top - H / 2 + 0.02, 0));
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const flap = mesh(box(0.92, 0.12, 0.01), toon(i % 2 ? color : stripe), Math.sin(a) * R * 0.93, top - H - 0.03, Math.cos(a) * R * 0.93);
    flap.rotation.y = a;
    g.add(flap);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const from = new THREE.Vector3(0, top - 0.04, 0);
    const to = new THREE.Vector3(Math.sin(a) * R * 0.97, top - H - 0.02, Math.cos(a) * R * 0.97);
    const rib = mesh(cyl(0.008, 0.008, from.distanceTo(to), 6), ink, 0, 0, 0);
    rib.position.copy(from).add(to).multiplyScalar(0.5);
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    g.add(rib);
  }
  g.add(mesh(sph(0.05), ink, 0, top + 0.05, 0));
  return g;
}

export function bistroSet(): THREE.Group {
  const g = new THREE.Group();
  const metal = toon('#3d405b');
  const top = toon('#fffaf3');
  g.add(mesh(cyl(0.38, 0.38, 0.035, 24), top, 0, 0.74, 0));
  g.add(mesh(cyl(0.04, 0.05, 0.7, 10), metal, 0, 0.37, 0));
  g.add(mesh(cyl(0.26, 0.28, 0.03, 20), metal, 0, 0.015, 0));
  for (const s of [-1, 1]) {
    const c = new THREE.Group();
    c.add(mesh(cyl(0.2, 0.2, 0.03, 18), toon('#e07a5f'), 0, 0.46, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = mesh(cyl(0.012, 0.012, 0.47, 6), metal, Math.cos(a) * 0.15, 0.23, Math.sin(a) * 0.15);
      leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
      c.add(leg);
    }
    c.add(mesh(new THREE.TorusGeometry(0.19, 0.014, 6, 18, Math.PI), metal, 0, 0.75, -0.17));
    for (const x of [-0.1, 0, 0.1]) c.add(mesh(cyl(0.008, 0.008, 0.28, 6), metal, x, 0.6, -0.17));
    c.position.set(0, 0, s * 0.6);
    c.rotation.y = s > 0 ? Math.PI : 0;
    g.add(c);
  }
  return g;
}

export function planterBox(len: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(len, 0.45, 0.45), toon('#8a5a3b'), 0, 0.225, 0));
  g.add(mesh(box(len - 0.06, 0.02, 0.39), toon('#5a3a22'), 0, 0.452, 0));
  for (let x = -len / 2 + 0.2; x < len / 2 - 0.1; x += 0.3) g.add(mesh(sph(0.2), toon(Math.round(x * 10) % 2 ? '#5fb760' : '#3f8f45'), x, 0.58, 0));
  return g;
}

export function wallLantern(): { group: THREE.Group; bulb: THREE.MeshToonMaterial } {
  const g = new THREE.Group();
  g.add(mesh(box(0.1, 0.16, 0.04), toon(INK), 0, 0, 0.02));
  g.add(mesh(box(0.03, 0.03, 0.12), toon(INK), 0, 0.05, 0.08));
  const bulb = toon('#fff3d6', { emissive: '#ffd49c' }).clone();
  bulb.emissiveIntensity = 0.2;
  g.add(mesh(box(0.13, 0.18, 0.13), bulb, 0, -0.04, 0.17));
  g.add(mesh(cyl(0.02, 0.1, 0.06, 4), toon(INK), 0, 0.08, 0.17).rotateY(Math.PI / 4));
  return { group: g, bulb };
}
