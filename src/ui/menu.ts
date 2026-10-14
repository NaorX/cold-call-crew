import { h, clear } from './dom';
import { portrait } from './portrait';
import { icon } from '../os/icons';
import { settingsPanel } from './settingsPanel';
import { backend, checkBackend } from '../game/ai';
import { settings } from '../game/settings';
import { sfx } from '../game/audio';

export interface MenuActions {
  solo(): void;
  host(): void;
  join(code: string): void;
  leave(): void;
  setLook(): void;
  customize(): void;
}

export class Menu {
  el: HTMLElement;
  private left: HTMLElement;
  private status: HTMLElement;
  private sheet: HTMLElement;
  private cards: HTMLElement;

  constructor(private act: MenuActions) {
    this.left = h('div.mm-nav');
    this.status = h('div.mm-status');
    this.sheet = h('div.sheet');
    this.cards = h('div.mm-cards');
    this.el = h(
      'div.menu',
      null,
      h('div.mm-shade'),
      h('div.mm-logo', null, h('div.logo-top', null, 'COLD CALL'), h('div.logo-bottom', null, 'CREW')),
      this.left,
      this.cards,
      this.status,
      h('div.mm-ver', null, 'v0.3 · early access'),
      this.sheet,
    );
    this.main();
    void this.refresh();
  }

  private item(label: string, sub: string, fn: () => void, cls = '') {
    return h(`button.mm-item${cls}`, { onclick: () => (sfx.click(), fn()), onmouseenter: () => sfx.key() }, h('span.mm-label', null, label), h('span.mm-sub', null, sub));
  }

  private drawCards() {
    clear(this.cards);
    const card = (ico: HTMLElement, title: string, sub: string, fn: () => void, accent: string) =>
      h('button.mm-card', { style: { '--accent': accent }, onclick: fn }, ico, h('div', null, h('b', null, title), h('small', null, sub)), h('span.mm-card-go', { innerHTML: icon('arrowRight') }));
    this.cards.append(
      card(h('span.mm-card-face', { innerHTML: portrait(settings.look, 'happy') }), settings.name, 'Customize your character', () => this.act.customize(), '#ff9f43'),
      card(h('span.mm-card-ico', { innerHTML: icon('sparkles') }), backend.ai ? 'AI callers are live' : 'AI callers offline', backend.ai ? `${backend.provider === 'gemini' ? 'Gemini' : 'Claude'}${backend.tts ? ' · real voices' : ''}` : 'Add a Gemini key for smart callers', () => this.showSheet('ai'), '#30d158'),
      card(h('span.mm-card-ico', { innerHTML: icon('info') }), 'How to play', 'From your first call to quota', () => this.showSheet('how'), '#0a84ff'),
    );
  }

  main() {
    clear(this.left);
    this.left.append(
      this.item('Play', 'Solo or with your crew', () => this.play(), '.big'),
      this.item('Customize', 'Your character', () => this.act.customize()),
      this.item('Settings', 'Language, audio, graphics', () => this.showSheet('settings')),
      this.item('Credits', 'Who made this', () => this.showSheet('credits')),
    );
    this.drawCards();
  }

  play() {
    clear(this.left);
    this.left.append(
      h('div.mm-crumb', null, h('button', { onclick: () => this.main(), innerHTML: icon('arrowRight') }), 'PLAY'),
      this.item('Solo shift', 'Just you and the phones', () => this.act.solo(), '.big'),
      this.item('Host a crew', 'Get a code, invite friends', () => this.act.host()),
      this.item('Join by code', 'Enter a 4-letter crew code', () => this.joinCode()),
    );
  }

