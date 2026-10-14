export const SHIFT_MINUTES = 480;
export const MAX_PLAYERS = 6;

export const UNLOCKS = [
  { day: 1, key: 'giftcard', label: 'Gift card scheme' },
  { day: 1, key: 'card', label: 'Credit card scheme' },
  { day: 2, key: 'baiters', label: 'Scambaiters on the line' },
  { day: 2, key: 'scammy', label: 'Scammy challenges' },
  { day: 2, key: 'scamazon', label: 'Scamazon opens: pranks and boosts' },
  { day: 3, key: 'remote', label: 'RemoteDesk "tech support"' },
  { day: 3, key: 'raids', label: 'Police raids' },
  { day: 4, key: 'outage', label: 'Power outages' },
];

export function unlockedFor(day) {
  return UNLOCKS.filter((u) => u.day <= day).map((u) => u.key);
}

export function quotaFor(day, players) {
  const base = 600 * Math.pow(1.2, day - 1) + 120 * (day - 1);
  const crew = 1 + 0.65 * Math.max(0, players - 1);
  return Math.round((base * crew) / 10) * 10;
}

const BOSS_LINES = [
  'Phones are quiet. Quiet phones do not pay rent. DIAL.',
  'Reminder: the coffee machine is for closers only.',
  'Whoever made $0 so far, I can see you on camera.',
  'Smile while you talk. They can hear it. Probably.',
  'Nobody leaves before quota. Nobody.',
  'If a caller says "is this a scam", say "no". Basic stuff, people.',
  'I just got a new boat. You did not help. Help me get a second boat.',
  'HR wants me to say "great job". Fine. Great job. Now faster.',
  'Lunch break is cancelled. Lunch is a mindset.',
  'Remember: confidence is 90% of the job. The other 10% is also confidence.',
];

const BOUNTIES = [
  { source: 'giftcard', reward: 150, text: 'Bounty: next gift card redeemed in 60 minutes gets +$150.' },
  { source: 'card', reward: 200, text: 'Bounty: land a card charge in the next 60 minutes, +$200 on top.', needs: 'card' },
  { source: 'remote', reward: 250, text: 'Bounty: pull off a RemoteDesk job within 60 minutes, +$250.', needs: 'remote' },
];

const DESK_COUNT = 6;

export class RoomLogic {
  constructor(code, emit) {
    this.code = code;
    this.emit = emit;
    this.players = new Map();
    this.hostId = null;
    this.run = this.freshRun();
    this.world = { time: 'auto', weather: 'auto', jukebox: { track: null, at: 0 }, ball: { holder: null, shot: null } };
    this.stateDirty = true;
    this.secAcc = 0;
  }

  freshRun() {
    return {
      phase: 'lobby',
      day: 1,
      clock: 0,
      shiftSeconds: 1200,
      overtime: 0,
      quota: 600,
      teamToday: 0,
      heat: 0,
      paused: false,
      lastRaid: -999,
      nextBoss: 25,
      review: null,
      unlocked: unlockedFor(1),
      bestDay: 1,
      total: 0,
      moments: [],
      quotes: [],
      reviewIn: 0,
    };
  }

  get size() {
    return this.players.size;
  }

