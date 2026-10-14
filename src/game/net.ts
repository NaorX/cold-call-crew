import { RoomLogic } from '../shared/room.js';
import { bus } from './bus';
import { settings } from './settings';
import type { PlayerInfo, RunInfo } from './types';

export interface Room {
  send(msg: any): void;
  close(): void;
  readonly online: boolean;
}

export const crew = {
  me: '',
  code: '',
  host: '',
  online: false,
  run: null as RunInfo | null,
  world: { time: 'auto', weather: 'auto', jukebox: { track: null as string | null, at: 0, url: undefined as string | undefined }, ball: { holder: null as string | null, shot: null as any } },
  skew: 0,
  players: [] as PlayerInfo[],
  get self(): PlayerInfo | undefined {
    return this.players.find((p) => p.id === this.me);
  },
  get isHost() {
    return this.me === this.host;
  },
};

let room: Room | null = null;

function onMessage(msg: any) {
  switch (msg.t) {
    case 'welcome':
      crew.me = msg.you;
      crew.code = msg.code;
      crew.host = msg.host;
      break;
    case 'state':
      crew.run = msg.run;
      crew.players = msg.players;
      crew.host = msg.host;
      if (msg.world) crew.world = msg.world;
      if (msg.now) crew.skew = Date.now() - msg.now;
      break;
    case 'ball':
      crew.world.ball = { holder: msg.holder, shot: msg.shot };
      if (msg.now) crew.skew = Date.now() - msg.now;
      break;
    case 'clock':
      if (crew.run) {
        crew.run.clock = msg.clock;
        crew.run.heat = msg.heat;
        if (msg.reviewIn !== undefined) crew.run.reviewIn = msg.reviewIn;
      }
      break;
  }
  bus.emit(`net:${msg.t}`, msg);
}

class LocalRoom implements Room {
  online = false;
  private logic: RoomLogic;
  private timer: number;
  private last = performance.now();
  constructor() {
    this.logic = new RoomLogic('SOLO', (_to: string | null, msg: any) => queueMicrotask(() => onMessage(msg)));
    this.logic.join('me', { name: settings.name, look: settings.look });
    this.timer = window.setInterval(() => {
      const now = performance.now();
      this.logic.tick(Math.min(0.5, (now - this.last) / 1000));
      this.last = now;
    }, 100);
  }
  send(msg: any) {
    this.logic.handle('me', msg);
  }
  close() {
    clearInterval(this.timer);
  }
}

class RemoteRoom implements Room {
  online = true;
  private ws: WebSocket;
  private queue: string[] = [];
  constructor(first: any, onFail: (text: string) => void) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify(first));
      for (const q of this.queue) this.ws.send(q);
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.t === 'error') onFail(msg.text);
        onMessage(msg);
      } catch {
      }
    };
    this.ws.onerror = () => onFail('Could not reach the crew server. Is `npm run dev` running?');
    this.ws.onclose = () => bus.emit('net:closed');
  }
  send(msg: any) {
    const s = JSON.stringify(msg);
    if (this.ws.readyState === 1) this.ws.send(s);
    else this.queue.push(s);
  }
  close() {
    this.ws.onclose = null;
    this.ws.close();
  }
}

function reset() {
  room?.close();
  room = null;
  crew.me = '';
  crew.code = '';
  crew.players = [];
  crew.run = null;
}

export function playSolo() {
  reset();
  crew.online = false;
  room = new LocalRoom();
}

export function hostCrew(onFail: (t: string) => void) {
  reset();
  crew.online = true;
  room = new RemoteRoom({ t: 'create', name: settings.name, look: settings.look }, onFail);
}

export function joinCrew(code: string, onFail: (t: string) => void) {
  reset();
  crew.online = true;
  room = new RemoteRoom({ t: 'join', code: code.trim().toUpperCase(), name: settings.name, look: settings.look }, onFail);
}

export function leaveCrew() {
  reset();
}

export function send(msg: any) {
  room?.send(msg);
}
