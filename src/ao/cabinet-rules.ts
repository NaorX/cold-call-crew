// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
export const GAME = 'BLOCKFALL';
export const WELL_COLS = 10;
export const WELL_ROWS = 20;
export const SCORES_KEPT = 10;
const SCORE_MAX = 99_999_999;
export const CLEAR_POINTS = [0, 100, 300, 500, 800];

export function levelFor(lines: number): number {
  return Math.min(99, 1 + Math.floor(lines / 10));
}

export type PlayState = 'play' | 'paused' | 'over';

export interface CabinetFrame {
  cells: string;
  next: number;
  hold: number;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  state: PlayState;
}

export interface HighScore {
  game: string;
  name: string;
  color: string;
  score: number;
  lines: number;
  level: number;
  at: number;
}

export interface CabinetState {
  player: { id: string; name: string; game: string } | null;
  scores: HighScore[];
}

export interface CabinetView extends CabinetState {
  frame: CabinetFrame | null;
}

export function scoreText(n: number): string {
  return n.toLocaleString('en-US');
}

const CELLS_RE = new RegExp(`^[0-8]{${WELL_COLS * WELL_ROWS}}$`);
const GAME_RE = /^[a-z0-9]{8,32}$/;

const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

export function checkFrame(raw: unknown): CabinetFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const cells = typeof f.cells === 'string' && CELLS_RE.test(f.cells) ? f.cells : null;
  const next = int(f.next, 1, 7);
  const hold = int(f.hold, 0, 7);
  const score = int(f.score, 0, SCORE_MAX);
  const lines = int(f.lines, 0, SCORE_MAX);
  const level = int(f.level, 1, 99);
  const pieces = int(f.pieces, 0, SCORE_MAX);
  const state = f.state === 'play' || f.state === 'paused' || f.state === 'over' ? f.state : null;
  if (cells === null || next === null || hold === null || score === null || lines === null || level === null || pieces === null || !state) return null;
  return { cells, next, hold, score, lines, level, pieces, state };
}

export function checkScore(raw: { game?: unknown; score?: unknown; lines?: unknown; level?: unknown }): Pick<HighScore, 'game' | 'score' | 'lines' | 'level'> | null {
  const game = typeof raw.game === 'string' && GAME_RE.test(raw.game) ? raw.game : null;
  const score = int(raw.score, 0, SCORE_MAX);
  const lines = int(raw.lines, 0, SCORE_MAX);
  const level = int(raw.level, 1, 99);
  if (game === null || score === null || lines === null || level === null) return null;
  return { game, score, lines, level };
}
