import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export function carpetTexture() {
  const [c, ctx] = canvas(512, 512);
  const cells = 4;
  const s = 512 / cells;
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      const dark = (x + y) % 2 === 0;
      ctx.fillStyle = dark ? '#8a9bb0' : '#9aabc0';
      ctx.fillRect(x * s, y * s, s, s);
      ctx.strokeStyle = dark ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
      for (let k = 0; k < s; k += 4) {
        ctx.beginPath();
        if (dark) {
          ctx.moveTo(x * s + k, y * s);
          ctx.lineTo(x * s + k, y * s + s);
        } else {
          ctx.moveTo(x * s, y * s + k);
          ctx.lineTo(x * s + s, y * s + k);
        }
        ctx.stroke();
      }
    }
  speckle(ctx, 512, 512, 9000, 0.25);
  speckle(ctx, 512, 512, 3000, 0.08, true);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, 512);
    ctx.moveTo(0, i * s);
    ctx.lineTo(512, i * s);
    ctx.stroke();
  }
  return tex(c, 1);
}

export function ceilingTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#e4ded3';
  ctx.fillRect(0, 0, 128, 3);
  ctx.fillRect(0, 0, 3, 128);
  return tex(c, 1);
}

export function fabricTexture(color = '#4a3f78') {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`;
    ctx.fillRect(0, y, 256, 1);
  }
  for (let x = 0; x < 256; x += 2) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    ctx.fillRect(x, 0, 1, 256);
  }
  speckle(ctx, 256, 256, 2500, 0.15);
  return tex(c, 1);
}

export function wallTexture(color = '#cdbfa8') {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 6000, 0.06);
  speckle(ctx, 256, 256, 2000, 0.05, true);
  return tex(c, 1);
}

export function woodTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#a7774a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(70,40,20,${0.08 + Math.random() * 0.15})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
    ctx.stroke();
  }
  return tex(c, 1);
}

export function stickyTexture(seed: number) {
  const [c, ctx] = canvas(128, 128);
  const colors = ['#fff27a', '#ffd36b', '#ffb3c7', '#a8f0c6', '#9fd8ff'];
  ctx.fillStyle = colors[seed % colors.length];
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, 0, 128, 18);
  ctx.strokeStyle = '#3b3550';
  ctx.lineWidth = 3;
  ctx.font = 'bold 20px "Comic Sans MS", cursive';
  ctx.fillStyle = '#3b3550';
  const notes = ['555-0199', 'CALL BACK', 'quota!!', 'be nice', 'lunch?', 'IRS script', 'smile :)', 'grandma Mon', '$$$', 'NO REFUNDS', 'Dont say scam'];
  ctx.fillText(notes[seed % notes.length], 10, 52);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(10, 75 + i * 16);
    for (let x = 10; x < 110; x += 8) ctx.lineTo(x, 75 + i * 16 + Math.sin(x * 0.4 + seed) * 3);
  }
  ctx.stroke();
  return tex(c, 1);
}

export function paperTexture() {
  const [c, ctx] = canvas(128, 160);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = 'rgba(40,40,60,0.35)';
  for (let y = 20; y < 150; y += 9) ctx.fillRect(12, y, 60 + Math.random() * 46, 3);
  return tex(c, 1);
}

export function skyTexture() {
  const [c, ctx] = canvas(64, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#ff9a4a');
  g.addColorStop(0.45, '#ffc070');
  g.addColorStop(0.7, '#ffd9a0');
  g.addColorStop(1, '#ff8a50');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function whiteboardTexture() {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = '#f7f7f4';
  ctx.fillRect(0, 0, 512, 256);
  ctx.font = 'bold 34px "Comic Sans MS", cursive';
  ctx.fillStyle = '#c62828';
  ctx.fillText('QUOTA OR GOODBYE', 40, 60);
  ctx.strokeStyle = '#1565c0';
  ctx.lineWidth = 4;
  ctx.font = '24px "Comic Sans MS", cursive';
  ctx.fillStyle = '#1565c0';
  ctx.fillText('1. Be confident', 50, 110);
  ctx.fillText('2. Gift cards > cash', 50, 145);
  ctx.fillText('3. Never say the S word', 50, 180);
  ctx.beginPath();
  ctx.moveTo(330, 200);
  ctx.lineTo(380, 120);
  ctx.lineTo(420, 160);
  ctx.lineTo(480, 70);
  ctx.stroke();
  ctx.fillStyle = '#2e7d32';
  ctx.fillText('$$$ ↑', 420, 220);
  return tex(c, 1);
}

export function clockFaceTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#fbfaf5';
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#222';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(64 + Math.sin(a) * 52 - 2, 64 - Math.cos(a) * 52 - 2, 4, 4);
  }
  return tex(c, 1);
}

export class ScreenSaver {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  constructor(public kind: number) {
    [this.canvas, this.ctx] = canvas(128, 80);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw(0);
  }
  draw(t: number) {
    const { ctx } = this;
    const w = 128;
    const h = 80;
    if (this.kind === 0) {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const dx = x - w / 2;
          const dy = y - h / 2;
          const a = Math.atan2(dy, dx);
          const r = Math.sqrt(dx * dx + dy * dy);
          const v = Math.sin(a * 3 + r * 0.25 - t * 3);
          const i = (y * w + x) * 4;
          img.data[i] = 128 + 127 * Math.sin(v * 3 + t);
          img.data[i + 1] = 128 + 127 * Math.sin(v * 3 + t + 2);
          img.data[i + 2] = 128 + 127 * Math.sin(v * 3 + t + 4);
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    } else if (this.kind === 1) {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const v = Math.sin(x * 0.08 + t) + Math.sin(y * 0.11 - t * 1.3) + Math.sin((x + y) * 0.06 + t * 0.7);
          const i = (y * w + x) * 4;
          img.data[i] = 40 + 60 * (1 + Math.sin(v * 2));
          img.data[i + 1] = 120 + 120 * Math.sin(v * 2 + 1.5) * 0.5;
          img.data[i + 2] = 40;
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    } else if (this.kind === 2) {
      ctx.fillStyle = '#f2efe6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b5ea8';
      ctx.fillRect(0, 0, w, 10);
      ctx.fillStyle = 'rgba(30,30,50,0.6)';
      const off = Math.floor(t * 6) % 10;
      for (let y = 16; y < h; y += 7) ctx.fillRect(6, y, 30 + ((y * 13 + off * 7) % 80), 3);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c8d6c8';
      for (let x = 0; x < w; x += 16) ctx.strokeRect(x, 0, 16, h);
      for (let y = 0; y < h; y += 8) ctx.strokeRect(0, y, w, 8);
      ctx.fillStyle = '#1e7a3c';
      ctx.fillRect(0, 0, w, 8);
      const cx = Math.floor(t * 2) % 8;
      ctx.fillStyle = 'rgba(30,120,60,0.35)';
      ctx.fillRect(cx * 16, 8 + (Math.floor(t * 3) % 8) * 8, 16, 8);
    }
    this.texture.needsUpdate = true;
  }
}

export class Board {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  constructor(w: number, h: number) {
    [this.canvas, this.ctx] = canvas(w, h);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }
  draw(fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    fn(this.ctx, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }
}

export function logoSignTexture() {
  const [c, ctx] = canvas(1024, 512);
  const g = ctx.createRadialGradient(512, 256, 40, 512, 256, 560);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(1, '#f4c25a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 1024, Math.random() * 512, 6 + Math.random() * 18, 0, 7);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(512, 230);
  ctx.rotate(-0.06);
  ctx.font = '900 150px "Luckiest Guy", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 26;
  ctx.strokeStyle = '#1a0f08';
  ctx.strokeText('COLD CALL', 0, 0);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText('COLD CALL', 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.35;
  ctx.fillText('COLD CALL', -4, -6);
  ctx.globalAlpha = 1;
  ctx.translate(60, 120);
  ctx.rotate(0.08);
  ctx.fillStyle = '#e5483b';
  ctx.strokeStyle = '#1a0f08';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.roundRect(-170, -70, 340, 110, 18);
  ctx.fill();
  ctx.stroke();
  ctx.font = '900 92px "Luckiest Guy", Impact, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('CREW', 0, 16);
  ctx.restore();
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function vinylTexture() {
  const [c, ctx] = canvas(256, 256);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#efe6d6' : '#e2d6c2';
      ctx.fillRect(x * 64, y * 64, 64, 64);
    }
  speckle(ctx, 256, 256, 5000, 0.12);
  speckle(ctx, 256, 256, 2000, 0.06, true);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
  }
  return tex(c, 1);
}

export function corkTexture() {
  const [c, ctx] = canvas(256, 192);
  ctx.fillStyle = '#b98a5a';
  ctx.fillRect(0, 0, 256, 192);
  speckle(ctx, 256, 192, 5000, 0.25);
  const colors = ['#fff27a', '#ffb3c7', '#a8f0c6', '#ffffff', '#9fd8ff'];
  for (let i = 0; i < 9; i++) {
    ctx.save();
    ctx.translate(20 + (i % 3) * 80 + Math.random() * 10, 20 + Math.floor(i / 3) * 58 + Math.random() * 8);
    ctx.rotate((Math.random() - 0.5) * 0.3);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(0, 0, 56, 44);
    ctx.fillStyle = 'rgba(40,40,60,0.6)';
    for (let k = 0; k < 4; k++) ctx.fillRect(6, 10 + k * 8, 30 + Math.random() * 14, 2);
    ctx.fillStyle = '#d33';
    ctx.beginPath();
    ctx.arc(28, 3, 4, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  return tex(c, 1);
}
