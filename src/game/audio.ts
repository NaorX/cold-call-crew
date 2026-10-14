import { settings, onSettings } from './settings';

let ctx: AudioContext | null = null;
let master: GainNode;
let ambience: GainNode | null = null;
let ringing: { stop: () => void } | null = null;
let siren: { stop: () => void } | null = null;

export function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    master.connect(ctx.destination);
    onSettings(() => master.gain.setTargetAtTime(settings.volume, ctx!.currentTime, 0.05));
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function masterNode(): AudioNode {
  audio();
  return master;
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, when = 0, dest?: AudioNode) {
  const c = audio();
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noiseBuffer(seconds = 1) {
  const c = audio();
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, when = 0) {
  const c = audio();
  const t = c.currentTime + when;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(Math.max(0.1, dur + 0.1));
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const g = c.createGain();
  env(g, t, 0.003, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.1);
}

export const sfx = {
  click() {
    noise(0.03, 0.15, 'highpass', 2500);
  },
  key() {
    noise(0.02, 0.06 + Math.random() * 0.04, 'bandpass', 1800 + Math.random() * 1500);
  },
  open() {
    tone(660, 0.08, 'triangle', 0.08);
    tone(990, 0.1, 'triangle', 0.06, 0.05);
  },
  close() {
    tone(700, 0.07, 'triangle', 0.07);
    tone(440, 0.09, 'triangle', 0.05, 0.05);
  },
  notify() {
    tone(880, 0.12, 'sine', 0.12);
    tone(1320, 0.18, 'sine', 0.1, 0.09);
  },
  error() {
    tone(180, 0.25, 'square', 0.08);
    tone(150, 0.3, 'square', 0.07, 0.12);
  },
  cash() {
    noise(0.08, 0.2, 'highpass', 3000);
    tone(1568, 0.5, 'triangle', 0.14, 0.06);
    tone(2093, 0.6, 'triangle', 0.12, 0.12);
    noise(0.25, 0.08, 'bandpass', 6000, 0.1);
  },
  boot() {
    [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 1.2, 'triangle', 0.08, i * 0.12));
  },
  pickup() {
    noise(0.06, 0.25, 'lowpass', 900);
    tone(1400, 0.04, 'square', 0.03, 0.05);
  },
  hangup() {
    noise(0.08, 0.3, 'lowpass', 700);
    [0, 0.35, 0.7].forEach((w) => tone(480, 0.22, 'sine', 0.08, 0.2 + w));
  },
  whoosh() {
    noise(0.35, 0.1, 'bandpass', 900);
  },
  alarm() {
    for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 0.18, 'square', 0.07, i * 0.2);
  },
  powerDown() {
    const c = audio();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.9);
    env(g, c.currentTime, 0.01, 0.1, 0.9);
    o.connect(g).connect(master);
    o.start();
    o.stop(c.currentTime + 1);
  },
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'square', 0.06, i * 0.09));
  },
  bounce(k = 1) {
    tone(95, 0.12, 'sine', 0.18 * k);
    noise(0.05, 0.12 * k, 'lowpass', 500);
  },
  rim() {
    tone(620, 0.25, 'triangle', 0.08);
    tone(1240, 0.15, 'sine', 0.03);
  },
  swish() {
    noise(0.28, 0.16, 'bandpass', 2600);
  },
  cheer() {
    noise(1.1, 0.1, 'bandpass', 1400);
    noise(0.9, 0.06, 'bandpass', 2400, 0.1);
    [523, 659, 784].forEach((f, i) => tone(f, 0.25, 'triangle', 0.05, 0.05 + i * 0.07));
  },
  thunder(loud = 1) {
    const c = audio();
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(4);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * loud, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.15 * loud, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + 4);
  },
  blip(f = 660) {
    tone(f, 0.06, 'square', 0.04);
  },
  stamp() {
    tone(70, 0.16, 'sine', 0.3);
    noise(0.09, 0.32, 'lowpass', 900);
    noise(0.04, 0.12, 'bandpass', 3200, 0.01);
  },
  slide() {
    tone(1180, 0.03, 'square', 0.025);
    noise(0.16, 0.05, 'bandpass', 1800, 0.02);
  },
  horn() {
    for (const f of [233, 236, 311]) tone(f, 0.9, 'sawtooth', 0.09);
    noise(0.15, 0.08, 'bandpass', 1200);
  },
  boom() {
    tone(55, 0.9, 'sine', 0.45);
    tone(38, 1.2, 'triangle', 0.3, 0.05);
    noise(1.1, 0.5, 'lowpass', 700);
    noise(0.25, 0.25, 'bandpass', 2400);
  },
  fired() {
    [392, 370, 349, 330].forEach((f, i) => tone(f, 0.45, 'sawtooth', 0.06, i * 0.35));
  },
};

