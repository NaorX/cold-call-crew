import { h, clear, money } from '../../ui/dom';
import { jobSteps, progressPill, startHere } from './scams';
import { icon } from '../icons';
import { bus } from '../../game/bus';
import { game, type Call } from '../../game/game';
import { crew } from '../../game/net';
import { sfx } from '../../game/audio';
import type { AppDef } from '../wm';

export const RemoteDeskApp: AppDef = {
  id: 'remote',
  title: 'RemoteDesk',
  icon: 'remote',
  color: '#e0245e',
  color2: '#ff6b8a',
  w: 780,
  h: 560,
  evidence: true,
  render(win) {
    const root = h('div.remote');
    win.body.append(root);
    if (!crew.run?.unlocked.includes('remote')) {
      root.append(h('div.locked-app', null, h('span', { innerHTML: icon('lock') }), h('h2', null, 'Available from Day 3'), h('p', null, 'Remote "support" sessions open up later in the week.')));
      return;
    }
    let session: Call | null = null;
    let view: 'desktop' | 'bank' = 'desktop';
    const result = (el: HTMLElement, r: { ok: boolean; msg: string }) => {
      el.textContent = r.msg;
      el.className = `redeem-msg ${r.ok ? 'good' : 'bad'}`;
      if (!r.ok) sfx.error();
    };

    const connectView = () => {
      const codeIn = h('input.rd-code', { placeholder: '000 000', maxLength: 7, inputMode: 'numeric' }) as HTMLInputElement;
      codeIn.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') go();
      });
      const out = h('div.redeem-msg');
      const go = () => {
        const c = game.connectRemote(codeIn.value);
        if (!c) return result(out, { ok: false, msg: 'No session with that code. It must belong to the caller you are on the phone with.' });
        session = c;
        sfx.notify();
        draw();
      };
      const call = game.call;
      const steps = h(
        'div.rd-steps',
        null,
        h('div.gc-sec-head', null, h('b', null, 'RemoteDesk scheme'), call ? progressPill('remote', call) : ''),
        jobSteps('remote', call),
        call && call.job?.kind !== 'remote' ? startHere('remote', call) : '',
      );
      return h(
        'div.rd-split',
        null,
        steps,
        h(
        'div.rd-connect',
        null,
        h('div.rd-logo', null, h('span', { innerHTML: icon('remote') }), h('b', null, 'RemoteDesk')),
        h('p', null, 'Ask the caller to install RemoteDesk and read you the 6-digit code.'),
        h('div.rd-row', null, codeIn, h('button.redeem-btn', { onclick: go }, 'Connect')),
        out,
        game.remotes.length ? h('div.rd-codes', null, ...game.remotes.map((r) => h('button.rd-chip', { onclick: () => (codeIn.value = `${r.code.slice(0, 3)} ${r.code.slice(3)}`) }, `${r.from} · ${r.code.slice(0, 3)} ${r.code.slice(3)}`))) : '',
        ),
      );
    };

    const sessionView = (c: Call) => {
      const p = c.persona;
      const checking = Math.round(p.savings * 0.35);
      const savingsAcc = p.savings - checking;
      if (game.call !== c) return h('div.rd-connect', null, h('h3', null, 'Session closed'), h('p', null, 'The caller hung up.'), h('button.pill-btn', { onclick: () => ((session = null), draw()) }, 'Back'));
      const bar = h('div.rd-bar', null, h('i.live-dot'), `Connected to ${p.name.split(' ')[0]}'s PC`, h('span.spacer'), h('button.pill-btn.danger', { onclick: () => ((session = null), draw()) }, 'Disconnect'));
      let screen: HTMLElement;
      if (view === 'desktop') {
        const vi = (ico: string, label: string, fn?: () => void) => h('button.v-icon', { onclick: fn }, h('span.v-ico', { innerHTML: icon(ico) }), label);
        screen = h('div.victim-desktop', null, vi('wallet', 'MyBank Online', () => ((view = 'bank'), draw())), vi('folder', 'Grandkids'), vi('notes', 'passwords.txt'), vi('globe', 'Internet'), h('div.v-hint', null, 'Open MyBank Online'));
      } else {
        const refund = h('input', { type: 'number', value: 200, min: 1 }) as HTMLInputElement;
        const wire = h('input', { type: 'number', value: Math.min(500, p.savings), min: 1 }) as HTMLInputElement;
        for (const i of [refund, wire]) i.addEventListener('keydown', (e) => e.stopPropagation());
        const out = h('div.redeem-msg');
        const fake = c.fakeRefund;
        screen = h(
          'div.bank',
          null,
          h('div.bank-top', null, h('b', null, 'MyBank'), h('span', null, 'Online Banking'), h('span.spacer'), h('button.icon-btn', { innerHTML: icon('close'), onclick: () => ((view = 'desktop'), draw()) })),
          h(
            'div.bank-body',
            null,
            h('div.acc', null, h('span', null, 'Checking'), h('b', null, money(checking + (fake || 0)))),
            h('div.acc', null, h('span', null, 'Savings'), h('b', null, money(savingsAcc))),
            fake ? h('div.acc.refund', null, h('span', null, 'Pending refund'), h('b', null, `+${money(fake)}`)) : null,
            h('div.bank-sec', null, h('b', null, 'Inspect element'), h('p', null, 'Show a huge "accidental" refund, then beg them to send back the difference in gift cards.')),
            h('div.rd-row', null, refund, h('button.pill-btn', { onclick: () => (game.remoteFakeRefund(c, Math.max(1, Number(refund.value) * 10)), draw()) }, 'Fake a refund ×10')),
            h('div.bank-sec', null, h('b', null, 'Wire transfer'), h('p', null, 'Fast, but they are watching their screen. Needs very high trust.')),
            h('div.rd-row', null, wire, h('button.pill-btn.danger', { onclick: () => result(out, game.remoteWire(c, Number(wire.value))) }, 'Wire to "safe account"')),
            out,
          ),
        );
      }
      return h('div.rd-session', null, bar, h('div.victim-screen', null, screen, h('div.victim-cursor')));
    };

    const draw = () => {
      clear(root);
      root.append(session ? sessionView(session) : connectView());
    };
    draw();
    const offs = [bus.on('loot:changed', () => !session && draw()), bus.on('job:changed', () => !session && draw()), bus.on('call:changed', () => session && view === 'desktop' && draw())];
    const wiggle = setInterval(() => {
      const cur = root.querySelector<HTMLElement>('.victim-cursor');
      if (cur) {
        cur.style.left = `${20 + Math.random() * 60}%`;
        cur.style.top = `${20 + Math.random() * 60}%`;
      }
    }, 900);
    return () => {
      offs.forEach((o) => o());
      clearInterval(wiggle);
    };
  },
};
