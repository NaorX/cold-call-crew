import { bus } from './bus';
import { crew, send } from './net';
import { nextLead } from './personas';
import { callerTurn } from './ai';
import { settings, type UpgradeKey } from './settings';
import { sfx, startRinging, stopRinging } from './audio';
import { shutUp, speakCaller } from './voice';
import { live, type LiveHooks } from './live';
import type { CallerAction, CallerTurn, Line, Persona } from './types';

export interface GiftCardLoot { brand: string; code: string; amount: number; from: string; expires: number }
export interface CardLoot { name: string; number: string; exp: string; cvv: string; limit: number; charged: number; from: string; frozen: boolean }
export interface RemoteLoot { code: string; callId: string; from: string; expires: number }
export interface LedgerEntry { at: number; clock: number; source: string; amount: number; note: string }
export interface Lead { persona: Persona; arrived: number; patience: number }

export type CallState = 'active' | 'ended';

export type JobKind = 'card' | 'gift' | 'remote';
export interface Job {
  kind: JobKind;
  step: number;
  price: number;
  brand: string;
  code: string;
  done: boolean;
  holdUntil: number;
}
interface StepDef {
  en: string;
  goal: string;
  hint?: RegExp;
  trust?: number;
}
export const JOBS: Record<JobKind, { title: string; app: string; reward: string; steps: StepDef[] }> = {
  card: {
    title: 'Credit Card',
    app: 'creditcard',
    reward: 'The price they agree to',
    steps: [
      { en: 'Convince the caller they need your service.', goal: 'convince you that you need their service (antivirus, tech support, a warranty, protection...)', hint: /virus|support|service|protect|warranty|security|hack|renew|subscription|insurance|וירוס|שירות|תמיכה|הגנה|אחריות|ביטוח|פרצו/i, trust: 45 },
      { en: 'Get them to agree on a price for the service.', goal: 'agree on a price for that service (set price to the amount you agree to)', hint: /\$?\d{2,4}|dollar|price|cost|fee|pay|דולר|מחיר|עולה|לשלם/i, trust: 55 },
      { en: 'Enter the card number from the front of the card.', goal: 'read the card number from the front of your credit card to pay (use action read_card)' },
    ],
  },
  gift: {
    title: 'Gift Cards',
    app: 'giftcards',
    reward: 'The card value',
    steps: [
      { en: 'Give them a reason to pay (a refund, a virus, the IRS, a prize).', goal: 'make you believe you have to pay, or pay something back (a refund mistake, a virus, a tax problem, a prize fee...)', hint: /virus|refund|tax|irs|prize|won|account|bank|warrant|police|fee|grand|וירוס|החזר|מס|זכית|חשבון|בנק|משטרה|קנס/i, trust: 45 },
      { en: 'Get them to agree to pay with gift cards.', goal: 'agree to pay with gift cards, which means going to a store to buy them', hint: /gift ?card|steam|apple|google play|itunes|voucher|store|כרטיס מתנה|גיפט|חנות/i, trust: 55 },
      { en: 'They go to the store and buy the card.', goal: 'you are at the store buying the card' },
      { en: 'Get the code from the back of the card and redeem it.', goal: 'read the code on the back of the gift card you bought (use action read_gift_card)' },
    ],
  },
  remote: {
    title: 'RemoteDesk',
    app: 'remote',
    reward: 'Whatever you wire',
    steps: [
      { en: 'Tell them their computer has a problem.', goal: 'convince you that your computer has a serious problem', hint: /virus|hack|computer|error|infected|slow|warning|וירוס|מחשב|תקלה|פרצו|שגיאה/i, trust: 40 },
      { en: 'Get them to install RemoteDesk.', goal: 'install the "RemoteDesk" support app they tell you about', hint: /install|download|remote|app|website|program|תתקין|תוריד|אפליקציה|תוכנה|אתר/i, trust: 55 },
      { en: 'Get the 6-digit code and connect.', goal: 'read the 6-digit code shown in the RemoteDesk app (use action give_remote_code)' },
    ],
  },
};

const MISSION_GOAL: Record<JobKind, (first: string) => string> = {
  card: (n) => `Get ${n} to pay you by card and read you the number.`,
  gift: (n) => `Get ${n} to buy a gift card and read you the code.`,
  remote: (n) => `Get ${n} to install RemoteDesk and read you the code.`,
};

