import { h, clear, money, clockText } from '../../ui/dom';
import { icon } from '../icons';
import { appTile } from '../wm';
import { bus } from '../../game/bus';
import { game } from '../../game/game';
import { crew, send } from '../../game/net';
import { UPGRADES, settings, type UpgradeKey } from '../../game/settings';
import { askBoss } from '../../game/boss';
import { sfx } from '../../game/audio';
import { webcamTargets } from '../webcam';
import type { AppDef } from '../wm';
import type { World } from '../../engine/world';

export const LedgerApp: AppDef = {
  id: 'ledger',
  title: 'Ledger',
  icon: 'ledger',
  color: '#1f9d55',
  color2: '#63e6be',
  w: 640,
  h: 560,
  dark: true,
  render(win) {
    const root = h('div.app-pad.dark.ledger');
    win.body.append(root);
    const draw = () => {
      clear(root);
      const run = crew.run;
      const me = crew.self;
      const pct = run ? Math.min(100, (run.teamToday / Math.max(1, run.quota)) * 100) : 0;
      const chart = h('canvas.lg-chart', { width: 1200, height: 260 }) as HTMLCanvasElement;
      root.append(
        h('div.lg-hero', null, h('small', null, 'Earned by you today'), h('div.lg-big', null, money(me?.today || 0)), h('span.lg-sub', null, `Wallet ${money(me?.personal || 0)}`)),
        chart,
        h(
          'div.lg-cards',
          null,
          h('div.lg-card', null, h('small', null, 'Team quota'), h('b', null, `${Math.round(pct)}%`), h('div.mini-bar', null, h('i', { style: { width: `${pct}%` } })), h('span.muted', null, `${money(run?.teamToday || 0)} of ${money(run?.quota || 0)}`)),
          h('div.lg-card', null, h('small', null, 'Heat'), h('b', { class: (run?.heat || 0) > 60 ? 'bad' : '' }, `${Math.round(run?.heat || 0)}`), h('div.mini-bar.heat', null, h('i', { style: { width: `${run?.heat || 0}%` } })), h('span.muted', null, 'High heat brings the police')),
          h('div.lg-card', null, h('small', null, 'Calls · scams'), h('b', null, `${game.calls} · ${game.scams}`), h('span.muted', null, game.calls ? `${Math.round((game.scams / game.calls) * 100)}% close rate` : 'No calls yet')),
        ),
        h('div.sec-title', null, 'Transactions'),
        h(
          'div.tx-list',
          null,
          game.ledger.length
            ? game.ledger.map((e) =>
                h(
                  'div.tx',
                  null,
                  h('span.tx-ico', { class: e.amount >= 0 ? 'in' : 'out', innerHTML: icon(e.source === 'card' ? 'card' : e.source === 'remote' ? 'remote' : e.source === 'raid' ? 'siren' : 'gift') }),
                  h('div.tx-main', null, h('b', null, e.note), h('small', null, clockText(e.clock))),
                  h('b.tx-amt', { class: e.amount >= 0 ? 'good' : 'bad' }, `${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))}`),
                ),
              )
            : h('p.muted', null, 'Nothing yet. The phone is right there.'),
        ),
      );
      const ctx = chart.getContext('2d')!;
      const W = chart.width;
      const H = chart.height;
      const pts = [...game.ledger].reverse().reduce<{ x: number; y: number }[]>((acc, e) => {
        const prev = acc.length ? acc[acc.length - 1].y : 0;
        acc.push({ x: e.clock, y: prev + e.amount });
        return acc;
      }, [{ x: 0, y: 0 }]);
      pts.push({ x: run?.clock || 0, y: pts[pts.length - 1].y });
      const maxY = Math.max(run?.quota || 1, ...pts.map((p) => p.y)) * 1.1;
      const X = (m: number) => (m / 480) * (W - 40) + 20;
      const Y = (v: number) => H - 20 - (v / maxY) * (H - 40);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(20, Y(run?.quota || 0));
      ctx.lineTo(W - 20, Y(run?.quota || 0));
      ctx.stroke();
      ctx.setLineDash([]);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(48,209,88,0.35)');
      g.addColorStop(1, 'rgba(48,209,88,0)');
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.lineTo(X(pts[pts.length - 1].x), H - 20);
      ctx.lineTo(X(0), H - 20);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.strokeStyle = '#30d158';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '22px Inter Variable, Inter, sans-serif';
      ctx.fillText('QUOTA', 26, Y(run?.quota || 0) - 10);
    };
    draw();
    const offs = [bus.on('ledger:changed', draw), bus.on('net:state', draw)];
    return () => offs.forEach((o) => o());
  },
};

