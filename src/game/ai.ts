import type { CallerTurn, Line, Persona } from './types';
import { localTurn } from './brain';
import { settings } from './settings';
import { bus } from './bus';

export const backend = {
  server: false,
  ai: false,
  provider: '' as string | null,
  model: '' as string | null,
  tts: '' as string | null,
  voices: null as null | { f: string[]; m: string[] },
  live: false,
  checked: false,
};
let downUntil = 0;
let warned = false;

export async function checkBackend(): Promise<typeof backend> {
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    const j = await r.json();
    backend.server = true;
    backend.ai = !!j.ai;
    backend.provider = j.provider;
    backend.model = j.model;
    backend.tts = j.tts;
    backend.voices = j.voices;
    backend.live = !!j.live;
  } catch {
    backend.server = false;
    backend.ai = false;
    backend.tts = null;
    backend.live = false;
  }
  backend.checked = true;
  return backend;
}

export async function callerTurn(p: Persona, history: Line[], trust: number, context: string): Promise<CallerTurn & { offline: boolean; voice_style?: string }> {
  const lines = history.filter((h) => h.who !== 'system');
  if (backend.ai && Date.now() > downUntil) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25_000);
      const r = await fetch('/api/caller/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persona: p, history: lines, trust, lang: settings.lang, context }),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (r.ok) return { ...(await r.json()), offline: false };
      if (r.status === 503) backend.ai = false;
      const j = await r.json().catch(() => null);
      if (j?.detail && !warned) {
        warned = true;
        bus.emit('toast', { text: `AI caller offline: ${j.detail} Using the built-in brain.`, kind: 'bad' });
      }
    } catch {
    }
    downUntil = Date.now() + 30_000;
  }
  await new Promise((res) => setTimeout(res, 500 + Math.random() * 700));
  return { ...localTurn(p, lines, trust, context), offline: true };
}
