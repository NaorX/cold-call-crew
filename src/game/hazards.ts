import { h } from '../ui/dom';
import { bus } from './bus';
import { game } from './game';
import { crew } from './net';
import { sfx, startSiren, stopSiren } from './audio';
import type { OSShell } from '../os/desktop';
import type { World } from '../engine/world';

const ADS = [
  ['🎉 YOU WON!', 'You are the 1,000,000th visitor! Click to claim your free iPhone 47.'],
  ['⚠️ WARNING', 'Your PC has 2,341 viruses. Call 1-800-NOT-A-SCAM now.'],
  ['💊 DOCTORS HATE HIM', 'Local scammer makes $9,000/day with this one weird trick.'],
  ['💘 HOT SINGLES', 'There are 3 hot singles in your cubicle. Click to meet them.'],
  ['🐹 HAMSTER FARM', 'Invest in Hamster Coin before it goes to the moon!!'],
  ['🔧 DRIVER UPDATE', 'Your mouse driver is 400 years out of date.'],
  ['🍔 FREE BURGER', 'Answer 3 questions and win a lifetime of burgers.'],
];

export class Hazards {
  private raidEl: HTMLElement | null = null;
  private raidTimer = 0;
  private popups: HTMLElement[] = [];
  private popupTimer = 0;
  private questionEl: HTMLElement | null = null;
  private outageEl: HTMLElement | null = null;
  onOutage: () => void = () => {};

  constructor(private os: OSShell, private world: World, private ui: HTMLElement) {
    bus.on('net:event', (m: any) => {
      if (m.kind === 'raid') this.raid(m.seconds);
      if (m.kind === 'outage') this.outage();
    });
    bus.on('virus:start', () => this.virus());
    bus.on('virus:clean', () => this.cleanVirus());
    bus.on('net:review', () => this.clearAll());
    bus.on('net:dayStart', () => this.clearAll());
  }

  clearAll() {
    this.endRaidVisuals();
    this.cleanVirus();
    this.fixPower(true);
    this.questionEl?.remove();
    this.questionEl = null;
  }

  raid(seconds: number) {
    if (game.raid) return;
    const total = seconds + (game.has('vpn') ? 6 : 0);
    const endsAt = performance.now() + total * 1000;
    game.raid = { endsAt };
    game.updateRinging();
    startSiren();
    this.world.raid = 1;
    this.world.drawMyScreen('raid');
    const timer = h('b.raid-count');
    const checks = h('div.raid-checks');
    this.raidEl = h(
      'div.raid',
      null,
      h('div.raid-title', null, '🚨 POLICE RAID 🚨'),
      h('div.raid-sub', null, 'Hang up and close the evidence: Gift Cards, Card Terminal, RemoteDesk'),
      timer,
      checks,
      h(
        'button.btn.danger.big',
        {
          onclick: () => {
            if (game.call) game.endCall('Raid! You slammed the phone down');
            this.os.wm.closeAll((w) => !!w.app.evidence);
            game.giftCards = [];
            game.cards = [];
            game.remotes = [];
            bus.emit('loot:changed');
          },
        },
        'PANIC WIPE (lose unredeemed loot)',
      ),
    );
    this.ui.append(this.raidEl);
    const tick = () => {
      const left = Math.max(0, (endsAt - performance.now()) / 1000);
      timer.textContent = left.toFixed(1);
      const onCall = !!game.call;
      const evidence = this.os.wm.evidenceOpen();
      checks.innerHTML = `<div class="${onCall ? 'bad' : 'good'}">${onCall ? '✗' : '✓'} Phone hung up</div><div class="${evidence.length ? 'bad' : 'good'}">${evidence.length ? '✗' : '✓'} Evidence closed${evidence.length ? ` (${evidence.map((w) => w.app.title).join(', ')})` : ''}</div>`;
      if (left <= 0) this.resolveRaid(!onCall && !evidence.length);
    };
    tick();
    this.raidTimer = window.setInterval(tick, 100);
  }

