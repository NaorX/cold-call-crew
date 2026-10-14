import { h, clear, money } from '../../ui/dom';
import { icon } from '../icons';
import { bus } from '../../game/bus';
import { crew, send } from '../../game/net';
import { sfx } from '../../game/audio';
import { game } from '../../game/game';
import type { AppDef } from '../wm';

interface Item {
  key: string;
  name: string;
  blurb: string;
  price: number;
  icon: string;
  tint: string;
  delivery: number;
  rating: number;
  reviews: number;
  cat: 'Pranks' | 'Boosts';
  day?: number;
  target?: boolean;
}

export const SZ_ITEMS: Item[] = [
  { key: 'horn', name: 'Air Horn 9000', blurb: 'Deafens the whole floor for one glorious second.', price: 60, icon: 'megaphone', tint: '#ff9f0a', delivery: 10, rating: 4.8, reviews: 2311, cat: 'Pranks' },
  { key: 'confetti', name: 'Confetti Cannon', blurb: 'Celebrate a big score on every screen in the office.', price: 90, icon: 'sparkles', tint: '#bf5af2', delivery: 12, rating: 4.9, reviews: 874, cat: 'Pranks' },
  { key: 'stink', name: 'Stink Bomb, Office Edition', blurb: 'A green haze over the floor. Blame the intern.', price: 120, icon: 'smoke', tint: '#7cb342', delivery: 15, rating: 4.6, reviews: 640, cat: 'Pranks' },
  { key: 'siren', name: 'Fake Police Siren', blurb: 'Three seconds of pure panic. Then everyone hates you.', price: 220, icon: 'siren', tint: '#ff453a', delivery: 18, rating: 4.7, reviews: 1033, cat: 'Pranks', day: 3 },
  { key: 'airstrike', name: 'Desk Airstrike', blurb: "Pick a coworker. Their desk goes boom. Nobody gets hurt (their pride does).", price: 300, icon: 'rocket', tint: '#0a84ff', delivery: 20, rating: 5.0, reviews: 99, cat: 'Pranks', day: 3, target: true },
  { key: 'energy', name: 'BULL Energy, 4-Pack', blurb: 'Your next 2 callers start with +10 trust.', price: 150, icon: 'zap', tint: '#30d158', delivery: 15, rating: 4.4, reviews: 5120, cat: 'Boosts' },
];

interface Order {
  id: number;
  item: Item;
  target: string | null;
  targetName: string | null;
  placed: number;
  due: number;
  done: boolean;
}
const orders: Order[] = [];
let orderSeq = 0;
function deliver(o: Order) {
  o.done = true;
  if (o.item.key === 'energy') {
    game.energy += 2;
    bus.emit('toast', { text: 'Scamazon: BULL Energy delivered. Your next 2 callers start with +10 trust.', kind: 'good' });
  } else send({ t: 'prank', kind: o.item.key, target: o.target });
  sfx.notify();
  bus.emit('scamazon:changed');
}

const stars = (r: number) => h('span.sz-stars', { style: { '--r': `${(r / 5) * 100}%` } }, '★★★★★');