const CHALLENGES = [
  { en: "Get them to tell you their pet's name.", goal: "tell the scammer your pet's name (or admit you have no pet)" },
  { en: 'Make them laugh out loud.', goal: 'laugh out loud at something the scammer said' },
  { en: 'Get them to sing a line of a song.', goal: 'sing a line of a song' },
  { en: 'Get them to call you "sweetheart".', goal: 'call the scammer "sweetheart" (or "מותק")' },
  { en: 'Find out their favorite food.', goal: 'tell the scammer your favorite food' },
  { en: 'Get them to say the word "banana".', goal: 'say the word "banana"' },
  { en: 'Get them to tell you about their grandkids or family.', goal: 'talk about your grandkids or family' },
];

const groups = (s: string, n: number, sep = ' ') => s.replace(new RegExp(`(.{${n}})(?=.)`, 'g'), `$1${sep}`);
const spell = (code: string) => code.split('').map((c) => (c === ' ' || c === '-' ? ',' : c)).join(' ');
export interface Standing {
  convinced?: boolean;
  payment?: string;
  price?: number;
  going_to_store?: boolean;
}

export class Call {
  id = Math.random().toString(36).slice(2);
  lines: Line[] = [];
  trust: number;
  mood = 'calm';
  state: CallState = 'active';
  busy = false;
  started = performance.now();
  takenFromThem = 0;
  fakeRefund = 0;
  remote = false;
  revealed = false;
  endReason = '';
  offline = false;
  speaking = false;
  stalls = 0;
  convinced = false;
  job: Job | null = null;
  challenge: { en: string; goal: string; done: boolean } | null = null;
  bestLine = { text: '', gain: 0 };
  constructor(public persona: Persona) {
    const t = persona.temper;
    const mood = ({ angry: -8, rude: -10, skeptical: -5, grumpy: -5, entitled: -5, nervous: -3, paranoid: -4, sweet: 5, sad: 4, euphoric: 8, drunk: 5, oversharer: 4 } as Record<string, number>)[t || ''] || 0;
    this.trust = Math.round(30 + persona.gullibility * 30 + mood + (game.has('headset') ? 10 : 0));
  }
}