export function startRinging() {
  stopRinging();
  let alive = true;
  const loop = () => {
    if (!alive) return;
    for (let i = 0; i < 2; i++) {
      tone(440, 0.4, 'sine', 0.06, i * 0.45);
      tone(480, 0.4, 'sine', 0.06, i * 0.45);
    }
    setTimeout(loop, 2600);
  };
  loop();
  ringing = { stop: () => (alive = false) };
}
export function stopRinging() {
  ringing?.stop();
  ringing = null;
}

export function startSiren() {
  stopSiren();
  const c = audio();
  const o = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  const g = c.createGain();
  o.type = 'sawtooth';
  o.frequency.value = 750;
  lfo.frequency.value = 0.9;
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(o.frequency);
  g.gain.value = 0.05;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2200;
  o.connect(f).connect(g).connect(master);
  o.start();
  lfo.start();
  siren = {
    stop: () => {
      g.gain.setTargetAtTime(0.0001, c.currentTime, 0.1);
      setTimeout(() => {
        o.stop();
        lfo.stop();
      }, 400);
    },
  };
}
export function stopSiren() {
  siren?.stop();
  siren = null;
}

export function startAmbience() {
  if (ambience) return;
  const c = audio();
  ambience = c.createGain();
  ambience.gain.value = 0.0001;
  ambience.gain.setTargetAtTime(0.35, c.currentTime, 1.5);
  ambience.connect(master);

  const hum = c.createBufferSource();
  hum.buffer = noiseBuffer(4);
  hum.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const hg = c.createGain();
  hg.gain.value = 0.18;
  hum.connect(lp).connect(hg).connect(ambience);
  hum.start();

  const chatter = c.createBufferSource();
  chatter.buffer = noiseBuffer(4);
  chatter.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700;
  bp.Q.value = 2.5;
  const cg = c.createGain();
  cg.gain.value = 0.025;
  const wob = c.createOscillator();
  const wobG = c.createGain();
  wob.frequency.value = 2.7;
  wobG.gain.value = 0.02;
  wob.connect(wobG).connect(cg.gain);
  wob.start();
  chatter.connect(bp).connect(cg).connect(ambience);
  chatter.start();

  const typing = () => {
    if (!ambience) return;
    const burst = 3 + Math.floor(Math.random() * 8);
    for (let i = 0; i < burst; i++) setTimeout(() => ambience && noise(0.015, 0.012, 'bandpass', 2400 + Math.random() * 1000), i * (60 + Math.random() * 70));
    setTimeout(typing, 700 + Math.random() * 2500);
  };
  typing();
}

let music: { stop: () => void } | null = null;
export function startMenuMusic() {
  if (music) return;
  const c = audio();
  const out = c.createGain();
  out.gain.value = 0.0001;
  out.gain.setTargetAtTime(0.5, c.currentTime, 1);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  out.connect(lp).connect(master);
  const chords = [
    [220, 261.6, 329.6, 392],
    [174.6, 220, 261.6, 329.6],
    [196, 246.9, 293.7, 349.2],
    [164.8, 207.7, 246.9, 329.6],
  ];
  let i = 0;
  let alive = true;
  const step = () => {
    if (!alive) return;
    const ch = chords[i++ % chords.length];
    ch.forEach((f, k) => {
      tone(f, 2.2, 'triangle', 0.035, k * 0.02, out);
      tone(f * 2, 0.25, 'sine', 0.02, 0.5 + k * 0.25, out);
    });
    tone(ch[0] / 2, 1.8, 'sine', 0.08, 0, out);
    setTimeout(step, 2400);
  };
  step();
  music = {
    stop: () => {
      alive = false;
      out.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
    },
  };
}
export function stopMenuMusic() {
  music?.stop();
  music = null;
}

let rainGain: GainNode | null = null;
export function setRain(level: number) {
  const a = audio();
  if (!rainGain) {
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.86 + (Math.random() * 2 - 1) * 0.14;
      d[i] = last * 2.4 + (Math.random() < 0.0007 ? (Math.random() - 0.5) * 1.5 : 0);
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    rainGain = a.createGain();
    rainGain.gain.value = 0;
    src.connect(lp).connect(rainGain).connect(masterNode());
    src.start();
  }
  rainGain.gain.setTargetAtTime(level * 0.16, a.currentTime, 1.2);
}
