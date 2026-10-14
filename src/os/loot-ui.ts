import { h } from '../ui/dom';
import { icon } from './icons';
import type { GiftCardLoot, CardLoot, RemoteLoot } from '../game/game';

export const BRANDS: Record<string, { bg: string; fg: string; mark: string }> = {
  Steam: { bg: 'linear-gradient(135deg,#0e1a2b 0%,#1b2838 45%,#2a475e 100%)', fg: '#c7d5e0', mark: 'STEAM' },
  Apple: { bg: 'linear-gradient(135deg,#f5f5f7 0%,#d9d9de 100%)', fg: '#1d1d1f', mark: 'Apple' },
  'Google Play': { bg: 'linear-gradient(135deg,#0b8043 0%,#34a853 55%,#7bd88f 100%)', fg: '#ffffff', mark: 'Google Play' },
  Amazon: { bg: 'linear-gradient(135deg,#131921 0%,#232f3e 60%,#37475a 100%)', fg: '#ff9900', mark: 'amazon' },
  Target: { bg: 'linear-gradient(135deg,#b40000 0%,#e2231a 100%)', fg: '#ffffff', mark: 'TARGET' },
};

export function giftCardArt(g: Pick<GiftCardLoot, 'brand' | 'amount'> & { code?: string }, opts: { masked?: boolean; small?: boolean } = {}) {
  const b = BRANDS[g.brand] || BRANDS.Steam;
  return h(
    'div.gc-art',
    { class: opts.small ? 'small' : '', style: { background: b.bg, color: b.fg } },
    h('div.gc-shine'),
    h('div.gc-top', null, h('span.gc-mark', { class: `m-${g.brand.replace(/\s/g, '')}` }, b.mark), h('span.gc-kind', null, 'GIFT CARD')),
    h('div.gc-amount', null, g.amount ? `$${g.amount}` : '$ ··'),
    g.code ? h('div.gc-code', null, opts.masked ? g.code.replace(/[A-Z0-9]/g, '•') : g.code) : null,
  );
}

export function creditCardArt(c: CardLoot) {
  return h(
    'div.cc-art',
    null,
    h('div.gc-shine'),
    h('div.cc-top', null, h('span.cc-chip'), h('span.cc-brand', null, 'VISTA')),
    h('div.cc-num', null, c.number),
    h('div.cc-bottom', null, h('div', null, h('small', null, 'CARDHOLDER'), h('b', null, c.name)), h('div', null, h('small', null, 'EXP'), h('b', null, c.exp)), h('div', null, h('small', null, 'CVV'), h('b', null, c.cvv))),
  );
}

export function remoteArt(r: RemoteLoot) {
  return h('div.rc-art', null, h('span.rc-ico', { innerHTML: icon('remote') }), h('div', null, h('small', null, 'REMOTEDESK SESSION CODE'), h('b', null, `${r.code.slice(0, 3)} ${r.code.slice(3)}`)));
}

export function ring(frac: number, size = 28) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return h('span.ring', {
    innerHTML: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="3"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${frac < 0.25 ? '#ff453a' : '#30d158'}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, frac)))}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`,
  });
}
