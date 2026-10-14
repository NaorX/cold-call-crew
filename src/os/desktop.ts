import { h, clear, money, clockText } from '../ui/dom';
import { portrait } from '../ui/portrait';
import { icon } from './icons';
import { WindowManager, appTile } from './wm';
import { bus } from '../game/bus';
import { crew } from '../game/net';
import { game } from '../game/game';
import { sfx } from '../game/audio';
import { SHIFT_MINUTES } from '../shared/room.js';
import { PhoneApp } from './apps/phone';
import { RemoteDeskApp } from './apps/loot';
import { CreditCardApp, GiftCardsApp, CustomerInfoApp } from './apps/scams';
import { CasinoApp } from './apps/casino';
import { ScamazonApp } from './apps/scamazon';
import { LedgerApp, ShopApp, ChatApp, CameraApp, chatUnread } from './apps/office';
import { FolderApp, PaintApp, MinesApp, NotesApp, DefendrApp, FreeRamApp } from './apps/fun';
import { StudioApp } from './apps/studio';
import { GameManagerApp } from './apps/manager';
import { settingsPanel } from '../ui/settingsPanel';
import type { World } from '../engine/world';
import { clockOutState, toggleClockOut } from '../ui/hud';

export class OSShell {
  el: HTMLElement;
  area: HTMLElement;
  wm: WindowManager;
  private dock: HTMLElement;
  private stats: HTMLElement;
  private outBtn: HTMLButtonElement;
  private clockEl: HTMLElement;
  private appName: HTMLElement;
  private icons: HTMLElement;
  private bootEl: HTMLElement;
  private incomingEl: HTMLElement | null = null;
  private startMenu: HTMLElement | null = null;
  visible = false;
  booted = false;
  onExit: () => void = () => {};
  onQuit: () => void = () => {};

  constructor(
    private world: World,
    public kind: 'desk' | 'laptop' = 'desk',
  ) {
    this.area = h('div.os-area');
    this.icons = h('div.os-icons', { class: kind === 'laptop' ? 'centered' : '' });
    this.dock = h('div.dock');
    this.stats = h('div.mb-stats');
    this.outBtn = h('button.mb-out', { onclick: () => toggleClockOut(), title: 'Quota met: head to the review early' }) as HTMLButtonElement;
    this.clockEl = h('div.mb-clock');
    this.appName = h('b.mb-app', null, 'Finder');
    this.bootEl = h(
      'div.os-boot',
      null,
      h('div.boot-mark', { innerHTML: mascot() }),
      h('div.boot-name', null, kind === 'laptop' ? 'Manager' : 'BoilerRoom'),
      h('div.boot-bar', null, h('i')),
    );
    const logo = h('button.mb-logo', { innerHTML: icon('phone'), title: 'BoilerRoom', onclick: (e: Event) => (e.stopPropagation(), this.toggleStart()) });
    const menubar = h(
      'div.menubar',
      null,
      logo,
      this.appName,
      h('span.mb-item', null, 'File'),
      h('span.mb-item', null, 'Edit'),
      h('span.mb-item', null, 'View'),
      h('span.mb-item', null, 'Window'),
      h('span.spacer'),
      this.stats,
      this.outBtn,
      h('span.mb-icon', { innerHTML: icon('globe') }),
      this.clockEl,
    );
    this.el = h('div.os', null, h('div.os-wall'), menubar, this.icons, this.area, h('div.dock-wrap', null, this.dock), this.bootEl);
    this.el.addEventListener('pointerdown', () => this.closeStart());

    this.wm = new WindowManager(this.area);
    const apps =
      kind === 'laptop'
        ? [GameManagerApp, { ...StudioApp, title: 'Caller Manager' }]
        : [PhoneApp, GiftCardsApp, CreditCardApp, CustomerInfoApp, RemoteDeskApp, CasinoApp, ScamazonApp, LedgerApp, ShopApp, ChatApp, CameraApp(world), FolderApp(this.wm), PaintApp, MinesApp, NotesApp, DefendrApp, FreeRamApp];
    for (const app of apps) this.wm.register(app);
    this.wm.register({
      id: 'settings',
      title: 'Settings',
      icon: 'settings',
      color: '#636366',
      color2: '#aeaeb2',
      w: 680,
      h: 600,
      dark: true,
      render: (win) => {
        win.body.append(h('div.app-scroll.dark', null, settingsPanel((look) => this.world.setMyLook(look))));
      },
    });
    this.wm.onTaskbar = () => this.drawDock();
    this.drawIcons();
    this.drawDock();
    bus.on('chat:changed', () => this.drawDock());
    bus.on('loot:changed', () => (this.drawIcons(), this.drawDock()));
    bus.on('net:dayStart', () => this.drawIcons());
    bus.on('apps:changed', () => (this.drawIcons(), this.drawDock()));
    if (kind === 'desk') {
      bus.on('os:open', (m: { id: string; arg?: any }) => this.visible && this.open(m.id, m.arg));
      bus.on('leads:changed', () => this.drawIncoming());
      bus.on('call:changed', () => this.drawIncoming());
      bus.on('job:changed', () => this.drawDock());
    }
  }