  join(id, hello) {
    if (this.players.size >= MAX_PLAYERS) {
      this.emit(id, { t: 'error', text: 'This crew is full.' });
      return false;
    }
    const used = new Set([...this.players.values()].map((p) => p.desk));
    let desk = 0;
    while (used.has(desk) && desk < DESK_COUNT) desk++;
    const p = {
      id,
      name: String(hello?.name || 'Rookie').slice(0, 18),
      look: hello?.look || null,
      desk,
      ready: false,
      talking: false,
      onCall: null,
      personal: 0,
      today: 0,
      pose: null,
    };
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    this.emit(id, { t: 'welcome', you: id, code: this.code, host: this.hostId });
    this.system(`${p.name} clocked in.`);
    this.stateDirty = true;
    if (this.run.phase !== 'lobby') this.run.quota = quotaFor(this.run.day, this.players.size);
    return true;
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.world.ball.holder === id) this.world.ball = { holder: null, shot: null };
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    this.system(`${p.name} left the building.`);
    this.stateDirty = true;
  }

  system(text) {
    this.emit(null, { t: 'chat', from: 'SYSTEM', text, system: true, at: Date.now() });
  }

  handle(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg.t !== 'string') return;
    const isHost = id === this.hostId;
    const run = this.run;
    switch (msg.t) {
      case 'look':
        p.look = msg.look;
        if (msg.name) p.name = String(msg.name).slice(0, 18);
        this.stateDirty = true;
        break;
      case 'ready':
        p.ready = !!msg.on;
        this.stateDirty = true;
        break;
      case 'start':
        if (!isHost || run.phase !== 'lobby') return;
        run.shiftSeconds = clamp(Number(msg.shiftSeconds) || 1200, 120, 3600);
        this.startDay(1);
        break;
      case 'continue':
        if (!isHost || run.phase !== 'review') return;
        this.startDay(run.day + 1);
        break;
      case 'restart':
        if (!isHost || (run.phase !== 'fired' && run.phase !== 'review')) return;
        {
          const secs = run.shiftSeconds;
          this.run = this.freshRun();
          this.run.shiftSeconds = secs;
          for (const q of this.players.values()) {
            q.personal = 0;
            q.today = 0;
          }
          this.startDay(1);
        }
        break;
      case 'pause':
        if (this.players.size === 1) run.paused = !!msg.on;
        break;
      case 'earn': {
        if (run.phase !== 'shift') return;
        const amount = Math.round(clamp(Number(msg.amount) || 0, -100000, 100000));
        if (String(msg.source) === 'casino') {
          p.personal += amount;
          this.stateDirty = true;
          break;
        }
        p.today += amount;
        p.personal += amount;
        run.teamToday += amount;
        run.total = (run.total || 0) + amount;
        if (amount > 0 && msg.source !== 'dodge')
          run.moments = [...(run.moments || []), { id, name: p.name, amount, source: String(msg.source || ''), note: String(msg.note || '').slice(0, 80), at: run.clock }].slice(-40);
        this.emit(null, { t: 'earned', id, name: p.name, amount, source: String(msg.source || ''), note: String(msg.note || '').slice(0, 80) });
        this.stateDirty = true;
        break;
      }
      case 'prank': {
        const kind = String(msg.kind || '').slice(0, 20);
        if (!kind) return;
        const target = msg.target ? String(msg.target).slice(0, 40) : null;
        const tp = target ? this.players.get(target) : null;
        this.emit(null, { t: 'prank', kind, from: p.name, fromId: id, target, targetName: tp?.name || null });
        break;
      }
      case 'spend': {
        const amount = Math.round(clamp(Number(msg.amount) || 0, 0, 1e7));
        if (p.personal < amount) {
          this.stateDirty = true;
          return;
        }
        p.personal -= amount;
        this.emit(id, { t: 'spent', item: String(msg.item || ''), amount });
        this.stateDirty = true;
        break;
      }
      case 'heat':
        run.heat = clamp(run.heat + (Number(msg.amount) || 0), 0, 100);
        this.stateDirty = true;
        break;
      case 'chat': {
        const text = String(msg.text || '').trim().slice(0, 300);
        if (text) this.emit(null, { t: 'chat', from: p.name, id, text, at: Date.now() });
        break;
      }
      case 'talk':
        p.talking = !!msg.on;
        this.emit(null, { t: 'pose', id, talking: p.talking, pose: p.pose });
        break;
      case 'pose': {
        const q = msg.pose || {};
        const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
        const a = ['stand', 'walk', 'run', 'sit'].includes(q.a) ? q.a : 'stand';
        const seat = Number.isInteger(q.s) ? q.s : null;
        if (seat !== null && [...this.players.values()].some((o) => o !== p && o.pose && o.pose.s === seat)) return;
        p.pose = { x: num(q.x), z: num(q.z), y: num(q.y), f: num(q.f), a, s: seat, sm: !!q.sm };
        this.emit(null, { t: 'pose', id, talking: p.talking, pose: p.pose });
        break;
      }
      case 'signal': {
        const to = String(msg.to || '');
        if (this.players.has(to)) this.emit(to, { t: 'signal', from: id, data: msg.data });
        break;
      }
      case 'sky': {
        if (!isHost) return;
        const TIMES = ['auto', 'morning', 'noon', 'sunset', 'night'];
        const WEATHERS = ['auto', 'clear', 'cloudy', 'rain', 'storm', 'fog', 'snow'];
        if (TIMES.includes(msg.time)) this.world.time = msg.time;
        if (WEATHERS.includes(msg.weather)) this.world.weather = msg.weather;
        this.stateDirty = true;
        break;
      }
      case 'jukebox': {
        const track = typeof msg.track === 'string' ? msg.track.slice(0, 30) : null;
        const url = track === 'stream' && typeof msg.url === 'string' && /^https?:\/\//i.test(msg.url) ? msg.url.slice(0, 500) : undefined;
        if (track === 'stream' && !url) return;
        this.world.jukebox = { track, at: Date.now(), url };
        if (track) this.system(`${p.name} put on a tune.`);
        this.stateDirty = true;
        break;
      }
      case 'ball': {
        const num = (v) => (Number.isFinite(Number(v)) ? Math.max(-60, Math.min(60, Number(v))) : 0);
        if (msg.shot) {
          const q = msg.shot;
          this.world.ball = { holder: null, shot: { x: num(q.x), y: num(q.y), z: num(q.z), vx: num(q.vx), vy: num(q.vy), vz: num(q.vz), by: id, at: Date.now() } };
        } else if (msg.take) {
          if (this.world.ball.holder && this.world.ball.holder !== id && this.players.has(this.world.ball.holder)) return;
          this.world.ball = { holder: id, shot: null };
        } else if (msg.drop) this.world.ball = { holder: null, shot: null };
        else return;
        this.emit(null, { t: 'ball', ...this.world.ball, now: Date.now() });
        break;
      }
      case 'scored':
        this.emit(null, { t: 'scored', id, name: p.name, three: !!msg.three });
        break;
      case 'quote': {
        const text = String(msg.text || '').trim().slice(0, 160);
        if (!text || run.phase !== 'shift') return;
        run.quotes = [...(run.quotes || []), { id, name: p.name, text, to: String(msg.to || '').slice(0, 40), gain: Number(msg.gain) || 0 }].slice(-30);
        break;
      }
      case 'clockout': {
        if (run.phase !== 'shift' || run.teamToday < run.quota) return;
        p.clockedOut = !!msg.on;
        this.stateDirty = true;
        const all = [...this.players.values()];
        if (all.length && all.every((q) => q.clockedOut)) this.review();
        else if (p.clockedOut) this.system(`${p.name} clocked out (${all.filter((q) => q.clockedOut).length}/${all.length}).`);
        break;
      }
      case 'loot':
        p.loot = Math.max(0, Number(msg.n) || 0);
        break;
      case 'onCall':
        p.onCall = msg.name ? String(msg.name).slice(0, 40) : null;
        this.stateDirty = true;
        break;
      case 'debugRaid':
        if (isHost && this.players.size === 1) this.raid();
        break;
      case 'debugOutage':
        if (isHost && this.players.size === 1) this.emit(null, { t: 'event', kind: 'outage' });
        break;
      case 'debugDay':
        if (isHost && this.players.size === 1) this.startDay(Math.max(1, Math.min(9, Number(msg.day) || 1)));
        break;
      case 'debugEnd':
        if (isHost && this.players.size === 1 && run.phase === 'shift') run.clock = SHIFT_MINUTES - 0.01;
        break;
    }
  }

  startDay(day) {
    const run = this.run;
    run.day = day;
    run.bestDay = Math.max(run.bestDay, day);
    run.phase = 'shift';
    run.clock = 0;
    run.teamToday = 0;
    run.heat = Math.max(0, run.heat * 0.4);
    run.lastRaid = -999;
    run.overtime = 0;
    run.nextBoss = 20 + Math.random() * 20;
    run.quota = quotaFor(day, this.players.size);
    run.unlocked = unlockedFor(day);
    run.review = null;
    run.moments = [];
    run.quotes = [];
    run.warned = false;
    for (const p of this.players.values()) {
      p.today = 0;
      p.clockedOut = false;
    }
    const fresh = UNLOCKS.filter((u) => u.day === day).map((u) => u.label);
    this.emit(null, { t: 'dayStart', day, quota: run.quota, unlocked: run.unlocked, fresh });
    this.boss(day === 1 ? 'Welcome to the team. Quota is on your taskbar. Make it, or clean out your desk.' : `Day ${day}. Quota went up. Obviously.`);
    this.stateDirty = true;
  }

  boss(text, bounty) {
    this.emit(null, { t: 'boss', text, bounty: bounty || null, at: Date.now() });
  }

  raid() {
    this.run.lastRaid = this.run.clock;
    this.emit(null, { t: 'event', kind: 'raid', seconds: 9 });
    this.run.heat = Math.max(0, this.run.heat - 35);
    this.stateDirty = true;
  }

  tick(dt) {
    const run = this.run;
    if (run.phase === 'shift' && !run.paused) {
      const before = run.clock;
      const all = [...this.players.values()];
      const onCall = all.filter((p) => p.onCall).length;
      const slow = all.length ? 1 - 0.75 * (onCall / all.length) : 1;
      run.clock = Math.min(SHIFT_MINUTES, run.clock + (dt * SHIFT_MINUTES * slow) / run.shiftSeconds);
      const gm = run.clock - before;

      run.heat = Math.max(0, run.heat - gm * 0.06);

      if (run.unlocked.includes('raids') && run.clock - run.lastRaid > 70 && run.clock < SHIFT_MINUTES - 20) {
        const perMinute = 0.002 + (run.heat / 100) * 0.03;
        if (Math.random() < perMinute * gm) this.raid();
      }
      if (run.unlocked.includes('outage') && Math.random() < 0.0025 * gm) {
        this.emit(null, { t: 'event', kind: 'outage' });
      }
      if (run.clock >= run.nextBoss) {
        run.nextBoss = run.clock + 45 + Math.random() * 40;
        const options = BOUNTIES.filter((b) => !b.needs || run.unlocked.includes(b.needs));
        if (Math.random() < 0.45 && options.length) {
          const b = options[Math.floor(Math.random() * options.length)];
          this.boss(b.text, { source: b.source, reward: b.reward, until: run.clock + 60 });
        } else {
          this.boss(BOSS_LINES[Math.floor(Math.random() * BOSS_LINES.length)]);
        }
      }
      if (run.clock >= SHIFT_MINUTES) {
        if ((onCall || all.some((p) => p.loot > 0)) && run.overtime < 300) run.overtime += dt;
        else this.review();
      }

      run.reviewIn = Math.max(0, ((SHIFT_MINUTES - run.clock) / SHIFT_MINUTES) * run.shiftSeconds);
      if (!run.warned && run.reviewIn < 60 && run.reviewIn > 0) {
        run.warned = true;
        this.boss(run.teamToday >= run.quota ? 'One minute to the performance review. Wrap it up and come to my office.' : `One minute to the performance review and we are ${Math.round(run.quota - run.teamToday)} short. Close something. NOW.`);
      }
      this.secAcc += dt;
      if (this.secAcc >= 1) {
        this.secAcc = 0;
        this.emit(null, { t: 'clock', clock: run.clock, heat: run.heat, reviewIn: run.reviewIn });
      }
    }
    if (this.stateDirty) {
      this.stateDirty = false;
      this.emit(null, { t: 'state', ...this.snapshot() });
    }
  }

  review() {
    const run = this.run;
    const pass = run.teamToday >= run.quota;
    const crew = [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, today: p.today }))
      .sort((a, b) => b.today - a.today);
    const next = UNLOCKS.filter((u) => u.day === run.day + 1).map((u) => u.label);
    const moments = [...(run.moments || [])].sort((a, b) => b.amount - a.amount).slice(0, 3);
    const quotes = [...(run.quotes || [])].sort((a, b) => b.gain - a.gain).slice(0, 3);
    const runCrew = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, total: p.personal })).sort((a, b) => b.total - a.total);
    run.review = { day: run.day, quota: run.quota, team: run.teamToday, pass, crew, next, nextQuota: quotaFor(run.day + 1, this.players.size), moments, quotes, total: run.total || 0, runCrew, looks: Object.fromEntries([...this.players.values()].map((p) => [p.id, p.look])) };
    run.phase = pass ? 'review' : 'fired';
    this.emit(null, { t: 'review', ...run.review });
    this.stateDirty = true;
  }

  snapshot() {
    return {
      code: this.code,
      host: this.hostId,
      run: { ...this.run },
      world: this.world,
      now: Date.now(),
      players: [...this.players.values()],
    };
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
