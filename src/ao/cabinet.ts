// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import { mesh, roundedBox, toon } from './toon';
const CABINET = { width: 0.8, depth: 0.8, height: 1.9 } as const;

export interface CabinetModel {
  group: THREE.Group;
  screen: THREE.Mesh;
}

const BODY: [number, number][] = [
  [-0.4, 0],
  [0.26, 0],
  [0.26, 0.84],
  [0.4, 0.9],
  [0.4, 0.98],
  [0.13, 1.05],
  [0.01, 1.57],
  [0.19, 1.63],
  [0.19, 1.9],
  [-0.4, 1.9],
];
const SIDE: [number, number][] = [
  [-0.4, 0],
  [0.29, 0],
  [0.29, 0.83],
  [0.43, 0.89],
  [0.43, 1.0],
  [0.16, 1.07],
  [0.04, 1.58],
  [0.22, 1.64],
  [0.22, 1.93],
  [-0.4, 1.93],
];
const SIDE_T = 0.04;
const SCREEN_BOTTOM: [number, number] = [0.13, 1.05];
const SCREEN_TOP: [number, number] = [0.01, 1.57];
const LEAN = Math.atan2(SCREEN_BOTTOM[0] - SCREEN_TOP[0], SCREEN_TOP[1] - SCREEN_BOTTOM[1]);
const PANEL_FRONT: [number, number] = [0.4, 0.98];
const PANEL_BACK: [number, number] = [0.13, 1.05];
const PIECES = ['#4cc9f0', '#ffd166', '#b388eb', '#06d6a0', '#ef476f', '#4f86f7', '#ff8a5b'];

function slab(points: [number, number][], thick: number, x0: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(x0 + thick, 0, 0);
  return geo;
}

export function buildCabinet(): CabinetModel {
  const { width: W } = CABINET;
  const group = new THREE.Group();
  const inner = W - 2 * SIDE_T;
  group.add(mesh(slab(BODY, inner, -inner / 2), toon('#1b1d3a')));
  const sideMat = toon('#4361ee');
  for (const x0 of [-W / 2, W / 2 - SIDE_T]) group.add(mesh(slab(SIDE, SIDE_T, x0), sideMat));

  const cube = new THREE.BoxGeometry(0.02, 0.1, 0.1);
  [
    [0.02, 1.62, 4],
    [-0.09, 1.62, 4],
    [-0.09, 1.51, 4],
    [-0.2, 1.51, 4],
    [0.02, 1.39, 6],
    [0.02, 1.28, 6],
    [0.02, 1.17, 6],
    [-0.09, 1.17, 6],
    [-0.12, 0.62, 2],
    [-0.01, 0.62, 2],
    [0.1, 0.62, 2],
    [-0.01, 0.51, 2],
  ].forEach(([u, v, c]) => {
    for (const sx of [-1, 1]) group.add(mesh(cube, toon(PIECES[c]), sx * (W / 2 + 0.01), v, u, false));
  });

  const marquee = document.createElement('canvas');
  marquee.width = 512;
  marquee.height = 160;
  paintMarquee(marquee);
  const marqueeTex = new THREE.CanvasTexture(marquee);
  marqueeTex.colorSpace = THREE.SRGBColorSpace;
  marqueeTex.anisotropy = 4;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(inner, 0.25), new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false }));
  sign.position.set(0, 1.765, 0.192);
  group.add(sign);
  void document.fonts.ready.then(() => {
    paintMarquee(marquee);
    marqueeTex.needsUpdate = true;
  });

  const [bu, bv] = SCREEN_BOTTOM;
  const [tu, tv] = SCREEN_TOP;
  const out = new THREE.Vector2(Math.cos(LEAN), Math.sin(LEAN));
  const bezel = mesh(new THREE.PlaneGeometry(inner - 0.04, 0.5), toon('#0b1320'), 0, (bv + tv) / 2 + out.y * 0.002, (bu + tu) / 2 + out.x * 0.002, false);
  bezel.rotation.x = -LEAN;
  group.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshBasicMaterial({ color: '#070b14', toneMapped: false }));
  screen.position.set(0, (bv + tv) / 2 + out.y * 0.005, (bu + tu) / 2 + out.x * 0.005);
  screen.rotation.x = -LEAN;
  group.add(screen);

  const panel = new THREE.Group();
  const [fu, fv] = PANEL_FRONT;
  const [pu, pv] = PANEL_BACK;
  panel.position.set(0, (fv + pv) / 2, (fu + pu) / 2);
  panel.rotation.x = Math.atan2(pv - fv, fu - pu);
  panel.add(mesh(new THREE.BoxGeometry(inner, 0.012, Math.hypot(fu - pu, fv - pv)), toon('#ffd166'), 0, 0.006, 0, false));
  panel.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 16), toon('#2b2d42'), -0.16, 0.02, 0.01, false));
  panel.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8), toon('#adb5bd'), -0.16, 0.075, 0.01, false));
  panel.add(mesh(new THREE.SphereGeometry(0.035, 14, 10), toon('#ef476f'), -0.16, 0.135, 0.01));
  ['#ef476f', '#4cc9f0', '#06d6a0'].forEach((c, i) => panel.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.025, 14), toon(c, { emissive: c }), 0.02 + i * 0.1, 0.02, i === 1 ? -0.03 : 0.02, false)));
  group.add(panel);

  group.add(mesh(roundedBox(0.34, 0.32, 0.02, 0.02), toon('#2b2d42'), 0, 0.5, 0.265, false));
  for (const sx of [-1, 1]) group.add(mesh(new THREE.BoxGeometry(0.035, 0.075, 0.012), toon('#ff8a5b', { emissive: '#ff5a1f' }), sx * 0.07, 0.56, 0.278, false));
  group.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.012), toon('#8d99ae'), 0, 0.43, 0.278, false));
  group.add(mesh(new THREE.BoxGeometry(inner, 0.1, 0.01), toon('#0b1320'), 0, 0.05, 0.266, false));

  return { group, screen };
}

function paintMarquee(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#3a0ca3');
  grad.addColorStop(1, '#1b1d3a');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 84px Heebo, Nunito, ui-rounded, system-ui, sans-serif';
  const letters = [...'BLOCKFALL'];
  const widths = letters.map((ch) => g.measureText(ch).width);
  let x = c.width / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  letters.forEach((ch, i) => {
    g.fillStyle = PIECES[i % PIECES.length];
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 16;
    g.fillText(ch, x + widths[i] / 2, c.height / 2 + 4);
    x += widths[i];
  });
  g.shadowBlur = 0;
}