  private iconIds(): string[] {
    if (this.kind === 'laptop') return ['game', 'studio', 'settings'];
    const ids = ['phone', 'giftcards', 'creditcard', 'chat', 'shop', 'casino', 'folder'];
    if (game.has('ledger')) ids.push('ledger');
    if (game.has('customer')) ids.push('customer');
    if (game.has('remote')) ids.push('remote');
    if (crew.run?.unlocked.includes('scamazon')) ids.splice(ids.indexOf('casino'), 0, 'scamazon');
    return ids;
  }

  private badge(id: string) {
    if (id === 'giftcards') return game.giftCards.length;
    if (id === 'creditcard') return game.call?.job?.kind === 'card' && game.call.job.code && !game.call.job.done ? 1 : 0;
    if (id === 'remote') return game.remotes.length;
    if (id === 'chat') return chatUnread();
    if (id === 'phone') return game.leads.length && !game.call ? 1 : 0;
    return 0;
  }

  private drawIcons() {
    clear(this.icons);
    for (const id of this.iconIds()) {
      const a = this.wm.apps.get(id);
      if (!a) continue;
      const n = this.badge(id);
      const el = h(
        'button.desk-icon',
        {
          onclick: (e: Event) => {
            this.icons.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
            (e.currentTarget as HTMLElement).classList.add('sel');
            this.open(id);
          },
        },
        h('span.tile-wrap', null, appTile(a, 'lg'), n ? h('em.badge', null, String(n)) : null),
        h('span.label', null, a.title),
      );
      this.icons.append(el);
    }
  }

  open(id: string, arg?: any) {
    return this.wm.open(id, arg);
  }

  private drawDock() {
    clear(this.dock);
    const pinned = this.iconIds().filter((id) => id !== 'folder');
    const running = this.wm.windows.map((w) => w.app.id);
    const ids = [...new Set([...pinned, ...running])];
    for (const id of ids) {
      const a = this.wm.apps.get(id);
      if (!a) continue;
      const w = this.wm.get(id);
      const n = this.badge(id);
      this.dock.append(
        h(
          'button.dock-item',
          {
            'data-tip': a.title,
            onclick: () => {
              if (!w) this.open(id);
              else if (w.minimized || this.wm.focused !== w) w.restore();
              else w.minimize();
            },
          },
          appTile(a, 'md'),
          n ? h('em.badge', null, String(n)) : null,
          w ? h('i.run-dot') : null,
        ),
      );
    }
    this.dock.append(
      h('span.dock-sep'),
      h('button.dock-item.util', { 'data-tip': 'Look away (Esc)', onclick: () => this.onExit() }, h('span.app-tile.md.glass', { innerHTML: icon('logout') })),
    );
    this.updateAppName();
  }

  private updateAppName() {
    this.appName.textContent = this.wm.focused && !this.wm.focused.minimized ? this.wm.focused.app.title : this.kind === 'laptop' ? 'Manager' : 'BoilerRoom';
  }

  private drawIncoming() {
    const lead = game.leads[0];
    const show = this.visible && this.booted && !game.call && !!lead && game.shiftLive;
    if (!show) {
      this.incomingEl?.remove();
      this.incomingEl = null;
      return;
    }
    if (this.incomingEl?.dataset.id === lead.persona.id) return;
    this.incomingEl?.remove();
    const p = lead.persona;
    this.incomingEl = h(
      'div.incoming',
      { 'data-id': p.id },
      h('div.inc-glow', { innerHTML: portrait(p.look) }),
      h('div.inc-avatar', null, h('i.ring'), h('i.ring.r2'), h('div.inc-face', { innerHTML: portrait(p.look) })),
      h('div.inc-name', null, p.name),
      h('div.inc-sub', null, `Incoming call · ${p.location}`),
      h('div.inc-hook', null, p.hook),
      h(
        'div.inc-btns',
        null,
        h('div.inc-col', null, h('button.inc-btn.no', { title: 'Decline', onclick: () => game.decline(0), innerHTML: icon('phoneOff') }), h('span', null, 'Decline')),
        h(
          'div.inc-col',
          null,
          h('button.inc-btn.yes', {
            title: 'Accept',
            innerHTML: icon('phone'),
            onclick: () => {
              this.open('phone');
              game.answer(0);
            },
          }),
          h('span', null, 'Accept'),
        ),
      ),
    );
    this.el.append(this.incomingEl);
  }