  joinCode() {
    clear(this.left);
    const boxes = [0, 1, 2, 3].map(() => h('input.code-cell', { maxLength: 1, spellcheck: false, autocomplete: 'off' }) as HTMLInputElement);
    const go = () => {
      const code = boxes.map((b) => b.value).join('');
      if (code.length === 4) this.act.join(code);
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        b.value = b.value.toUpperCase().replace(/[^A-Z]/g, '');
        if (b.value && i < 3) boxes[i + 1].focus();
        if (boxes.every((x) => x.value)) go();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus();
        if (e.key === 'Enter') go();
      });
    });
    this.left.append(
      h('div.mm-crumb', null, h('button', { onclick: () => this.play(), innerHTML: icon('arrowRight') }), 'JOIN BY CODE'),
      h('div.code-cells', null, ...boxes),
      h('p.mm-note', null, 'Ask the host for the code. It is in the top-left corner of their screen.'),
      this.item('Join', 'Clock in with your crew', go, '.big'),
    );
    setTimeout(() => boxes[0].focus(), 50);
  }

  lobby() {
  }

  async refresh() {
    clear(this.status);
    this.status.append(h('span.mm-chip', null, h('i.dot'), 'Checking…'));
    await checkBackend();
    clear(this.status);
    const chip = (ok: boolean, label: string) => h('span.mm-chip', { class: ok ? 'ok' : 'warn' }, h('i.dot'), label);
    this.status.append(
      chip(backend.server, backend.server ? 'Server online' : 'Offline · solo only'),
      chip(backend.ai, backend.ai ? `AI · ${backend.provider === 'gemini' ? 'Gemini' : 'Claude'}` : 'AI offline'),
      chip(!!backend.tts, backend.tts ? 'Real voices' : 'Browser voices'),
      h('button.mm-refresh', { onclick: () => void this.refresh(), innerHTML: icon('refresh'), title: 'Refresh' }),
    );
    this.drawCards();
  }

  showSheet(kind: 'how' | 'settings' | 'credits' | 'ai' | 'quit' | 'studio') {
    clear(this.sheet);
    const close = h('button.sheet-close', { onclick: () => this.sheet.classList.remove('show'), innerHTML: icon('close') });
    let body: HTMLElement;
    if (kind === 'settings') body = h('div', null, h('h2', null, 'Settings'), settingsPanel(() => this.act.setLook()));
    else if (kind === 'how') {
      const step = (n: number, t: string, d: string) => h('div.how-step', null, h('span.how-n', null, String(n)), h('div', null, h('b', null, t), h('p', null, d)));
      body = h(
        'div.how',
        null,
        h('h2', null, 'How to play'),
        step(1, 'Clock in', 'Walk to the manager laptop on the red table (E) and start the shift.'),
        step(2, 'Grab a desk', 'Go through the red door, sit at a free desk (E) and click the monitor.'),
        step(3, 'Work the call', 'Introduce yourself, tell one story, and win their trust. The Boss whispers your next move.'),
        step(4, 'Make the ask', 'At 70% trust ask for a gift card. Redeem the code in Gift Cards before it expires.'),
        step(5, 'Make quota', 'Hit the team quota by 5 PM, survive raids, viruses and scambaiters, and buy upgrades.'),
        h('p.muted', null, 'Everything here is fiction and satire: fictional people, fictional money.'),
      );
    } else if (kind === 'credits')
      body = h('div', null, h('h2', null, 'Credits'), h('p', null, 'Cold Call Crew. A co-op comedy about the worst call center on Earth.'), h('p', null, 'Built with three.js. Callers by Gemini or Claude, voices by Gemini TTS. Every sound is synthesized and every texture painted in code.'), h('p.muted', null, 'All characters and companies are fictional.'));
    else if (kind === 'ai')
      body = h(
        'div',
        null,
        h('h2', null, 'AI callers'),
        h('p', null, backend.ai ? `Callers are improvised live by ${backend.provider === 'gemini' ? 'Google Gemini' : 'Claude'} (${backend.model}).` : 'AI is offline. A built-in caller brain runs instead; callers are far smarter with AI.'),
        h('p', null, backend.tts ? `Voices: Gemini TTS (${backend.tts}).` : 'Voices: browser speech. A Gemini key gives every caller a real voice.'),
        h('p.muted', null, 'Put GEMINI_API_KEY in the .env file and restart the server.'),
      );
    else body = h('div', null, h('h2', null, 'Caller Studio'), h('p', null, 'Caller Studio is on the manager laptop in the break room.'));
    this.sheet.append(h('div.sheet-card', null, close, body));
    this.sheet.classList.add('show');
  }

  show() {
    this.el.classList.add('show');
    this.main();
  }
  hide() {
    this.el.classList.remove('show');
    this.sheet.classList.remove('show');
  }
}
