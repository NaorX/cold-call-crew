import { bus } from './bus';
import { audio, masterNode } from './audio';
import { settings } from './settings';
import { backend } from './ai';
import { voiceName } from './voice';
import type { Line } from './types';
import type { Call, JobKind } from './game';

export interface LiveHooks {
  react(args: any): { trust: number; situation: string };
  readOut(kind: JobKind, brand: string, amount: number): { shown: string; loot: Line[] } | null;
  ends(action: string, after: Promise<void>): void;
  fallback(): void;
  context(): string;
}

const WORKLET = `
class Mic extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.p = 1; this.prev = 0; this.out = new Int16Array(640); this.n = 0; }
  process(inputs) {
    const x = inputs[0] && inputs[0][0];
    if (!x) return true;
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
    const level = Math.sqrt(sum / x.length);
    const src = new Float32Array(x.length + 1);
    src[0] = this.prev; src.set(x, 1); this.prev = x[x.length - 1];
    while (this.p < src.length - 1) {
      const i = Math.floor(this.p), f = this.p - i;
      const v = src[i] * (1 - f) + src[i + 1] * f;
      this.out[this.n++] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      if (this.n === this.out.length) { this.port.postMessage({ pcm: this.out.buffer, level }, [this.out.buffer]); this.out = new Int16Array(640); this.n = 0; }
      this.p += this.ratio;
    }
    this.p -= x.length;
    return true;
  }
}
registerProcessor('cc-mic', Mic);`;
const worklets = new WeakMap<BaseAudioContext, Promise<void>>();

