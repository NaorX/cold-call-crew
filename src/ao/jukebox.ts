// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import { mesh, roundedBox, textSprite, toon, toonUnique } from './toon';
const JUKEBOX = { width: 1.3, depth: 0.72, height: 1.85 } as const;

export interface JukeboxView {
  group: THREE.Group;
  show(on: boolean, title: string): void;
  update(t: number, dt: number, beat: number): void;
}

const NOTES = ['♪', '♫', '♪', '♬', '♫'];

export function buildJukebox(): JukeboxView {
  const { width: W, depth: D, height: H } = JUKEBOX;
  const r = W / 2;
  const group = new THREE.Group();

  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, H - r);
  shape.absarc(0, H - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  const body = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 24 });
  body.translate(0, 0, -D / 2);
  group.add(mesh(body, toon('#d64545')));
  group.add(mesh(new THREE.BoxGeometry(W + 0.12, 0.1, D + 0.12), toon('#2b2d42'), 0, 0.05, 0));

  const front = D / 2 + 0.035;
  const neon = toonUnique('#ffd166');
  neon.emissive = new THREE.Color('#ffd166');
  const tubeR = r - 0.1;
  const legLen = H - r - 0.3;
  group.add(mesh(new THREE.TorusGeometry(tubeR, 0.045, 8, 36, Math.PI), neon, 0, H - r, front, false));
  for (const sx of [-1, 1]) group.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, legLen, 8), neon, sx * tubeR, 0.3 + legLen / 2, front, false));

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.41), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, H - r + 0.02, front + 0.005);
  group.add(screen);

  ['#ef476f', '#ffd166', '#06d6a0', '#4cc9f0', '#9d4edd'].forEach((c, i) => group.add(mesh(roundedBox(0.1, 0.05, 0.05, 0.02), toon(c), (i - 2) * 0.14, 0.98, front, false)));
  group.add(mesh(new THREE.BoxGeometry(0.82, 0.52, 0.03), toon('#2b2d42'), 0, 0.58, front - 0.01, false));
  for (let i = 0; i < 5; i++) group.add(mesh(new THREE.BoxGeometry(0.78, 0.035, 0.03), toon('#dfe6ee'), 0, 0.38 + i * 0.1, front + 0.01, false));

  const notes = NOTES.map((n, i) => {
    const s = textSprite(n, { color: ['#ef476f', '#4f86f7', '#06d6a0', '#9d4edd', '#ff8a5b'][i], size: 96 });
    s.scale.multiplyScalar(0.55);
    s.visible = false;
    group.add(s);
    return s;
  });

  let on = false;
  let shown = '';
  const paint = (title: string) => {
    const g = canvas.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, on ? '#3a0ca3' : '#2b2d42');
    grad.addColorStop(1, on ? '#1b1d2e' : '#1b1d2e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = on ? '#ffd166' : '#8d99ae';
    g.font = '900 44px Heebo, Nunito, ui-rounded, system-ui, sans-serif';
    g.fillText(on ? '♪ NOW PLAYING ♪' : 'JUKEBOX', 256, 70);
    g.fillStyle = on ? '#ffffff' : '#8d99ae';
    let size = 58;
    const text = on ? title : 'press E to play';
    do g.font = `800 ${size--}px Heebo, Nunito, ui-rounded, system-ui, sans-serif`;
    while (g.measureText(text).width > 470 && size > 26);
    g.fillText(text, 256, 160);
    tex.needsUpdate = true;
  };

  const show = (playing: boolean, title: string) => {
    const k = `${playing}|${title}`;
    if (k === shown) return;
    shown = k;
    on = playing;
    paint(title);
    neon.color.set(on ? '#1b1d2e' : '#b8b2a7');
    if (!on) {
      neon.emissive.set('#000000');
      for (const n of notes) n.visible = false;
    }
  };
  show(false, '');

  const update = (t: number, _dt: number, beat: number) => {
    if (!on) return;
    neon.emissive.setHSL((t * 0.05) % 1, 0.85, 0.55);
    neon.emissiveIntensity = 0.55 + 0.9 * beat;
    notes.forEach((n, i) => {
      const k = (t * 0.35 + i / notes.length) % 1;
      n.visible = true;
      n.position.set(Math.sin(t * 1.3 + i * 2.1) * 0.35, H + 0.1 + k * 1.3, 0.1);
      n.material.opacity = Math.min(1, k * 5) * (1 - k);
    });
  };

  return { group, show, update };
}
