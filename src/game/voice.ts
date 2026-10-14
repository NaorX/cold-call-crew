import { settings } from './settings';
import { LANGS, type Lang } from './langs';
import { backend } from './ai';
import { audio, masterNode } from './audio';

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

const SR: (new () => Rec) | undefined = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
export const sttSupported = !!SR;

export class Listener {
  private rec: Rec | null = null;
  private wanted = false;
  onInterim: (text: string) => void = () => {};
  onFinal: (text: string) => void = () => {};
  onState: (listening: boolean) => void = () => {};
  onError: (msg: string) => void = () => {};

  get listening() {
    return this.wanted;
  }

  start() {
    if (!SR || this.wanted) return;
    this.wanted = true;
    this.spawn();
    this.onState(true);
  }

  stop() {
    this.wanted = false;
    this.rec?.stop();
    this.rec = null;
    this.onState(false);
  }

  private spawn() {
    if (!SR) return;
    const rec = new SR();
    rec.lang = LANGS[settings.lang]?.bcp || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const t = r[0].transcript.trim();
          if (t) this.onFinal(t);
        } else interim += r[0].transcript;
      }
      this.onInterim(interim);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.onError('Microphone blocked. Allow mic access in the browser, or type instead.');
        this.stop();
      }
    };
    rec.onend = () => {
      if (this.wanted) setTimeout(() => this.wanted && this.spawn(), 120);
    };
    try {
      rec.start();
      this.rec = rec;
    } catch {
    }
  }
}

let voices: SpeechSynthesisVoice[] = [];
function refreshVoices() {
  voices = speechSynthesis.getVoices();
}
if ('speechSynthesis' in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}

function voiceFor(gender: 'f' | 'm', seed: string, forceLang?: Lang): SpeechSynthesisVoice | undefined {
  const lang = forceLang || settings.lang || 'en';
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (!pool.length) return undefined;
  const female = /female|zira|aria|jenny|samantha|susan|hazel|libby|sonia|hila|karen|moira|tessa|victoria|google us english|google uk english female/i;
  const male = /male|david|guy|mark|george|ryan|daniel|asaf|alex|fred|google uk english male/i;
  const sexed = pool.filter((v) => (gender === 'f' ? female.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, '')) : male.test(v.name) && !female.test(v.name)));
  const list = sexed.length ? sexed : pool;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export function speak(text: string, opts: { gender: 'f' | 'm'; pitch: number; rate: number; seed: string; lang?: Lang }, onLevel?: (on: boolean) => void): Promise<void> {
  return new Promise((resolve) => {
    if (!settings.tts || !('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(opts.gender, opts.seed, opts.lang);
    if (v) u.voice = v;
    u.lang = LANGS[opts.lang || settings.lang]?.bcp || 'en-US';
    u.pitch = Math.max(0.1, Math.min(2, opts.pitch));
    u.rate = Math.max(0.5, Math.min(1.6, opts.rate * settings.ttsRate));
    u.volume = Math.min(1, settings.volume + 0.1);
    const done = () => {
      onLevel?.(false);
      resolve();
    };
    u.onstart = () => onLevel?.(true);
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
    setTimeout(done, 1500 + text.length * 90);
  });
}

let current: AudioBufferSourceNode | null = null;
let ttsDownUntil = 0;
export function shutUp() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  try {
    current?.stop();
  } catch {
  }
  current = null;
}

export function voiceName(gender: 'f' | 'm', seed: string): string {
  const list = backend.voices?.[gender] || [];
  if (!list.length) return gender === 'f' ? 'Kore' : 'Puck';
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export async function speakCaller(
  text: string,
  opts: { gender: 'f' | 'm'; pitch: number; rate: number; seed: string; style: string; voice?: string },
  onLevel?: (on: boolean) => void,
): Promise<void> {
  if (!settings.tts) return;
  if (backend.tts && Date.now() > ttsDownUntil) {
    try {
      const r = await fetch('/api/caller/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, voice: opts.voice || voiceName(opts.gender, opts.seed), style: opts.style }),
      });
      if (!r.ok) ttsDownUntil = Date.now() + 10 * 60_000;
      if (r.ok) {
        const { audio: b64 } = await r.json();
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const ctx = audio();
        const buf = await ctx.decodeAudioData(bytes.buffer);
        return await new Promise<void>((resolve) => {
          shutUp();
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.playbackRate.value = Math.max(0.8, Math.min(1.25, settings.ttsRate));
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 280;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 3600;
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -24;
          comp.ratio.value = 4;
          const g = ctx.createGain();
          g.gain.value = 1.6;
          src.connect(hp).connect(lp).connect(comp).connect(g).connect(masterNode());
          current = src;
          src.onended = () => {
            if (current === src) current = null;
            onLevel?.(false);
            resolve();
          };
          onLevel?.(true);
          src.start();
        });
      }
    } catch {
    }
  }
  return speak(text, opts, onLevel);
}

let analyser: AnalyserNode | null = null;
let buf: Float32Array<ArrayBuffer> | null = null;
export async function enableMicLevel(ctx: AudioContext) {
  if (analyser) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    buf = new Float32Array(analyser.fftSize);
    src.connect(analyser);
  } catch {
  }
}
export function micLevel(): number {
  if (!analyser || !buf) return 0;
  analyser.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export function bossVoice(): string {
  const list = backend.voices?.m || [];
  for (const v of ['Algenib', 'Charon', 'Orus', 'Fenrir', 'Rasalgethi']) if (list.includes(v)) return v;
  return voiceName('m', 'the-boss');
}

export async function fetchVoice(text: string, voice: string, style: string): Promise<AudioBuffer | null> {
  if (!settings.tts || !backend.tts) return null;
  try {
    const r = await fetch('/api/caller/voice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice, style }),
    });
    if (!r.ok) return null;
    const { audio: b64 } = await r.json();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return await audio().decodeAudioData(bytes.buffer);
  } catch {
    return null;
  }
}

export function playVoice(buf: AudioBuffer, onLevel?: (on: boolean) => void): Promise<void> {
  const ctx = audio();
  return new Promise<void>((resolve) => {
    shutUp();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.85, Math.min(1.2, settings.ttsRate));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    const g = ctx.createGain();
    g.gain.value = 1.3;
    src.connect(comp).connect(g).connect(masterNode());
    current = src;
    src.onended = () => {
      if (current === src) current = null;
      onLevel?.(false);
      resolve();
    };
    onLevel?.(true);
    src.start();
  });
}
