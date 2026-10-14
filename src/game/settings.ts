import type { Look } from './types';
import type { Lang } from './langs';

export interface Settings {
  name: string;
  look: Look;
  lang: Lang;
  volume: number;
  tts: boolean;
  ttsRate: number;
  quality: 'low' | 'medium' | 'high';
  shiftSeconds: number;
  pushToTalk: boolean;
  created: boolean;
  voiceChat: boolean;
  textSize: number;
  selfView: boolean;
  view: 'third' | 'first';
}

const KEY = 'ccc.settings';

const DEFAULTS: Settings = {
  name: 'Rookie',
  look: { skin: '#f08a3c', hair: 'curly', hairColor: '#2a1d14', facial: 'none', glasses: false, shirt: '#3f9b4a', top: 'tee', pants: '#3b5b8c' },
  lang: 'en',
  volume: 0.8,
  tts: true,
  ttsRate: 1,
  quality: 'high',
  shiftSeconds: 1200,
  pushToTalk: false,
  created: false,
  voiceChat: true,
  textSize: 16,
  selfView: true,
  view: 'third',
};

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (raw.shiftSeconds && raw.shiftSeconds <= 600) raw.shiftSeconds = DEFAULTS.shiftSeconds;
    return { ...DEFAULTS, ...raw, look: { ...DEFAULTS.look, ...(raw.look || {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

const listeners = new Set<() => void>();
export function onSettings(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
  }
  for (const l of listeners) l();
}

export const UPGRADES = [
  { key: 'ledger', name: 'Ledger', price: 300, desc: 'App: see every transaction, the quota bar and your heat.', icon: 'ledger', app: true },
  { key: 'customer', name: 'Customer Info', price: 400, desc: "App: the caller's file: savings, whether they'd buy gift cards, if they carry a card, their quirks.", icon: 'user', app: true },
  { key: 'remote', name: 'RemoteDesk', price: 900, desc: "App: remote into a caller's PC, fake refunds, wire money. (Day 3+)", icon: 'remote', app: true, day: 3 },
  { key: 'headset', name: 'Noise-Cancelling Headset', price: 300, desc: 'Callers start with +10 trust.', icon: 'headset' },
  { key: 'binder', name: 'Script Binder', price: 200, desc: 'Unlocks every line in the Script panel.', icon: 'script' },
  { key: 'spoof', name: 'Caller ID Spoofer', price: 450, desc: 'Callers lose 30% less trust when you slip up.', icon: 'antenna' },
  { key: 'vpn', name: 'Bulletproof VPN', price: 500, desc: '+6 seconds of warning before police raids. Less heat.', icon: 'shield' },
  { key: 'printer', name: 'Gift Card Printer', price: 650, desc: 'Every gift card redeemed is worth +20%.', icon: 'printer' },
  { key: 'autodialer', name: 'Auto-Dialer 3000', price: 400, desc: 'Calls come in twice as fast.', icon: 'dial' },
  { key: 'coffee', name: 'Industrial Coffee', price: 120, desc: 'Consumable: +15 trust on your current caller (press C or click your mug).', icon: 'coffee', consumable: true },
  { key: 'antivirus', name: 'DefendR Pro License', price: 250, desc: 'Viruses are removed instantly by DefendR.', icon: 'virus' },
] as const;
export type UpgradeKey = (typeof UPGRADES)[number]['key'];