const KEYS = 'trust_delta|mood|advance|price|challenge_met|action|convinced|payment|going_to_store';
const LEAK = new RegExp(`[,{(]?\\s*"?\\b(?:${KEYS})"?\\s*[:=]\\s*"?[\\w.-]*"?`, 'g');
const LEAK_TAIL = /[,{]\s*[a-z_]*$/;
export const spoken = (t: string) =>
  t
    .replace(LEAK, '')
    .replace(/[{}]/g, '')
    .replace(LEAK_TAIL, '')
    .replace(/([.!?]),+/g, '$1')
    .replace(/\s+/g, ' ')
    .trimStart();

const b64 = (buf: ArrayBuffer) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

class LiveCall {
  call: Call | null = null;
  private hooks: LiveHooks | null = null;
  private ws: WebSocket | null = null;
  private ready = false;
  private downUntil = 0;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private micCtx: AudioContext | null = null;
  private wantMic = true;
  private onHold = false;
  level = 0;
  private out: AudioNode | null = null;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private timer = 0;
  private callerLine: Line | null = null;
  private playerLine: Line | null = null;
  private words: { at: number; text: string }[] = [];
  private loot: Line[] = [];
  private ending: string | null = null;
  private turnOpen = false;
  private toolWait = 0;
  private pendingCode: { code: string; kind: JobKind } | null = null;

  get active() {
    return !!this.call && !!this.ws;
  }
  get micOn() {
    return this.active && this.wantMic && !!this.stream;
  }
  available() {
    return backend.live && Date.now() > this.downUntil && typeof AudioWorkletNode !== 'undefined';
  }

  private redials = 0;

  start(call: Call, hooks: LiveHooks, redial = false) {
    if (!redial) this.redials = 0;
    this.stop();
    this.call = call;
    this.hooks = hooks;
    this.ready = false;
    this.wantMic = true;
    this.onHold = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/live`);
    this.ws = ws;
    const p = call.persona;
    const giveUp = window.setTimeout(() => !this.ready && this.ws === ws && this.fail(), 7000);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          t: 'start',
          persona: p,
          lang: settings.lang,
          voice: p.voiceName || voiceName(p.gender, p.id),
          trust: call.trust,
          context: hooks.context(),
          history: call.lines.filter((l) => l.who !== 'system'),
        }),
      );
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      clearTimeout(giveUp);
      if (this.ws !== ws) return;
      if (!this.ready) return this.fail();
      if (this.call?.state === 'active' && this.hooks && this.redials < 3) {
        this.redials++;
        return this.start(this.call, this.hooks, true);
      }
      this.ws = null;
      this.release();
    };
    ws.onerror = () => {};
    this.timer = window.setInterval(() => this.pump(), 50);
  }

  private fail(why = '') {
    const hooks = this.hooks;
    this.downUntil = Date.now() + 5 * 60_000;
    if (why) bus.emit('toast', { text: `${why} Calls continue turn by turn.`, kind: 'bad' });
    this.stop();
    hooks?.fallback();
  }

  stop() {
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    this.release();
    this.call = null;
    this.hooks = null;
  }

  private release() {
    clearInterval(this.timer);
    this.silence();
    this.node?.disconnect();
    this.src?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.micCtx?.close().catch(() => {});
    this.micCtx = null;
    this.node = null;
    this.src = null;
    this.stream = null;
    this.level = 0;
    this.callerLine = this.playerLine = null;
    this.words = [];
    this.loot = [];
    this.ending = null;
    this.toolWait = 0;
    this.pendingCode = null;
    if (this.call?.speaking) {
      this.call.speaking = false;
      bus.emit('call:speaking', false);
    }
  }

  private send(m: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  sendText(text: string) {
    this.flushWords();
    this.callerLine = null;
    this.playerLine = null;
    this.send({ t: 'text', text });
  }
  note(text: string, respond = false) {
    this.send({ t: 'note', text, respond });
  }
  hold(on: boolean) {
    this.onHold = on;
    if (on) this.send({ t: 'audioEnd' });
  }
  setMic(on: boolean) {
    this.wantMic = on;
    if (on && !this.stream) void this.openMic();
    if (!on) this.send({ t: 'audioEnd' });
    bus.emit('call:changed');
  }

  private async openMic() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch {
      this.wantMic = false;
      bus.emit('toast', { text: 'No microphone access. You can type to the caller instead.', kind: 'bad' });
      bus.emit('call:changed');
      return;
    }
    if (!this.active) return stream.getTracks().forEach((t) => t.stop());
    this.stream = stream;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: 16000 });
      this.micCtx = ctx;
    } catch {
      ctx = audio();
    }
    try {
      let ready = worklets.get(ctx);
      if (!ready) worklets.set(ctx, (ready = ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))));
      await ready;
      if (ctx.state === 'suspended') void ctx.resume();
      this.src = ctx.createMediaStreamSource(stream);
      this.node = new AudioWorkletNode(ctx, 'cc-mic');
    } catch {
      this.micCtx?.close().catch(() => {});
      this.micCtx = null;
      ctx = audio();
      let ready = worklets.get(ctx);
      if (!ready) worklets.set(ctx, (ready = ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))));
      await ready;
      this.src = ctx.createMediaStreamSource(stream);
      this.node = new AudioWorkletNode(ctx, 'cc-mic');
    }
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.src.connect(this.node).connect(sink).connect(ctx.destination);
    let talking = false;
    const preroll: ArrayBuffer[] = [];
    this.node.port.onmessage = (e) => {
      this.level = this.level * 0.6 + e.data.level * 0.4;
      const now = this.level > 0.02;
      if (now !== talking) bus.emit('me:talking', (talking = now));
      if (!this.ready || !this.wantMic || this.onHold) {
        preroll.length = 0;
        return;
      }
      if (this.call?.speaking && e.data.level < 0.03) {
        preroll.push(e.data.pcm);
        if (preroll.length > 8) preroll.shift();
        return;
      }
      for (const b of preroll.splice(0)) this.send({ t: 'audio', data: b64(b) });
      this.send({ t: 'audio', data: b64(e.data.pcm) });
    };
    bus.emit('call:changed');
  }

  private onMessage(m: any) {
    const call = this.call;
    if (!call || call.state !== 'active') return;
    switch (m.t) {
      case 'ready':
        this.ready = true;
        if (this.wantMic) void this.openMic();
        if (!call.lines.some((l) => l.who === 'caller')) this.note('Your phone rings and you pick up. Answer it in character, briefly.', true);
        break;
      case 'audio':
        this.toolWait = 0;
        this.play(m.data);
        break;
      case 'said': {
        this.playerLine = null;
        const at = Math.max(audio().currentTime, this.next - 0.25);
        this.words.push({ at, text: m.text });
        this.turnOpen = true;
        break;
      }
      case 'heard': {
        if (!this.playerLine) {
          this.flushWords();
          this.callerLine = null;
          this.playerLine = { who: 'player', text: '', live: true };
          call.lines.push(this.playerLine);
          bus.emit('call:changed');
        }
        this.playerLine.text = (this.playerLine.text + m.text).replace(/\s+/g, ' ').trimStart();
        bus.emit('call:live', call.lines.indexOf(this.playerLine));
        break;
      }
      case 'interrupted':
        this.silence();
        this.words = [];
        this.callerLine = null;
        break;
      case 'turnDone':
        this.turnOpen = false;
        break;
      case 'tool':
        this.onTools(m.calls);
        break;
      case 'error':
        if (!this.ready) this.fail(String(m.msg || ''));
        break;
    }
  }

  private onTools(calls: { id: string; name: string; args: any }[]) {
    const hooks = this.hooks;
    if (!hooks) return;
    const responses = calls.map((c) => {
      if (c.name === 'react') {
        const r = hooks.react(c.args);
        if (c.args.action && c.args.action !== 'none') this.ending = c.args.action;
        return { id: c.id, name: c.name, response: r };
      }
      if (c.name === 'read_out') {
        const kind: JobKind = c.args.what === 'card' ? 'card' : c.args.what === 'remote_code' ? 'remote' : 'gift';
        const read = hooks.readOut(kind, String(c.args.brand || ''), Number(c.args.amount) || 0);
        if (!read) return { id: c.id, name: c.name, response: { ok: false, note: "You don't really have it. Make an excuse and stall." } };
        this.loot.push(...read.loot);
        if (this.callerLine) this.callerLine.data = { code: read.shown, kind };
        else this.pendingCode = { code: read.shown, kind };
        return { id: c.id, name: c.name, response: { ok: true, code: read.shown, how: 'Read these exact characters out loud, slowly, in small groups.' } };
      }
      return { id: c.id, name: c.name, response: {} };
    });
    this.toolWait = performance.now();
    this.send({ t: 'toolResponse', responses });
  }

  private ensureCallerLine(): Line {
    const call = this.call!;
    if (!this.callerLine) {
      this.playerLine = null;
      this.callerLine = { who: 'caller', text: '', live: true, data: this.pendingCode || undefined };
      this.pendingCode = null;
      call.lines.push(this.callerLine);
      bus.emit('call:changed');
    }
    return this.callerLine;
  }

  private play(data: string) {
    const ctx = audio();
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    const buf = ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    if (!this.out) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 220;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -22;
      comp.ratio.value = 3;
      const g = ctx.createGain();
      g.gain.value = 1.5;
      hp.connect(lp).connect(comp).connect(g).connect(masterNode());
      this.out = hp;
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.out);
    const at = Math.max(ctx.currentTime + 0.05, this.next);
    s.start(at);
    this.next = at + buf.duration;
    this.sources.add(s);
    s.onended = () => this.sources.delete(s);
    if (!settings.tts) s.disconnect();
  }

  private silence() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
      }
    }
    this.sources.clear();
    this.next = 0;
  }

  private pump() {
    const call = this.call;
    if (!call || call.state !== 'active') return;
    const now = audio().currentTime;
    if (this.words.length && this.words[0].at <= now + 0.05) {
      const line = this.ensureCallerLine();
      while (this.words.length && this.words[0].at <= now + 0.05) line.text += this.words.shift()!.text;
      line.text = spoken(line.text);
      bus.emit('call:live', call.lines.indexOf(line));
    }
    const speaking = now < this.next - 0.03;
    if (speaking !== call.speaking) {
      call.speaking = speaking;
      bus.emit('call:speaking', speaking);
    }
    if (this.toolWait && performance.now() - this.toolWait > 8000) this.toolWait = 0;
    if (!this.turnOpen && !this.toolWait && !speaking && !this.words.length) {
      if (this.callerLine?.text) this.callerLine = null;
      if (this.loot.length) {
        call.lines.push(...this.loot);
        this.loot = [];
        this.callerLine = null;
        bus.emit('call:changed');
      }
      if (this.ending) {
        const a = this.ending;
        this.ending = null;
        this.hooks?.ends(a, Promise.resolve());
      }
    }
  }

  private flushWords() {
    if (!this.words.length || !this.call) return;
    const line = this.ensureCallerLine();
    for (const w of this.words.splice(0)) line.text += w.text;
    line.text = spoken(line.text);
    bus.emit('call:live', this.call.lines.indexOf(line));
  }
}

export const live = new LiveCall();