export const ScamazonApp: AppDef = {
  id: 'scamazon',
  title: 'Scamazon',
  icon: 'package',
  color: '#232f3e',
  color2: '#37475a',
  w: 880,
  h: 620,
  minW: 640,
  minH: 480,
  render(win) {
    let cat: 'All' | Item['cat'] = 'All';
    let picking: Item | null = null;
    let msg = '';
    const root = h('div.sz');
    win.body.append(root);
    const wallet = () => crew.self?.personal ?? 0;
    const day = () => crew.run?.day ?? 1;
    const coworkers = () => crew.players.filter((p) => p.id !== crew.me);

    const buy = (it: Item, target: { id: string; name: string } | null = null) => {
      msg = '';
      if (crew.run?.phase !== 'shift') msg = 'Scamazon only delivers during the shift.';
      else if (wallet() < it.price) msg = `You need ${money(it.price)} in your wallet for that.`;
      else if (it.target && !target) {
        picking = it;
        return draw();
      }
      if (msg) {
        sfx.error();
        return draw();
      }
      send({ t: 'spend', amount: it.price, item: `sz:${it.key}` });
      const now = Date.now();
      const o: Order = { id: ++orderSeq, item: it, target: target?.id ?? null, targetName: target?.name ?? null, placed: now, due: now + it.delivery * 1000, done: false };
      orders.unshift(o);
      orders.length = Math.min(orders.length, 8);
      setTimeout(() => deliver(o), it.delivery * 1000);
      picking = null;
      sfx.cash();
      draw();
    };

    const card = (it: Item) => {
      const locked = (it.day ?? 0) > day();
      return h(
        'div.sz-card',
        { class: locked ? 'locked' : '' },
        h('div.sz-img', { style: { '--t': it.tint } }, h('span', { innerHTML: icon(it.icon) })),
        h('div.sz-name', null, it.name),
        h('div.sz-rate', null, stars(it.rating), h('small', null, it.reviews.toLocaleString('en-US'))),
        h('div.sz-price', null, h('sup', null, '$'), String(it.price)),
        h('div.sz-ship', null, h('b', null, 'Scam Prime'), ` · arrives in ${it.delivery}s`),
        h('p.sz-blurb', null, it.blurb),
        locked
          ? h('button.sz-buy', { disabled: true }, `Available day ${it.day}`)
          : h('button.sz-buy', { onclick: () => buy(it) }, it.target ? 'Choose a desk' : 'Buy now'),
      );
    };

    const orderRow = (o: Order) => {
      const p = o.done ? 1 : Math.min(1, (Date.now() - o.placed) / (o.due - o.placed));
      const stage = o.done ? 'Delivered' : p < 0.25 ? 'Ordered' : p < 0.85 ? 'Out for delivery' : 'Arriving now';
      return h(
        'div.sz-order',
        { class: o.done ? 'done' : '' },
        h('span.sz-oi', { style: { '--t': o.item.tint }, innerHTML: icon(o.item.icon) }),
        h('div.sz-ot', null, h('b', null, o.item.name), h('small', null, o.targetName ? `${stage} · to ${o.targetName}'s desk` : stage), h('div.sz-bar', null, h('i', { style: { width: `${p * 100}%` } }))),
        h('span.sz-eta', null, o.done ? '' : `${Math.max(0, Math.ceil((o.due - Date.now()) / 1000))}s`),
      );
    };

    const draw = () => {
      clear(root);
      root.append(
        h(
          'div.sz-top',
          null,
          h('div.sz-logo', null, h('b', null, 'scamazon'), h('i')),
          h('div.sz-search', null, h('span', { innerHTML: icon('eye') }), 'Search Scamazon'),
          h('div.sz-acct', null, h('small', null, 'Wallet'), h('b', null, money(wallet()))),
        ),
        h('div.sz-cats', null, ...(['All', 'Pranks', 'Boosts'] as const).map((c) => h('button', { class: c === cat ? 'on' : '', onclick: () => ((cat = c), draw()) }, c))),
      );
      const body = h('div.sz-body');
      const grid = h('div.sz-grid', null, ...SZ_ITEMS.filter((it) => cat === 'All' || it.cat === cat).map(card));
      const side = h(
        'div.sz-side',
        null,
        h('div.sz-side-head', null, 'Your orders'),
        orders.length ? h('div.sz-orders', null, ...orders.map(orderRow)) : h('p.sz-empty', null, 'Nothing on the way. Treat yourself (and annoy everyone).'),
        msg ? h('div.sz-msg', null, msg) : '',
      );
      body.append(grid, side);
      root.append(body);
      if (picking) {
        const it = picking;
        const list = coworkers();
        root.append(
          h(
            'div.sz-modal',
            { onclick: (e: Event) => e.target === e.currentTarget && ((picking = null), draw()) },
            h(
              'div.sz-pick',
              null,
              h('b', null, `${it.name}: whose desk?`),
              list.length
                ? h('div.sz-people', null, ...list.map((p) => h('button.sz-person', { onclick: () => buy(it, { id: p.id, name: p.name }) }, h('span.sz-av', null, p.name[0]), p.name, h('small', null, p.onCall ? 'on a call' : 'at their desk'))))
                : h('p.sz-empty', null, 'Nobody else is on the floor. Airstrikes need a coworker.'),
              h('button.sz-cancel', { onclick: () => ((picking = null), draw()) }, 'Cancel'),
            ),
          ),
        );
      }
    };
    draw();
    const tick = setInterval(() => orders.some((o) => !o.done) && root.isConnected && draw(), 1000);
    const offs = [bus.on('net:state', () => root.isConnected && !picking && draw()), bus.on('scamazon:changed', () => root.isConnected && draw())];
    return () => {
      clearInterval(tick);
      offs.forEach((o) => o());
    };
  },
};