  private toggleStart() {
    if (this.startMenu) return this.closeStart();
    sfx.click();
    const item = (ico: string, label: string, fn: () => void, danger = false) =>
      h('button.start-item', { class: danger ? 'danger' : '', onclick: () => (this.closeStart(), fn()) }, h('span.si-ico', { innerHTML: icon(ico) }), label);
    this.startMenu = h(
      'div.start-menu',
      { onpointerdown: (e: Event) => e.stopPropagation() },
      h('div.start-user', null, h('b', null, crew.self?.name || 'Employee'), h('small', null, crew.online ? `Crew ${crew.code}` : 'Solo shift')),
      item('settings', 'System Settings…', () => this.open('settings')),
      this.kind === 'desk' ? item('notes', 'Notes', () => this.open('notes')) : null,
      h('hr'),
      item('logout', 'Close the computer', () => this.onExit()),
      item('power', 'Quit to main menu', () => this.onQuit(), true),
    );
    this.el.append(this.startMenu);
  }
  private closeStart() {
    this.startMenu?.remove();
    this.startMenu = null;
  }

  update() {
    const run = crew.run;
    const me = crew.self;
    this.updateAppName();
    if (!run) return;
    const left = Math.max(0, SHIFT_MINUTES - run.clock);
    const realLeft = (left / SHIFT_MINUTES) * run.shiftSeconds;
    const mm = Math.floor(realLeft / 60);
    const ss = Math.floor(realLeft % 60);
    const pct = Math.min(100, (run.teamToday / Math.max(1, run.quota)) * 100);
    const live = run.phase === 'shift';
    const html = `
      <span class="mb-pill"><i class="dot g"></i>Wallet <b>${money(me?.personal || 0)}</b></span>
      <span class="mb-pill quota"><span>Quota</span><b>${money(run.teamToday)}</b><span class="muted">/ ${money(run.quota)}</span><span class="mini-bar"><i style="width:${pct}%"></i></span></span>
      <span class="mb-pill rv-pill ${live && realLeft < 20 ? 'urgent' : live && realLeft < 60 ? 'warn' : ''}">Review in <b>${live ? `${mm}:${String(ss).padStart(2, '0')}` : '--:--'}</b></span>`;
    if (this.stats.innerHTML !== html) this.stats.innerHTML = html;
    const out = clockOutState();
    this.outBtn.classList.toggle('show', out.can);
    this.outBtn.classList.toggle('on', out.mine);
    const ol = out.mine ? `Clocked out <b>${out.done}/${out.all}</b>` : 'Clock out';
    if (this.outBtn.innerHTML !== ol) this.outBtn.innerHTML = ol;
    const date = new Date(2026, 9, 4 + run.day);
    const ch = `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}&nbsp;&nbsp;${clockText(run.clock)}`;
    if (this.clockEl.innerHTML !== ch) this.clockEl.innerHTML = ch;
  }

  show(after?: () => void) {
    this.visible = true;
    this.el.classList.add('show');
    this.drawIcons();
    this.drawDock();
    if (!this.booted) {
      this.bootEl.style.display = '';
      sfx.boot();
      setTimeout(() => {
        this.booted = true;
        this.bootEl.classList.add('gone');
        setTimeout(() => (this.bootEl.style.display = 'none'), 500);
        if (!this.wm.windows.length) this.open(this.kind === 'laptop' ? 'game' : 'phone');
        this.drawIncoming();
        after?.();
      }, 1400);
    } else {
      this.drawIncoming();
      after?.();
    }
  }

  hide() {
    this.visible = false;
    this.el.classList.remove('show');
    this.closeStart();
    this.drawIncoming();
  }

  reset() {
    this.wm.closeAll();
    this.booted = false;
    this.bootEl.classList.remove('gone');
    this.bootEl.style.display = '';
  }
}

export function mascot() {
  return `<svg viewBox="0 0 120 120"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9f43"/><stop offset="1" stop-color="#ff3d5a"/></linearGradient></defs>
  <rect x="6" y="6" width="108" height="108" rx="30" fill="url(#bm)"/>
  <path d="M36 50c0-6 5-10 11-10h26c6 0 11 4 11 10v5H73v-5H47v5H36z" fill="#fff"/>
  <rect x="32" y="58" width="56" height="28" rx="9" fill="#fff"/>
  <rect x="42" y="65" width="15" height="7" rx="3" fill="#1d1d1f"/><rect x="63" y="65" width="15" height="7" rx="3" fill="#1d1d1f"/>
  <path d="M48 79q12 6 24 0" stroke="#1d1d1f" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`;
}