export const ShopApp: AppDef = {
  id: 'shop',
  title: 'Bargain Bin',
  icon: 'shop',
  color: '#0a64d8',
  color2: '#64d2ff',
  w: 820,
  h: 600,
  minW: 640,
  dark: true,
  render(win) {
    const root = h('div.store');
    win.body.append(root);
    let pending: UpgradeKey | null = null;
    let tab: 'all' | 'apps' | 'upgrades' = 'all';
    const COLORS: Record<string, [string, string]> = {
      ledger: ['#1f9d55', '#63e6be'],
      customer: ['#5e5ce6', '#8e8cf8'],
      remote: ['#e0245e', '#ff6b8a'],
      headset: ['#5e5ce6', '#9a98ff'],
      binder: ['#ff9f0a', '#ffd60a'],
      spoof: ['#32ade6', '#7fdbff'],
      vpn: ['#30b0c7', '#7ae3f0'],
      printer: ['#8e8e93', '#c7c7cc'],
      autodialer: ['#34c759', '#86efac'],
      coffee: ['#a2652a', '#d9a066'],
      antivirus: ['#ff375f', '#ff8fa3'],
    };
    const draw = () => {
      clear(root);
      const wallet = crew.self?.personal || 0;
      const items = UPGRADES.filter((u) => (tab === 'all' ? true : tab === 'apps' ? 'app' in u : !('app' in u)));
      root.append(
        h(
          'div.store-side',
          null,
          h('div.store-brand', null, h('b', null, 'Bargain'), h('span', null, 'Bin')),
          ...(
            [
              ['all', 'Discover', 'sparkles'],
              ['apps', 'Software', 'remote'],
              ['upgrades', 'Upgrades', 'zap'],
            ] as const
          ).map(([k, label, ico]) => h('button.store-nav', { class: tab === k ? 'on' : '', onclick: () => ((tab = k), draw()) }, h('span', { innerHTML: icon(ico) }), label)),
          h('div.store-wallet', null, h('small', null, 'Wallet'), h('b', null, money(wallet))),
        ),
        h(
          'div.store-main',
          null,
          h('div.store-hero', null, h('small', null, 'THIS WEEK'), h('h2', null, 'Tools of the trade'), h('p', null, 'Apps unlock new schemes. Upgrades make every call a little easier. Paid from your own wallet, never the team quota.')),
          h(
            'div.store-grid',
            null,
            items.map((u) => {
              const owned = !('consumable' in u) && game.has(u.key);
              const count = u.key === 'coffee' ? game.coffee : 0;
              const dayLock = 'day' in u && (crew.run?.day || 1) < u.day ? u.day : 0;
              const [c1, c2] = COLORS[u.key] || ['#636366', '#aeaeb2'];
              const can = !owned && !dayLock && wallet >= u.price && pending === null;
              return h(
                'div.store-item',
                null,
                appTile({ color: c1, color2: c2, icon: u.icon }, 'lg'),
                h('div.si-text', null, h('b', null, u.name), h('small', null, 'app' in u ? 'App' : 'consumable' in u ? 'Consumable' : 'Upgrade'), h('p', null, u.desc)),
                h(
                  'button.get-btn',
                  {
                    class: owned ? 'owned' : can ? '' : 'disabled',
                    disabled: !can,
                    onclick: () => {
                      pending = u.key;
                      send({ t: 'spend', amount: u.price, item: u.key });
                      draw();
                    },
                  },
                  owned ? ('app' in u ? 'Installed' : 'Owned') : dayLock ? `Day ${dayLock}` : pending === u.key ? '…' : `${money(u.price)}${count ? ` · ${count} left` : ''}`,
                ),
              );
            }),
          ),
        ),
      );
    };
    draw();
    const offs = [
      bus.on('net:spent', (m: any) => {
        if (String(m.item).startsWith('sz:')) return;
        if (m.item === 'coffee') game.coffee++;
        else game.upgrades.add(m.item);
        bus.emit('apps:changed');
        pending = null;
        sfx.levelUp();
        bus.emit('toast', { text: `Purchased ${UPGRADES.find((u) => u.key === m.item)?.name}`, kind: 'good' });
        draw();
      }),
      bus.on('net:state', () => {
        pending = null;
        draw();
      }),
    ];
    return () => offs.forEach((o) => o());
  },
};

