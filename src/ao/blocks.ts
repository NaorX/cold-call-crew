// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import { CLEAR_POINTS, GAME, WELL_COLS, WELL_ROWS, levelFor, scoreText, type CabinetFrame, type HighScore, type PlayState } from './cabinet-rules';

export const W = 800;
export const H = 600;

const COLS = WELL_COLS;
const HIDDEN = 2;
const ROWS = WELL_ROWS + HIDDEN;
const GHOST = 8;

const SHAPES: readonly (readonly [number, number][])[] = [
  [],
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
];
const BOX = [0, 4, 2, 3, 3, 3, 3, 3];
export const COLORS = ['', '#4cc9f0', '#ffd166', '#b388eb', '#06d6a0', '#ef476f', '#4f86f7', '#ff8a5b'];

const KICKS: readonly (readonly [number, number][])[] = [
  [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
];
const I_KICKS: readonly (readonly [number, number][])[] = [
  [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
];

const LOCK_DELAY = 0.5;
const LOCK_RESETS = 15;
const DAS = 0.16;
const ARR = 0.045;
const SOFT_DROP = 20;

interface Piece {
  kind: number;
  rot: number;
  x: number;
  y: number;
}

function blocks(kind: number, rot: number): [number, number][] {
  const n = BOX[kind];
  return SHAPES[kind].map(([x, y]) => {
    for (let r = 0; r < rot; r++) [x, y] = [n - 1 - y, x];
    return [x, y];
  });
}

function gravity(level: number): number {
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1);
}

export class Blocks {
  private well = new Uint8Array(COLS * ROWS);
  private piece!: Piece;
  private bag: number[] = [];
  private queue: number[] = [];
  private held = 0;
  private swapped = false;
  state: PlayState = 'play';
  score = 0;
  lines = 0;
  level = 1;
  pieces = 0;
  version = 0;
  onLand?: (cleared: number) => void;
  id = '';
  private fall = 0;
  private lockT = 0;
  private resets = 0;
  private soft = false;
  private left = false;
  private right = false;
  private slide = 0;
  private repeat = 0;

  constructor() {
    this.queue.push(this.draw());
    this.spawn();
  }

  get over(): boolean {
    return this.state === 'over';
  }

  press(dir: -1 | 1) {
    if (dir < 0) this.left = true;
    else this.right = true;
    this.slide = dir;
    this.repeat = DAS;
    if (this.state === 'play') this.shift(dir);
  }

  release(dir: -1 | 1) {
    if (dir < 0) this.left = false;
    else this.right = false;
    if (this.slide === dir) {
      this.slide = this.left ? -1 : this.right ? 1 : 0;
      this.repeat = DAS;
    }
  }

  releaseAll() {
    this.left = this.right = this.soft = false;
    this.slide = 0;
  }

  softDrop(on: boolean) {
    this.soft = on;
  }

  hardDrop() {
    if (this.state !== 'play') return;
    let rows = 0;
    while (this.fits(this.piece, 0, rows + 1)) rows++;
    this.piece.y += rows;
    this.score += rows * 2;
    this.lock();
  }

  rotate(dir: 1 | -1) {
    if (this.state !== 'play') return;
    const p = this.piece;
    const to = (p.rot + dir + 4) % 4;
    const table = p.kind === 1 ? I_KICKS : KICKS;
    const kicks = dir > 0 ? table[p.rot] : table[to].map(([x, y]) => [-x, -y]);
    for (const [kx, ky] of kicks) {
      const turned = { ...p, rot: to };
      if (!this.fits(turned, kx, -ky)) continue;
      this.piece = { ...turned, x: p.x + kx, y: p.y - ky };
      this.moved();
      return;
    }
  }

  hold() {
    if (this.state !== 'play' || this.swapped) return;
    const kind = this.piece.kind;
    if (this.held) this.spawn(this.held);
    else this.spawn();
    this.held = kind;
    this.swapped = true;
  }

  pause(on: boolean) {
    if (this.over || on === (this.state === 'paused')) return;
    this.state = on ? 'paused' : 'play';
    this.releaseAll();
    this.version++;
  }

  update(dt: number) {
    if (this.state !== 'play') return;
    if (this.slide) {
      this.repeat -= dt;
      while (this.repeat <= 0 && this.shift(this.slide)) this.repeat += ARR;
      if (this.repeat <= 0) this.repeat = ARR;
    }
    const perRow = this.soft ? Math.min(gravity(this.level), 1 / SOFT_DROP) : gravity(this.level);
    this.fall += dt;
    while (this.fall >= perRow) {
      this.fall -= perRow;
      if (!this.fits(this.piece, 0, 1)) {
        this.fall = 0;
        break;
      }
      this.piece.y++;
      if (this.soft) this.score++;
      this.version++;
    }
    if (this.fits(this.piece, 0, 1)) this.lockT = 0;
    else if ((this.lockT += dt) >= LOCK_DELAY) this.lock();
  }

  frame(): CabinetFrame {
    const cells = this.well.slice(HIDDEN * COLS);
    if (this.state !== 'over') {
      let drop = 0;
      while (this.fits(this.piece, 0, drop + 1)) drop++;
      for (const [x, y] of this.at(this.piece, 0, drop)) if (y >= HIDDEN && !cells[(y - HIDDEN) * COLS + x]) cells[(y - HIDDEN) * COLS + x] = GHOST;
      for (const [x, y] of this.at(this.piece)) if (y >= HIDDEN) cells[(y - HIDDEN) * COLS + x] = this.piece.kind;
    }
    return { cells: cells.join(''), next: this.queue[0], hold: this.held, score: this.score, lines: this.lines, level: this.level, pieces: this.pieces, state: this.state };
  }

  private draw(): number {
    if (!this.bag.length) {
      this.bag = [1, 2, 3, 4, 5, 6, 7];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  private spawn(kind?: number) {
    if (!kind) {
      kind = this.queue.shift()!;
      this.queue.push(this.draw());
    }
    this.piece = { kind, rot: 0, x: kind === 2 ? 4 : 3, y: 1 };
    this.fall = this.lockT = this.resets = 0;
    this.swapped = false;
    if (!this.fits(this.piece)) this.state = 'over';
    this.version++;
  }

  private shift(dx: number): boolean {
    if (!this.fits(this.piece, dx, 0)) return false;
    this.piece.x += dx;
    this.moved();
    return true;
  }

  private moved() {
    if (!this.fits(this.piece, 0, 1) && this.resets < LOCK_RESETS) {
      this.lockT = 0;
      this.resets++;
    }
    this.version++;
  }

  private at(p: Piece, dx = 0, dy = 0): [number, number][] {
    return blocks(p.kind, p.rot).map(([x, y]) => [p.x + x + dx, p.y + y + dy]);
  }

  private fits(p: Piece, dx = 0, dy = 0): boolean {
    return this.at(p, dx, dy).every(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !this.well[y * COLS + x]);
  }

  private lock() {
    const cells = this.at(this.piece);
    for (const [x, y] of cells) this.well[y * COLS + x] = this.piece.kind;
    this.pieces++;
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (!this.well.subarray(y * COLS, (y + 1) * COLS).every(Boolean)) continue;
      this.well.copyWithin(COLS, 0, y * COLS);
      this.well.fill(0, 0, COLS);
      cleared++;
      y++;
    }
    if (cleared) {
      this.score += CLEAR_POINTS[cleared] * this.level;
      this.lines += cleared;
      this.level = levelFor(this.lines);
    }
    this.onLand?.(cleared);
    if (cells.every(([, y]) => y < HIDDEN)) {
      this.state = 'over';
      this.version++;
      return;
    }
    this.spawn();
  }
}

export interface ScreenView {
  frame: CabinetFrame | null;
  player?: string;
  scores: readonly HighScore[];
  mine?: string;
  note?: string;
  prompt?: string;
  t: number;
}

const FONT = "Heebo, Nunito, ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
const CELL = 27;
const X0 = (W - COLS * CELL) / 2;
const Y0 = 36;
const INK = '#0b1320';
const TEXT = '#f1ede4';
const DIM = '#8d99ae';
const NEON = '#ff5ecb';

export function paintScreen(g: CanvasRenderingContext2D, v: ScreenView) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1b1d3a');
  bg.addColorStop(1, INK);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'middle';
  if (v.frame) paintGame(g, v.frame, v);
  else paintAttract(g, v);
  g.fillStyle = 'rgba(0, 0, 0, 0.12)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1.5);
}

function paintGame(g: CanvasRenderingContext2D, f: CabinetFrame, v: ScreenView) {
  g.fillStyle = '#070b14';
  g.fillRect(X0, Y0, COLS * CELL, WELL_ROWS * CELL);
  g.strokeStyle = NEON;
  g.lineWidth = 4;
  g.shadowColor = NEON;
  g.shadowBlur = 14;
  g.strokeRect(X0 - 4, Y0 - 4, COLS * CELL + 8, WELL_ROWS * CELL + 8);
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  g.lineWidth = 1;
  for (let c = 1; c < COLS; c++) line(g, X0 + c * CELL, Y0, X0 + c * CELL, Y0 + WELL_ROWS * CELL);
  for (let r = 1; r < WELL_ROWS; r++) line(g, X0, Y0 + r * CELL, X0 + COLS * CELL, Y0 + r * CELL);
  for (let i = 0; i < f.cells.length; i++) {
    const k = f.cells.charCodeAt(i) - 48;
    if (!k) continue;
    const x = X0 + (i % COLS) * CELL;
    const y = Y0 + Math.floor(i / COLS) * CELL;
    if (k === GHOST) ghost(g, x, y, CELL);
    else block(g, x, y, CELL, COLORS[k], f.state === 'over');
  }

  const lx = X0 / 2;
  const rx = W - X0 / 2;
  label(g, 'HOLD', lx, 62);
  preview(g, f.hold, lx, 112);
  label(g, 'SCORE', lx, 196);
  value(g, scoreText(f.score), lx, 228, 32);
  label(g, 'LINES', lx, 282);
  value(g, String(f.lines), lx, 312, 28);
  label(g, 'LEVEL', lx, 362);
  value(g, String(f.level), lx, 392, 28);
  if (v.player) {
    g.textAlign = 'center';
    g.fillStyle = '#ffd166';
    g.font = `900 20px ${FONT}`;
    g.fillText(`▶ ${fit(g, v.player.toUpperCase(), 190)}`, lx, 470);
  }
  const best = v.scores[0];
  if (best) {
    g.textAlign = 'center';
    g.fillStyle = DIM;
    g.font = `800 16px ${FONT}`;
    g.fillText(`HI ${scoreText(Math.max(best.score, f.score))}`, lx, 502);
  }
  label(g, 'NEXT', rx, 62);
  preview(g, f.next, rx, 112);
  label(g, 'HIGH SCORES', rx, 196);
  if (v.scores.length) table(g, v.scores, rx - 100, 200, 228, 30, 16, v.mine);
  else value(g, 'Be the first!', rx, 228, 18);

  if (f.state === 'paused') {
    banner(g, 'PAUSED', v.note ?? 'P to carry on', '#4f86f7');
  } else if (f.state === 'over') {
    banner(g, 'GAME OVER', v.prompt ?? scoreText(f.score), '#e63946');
  }
}

function paintAttract(g: CanvasRenderingContext2D, v: ScreenView) {
  g.textAlign = 'center';
  g.font = `900 76px ${FONT}`;
  const letters = [...GAME];
  const widths = letters.map((ch) => g.measureText(ch).width);
  let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  letters.forEach((ch, i) => {
    g.fillStyle = COLORS[(i % 7) + 1];
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 18;
    g.fillText(ch, x + widths[i] / 2, 74);
    x += widths[i];
  });
  g.shadowBlur = 0;
  label(g, '🏆 HIGH SCORES', W / 2, 142);
  if (v.scores.length) table(g, v.scores, W / 2 - 250, 500, 182, 35, 24, v.mine);
  else {
    g.fillStyle = DIM;
    g.font = `800 22px ${FONT}`;
    g.fillText('No scores yet. Be the first!', W / 2, 300);
  }
  if (Math.floor(v.t * 1.6) % 2 === 0) {
    g.fillStyle = '#ffd166';
    g.font = `900 30px ${FONT}`;
    g.fillText(v.prompt ?? 'PRESS E TO PLAY', W / 2, 562);
  }
}

function table(g: CanvasRenderingContext2D, scores: readonly HighScore[], x: number, width: number, y: number, step: number, size: number, mine?: string) {
  scores.forEach((s, i) => {
    const cy = y + i * step;
    if (s.game === mine) {
      g.fillStyle = 'rgba(255, 209, 102, 0.22)';
      g.beginPath();
      g.roundRect(x - 8, cy - step / 2 + 2, width + 16, step - 4, 8);
      g.fill();
    }
    g.font = `900 ${size}px ${FONT}`;
    const score = scoreText(s.score);
    const place = size * 1.6;
    g.textAlign = 'left';
    g.fillStyle = i === 0 ? '#ffd166' : DIM;
    g.fillText(String(i + 1), x, cy);
    g.fillStyle = s.color;
    g.fillText(fit(g, s.name, width - place - g.measureText(score).width - size), x + place, cy);
    g.textAlign = 'right';
    g.fillStyle = TEXT;
    g.fillText(score, x + width, cy);
  });
}

function block(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, dull = false) {
  g.globalAlpha = dull ? 0.45 : 1;
  g.fillStyle = color;
  g.fillRect(x + 1, y + 1, size - 2, size - 2);
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  g.fillRect(x + 1, y + 1, size - 2, 4);
  g.fillRect(x + 1, y + 1, 4, size - 2);
  g.fillStyle = 'rgba(0, 0, 0, 0.25)';
  g.fillRect(x + 1, y + size - 5, size - 2, 4);
  g.fillRect(x + size - 5, y + 1, 4, size - 2);
  g.globalAlpha = 1;
}

function ghost(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  g.strokeStyle = 'rgba(241, 237, 228, 0.35)';
  g.lineWidth = 2;
  g.strokeRect(x + 3, y + 3, size - 6, size - 6);
}

function preview(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number) {
  g.fillStyle = '#070b14';
  g.beginPath();
  g.roundRect(cx - 62, cy - 36, 124, 72, 12);
  g.fill();
  if (!kind) return;
  const cells = blocks(kind, 0);
  const size = 22;
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const ox = cx - ((Math.min(...xs) + Math.max(...xs) + 1) * size) / 2;
  const oy = cy - ((Math.min(...ys) + Math.max(...ys) + 1) * size) / 2;
  for (const [x, y] of cells) block(g, ox + x * size, oy + y * size, size, COLORS[kind]);
}

function banner(g: CanvasRenderingContext2D, title: string, sub: string, color: string) {
  g.fillStyle = 'rgba(7, 11, 20, 0.72)';
  g.fillRect(X0, Y0, COLS * CELL, WELL_ROWS * CELL);
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(X0 - 30, H / 2 - 62, COLS * CELL + 60, 112, 16);
  g.fill();
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = `900 44px ${FONT}`;
  g.fillText(title, W / 2, H / 2 - 22);
  g.font = `800 18px ${FONT}`;
  g.fillText(fit(g, sub, COLS * CELL + 40), W / 2, H / 2 + 22);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number) {
  g.textAlign = 'center';
  g.fillStyle = DIM;
  g.font = `900 16px ${FONT}`;
  g.fillText(text, x, y);
}

function value(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  g.textAlign = 'center';
  g.fillStyle = TEXT;
  g.font = `900 ${size}px ${FONT}`;
  g.fillText(fit(g, text, 200), x, y);
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}
