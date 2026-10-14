import { bus } from './bus';
import { crew } from './net';
import { game } from './game';
import { settings } from './settings';
import { backend } from './ai';
import { coach, STEPS_EN } from '../os/apps/phone';

export interface BossTip {
  callId: string;
  text: string;
  at: number;
}
export let bossTip: BossTip | null = null;
let lastAsk = 0;

const BUSY_EN = ['I am in a meeting. Figure it out. Thirty seconds.', 'Again? I pay you to think. Give it a minute.', 'Busy. Try not to get fired while I eat.'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function offline(): { reply: string; tip: string } {
  const call = game.call;
  if (!call || call.state !== 'active')
    return { reply: 'No call? Then why are you talking to me? Sit down and answer the phone.', tip: '' };
  const { tip } = coach(call);
  const p = call.persona;
  let hint = '';
  if (p.baiter && call.lines.length > 4) hint = 'And this one smells like a prankster. Do not waste your day.';
  else if (!p.giftCardFriendly && p.hasCard) hint = 'Also: gift cards confuse this one, but they carry a credit card.';
  else if (p.giftCardFriendly) hint = 'And this one would happily run to the store for a gift card. Lean on that.';
  return { reply: `${tip} ${hint}`.trim(), tip };
}

export async function askBoss(message: string): Promise<{ reply: string; mood: string }> {
  if (Date.now() - lastAsk < 20_000) return { reply: pick(BUSY_EN), mood: 'annoyed' };
  lastAsk = Date.now();
  const call = game.call && game.call.state === 'active' ? game.call : null;
  let out: { reply: string; tip: string; mood: string } | null = null;
  if (backend.ai) {
    try {
      const r = await fetch('/api/boss/advice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          lang: /[֐-׿]/.test(message) ? 'he' : /[؀-ۿ]/.test(message) ? 'ar' : 'en',
          name: crew.self?.name,
          earned: crew.self?.personal || 0,
          day: crew.run?.day,
          team: crew.run?.teamToday,
          quota: crew.run?.quota,
          owned: [...game.upgrades],
          call: call && {
            seconds: (performance.now() - call.started) / 1000,
            trust: call.trust,
            step: STEPS_EN[coach(call).stage],
            scheme: game.context(call),
            persona: call.persona,
            history: call.lines.filter((l) => l.who === 'player' || l.who === 'caller').map((l) => ({ who: l.who, text: l.text })),
          },
        }),
      });
      if (r.ok) out = await r.json();
    } catch {
    }
  }
  if (!out) out = { ...offline(), mood: 'impatient' };
  if (call && out.tip) {
    bossTip = { callId: call.id, text: out.tip, at: Date.now() };
    bus.emit('call:changed');
  }
  return { reply: out.reply, mood: out.mood };
}