  private resolveRaid(clean: boolean) {
    clearInterval(this.raidTimer);
    this.endRaidVisuals();
    if (clean) {
      bus.emit('toast', { text: 'The cops looked around, found nothing, and left. Smooth.', kind: 'good' });
      sfx.notify();
      return;
    }
    const today = crew.self?.today || 0;
    const fine = Math.max(100, Math.round(Math.max(0, today) * 0.5));
    game.earn(-fine, 'raid', 'Seized by police');
    game.giftCards = [];
    game.cards = [];
    game.remotes = [];
    if (game.call) game.endCall('Police took your headset');
    this.os.wm.closeAll((w) => !!w.app.evidence);
    bus.emit('loot:changed');
    sfx.error();
    game.questionedUntil = performance.now() + 20_000;
    this.questionEl = h('div.questioned', null, h('div.q-card', null, h('h2', null, '👮 You are being questioned'), h('p', null, `They seized ${'$'}${fine.toLocaleString()} and all your unredeemed loot.`), h('p.q-count', null, '20')));
    this.ui.append(this.questionEl);
    const el = this.questionEl;
    const t = setInterval(() => {
      const left = Math.ceil((game.questionedUntil - performance.now()) / 1000);
      const c = el.querySelector('.q-count');
      if (c) c.textContent = `Back to work in ${Math.max(0, left)}s`;
      if (left <= 0) {
        clearInterval(t);
        el.remove();
        if (this.questionEl === el) this.questionEl = null;
      }
    }, 250);
  }

  private endRaidVisuals() {
    clearInterval(this.raidTimer);
    stopSiren();
    this.raidEl?.remove();
    this.raidEl = null;
    game.raid = null;
    this.world.raid = 0;
    this.world.drawMyScreen(this.os.booted ? 'desktop' : 'boot');
    game.updateRinging();
  }

  virus() {
    if (game.virus) return;
    game.virus = true;
    bus.emit('virus:changed');
    bus.emit('toast', { text: 'Uh oh. Something installed itself. Run DefendR (Fun Random Apps).', kind: 'bad' });
    const spawn = () => {
      if (!game.virus) return;
      if (this.popups.length < 14) this.popup();
      this.popupTimer = window.setTimeout(spawn, 2500 + Math.random() * 3000);
    };
    spawn();
  }

  private popup() {
    const [title, text] = ADS[Math.floor(Math.random() * ADS.length)];
    const area = this.os.area.getBoundingClientRect();
    let dodges = Math.random() < 0.35 ? 2 : 0;
    const close = h('button.pop-x', null, '✕');
    const el = h('div.popup', { style: { left: `${Math.random() * Math.max(10, area.width - 300)}px`, top: `${Math.random() * Math.max(10, area.height - 180)}px`, zIndex: '99999' } }, h('div.pop-bar', null, h('b', null, title), close), h('div.pop-body', null, text, h('button.btn.small', { onclick: () => this.popup() }, 'CLAIM NOW')));
    close.addEventListener('pointerenter', () => {
      if (dodges-- > 0) {
        el.style.left = `${Math.random() * Math.max(10, area.width - 300)}px`;
        el.style.top = `${Math.random() * Math.max(10, area.height - 180)}px`;
      }
    });
    close.addEventListener('click', () => {
      el.remove();
      this.popups = this.popups.filter((p) => p !== el);
      sfx.close();
    });
    this.os.area.append(el);
    this.popups.push(el);
    sfx.error();
  }

  cleanVirus() {
    clearTimeout(this.popupTimer);
    this.popups.forEach((p) => p.remove());
    this.popups = [];
    if (game.virus) {
      game.virus = false;
      bus.emit('virus:changed');
      bus.emit('toast', { text: 'DefendR removed Trojan.PopUpZilla.', kind: 'good' });
    }
  }

  outage() {
    if (game.outage) return;
    game.outage = true;
    if (game.call) game.endCall('The line went dead (power outage)', false);
    this.world.outage = true;
    this.world.drawMyScreen('off');
    sfx.powerDown();
    this.outageEl = h('div.no-signal', null, h('b', null, 'NO SIGNAL'), h('small', null, 'Power is out. Flip the breaker on the right wall.'));
    this.os.el.append(this.outageEl);
    bus.emit('toast', { text: 'Power outage! Find the breaker box on the right wall (look right).', kind: 'bad' });
    game.updateRinging();
    this.onOutage();
  }

  fixPower(silent = false) {
    if (!game.outage) return;
    game.outage = false;
    this.world.outage = false;
    this.world.drawMyScreen(this.os.booted ? 'desktop' : 'boot');
    this.outageEl?.remove();
    this.outageEl = null;
    if (!silent) {
      sfx.boot();
      bus.emit('toast', { text: 'Power restored. Back to dialing.', kind: 'good' });
    }
    bus.emit('leads:changed');
  }

  tick(dt: number) {
    if (this.os.visible && crew.run?.phase === 'shift' && (crew.run?.day || 1) >= 2 && !game.virus && Math.random() < dt / 420) this.virus();
  }
}
