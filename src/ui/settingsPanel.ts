import { h, clear } from './dom';
import { icon } from '../os/icons';
import { settings, saveSettings } from '../game/settings';
import { backend, checkBackend } from '../game/ai';
import { speakCaller, sttSupported } from '../game/voice';
import { LANGS, LANG_LIST } from '../game/langs';
import type { Look } from '../game/types';

type Tab = 'gameplay' | 'audio' | 'graphics' | 'controls';

export function settingsPanel(_onLook?: (look: Look) => void, startTab: Tab = 'gameplay'): HTMLElement {
  let tab: Tab = startTab;
  const root = h('div.settings');
  const nav = h('div.set-nav');
  const body = h('div.set-body');
  root.append(nav, body);

  const row = (label: string, hint: string | null, control: HTMLElement) => h('div.set-row', null, h('div.set-label', null, h('b', null, label), hint ? h('small', null, hint) : null), h('div.set-ctl', null, control));
  const seg = <T extends string>(opts: readonly (readonly [T, string])[], cur: T, fn: (v: T) => void) =>
    h('div.seg', null, ...opts.map(([v, label]) => h('button', { class: cur === v ? 'on' : '', onclick: () => (fn(v), draw()) }, label)));
  const toggle = (on: boolean, fn: (v: boolean) => void) => h('button.switch', { class: on ? 'on' : '', role: 'switch', onclick: () => (fn(!on), draw()) }, h('i'));
  const slider = (v: number, min: number, max: number, step: number, fmt: (v: number) => string, fn: (v: number) => void) => {
    const out = h('span.slider-val', null, fmt(v));
    const s = h('input.slider', { type: 'range', min, max, step, value: v }) as HTMLInputElement;
    const paint = () => s.style.setProperty('--p', `${((Number(s.value) - min) / (max - min)) * 100}%`);
    paint();
    s.addEventListener('input', () => {
      fn(Number(s.value));
      out.textContent = fmt(Number(s.value));
      paint();
    });
    return h('div.slider-wrap', null, s, out);
  };

  const draw = () => {
    clear(nav);
    for (const [k, label, ico] of [
      ['gameplay', 'Gameplay', 'sliders'],
      ['audio', 'Audio', 'speaker'],
      ['graphics', 'Graphics', 'eye'],
      ['controls', 'Controls', 'keyboard'],
    ] as const)
      nav.append(h('button.set-tab', { class: tab === k ? 'on' : '', onclick: () => ((tab = k), draw()) }, h('span', { innerHTML: icon(ico) }), label));
    clear(body);
    if (tab === 'gameplay') {
      const name = h('input.text-in', { value: settings.name, maxLength: 18 }) as HTMLInputElement;
      name.addEventListener('keydown', (e) => e.stopPropagation());
      name.addEventListener('change', () => saveSettings({ name: name.value.trim() || 'Rookie' }));
      body.append(
        h('h3', null, 'Gameplay'),
        row('Name', 'What your crew and the leaderboard call you.', name),
        row('Call language', 'Callers speak this language and the mic listens for it.', seg(LANG_LIST.map((l) => [l, LANGS[l].label] as const), settings.lang, (v) => saveSettings({ lang: v }))),
        row('Shift length', 'Real time for one working day (solo / host).', seg([['600', '10 min'], ['1200', '20 min'], ['1800', '30 min'], ['2700', '45 min']] as const, String(settings.shiftSeconds) as any, (v) => saveSettings({ shiftSeconds: Number(v) }))),
        row('Transcript text size', 'Make the conversation easier to read.', slider(settings.textSize, 13, 24, 1, (v) => `${v}px`, (v) => saveSettings({ textSize: v }))),
        row('Self view in calls', 'Show your webcam picture while you talk.', toggle(settings.selfView, (v) => saveSettings({ selfView: v }))),
        row('Proximity voice chat', 'Talk to crewmates standing near you.', toggle(settings.voiceChat, (v) => saveSettings({ voiceChat: v }))),
        h(
          'div.set-card',
          null,
          h('div.set-card-ico', { innerHTML: icon('sparkles') }),
          h('div', null, h('b', null, backend.ai ? `AI callers online · ${backend.provider === 'gemini' ? 'Gemini' : 'Claude'}` : 'AI callers offline'), h('small', null, backend.ai ? `${backend.model}${backend.tts ? ` · voices ${backend.tts}` : ''}` : 'Add GEMINI_API_KEY to .env for smart callers and real voices.')),
          h('button.pill-btn.small', { onclick: async () => (await checkBackend(), draw()) }, 'Re-check'),
        ),
      );
    } else if (tab === 'audio') {
      body.append(
        h('h3', null, 'Audio'),
        row('Master volume', null, slider(settings.volume, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => saveSettings({ volume: v }))),
        row('Caller voice', 'Hear callers out loud.', toggle(settings.tts, (v) => saveSettings({ tts: v }))),
        row('Caller speech speed', null, slider(settings.ttsRate, 0.8, 1.25, 0.05, (v) => `${v.toFixed(2)}×`, (v) => saveSettings({ ttsRate: v }))),
        row(
          'Test a caller',
          backend.tts ? 'Plays a real Gemini voice.' : 'Plays the browser voice.',
          h('button.pill-btn.small', { onclick: () => void speakCaller(settings.lang === 'he' ? 'הלו? מי זה? קיבלתי הודעה להתקשר למספר הזה.' : 'Hello? Who is this? I got a message to call this number.', { gender: 'f', pitch: 1.1, rate: 0.95, seed: 'test-voice', style: 'elderly, warm, slightly confused' }) }, 'Play'),
        ),
        row('Voice input', sttSupported ? 'Works in this browser. Hold V or press the mic button.' : 'Needs Chrome or Edge. You can always type.', h('span.status-chip', { class: sttSupported ? 'ok' : 'warn' }, sttSupported ? 'Ready' : 'Unavailable')),
      );
    } else if (tab === 'graphics') {
      body.append(
        h('h3', null, 'Graphics'),
        row('Quality', 'Shadows, bloom, crowd size. Applies after a reload.', seg([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as const, settings.quality, (v) => saveSettings({ quality: v }))),
        h('button.pill-btn', { onclick: () => location.reload() }, 'Reload to apply'),
      );
    } else {
      const key = (k: string, what: string) => h('div.key-row', null, h('kbd', null, k), h('span', null, what));
      body.append(
        h('h3', null, 'Controls'),
        row('Camera', 'Over the shoulder, or through your own eyes. F switches any time.', seg([['third', 'Third person'], ['first', 'First person']] as const, settings.view, (v) => saveSettings({ view: v }))),
        h(
          'div.keys',
          null,
          key('W A S D', 'Walk'),
          key('Shift', 'Run'),
          key('Space', 'Jump'),
          key('Mouse', 'Look around (click to capture)'),
          key('E', 'Use · sit down · open the computer'),
          key('F', 'First / third person'),
          key('Esc', 'Pause menu · leave the screen'),
          key('V (hold)', 'Talk to the caller'),
          key('C', 'Drink coffee (+15 trust)'),
          key('Tab', 'Players'),
          key('M', 'Mute voice chat'),
        ),
      );
    }
  };
  draw();
  return root;
}