interface ChatMsg {
  from: string;
  text: string;
  system?: boolean;
  boss?: boolean;
  at: number;
  channel: string;
  context?: string;
}
let bossTyping = false;
let bossUnread = 0;
const QUICK_EN = ["I'm stuck. What do I say next?", "They don't trust me.", 'How do I get the gift card?', 'Is this caller legit?'];

export async function messageBoss(text: string) {
  const call = game.call && game.call.state === 'active' ? game.call : null;
  chatLog.push({
    from: crew.self?.name || 'You',
    text,
    at: Date.now(),
    channel: 'boss',
    context: call ? `${call.persona.name} · trust ${Math.round(call.trust)}%` : undefined,
  });
  bossTyping = true;
  bus.emit('chat:changed');
  const [r] = await Promise.all([askBoss(text), new Promise((ok) => setTimeout(ok, 900))]);
  bossTyping = false;
  chatLog.push({ from: 'The Boss', text: r.reply, boss: true, at: Date.now(), channel: 'boss' });
  bossUnread++;
  unread++;
  sfx.notify();
  bus.emit('chat:changed');
  if (!document.querySelector('.win[data-app="chat"].focused')) bus.emit('toast', { text: `The Boss: ${r.reply.slice(0, 90)}${r.reply.length > 90 ? '…' : ''}`, kind: 'boss' });
}
export const chatLog: ChatMsg[] = [];
let unread = 0;
export const chatUnread = () => unread;
bus.on('net:chat', (m: any) => {
  chatLog.push({ from: m.from, text: m.text, system: m.system, at: m.at, channel: 'general' });
  if (!m.system) unread++;
  bus.emit('chat:changed');
});
bus.on('net:boss', (m: any) => {
  chatLog.push({ from: 'The Boss', text: m.text, boss: true, at: m.at, channel: 'announcements' });
  unread++;
  bus.emit('chat:changed');
});
const BOT_LINES = [
  ['Gary', 'anyone got the IRS script? mine has coffee on it'],
  ['Priya', 'my lady just read me her whole meatloaf recipe'],
  ['Big Tony', 'closed a $900 steam card. who wants to touch the hand'],
  ['Gary', 'my guy asked for my badge number so I said "seven"'],
  ['Priya', 'never call the retired detectives. NEVER.'],
  ['Big Tony', 'boss is walking around again, look busy'],
  ['Dmitri', 'is it normal that my caller is singing'],
];
setInterval(() => {
  if (crew.run?.phase !== 'shift' || Math.random() > 0.25) return;
  const [from, text] = BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)];
  chatLog.push({ from, text, at: Date.now(), channel: 'general' });
  unread++;
  bus.emit('chat:changed');
}, 30_000);

const AV_COLORS = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#3ba55c', '#faa61a', '#00b0f4'];
const avColor = (name: string) => AV_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];