const RNG = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (n: number) => Array.from({ length: n }, () => RNG[Math.floor(Math.random() * RNG.length)]).join('');
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const game = {
  upgrades: new Set<UpgradeKey>(),
  coffee: 0,
  energy: 0,
  leads: [] as Lead[],
  call: null as Call | null,
  giftCards: [] as GiftCardLoot[],
  cards: [] as CardLoot[],
  remotes: [] as RemoteLoot[],
  ledger: [] as LedgerEntry[],
  bounty: null as null | { source: string; reward: number; until: number },
  nextLeadIn: 4,
  virus: false,
  outage: false,
  raid: null as null | { endsAt: number },
  questionedUntil: 0,
  calls: 0,
  scams: 0,
  seated: false,

  perkFired: {} as Record<string, number>,
  firePerk(k: UpgradeKey) {
    this.perkFired[k] = Date.now();
    bus.emit('call:changed');
    setTimeout(() => bus.emit('call:changed'), 2600);
  },

  has(k: UpgradeKey) {
    return this.upgrades.has(k);
  },
  get shiftLive() {
    return crew.run?.phase === 'shift';
  },

  resetRun() {
    this.upgrades.clear();
    this.coffee = 0;
    this.ledger = [];
    this.calls = 0;
    this.scams = 0;
    this.resetDay();
  },
  resetDay() {
    this.leads = [];
    if (this.call) this.endCall('Shift over');
    this.giftCards = [];
    this.cards = [];
    this.remotes = [];
    this.bounty = null;
    this.virus = false;
    this.outage = false;
    this.raid = null;
    this.nextLeadIn = 3;
    bus.emit('game:changed');
  },

  tick(dt: number) {
    if (!this.shiftLive || !this.seated) {
      this.updateRinging();
      return;
    }
    const now = performance.now();
    const max = 1;
    this.nextLeadIn -= dt;
    if (this.nextLeadIn <= 0) {
      this.nextLeadIn = (this.has('autodialer') ? 7 : 14) + Math.random() * 10;
      if (this.leads.length < max && !this.call) {
        this.leads.push({ persona: nextLead(crew.run?.unlocked || []), arrived: now, patience: 28_000 + Math.random() * 12_000 });
        bus.emit('leads:changed');
        if (!this.call) sfx.notify();
      }
    }
    const before = this.leads.length;
    this.leads = this.leads.filter((l) => now - l.arrived < l.patience);
    if (before !== this.leads.length) bus.emit('leads:changed');
    const now2 = Date.now();
    const gl = this.giftCards.length;
    this.giftCards = this.giftCards.filter((g) => g.expires > now2);
    this.remotes = this.remotes.filter((r) => r.expires > now2);
    if (gl !== this.giftCards.length) {
      bus.emit('toast', { text: 'A gift card expired before you redeemed it. The bank froze it.', kind: 'bad' });
      bus.emit('loot:changed');
    }
    this.updateRinging();
  },

  updateRinging() {
    const ring = this.shiftLive && this.seated && !this.call && this.leads.length > 0 && !this.outage && !this.raid;
    if (ring && !ringingOn) startRinging();
    if (!ring && ringingOn) stopRinging();
    ringingOn = ring;
  },

  decline(index = 0) {
    this.leads.splice(index, 1);
    this.nextLeadIn = Math.min(this.nextLeadIn, 6);
    sfx.hangup();
    bus.emit('leads:changed');
    this.updateRinging();
  },

  answer(index = 0) {
    if (this.call || this.outage || performance.now() < this.questionedUntil) return;
    const lead = this.leads.splice(index, 1)[0];
    if (!lead) return;
    sfx.pickup();
    this.calls++;
    const call = new Call(lead.persona);
    if (this.energy > 0) {
      this.energy--;
      call.trust = Math.min(100, call.trust + 10);
      bus.emit('toast', { text: `Energy drink: ${lead.persona.name.split(' ')[0]} starts at +10 trust.`, kind: 'good' });
    }
    const kind = this.missionFor(lead.persona);
    call.job = { kind, step: 0, price: 0, brand: '', code: '', done: false, holdUntil: 0 };
    call.lines.push({ who: 'system', kind: 'info', text: `Mission: ${JOBS[kind].title}. ${MISSION_GOAL[kind](lead.persona.name.split(' ')[0])}` });
    if (crew.run?.unlocked.includes('scammy') && !lead.persona.baiter && Math.random() < 0.6) call.challenge = { ...CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)], done: false };
    this.call = call;
    send({ t: 'onCall', name: lead.persona.name });
    bus.emit('leads:changed');
    bus.emit('call:changed');
    this.updateRinging();
    if (live.available()) live.start(call, this.liveHooks(call));
    else void this.callerSpeaks(call);
  },

  missionFor(p: Persona): JobKind {
    const u = crew.run?.unlocked || [];
    if (u.includes('remote') && p.techSkill < 0.5 && Math.random() < 0.25) return 'remote';
    const card = u.includes('card') && p.hasCard;
    if (card && (!p.giftCardFriendly || Math.random() < 0.5)) return 'card';
    return 'gift';
  },

  liveHooks(call: Call): LiveHooks {
    return {
      context: () => this.context(call),
      react: (a) => {
        this.judge(call, {
          trust_delta: Number(a.trust_delta) || 0,
          mood: String(a.mood || 'calm'),
          price: Number(a.price) || 0,
          challenge_met: !!a.challenge_met,
          convinced: !!a.convinced,
          payment: String(a.payment || 'none'),
          going_to_store: !!a.going_to_store,
        });
        bus.emit('call:changed');
        return { trust: Math.round(call.trust), situation: this.context(call) };
      },
      readOut: (kind, brand, amount) => this.readOut(call, kind, brand, amount),
      ends: (action, after) => this.callerEnds(call, action as CallerAction, after),
      fallback: () => {
        if (this.call === call && call.state === 'active') void this.callerSpeaks(call);
      },
    };
  },

  context(call: Call): string {
    const bits: string[] = [];
    bits.push(`Money you have left: about $${Math.max(0, call.persona.savings)}.`);
    if (call.takenFromThem) bits.push(`You already handed over $${call.takenFromThem} during this call.`);
    if (call.remote) bits.push('The caller is connected to your computer through a remote support app and can see your screen.');
    if (call.fakeRefund)
      bits.push(`On your bank screen it looks like the caller accidentally refunded you $${call.fakeRefund} too much. You feel guilty and want to give the extra back (gift cards would be one way).`);
    const job = call.job;
    if (job && !job.done) {
      const def = JOBS[job.kind];
      bits.push(`The scammer is running the ${def.title.toUpperCase()} scheme. Steps: ${def.steps.map((st, i) => `${i + 1}) ${st.goal}${i < job.step ? ' [DONE]' : i === job.step ? ' [CURRENT]' : ''}`).join('; ')}.`);
      bits.push(`CURRENT GOAL: ${def.steps[job.step].goal}.`);
      if (job.kind === 'card' && job.price) bits.push(`You agreed to pay $${job.price} for the service.`);
      if (job.kind === 'gift' && job.step >= 3) bits.push(`You just came back from the store with a $${job.price} ${job.brand} gift card in your hand.`);
      if (job.kind === 'gift' && job.step < 3) bits.push('Do not use read_gift_card yet: you do not have a card.');
      if (job.kind !== 'card' || job.step < 2) bits.push('Do not use read_card yet.');
      if (job.kind !== 'remote' || job.step < 2) bits.push('Do not use give_remote_code yet.');
    } else {
      bits.push(`No way of paying has been agreed yet.${call.convinced ? ' You already believe their story.' : ''} Do not read out any code or card number yet (none of read_gift_card, read_card or give_remote_code).`);
    }
    if (call.challenge && !call.challenge.done) bits.push(`Bonus challenge the scammer is after: get you to ${call.challenge.goal}.`);
    return bits.join(' ');
  },

  async callerSpeaks(call: Call) {
    call.busy = true;
    bus.emit('call:changed');
    const res = await callerTurn(call.persona, call.lines, call.trust, this.context(call));
    if (call.state !== 'active' || this.call !== call) return;
    call.busy = false;
    call.offline = res.offline;
    this.applyTurn(call, res);
  },

  startJob(kind: JobKind, auto = false) {
    const call = this.call;
    if (!call || call.state !== 'active') return;
    if (call.job && !call.job.done && call.job.kind === kind) return;
    if (kind === 'remote' && !crew.run?.unlocked.includes('remote')) return;
    call.job = { kind, step: call.convinced ? 1 : 0, price: 0, brand: '', code: '', done: false, holdUntil: 0 };
    call.lines.push({ who: 'system', kind: 'info', text: auto ? `Scheme: ${JOBS[kind].title}. ${JOBS[kind].steps[call.job.step].en}` : `You started the ${JOBS[kind].title} scheme.` });
    bus.emit('call:changed');
    bus.emit('job:changed');
  },

  progress(call: Call, r: Standing) {
    if (call.persona.baiter) return;
    if (r.convinced) call.convinced = true;
    const pay: JobKind | null = r.payment === 'gift_card' ? 'gift' : r.payment === 'card' ? 'card' : r.payment === 'remote' ? 'remote' : null;
    if (pay || (r.price || 0) > 0) call.convinced = true;
    if (pay && !call.job) this.startJob(pay, true);
    const job = call.job;
    if (!job || job.done || job.holdUntil || job.code) return;
    const to = (n: number) => {
      if (job.step >= n) return;
      job.step = n;
      sfx.notify();
    };
    if (call.convinced) to(1);
    if (job.kind === 'card' && (r.price || 0) > 0) {
      job.price = Math.max(10, Math.min(Math.round(r.price!), 5000, Math.max(99, call.persona.savings)));
      to(2);
    } else if (job.kind === 'gift' && pay === 'gift' && r.going_to_store && job.step <= 1) {
      job.step = 1;
      this.advanceJob(call, r.price || 0);
    } else if (job.kind === 'remote' && pay === 'remote') to(2);
    bus.emit('call:changed');
  },

  advanceJob(call: Call, price = 0) {
    const job = call.job;
    if (!job || job.done) return;
    const def = JOBS[job.kind];
    if (job.step >= def.steps.length - 1) return;
    if (job.kind === 'card' && job.step === 1) job.price = Math.max(49, Math.min(price || 199 + Math.round(Math.random() * 3) * 100, 900, Math.max(99, call.persona.savings)));
    job.step++;
    sfx.notify();
    if (job.kind === 'gift' && job.step === 2) {
      job.brand = ['Steam', 'Apple', 'Google Play', 'Amazon'][Math.floor(Math.random() * 4)];
      job.price = price > 0 ? Math.max(20, Math.min(Math.round(price), 2000)) : Math.max(100, Math.min(call.persona.savings, 200 + Math.round(Math.random() * 6) * 50));
      job.holdUntil = performance.now() + 9000 + Math.random() * 5000;
      const back = job.holdUntil;
      if (live.call === call) live.hold(true);
      setTimeout(() => {
        if (this.call !== call || call.state !== 'active' || job.holdUntil !== back) return;
        job.holdUntil = 0;
        job.step = 3;
        call.lines.push({ who: 'system', kind: 'info', text: `${call.persona.name} is back from the store with a $${job.price} ${job.brand} card.` });
        bus.emit('job:changed');
        if (live.active && live.call === call) {
          live.hold(false);
          live.note(`You are back from the store with a ${job.price} ${job.brand} gift card in your hand. Tell the scammer you're back and you have it.`, true);
        } else void this.callerSpeaks(call);
      }, back - performance.now());
    }
    bus.emit('job:changed');
    bus.emit('call:changed');
  },

  verifyCard(raw: string): { ok: boolean; msg: string } {
    const call = this.call;
    const job = call?.job;
    if (!call || !job || job.kind !== 'card') return { ok: false, msg: 'No card scheme on this call.' };
    if (job.done) return { ok: false, msg: 'Already paid.' };
    if (!job.code) return { ok: false, msg: 'They have not read the card yet.' };
    if (raw.replace(/\D/g, '') !== job.code.replace(/\D/g, '')) return { ok: false, msg: 'DECLINED: that number does not match.' };
    job.done = true;
    call.persona.savings -= job.price;
    call.takenFromThem += job.price;
    this.earn(job.price, 'card', `${call.persona.name}'s card`);
    call.lines.push({ who: 'system', kind: 'info', text: `APPROVED: $${job.price} charged to ${call.persona.name}'s card.` });
    bus.emit('job:changed');
    bus.emit('call:changed');
    return { ok: true, msg: `APPROVED: $${job.price}` };
  },

  say(text: string) {
    const call = this.call;
    text = text.trim();
    if (!call || call.state !== 'active' || !text) return;
    if (call.job && call.job.holdUntil > performance.now()) {
      bus.emit('toast', { text: "They're at the store. Hold the line.", kind: 'info' });
      return;
    }
    if (live.active && live.call === call) {
      call.lines.push({ who: 'player', text });
      live.sendText(text);
      bus.emit('call:changed');
      return;
    }
    if (call.busy) {
      call.lines.push({ who: 'player', text });
      bus.emit('call:changed');
      return;
    }
    shutUp();
    call.lines.push({ who: 'player', text });
    void this.callerSpeaks(call);
  },

  judge(call: Call, r: Pick<CallerTurn, 'trust_delta' | 'mood' | 'advance' | 'price' | 'challenge_met'> & Standing): number {
    const p0 = call.persona;
    let delta = Math.max(-30, Math.min(15, Math.round(r.trust_delta || 0)));
    if (delta < 0 && this.has('spoof')) {
      delta = Math.round(delta * 0.7);
      this.firePerk('spoof');
    }
    if (delta > 0) {
      delta = Math.min(delta, 12);
      const tough = ['angry', 'rude', 'skeptical', 'grumpy', 'impatient', 'entitled', 'bummed'].includes(p0.temper || '');
      if (tough && call.trust < 40) delta = Math.round(delta * 1.4);
      if (call.trust >= 55) delta = Math.round(delta * 0.7);
      if (call.lines.filter((l) => l.who === 'player').length < 3) delta = Math.min(delta, 8);
    }
    const lastPlayer = [...call.lines].reverse().find((l) => l.who === 'player')?.text || '';
    call.trust = Math.max(0, Math.min(100, call.trust + delta));
    call.mood = r.mood || call.mood;
    if (lastPlayer && delta > call.bestLine.gain) call.bestLine = { text: lastPlayer, gain: delta };

    if (r.convinced !== undefined || r.payment !== undefined) {
      this.progress(call, r);
      bus.emit('job:changed');
    }
    const job = call.job;
    if (r.convinced === undefined && job && !job.done && !job.holdUntil && !p0.baiter) {
      const st = JOBS[job.kind].steps[job.step];
      const done = r.advance !== undefined ? r.advance : !!st.hint && st.hint.test(lastPlayer) && call.trust >= (st.trust ?? 50);
      const last = JOBS[job.kind].steps.length - 1;
      if (done && job.step < last) this.advanceJob(call, r.price || Number(lastPlayer.match(/\d{2,4}/)?.[0]) || 0);
    }
    if (call.challenge && !call.challenge.done && r.challenge_met) {
      call.challenge.done = true;
      this.earn(100, 'scammy', `Scammy challenge with ${p0.name}`);
      bus.emit('toast', { text: `Scammy: challenge done! +$100`, kind: 'money' });
    }
    bus.emit('call:trust', delta);
    return delta;
  },

  readOut(call: Call, kind: JobKind, brand = '', amount = 0): { shown: string; loot: Line[] } | null {
    const p = call.persona;
    if (p.baiter) return null;
    if (!call.job || call.job.kind !== kind || call.job.done) call.job = { kind, step: 0, price: 0, brand: '', code: '', done: false, holdUntil: 0 };
    const j = call.job;
    const again = !!j.code;
    j.step = JOBS[kind].steps.length - 1;
    j.holdUntil = 0;
    if (kind === 'card') {
      if (!j.price) j.price = Math.max(99, Math.min(p.savings, 299));
      if (!again) j.code = groups(digits(16), 4);
    } else if (kind === 'gift') {
      if (!again) j.code = `${code(4)}-${code(4)}-${code(4)}`;
      if (!j.brand) j.brand = ['Steam', 'Apple', 'Google Play', 'Amazon'].find((b) => brand.toLowerCase().includes(b.toLowerCase().split(' ')[0])) || 'Steam';
      if (!j.price) j.price = Math.max(100, Math.min(p.savings, amount || 250));
    } else if (!again) j.code = digits(6);
    const shown = kind === 'remote' ? groups(j.code, 3) : j.code;
    const loot: Line[] = [];
    if (kind === 'gift' && !this.giftCards.some((g) => g.code === j.code)) {
      const g: GiftCardLoot = { brand: j.brand, code: j.code, amount: j.price, from: p.name, expires: Date.now() + 240_000 };
      this.giftCards.push(g);
      p.savings -= j.price;
      call.takenFromThem += j.price;
      loot.push({ who: 'system', kind: 'gift', data: g, text: `${p.name} read out ${/^[AEIOU]/.test(j.brand) ? 'an' : 'a'} ${j.brand} gift card worth $${j.price}.` });
      bus.emit('loot:changed');
      send({ t: 'loot', n: this.giftCards.length });
    } else if (kind === 'card' && !call.lines.some((l) => l.kind === 'card' && l.data?.number === j.code)) {
      loot.push({ who: 'system', kind: 'card', data: { number: j.code, price: j.price, from: p.name }, text: `${p.name} read out their card number. Type it into Credit Card and verify.` });
    } else if (kind === 'remote' && !this.remotes.some((x) => x.code === j.code)) {
      const rl: RemoteLoot = { code: j.code, callId: call.id, from: p.name, expires: Date.now() + 300_000 };
      this.remotes.push(rl);
      loot.push({ who: 'system', kind: 'remote', data: rl, text: `${p.name} read out their RemoteDesk code.` });
      bus.emit('loot:changed');
    }
    if (loot.length) sfx.notify();
    bus.emit('job:changed');
    return { shown, loot };
  },

  callerEnds(call: Call, action: CallerAction, after: Promise<unknown>) {
    const p = call.persona;
    if (action === 'reveal_baiter') {
      if (!p.baiter) return;
      call.revealed = true;
      call.lines.push({ who: 'system', kind: 'baiter', text: 'It was a scambaiter. You just became content. Heat +10.' });
      this.addHeat(10);
      sfx.error();
      void after.then(() => this.endCall('Scambaiter', false));
    } else if (action === 'hang_up') {
      void after.then(() => this.endCall(`${p.name} hung up`, false));
      this.addHeat(2);
    } else if (action === 'call_police') {
      call.lines.push({ who: 'system', kind: 'police', text: 'They are reporting your number. Heat +15.' });
      this.addHeat(15);
      void after.then(() => this.endCall(`${p.name} called the police`, false));
    }
    bus.emit('call:changed');
  },

  applyTurn(call: Call, r: CallerTurn) {
    const lastPlayer = [...call.lines].reverse().find((l) => l.who === 'player')?.text || '';
    const asksGift = /gift ?card|steam|apple card|google play|itunes|voucher|כרטיס מתנה|גיפט|סטים|קוד/i.test(lastPlayer);
    const asksCode = asksGift || /code|number|back of|scratch|קוד|מספר/i.test(lastPlayer);
    if (!call.persona.baiter && asksCode && r.action === 'none' && call.job?.kind === 'gift' && call.job.step === 3 && !call.job.code) {
      call.stalls++;
      if (call.stalls >= 2 && call.persona.giftCardFriendly !== false) {
        r = { ...r, action: 'read_gift_card', gift_card_brand: r.gift_card_brand || (lastPlayer.match(/steam|apple|google play|amazon|target/i)?.[0] ?? 'Steam'), amount: r.amount || 0 };
        call.stalls = 0;
      }
    }
    const asksCard = /card|number|front|digits|כרטיס|מספר|ספרות/i.test(lastPlayer);
    if (!call.persona.baiter && asksCard && r.action === 'none' && call.job?.kind === 'card' && call.job.step === 2 && !call.job.code && call.trust >= 60) {
      call.stalls++;
      if (call.stalls >= 2) {
        r = { ...r, action: 'read_card' };
        call.stalls = 0;
      }
    }
    this.judge(call, r);

    let spokenText = r.reply;
    let line: Line = { who: 'caller', text: r.reply };
    let loot: Line[] = [];
    const readKind: JobKind | null = r.action === 'read_card' ? 'card' : r.action === 'read_gift_card' ? 'gift' : r.action === 'give_remote_code' ? 'remote' : null;
    const read = readKind ? this.readOut(call, readKind, r.gift_card_brand, r.amount) : null;
    if (read && readKind) {
      line = { who: 'caller', text: `${r.reply} ${read.shown}`, data: { code: read.shown, kind: readKind } };
      spokenText = `${r.reply} ${spell(read.shown)}`;
      loot = read.loot;
    }
    call.lines.push(line, ...loot);
    bus.emit('call:changed');

    const p = call.persona;
    call.speaking = true;
    bus.emit('call:speaking', true);
    const style = r.voice_style || defaultStyle(p, r.mood);
    const spoken = speakCaller(spokenText, { gender: p.gender, pitch: p.voice.pitch, rate: p.voice.rate, seed: p.id, style, voice: p.voiceName }, (on) => {
      call.speaking = on;
      bus.emit('call:speaking', on);
    });
    this.callerEnds(call, r.action, spoken);
    bus.emit('call:changed');
  },

  endCall(reason = 'You hung up', byPlayer = true) {
    const call = this.call;
    if (!call) return;
    if (byPlayer && call.persona.baiter && !call.revealed && call.lines.filter((l) => l.who === 'player').length >= 2) {
      this.earn(75, 'dodge', `Dodged scambaiter ${call.persona.name}`);
      bus.emit('toast', { text: 'You smelled a scambaiter and hung up. +$75 from the boss.', kind: 'good' });
    }
    if (call.bestLine.gain >= 4) send({ t: 'quote', text: call.bestLine.text, to: call.persona.name, gain: call.bestLine.gain });
    call.state = 'ended';
    call.endReason = reason;
    this.call = null;
    if (live.call === call) live.stop();
    shutUp();
    sfx.hangup();
    send({ t: 'onCall', name: null });
    bus.emit('call:ended', call);
    bus.emit('call:changed');
    this.updateRinging();
  },

  addHeat(n: number) {
    if (n > 0 && this.has('vpn')) n = Math.round(n * 0.6);
    send({ t: 'heat', amount: n });
  },

  earn(amount: number, source: string, note: string) {
    let total = amount;
    const b = this.bounty;
    if (b && b.source === source && crew.run && crew.run.clock <= b.until && amount > 0) {
      total += b.reward;
      this.bounty = null;
      bus.emit('toast', { text: `Boss bounty paid: +$${b.reward}`, kind: 'good' });
    }
    if (amount > 0 && source !== 'dodge') this.scams++;
    this.ledger.unshift({ at: Date.now(), clock: crew.run?.clock || 0, source, amount: total, note });
    send({ t: 'earn', amount: total, source, note });
    send({ t: 'loot', n: this.giftCards.length + this.remotes.length });
    if (total > 0) sfx.cash();
    bus.emit('ledger:changed');
  },

  redeemGiftCard(brand: string, raw: string): { ok: boolean; msg: string } {
    const i = this.giftCards.findIndex((g) => norm(g.code) === norm(raw));
    if (i < 0) return { ok: false, msg: 'Invalid code. Double-check every character.' };
    const g = this.giftCards[i];
    if (g.brand !== brand) return { ok: false, msg: `That is not a ${brand} card.` };
    this.giftCards.splice(i, 1);
    const value = Math.round(g.amount * (this.has('printer') ? 1.2 : 1));
    if (this.has('printer')) this.firePerk('printer');
    this.earn(value, 'giftcard', `${g.brand} card from ${g.from}`);
    if (this.call?.job?.kind === 'gift' && this.call.job.code === g.code) {
      this.call.job.done = true;
      bus.emit('job:changed');
    }
    bus.emit('loot:changed');
    return { ok: true, msg: this.has('printer') ? `Redeemed ${value}! (+20% from the Gift Card Printer)` : `Redeemed ${value}!` };
  },

  chargeCard(number: string, exp: string, cvv: string, amount: number): { ok: boolean; msg: string } {
    const c = this.cards.find((x) => norm(x.number) === norm(number));
    if (!c) return { ok: false, msg: 'DECLINED: card not recognised.' };
    if (c.exp !== exp.trim() || c.cvv !== cvv.trim()) return { ok: false, msg: 'DECLINED: expiry or CVV wrong.' };
    if (c.frozen) return { ok: false, msg: 'DECLINED: card frozen by the bank.' };
    amount = Math.round(amount);
    if (amount <= 0) return { ok: false, msg: 'Enter an amount.' };
    if (c.charged + amount > c.limit) {
      c.frozen = Math.random() < 0.6;
      this.addHeat(6);
      bus.emit('loot:changed');
      return { ok: false, msg: c.frozen ? 'DECLINED: over limit. The bank froze the card. Heat +6.' : 'DECLINED: insufficient funds. Try a smaller amount.' };
    }
    if (c.charged > 0 && Math.random() < 0.3) {
      c.frozen = true;
      bus.emit('loot:changed');
      return { ok: false, msg: 'DECLINED: fraud alert on repeated charges. Card frozen.' };
    }
    c.charged += amount;
    this.earn(amount, 'card', `Charged ${c.name.split(' ')[0]}'s card`);
    bus.emit('loot:changed');
    return { ok: true, msg: `APPROVED: $${amount}` };
  },

  connectRemote(raw: string): Call | null {
    const r = this.remotes.find((x) => x.code === raw.replace(/\D/g, ''));
    if (!r || !this.call || this.call.id !== r.callId) return null;
    this.call.remote = true;
    const j = this.call.job;
    if (j && j.kind === 'remote' && !j.done) {
      j.done = true;
      j.step = JOBS.remote.steps.length - 1;
      bus.emit('job:changed');
    }
    bus.emit('call:changed');
    return this.call;
  },

  remoteWire(call: Call, amount: number): { ok: boolean; msg: string } {
    if (this.call !== call) return { ok: false, msg: 'Connection lost.' };
    if (call.trust < 80) {
      call.trust = Math.max(0, call.trust - 25);
      call.lines.push({ who: 'caller', text: 'Hey! What are you doing with my bank account?!' });
      bus.emit('call:changed');
      if (call.trust < 15) void Promise.resolve().then(() => this.endCall(`${call.persona.name} pulled the plug`, false));
      return { ok: false, msg: 'They saw it and panicked. Trust -25. (Need 80+ trust.)' };
    }
    amount = Math.min(amount, call.persona.savings);
    if (amount <= 0) return { ok: false, msg: 'Account is empty.' };
    call.persona.savings -= amount;
    call.takenFromThem += amount;
    this.addHeat(8);
    this.earn(amount, 'remote', `Wire from ${call.persona.name}`);
    return { ok: true, msg: `Wired $${amount}. Heat +8.` };
  },

  remoteFakeRefund(call: Call, amount: number) {
    call.fakeRefund = amount;
    call.trust = Math.min(100, call.trust + 10);
    call.lines.push({ who: 'system', kind: 'refund', text: `You "accidentally" showed a $${amount} refund on ${call.persona.name}'s screen. Now ask them to send back the difference.` });
    bus.emit('call:changed');
  },
};

let ringingOn = false;

function defaultStyle(p: Persona, mood: string) {
  const age = p.age > 68 ? 'elderly, slow and a bit frail' : p.age > 55 ? 'older, unhurried' : p.age < 18 ? 'teenage, fast' : 'casual';
  return `${age}, ${mood}`;
}

bus.on('net:dayStart', (m) => {
  if (m.day === 1) game.resetRun();
  else game.resetDay();
});
bus.on('net:review', () => {
  game.resetDay();
  stopRinging();
  ringingOn = false;
});
bus.on('net:boss', (m) => {
  if (m.bounty) game.bounty = m.bounty;
});
