import { h, clear, money, clockText } from './dom';
import { icon } from '../os/icons';
import { crew, send } from '../game/net';
import { bus } from '../game/bus';
import { sfx } from '../game/audio';

const TOAST_TITLE: Record<string, string> = { good: 'Nice work', bad: 'Heads up', boss: 'The Boss', info: 'Cold Call Crew', money: 'Wallet', coffee: 'Break Room' };
const TOAST_ICON: Record<string, string> = { good: 'check', bad: 'alert', boss: 'megaphone', info: 'info', money: 'money', coffee: 'coffee' };

export function reviewLeft(): number {
  const run = crew.run;
  if (!run) return 0;
  return Math.max(0, run.reviewIn ?? 0);
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function clockOutState() {
  const run = crew.run;
  const all = crew.players.length || 1;
  const done = crew.players.filter((p) => p.clockedOut).length;
  return { can: !!run && run.phase === 'shift' && run.teamToday >= run.quota, mine: !!crew.self?.clockedOut, done, all };
}
export function toggleClockOut() {
  const st = clockOutState();
  if (!st.can) return;
  sfx.click();
  send({ t: 'clockout', on: !st.mine });
}

export class Hud {
  el: HTMLElement;
  private info: HTMLElement;
  private hint: HTMLElement;
  private tip: HTMLElement;
  private prompt: HTMLElement;
  private alert: HTMLElement;
  private players: HTMLElement;
  private voice: HTMLElement;
  toasts: HTMLElement;
  private infoBody: HTMLElement;
  private outBtn: HTMLButtonElement;

  constructor() {
    this.infoBody = h('div.hc-body');
    this.outBtn = h('button.hc-out', { onclick: () => toggleClockOut() }) as HTMLButtonElement;
    this.info = h('div.hud-card', null, this.infoBody, this.outBtn);
    this.hint = h('div.hud-hint');
    this.tip = h('div.hud-tip');
    this.prompt = h('div.hud-prompt');
    this.alert = h('div.hud-alert');
    this.players = h('div.hud-players');
    this.voice = h('div.hud-voice');
    this.toasts = h('div.toasts');
    this.el = h('div.hud', null, this.info, this.tip, this.prompt, this.alert, this.players, this.voice, this.hint);
    bus.on('toast', (t: { text: string; kind?: string }) => this.toast(t.text, t.kind));
  }

  setHint(html: string) {
    if (this.hint.innerHTML !== html) this.hint.innerHTML = html;
  }

  setPrompt(text: string | null) {
    const html = text ? `<kbd>E</kbd><span>${text}</span>` : '';
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.classList.toggle('show', !!text);
  }

  setAlert(text: string | null, kind: 'call' | 'info' = 'info') {
    const html = text ? `${icon(kind === 'call' ? 'phone' : 'info')}<span>${text}</span>` : '';
    if (this.alert.innerHTML !== html) this.alert.innerHTML = html;
    this.alert.className = `hud-alert ${text ? 'show' : ''} ${kind}`;
  }

  setVoice(state: 'off' | 'on' | 'muted' | 'talking') {
    const html = state === 'off' ? '' : `${icon(state === 'muted' ? 'micOff' : 'mic')}<span>${state === 'muted' ? 'Muted' : state === 'talking' ? 'Talking' : 'Voice on'}</span><kbd>M</kbd>`;
    if (this.voice.innerHTML !== html) this.voice.innerHTML = html;
    this.voice.className = `hud-voice ${state}`;
  }

  showPlayers(on: boolean, rows: { name: string; status: string; money: string; host: boolean }[] = []) {
    this.players.classList.toggle('show', on);
    if (!on) return;
    clear(this.players);
    this.players.append(
      h('div.hp-head', null, h('b', null, 'Players'), crew.online ? h('span.code-chip', null, 'CREW ', h('b', null, crew.code)) : h('span.code-chip', null, 'SOLO')),
      ...rows.map((r) => h('div.hp-row', null, h('span.hp-av', null, r.name[0]), h('b', null, r.name, r.host ? h('span.tag', null, 'HOST') : null), h('span.hp-st', null, r.status), h('span.hp-money', null, r.money))),
    );
  }

  update() {
    const run = crew.run;
    if (!run) return;
    const pct = Math.min(100, (run.teamToday / Math.max(1, run.quota)) * 100);
    const live = run.phase === 'shift';
    const left = reviewLeft();
    const made = run.teamToday >= run.quota;
    const urgency = !live ? '' : left < 20 ? 'urgent' : left < 60 ? 'warn' : '';
    const html = `${crew.online ? `<div class="hc-code">CREW <b>${crew.code}</b></div>` : ''}
      <div class="hc-row"><b>Day ${run.day}</b><span>${clockText(run.clock)}</span></div>
      <div class="hc-review ${urgency}"><small>${live ? 'Performance review in' : run.phase === 'review' ? 'Performance review' : 'Shift not started'}</small><b>${live ? mmss(left) : run.phase === 'review' ? 'Now' : '--:--'}</b></div>
      <div class="hc-quota ${made ? 'made' : ''}"><span>${money(run.teamToday)}</span><span class="muted">/ ${money(run.quota)}</span>${made ? '<em>Quota met</em>' : ''}</div>
      <div class="hc-bar"><i style="width:${pct}%"></i></div>`;
    if (this.infoBody.innerHTML !== html) this.infoBody.innerHTML = html;
    const out = clockOutState();
    this.outBtn.classList.toggle('show', out.can);
    this.outBtn.classList.toggle('on', out.mine);
    const label = out.mine ? `<span>Clocked out</span><small>${out.done}/${out.all} · undo</small>` : `<span>Clock out</span><small>Go to the review early</small><kbd>O</kbd>`;
    if (this.outBtn.innerHTML !== label) this.outBtn.innerHTML = label;
  }

  setTip(text: string | null) {
    this.tip.textContent = text || '';
    this.tip.classList.toggle('show', !!text);
  }

  show() {
    this.el.classList.add('show');
  }
  hide() {
    this.el.classList.remove('show');
    this.setTip(null);
  }

  quiet = false;
  toast(text: string, kind = '') {
    if (this.quiet) return;
    const k = kind || 'info';
    const from = text.match(/^([^:]{2,24}):\s+(.+)$/s);
    const title = from ? from[1] : TOAST_TITLE[k] || 'Cold Call Crew';
    const body = from ? from[2] : text;
    const t = h(
      `div.toast.${k}`,
      null,
      h('span.toast-ico', { innerHTML: icon(TOAST_ICON[k] || 'info') }),
      h('div.toast-text', null, h('div.toast-head', null, h('b', null, title), h('small', null, 'now')), h('p', { dir: 'auto' }, body)),
    );
    this.toasts.append(t);
    setTimeout(() => t.classList.add('out'), 4600);
    setTimeout(() => t.remove(), 5100);
  }
}

export function daySplash(parent: HTMLElement, day: number, quota: number, fresh: string[]) {
  const el = h(
    'div.day-splash',
    null,
    h(
      'div.day-card',
      null,
      h('small', null, new Date(2026, 9, 4 + day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()),
      h('h1', null, `Day ${day}`),
      h('div.day-quota', null, h('span', null, 'Quota'), h('b', null, money(quota))),
      fresh.length && day > 1 ? h('div.fresh', null, h('small', null, 'NEW TODAY'), ...fresh.map((f) => h('span.chip', null, f))) : null,
    ),
  );
  parent.append(el);
  sfx.levelUp();
  setTimeout(() => el.classList.add('out'), 2800);
  setTimeout(() => el.remove(), 3500);
}

export function crewTicker(parent: HTMLElement) {
  const el = h('div.crew-ticker');
  parent.append(el);
  bus.on('net:earned', (m: any) => {
    if (m.amount <= 0 || m.id === crew.me) return;
    const t = h('div.tick', null, h('span', { innerHTML: icon('money') }), `${m.name} +${money(m.amount)}`);
    el.append(t);
    setTimeout(() => t.remove(), 3500);
  });
  return el;
}