export const ChatApp: AppDef = {
  id: 'chat',
  title: 'Chatter',
  icon: 'discord',
  color: '#5865f2',
  color2: '#8891f7',
  w: 900,
  h: 580,
  minW: 640,
  dark: true,
  render(win, arg) {
    unread = 0;
    bus.emit('chat:changed');
    let channel = 'general';
    const list = h('div.dc-messages');
    const input = h('input.dc-input', { maxLength: 300, dir: 'auto' }) as HTMLInputElement;
    const channels = h('div.dc-channels');
    const header = h('div.dc-header');
    const members = h('div.dc-members');
    const quick = h('div.dc-quick');
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && input.value.trim()) {
        if (channel === 'general') send({ t: 'chat', text: input.value.trim() });
        else if (channel === 'boss') void messageBoss(input.value.trim());
        else bus.emit('toast', { text: 'Only the boss can post announcements.', kind: 'bad' });
        input.value = '';
      }
    });
    const besidePhone = () => {
      const phone = document.querySelector<HTMLElement>('.win[data-app="phone"]');
      const area = win.el.parentElement?.getBoundingClientRect();
      if (!phone || !area) return;
      const p = phone.getBoundingClientRect();
      const w = win.el.offsetWidth;
      const right = p.right - area.left + 14;
      const left = p.left - area.left - w - 14;
      if (right + w <= area.width - 8) win.el.style.left = `${right}px`;
      else if (left >= 8) win.el.style.left = `${left}px`;
      else {
        const room = area.width - p.width - 16 - 14 - 8;
        if (room < 520) return;
        phone.style.left = '16px';
        win.el.style.width = `${Math.min(w, room)}px`;
        win.el.style.left = `${16 + p.width + 14}px`;
      }
      win.el.style.top = `${Math.max(8, p.top - area.top)}px`;
    };
    const openArg = (a: unknown) => {
      if (a !== 'ask' && a !== 'boss') return;
      channel = 'boss';
      requestAnimationFrame(besidePhone);
      draw();
      if (a === 'ask' && !bossTyping) void messageBoss(QUICK_EN[0]);
      input.focus();
    };
    win.el.addEventListener('app-arg', (e) => openArg((e as CustomEvent).detail));
    const rail = h('div.dc-rail');
    const sideHead = h('div.dc-guild');
    win.body.append(
      h(
        'div.dc',
        null,
        rail,
        h('div.dc-side', null, sideHead, channels, h('div.dc-me', null, h('span.dc-av', { style: { background: avColor(crew.self?.name || 'Me') } }, (crew.self?.name || 'M')[0]), h('div', null, h('b', null, crew.self?.name || 'You'), h('small', null, 'On shift')), h('span.dc-me-ico', { innerHTML: icon('mic') }), h('span.dc-me-ico', { innerHTML: icon('headset') }))),
        h('div.dc-main', null, header, list, quick, h('div.dc-compose', null, h('span.dc-plus', { innerHTML: icon('plus') }), input)),
        members,
      ),
    );
    let lastServerChannel = 'general';
    const go = (to: string) => {
      if (to !== 'boss') lastServerChannel = to;
      channel = to;
      draw();
    };
    const draw = () => {
      const dm = channel === 'boss';
      clear(rail);
      const railItem = (on: boolean, el: HTMLElement, title: string, fn: () => void, badge = 0) =>
        h('div.dc-rail-item', { class: on ? 'on' : '', title }, h('i.dc-pill'), h('button.dc-rail-btn', { onclick: fn }, el), badge ? h('em.dc-badge.rail', null, String(badge)) : '');
      rail.append(
        railItem(dm, h('span.dc-server.home', { innerHTML: icon('chat') }), 'Direct Messages', () => go('boss')),
        railItem(dm, h('span.dc-server.dmav', { style: { background: '#ed4245' } }, 'B'), 'The Boss', () => go('boss'), !dm ? bossUnread : 0),
        h('i.dc-sep'),
        railItem(!dm, h('span.dc-server.guild', { innerHTML: icon('phone') }), 'Floor 3', () => go(lastServerChannel)),
        h('div.dc-rail-item', null, h('button.dc-rail-btn', null, h('span.dc-server.add', { innerHTML: icon('plus') }))),
      );
      clear(sideHead);
      clear(channels);
      if (dm) {
        sideHead.className = 'dc-guild dm';
        sideHead.append(h('div.dc-find', null, 'Find or start a conversation'));
        channels.append(
          h('div.dc-chan.friends', null, h('span', { innerHTML: icon('users') }), 'Friends'),
          h('small.dc-cat', null, 'DIRECT MESSAGES'),
          h('button.dc-chan.dm.on', null, h('span.dc-av.sm', { style: { background: '#ed4245' } }, 'B', h('i.dc-status')), h('div.dc-dm-name', null, h('b', null, 'The Boss'), h('small', null, 'Watching the floor'))),
        );
      } else {
        sideHead.className = 'dc-guild';
        sideHead.append(h('b', null, 'Floor 3'), h('span', { innerHTML: icon('down') }));
        channels.append(h('small.dc-cat', null, 'TEXT CHANNELS'));
        for (const [id, label] of [
          ['general', 'general'],
          ['announcements', 'boss-announcements'],
        ])
          channels.append(h('button.dc-chan', { class: channel === id ? 'on' : '', onclick: () => go(id) }, h('span', { innerHTML: icon(id === 'general' ? 'hash' : 'megaphone') }), label));
        channels.append(h('small.dc-cat', null, 'VOICE CHANNELS'), h('div.dc-chan.voice', null, h('span', { innerHTML: icon('speaker') }), 'Floor 3 Lounge'), ...crew.players.map((p) => h('div.dc-voice-user', null, h('span.dc-av.sm', { style: { background: avColor(p.name) } }, p.name[0]), p.name)));
      }
      clear(header);
      if (dm) bossUnread = 0;
      const live = game.call && game.call.state === 'active' ? game.call : null;
      if (dm)
        header.append(
          h('span.dc-av.sm', { style: { background: '#ed4245' } }, 'B'),
          h('b', null, 'The Boss'),
          h('i.dc-hsep'),
          h('small', null, live ? `Knows more about ${live.persona.name.split(' ')[0]} than you do. Ask.` : 'Ask him anything. He answers fast when you are on a call.'),
        );
      else header.append(h('span', { innerHTML: icon(channel === 'general' ? 'hash' : 'megaphone') }), h('b', null, channel === 'general' ? 'general' : 'boss-announcements'), h('i.dc-hsep'), h('small', null, channel === 'general' ? 'Talk shop. Do not talk to the cops.' : 'Read these. The boss checks.'));
      input.placeholder = dm ? 'Message @The Boss' : `Message #${channel === 'general' ? 'general' : 'boss-announcements'}`;
      clear(quick);
      quick.classList.toggle('show', dm);
      if (dm)
        for (const q of QUICK_EN)
          quick.append(h('button.dc-chip', { dir: 'auto', disabled: bossTyping, onclick: () => void messageBoss(q) }, q));
      clear(list);
      const msgs = chatLog.filter((m) => m.channel === channel).slice(-120);
      if (!msgs.length && dm)
        list.append(
          h('div.dc-welcome', null, h('span.dc-av.xl', { style: { background: '#ed4245' } }, 'B'), h('h3', null, 'The Boss'), h('p', null, 'Stuck on a call? Message him. He can see who you are talking to and tells you exactly what to say next. His tip also shows up on your phone.')),
        );
      else if (!msgs.length) list.append(h('div.dc-welcome', null, h('div.dc-welcome-ico', { innerHTML: icon('hash') }), h('h3', null, `Welcome to #${channel === 'general' ? 'general' : 'boss-announcements'}!`), h('p', null, 'This is the start of the channel.')));
      let prev: ChatMsg | null = null;
      for (const m of msgs) {
        const grouped = prev && prev.from === m.from && m.at - prev.at < 5 * 60_000;
        const time = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (m.system) list.append(h('div.dc-sys', null, h('span', { innerHTML: icon('arrowRight') }), m.text, h('small', null, time)));
        else if (grouped) list.append(h('div.dc-msg.grouped', null, h('div.dc-text', { dir: 'auto' }, m.text)));
        else
          list.append(
            h(
              'div.dc-msg',
              { class: m.boss ? 'boss' : '' },
              h('span.dc-av', { style: { background: m.boss ? '#ed4245' : avColor(m.from) } }, m.from[0]),
              h(
                'div',
                null,
                h('div.dc-meta', null, h('b', { style: { color: m.boss ? '#ff7b7b' : '#f2f3f5' } }, m.from), m.boss ? h('span.dc-tag', null, 'BOSS') : null, h('small', null, `Today at ${time}`)),
                h('div.dc-text', { dir: 'auto' }, m.text),
                m.context ? h('div.dc-context', null, h('span', { innerHTML: icon('phone') }), m.context) : null,
              ),
            ),
          );
        prev = m;
      }
      if (dm && bossTyping) list.append(h('div.dc-typing', null, h('span.dots', null, h('i'), h('i'), h('i')), h('b', null, 'The Boss'), ' is typing…'));
      list.scrollTop = list.scrollHeight;
      clear(members);
      members.classList.toggle('profile', dm);
      if (dm) {
        members.append(
          h('div.dc-banner'),
          h('span.dc-av.xl.ring', { style: { background: '#ed4245' } }, 'B', h('i.dc-status')),
          h('div.dc-prof', null, h('b', null, 'The Boss'), h('small', null, 'theboss · Regional Manager')),
          h('div.dc-prof-card', null, h('small', null, 'ABOUT ME'), h('p', null, 'I see every call on this floor. Message me when you are stuck. Make quota.')),
          h('div.dc-prof-card', null, h('small', null, 'MEMBER SINCE'), h('p', null, 'Before you were born')),
          h('div.dc-prof-card', null, h('small', null, 'MUTUAL SERVERS'), h('p', null, 'Floor 3')),
        );
        unread = 0;
        return;
      }
      members.append(h('small.dc-cat', null, `ON SHIFT — ${crew.players.length + 1}`));
      members.append(h('div.dc-member', null, h('span.dc-av', { style: { background: '#ed4245' } }, 'B'), h('div', null, h('b', { style: { color: '#ff7b7b' } }, 'The Boss'), h('small', null, 'Watching you'))));
      for (const p of crew.players) members.append(h('div.dc-member', null, h('span.dc-av', { style: { background: avColor(p.name) } }, p.name[0], h('i.dc-status', { class: p.onCall ? 'busy' : '' })), h('div', null, h('b', null, p.name), h('small', null, p.onCall ? `On a call with ${p.onCall}` : 'Available'))));
      unread = 0;
    };
    draw();
    openArg(arg);
    const offs = [bus.on('chat:changed', () => win.el.isConnected && draw()), bus.on('call:changed', () => win.el.isConnected && channel === 'boss' && draw())];
    return () => offs.forEach((o) => o());
  },
};

export function CameraApp(_world: World): AppDef {
  return {
    id: 'camera',
    title: 'Camera',
    icon: 'camera',
    color: '#ff3b30',
    color2: '#ff7a6e',
    w: 560,
    h: 470,
    dark: true,
    render(win) {
      const c = h('canvas.webcam', { width: 640, height: 480 }) as HTMLCanvasElement;
      const flash = h('div.cam-flash');
      win.body.append(
        h(
          'div.camera',
          null,
          c,
          flash,
          h('div.cam-rec', null, h('i'), 'LIVE'),
          h(
            'div.cam-bar',
            null,
            h('button.shutter', {
              title: 'Take photo',
              onclick: () => {
                flash.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 400 });
                sfx.click();
                const a = document.createElement('a');
                a.download = 'boilerroom-selfie.png';
                a.href = c.toDataURL('image/png');
                a.click();
              },
            }),
          ),
        ),
      );
      webcamTargets.add(c);
      return () => webcamTargets.delete(c);
    },
  };
}
