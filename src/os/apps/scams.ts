import { h, clear, money } from '../../ui/dom';
import { icon } from '../icons';
import { bus } from '../../game/bus';
import { game, JOBS, type Call, type GiftCardLoot, type JobKind } from '../../game/game';
import { settings } from '../../game/settings';
import { sfx } from '../../game/audio';
import { portrait } from '../../ui/portrait';
import { BRANDS, giftCardArt, ring } from '../loot-ui';
import type { AppDef } from '../wm';

export function jobSteps(kind: JobKind, call: Call | null): HTMLElement {
  const def = JOBS[kind];
  const job = call?.job?.kind === kind ? call.job : null;
  const list = h('ol.job-steps');
  def.steps.forEach((st, i) => {
    const done = !!job && (i < job.step || job.done);
    const now = !!job && !job.done && i === job.step;
    const hold = now && job!.holdUntil > performance.now();
    const secs = hold ? Math.ceil((job!.holdUntil - performance.now()) / 1000) : 0;
    list.append(
      h(
        'li.job-step',
        { class: done ? 'done' : now ? 'now' : '' },
        h('span.js-mark', { innerHTML: done ? icon('check') : hold ? '<i class="js-spin"></i>' : String(i + 1) }),
        h('span.js-text', { dir: 'auto' }, st.en, hold ? h('small', null, ` · at the store, ${secs}s`) : null),
      ),
    );
  });
  return list;
}

export function progressPill(kind: JobKind, call: Call | null) {
  const job = call?.job?.kind === kind ? call.job : null;
  const n = JOBS[kind].steps.length;
  const d = job ? (job.done ? n : job.step) : 0;
  return h('span.job-pill', { class: d === n ? 'full' : '' }, `${d} / ${n} ${'done'}`);
}

export function startHere(kind: JobKind, call: Call) {
  const mine = call.job?.kind;
  const first = call.persona.name.split(' ')[0];
  if (!mine || mine === kind) return h('div.job-start', null, h('p', null, `No ${JOBS[kind].title} mission on this call.`));
  return h(
    'div.job-start',
    null,
    h('p', null, `${first}'s mission is ${JOBS[mine].title}, not ${JOBS[kind].title}.`),
    h('button.job-start-btn', { onclick: () => bus.emit('os:open', { id: JOBS[mine].app }) }, h('span', { innerHTML: icon('arrowRight') }), `Open ${JOBS[mine].title}`),
  );
}

function noCall(text: string) {
  return h('div.job-empty', null, h('span', { innerHTML: icon('phone') }), h('b', null, 'No live call'), h('small', null, text));
}

export const CreditCardApp: AppDef = {
  id: 'creditcard',
  title: 'Credit Card',
  icon: 'card',
  color: '#0f7a5a',
  color2: '#34c38f',
  w: 500,
  h: 720,
  minW: 440,
  minH: 520,
  evidence: true,
  render(win) {
    const root = h('div.ccapp');
    win.body.append(root);
    const num = h('input.cc-input', { placeholder: '0000 0000 0000 0000', maxLength: 19, inputMode: 'numeric', spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
    const msg = h('div.cc-msg');
    let paidFlash = 0;
    num.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') verify();
    });
    num.addEventListener('input', () => {
      const d = num.value.replace(/\D/g, '').slice(0, 16);
      num.value = d.match(/.{1,4}/g)?.join(' ') || '';
      drawCard();
    });
    const cardFace = h('div.cc-face');
    const drawCard = () => {
      const call = game.call;
      const typed = num.value.replace(/\D/g, '');
      const shown = Array.from({ length: 16 }, (_, i) => typed[i] ?? '•').join('').match(/.{4}/g)!.join(' ');
      clear(cardFace);
      cardFace.append(
        h('div.ccf-shine'),
        h('div.ccf-top', null, h('span.ccf-chip'), h('span.ccf-wave', { innerHTML: icon('antenna') }), h('span.ccf-brand', null, 'SWIFTPAY')),
        h('div.ccf-num', null, shown),
        h('div.ccf-bottom', null, h('div', null, h('small', null, 'CARDHOLDER'), h('b', null, (call?.persona.name || 'CARDHOLDER NAME').toUpperCase())), h('div', null, h('small', null, 'VALID THRU'), h('b', null, '••/••'))),
      );
    };
    const verify = () => {
      const r = game.verifyCard(num.value);
      msg.textContent = r.msg;
      msg.className = `cc-msg ${r.ok ? 'good' : 'bad'}`;
      if (r.ok) {
        paidFlash = performance.now();
        sfx.cash();
        draw();
      } else {
        sfx.error();
        num.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      }
    };
    const draw = () => {
      clear(root);
      const call = game.call;
      const job = call?.job?.kind === 'card' ? call.job : null;
      root.append(
        h(
          'div.cc-hero',
          null,
          h('div', null, h('small', null, 'SWIFTPAY MERCHANT'), h('h2', null, 'Credit Card')),
          h('span.cc-hero-ico', { innerHTML: icon('card') }),
        ),
        h(
          'div.cc-reward',
          null,
          h('div', null, h('small', null, 'Reward'), h('b', null, job?.price ? money(job.price) : 'The price you agree on')),
          progressPill('card', call),
        ),
      );
      if (!call) {
        root.append(noCall('Answer a call, then run the credit card scheme from here.'));
        return;
      }
      root.append(jobSteps('card', call));
      if (!job) return root.append(startHere('card', call));
      if (job.done) {
        root.append(
          h(
            'div.cc-paid',
            { class: performance.now() - paidFlash < 1500 ? 'pop' : '' },
            h('span.cc-paid-ico', { innerHTML: icon('check') }),
            h('b', null, `${'Approved'} · ${money(job.price)}`),
            h('small', null, `Charged to ${call.persona.name}'s card`),
          ),
        );
        return;
      }
      drawCard();
      const ready = job.step >= 2;
      root.append(
        cardFace,
        h(
          'div.cc-entry',
          { class: ready ? '' : 'waiting' },
          h('label', null, 'Card number (front of card)'),
          h('div.cc-row', null, num, h('button.cc-verify', { onclick: verify, disabled: !ready }, 'Verify')),
          ready ? null : h('small.cc-wait', null, 'Finish the steps above first.'),
          msg,
        ),
      );
    };
    draw();
    win.el.addEventListener('app-arg', (e: Event) => {
      const v = String((e as CustomEvent).detail || '');
      if (v) {
        num.value = v;
        drawCard();
        num.focus();
      }
    });
    const offs = [bus.on('job:changed', draw), bus.on('call:changed', () => !document.activeElement?.classList.contains('cc-input') && draw())];
    const t = setInterval(() => game.call?.job?.holdUntil && draw(), 1000);
    return () => {
      offs.forEach((o) => o());
      clearInterval(t);
    };
  },
};

const BRAND_LIST = Object.keys(BRANDS);

function confetti(parent: HTMLElement) {
  const box = h('div.confetti');
  const colors = ['#ffd166', '#06d6a0', '#ef476f', '#4cc9f0', '#ffffff'];
  for (let i = 0; i < 36; i++) {
    const p = h('i', { style: { left: `${50 + (Math.random() - 0.5) * 30}%`, background: colors[i % colors.length], '--dx': `${(Math.random() - 0.5) * 420}px`, '--dy': `${-160 - Math.random() * 220}px`, '--r': `${Math.random() * 720}deg`, animationDelay: `${Math.random() * 0.08}s` } });
    box.append(p);
  }
  parent.append(box);
  setTimeout(() => box.remove(), 1600);
}

export const GiftCardsApp: AppDef = {
  id: 'giftcards',
  title: 'Gift Cards',
  icon: 'gift',
  color: '#ff7a00',
  color2: '#ffc04d',
  w: 860,
  h: 600,
  minW: 720,
  minH: 520,
  dark: true,
  evidence: true,
  render(win, arg?: string) {
    let brand = 'Steam';
    let selected: GiftCardLoot | null = null;
    let flipped = false;
    let won = 0;
    const root = h('div.gcapp');
    win.body.append(root);
    const left = h('div.gc-left');
    const right = h('div.gc-right');
    root.append(left, right);
    const segs = [0, 1, 2].map(() => h('input.gc-seg', { maxLength: 4, spellcheck: false, autocomplete: 'off' }) as HTMLInputElement);
    const msg = h('div.gc-msg');

    const pick = (g: GiftCardLoot | null) => {
      selected = g;
      if (g) brand = g.brand;
      for (const s of segs) s.value = '';
      msg.textContent = '';
      msg.className = 'gc-msg';
      flipped = !!g;
      won = 0;
      draw();
      setTimeout(() => segs[0].focus(), 350);
    };
    const code = () => segs.map((s) => s.value).join('-');
    const redeem = () => {
      const r = game.redeemGiftCard(brand, code());
      msg.textContent = r.msg;
      msg.className = `gc-msg ${r.ok ? 'good' : 'bad'}`;
      if (r.ok) {
        won = Number(r.msg.match(/\d+/)?.[0]) || 0;
        selected = null;
        for (const s of segs) s.value = '';
        draw();
        confetti(right);
      } else {
        sfx.error();
        right.querySelector('.gc-codes')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      }
    };
    segs.forEach((s, i) => {
      s.addEventListener('paste', (e) => {
        const raw = (e.clipboardData?.getData('text') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
        if (raw.length <= 4) return;
        e.preventDefault();
        segs.forEach((x, k) => (x.value = raw.slice(k * 4, k * 4 + 4)));
        segs[Math.min(2, Math.floor((raw.length - 1) / 4))].focus();
      });
      s.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') redeem();
        if (e.key === 'Backspace' && !s.value && i > 0) segs[i - 1].focus();
      });
      s.addEventListener('input', () => {
        const raw = s.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (raw.length > 4) {
          const all = raw.slice(0, 12);
          segs.forEach((x, k) => (x.value = all.slice(k * 4, k * 4 + 4)));
          segs[Math.min(2, Math.floor((all.length - 1) / 4))].focus();
          return;
        }
        s.value = raw;
        if (raw.length === 4 && i < 2) segs[i + 1].focus();
      });
    });

    const drawLeft = () => {
      clear(left);
      const call = game.call;
      const job = call?.job?.kind === 'gift' ? call.job : null;
      left.append(h('div.gc-sec-head', null, h('b', null, 'Gift card scheme'), call ? progressPill('gift', call) : null));
      if (!call) left.append(noCall('During a call, the steps show up here.'));
      else {
        left.append(jobSteps('gift', call));
        if (!job) left.append(startHere('gift', call));
        else if (job.step === 2 && job.brand) left.append(h('div.gc-bought', null, h('span', { innerHTML: icon('gift') }), `${call.persona.name.split(' ')[0]} is buying ${job.brand} · $${job.price}`));
      }
      left.append(h('div.gc-sec-head', null, h('b', null, 'Waiting to redeem'), h('span.gc-count', null, String(game.giftCards.length))));
      if (!game.giftCards.length) left.append(h('div.gc-none', null, 'No cards yet.'));
      for (const g of game.giftCards) {
        const frac = (g.expires - Date.now()) / 240_000;
        const secs = Math.max(0, Math.round((g.expires - Date.now()) / 1000));
        left.append(
          h(
            'button.gc-pend',
            { class: selected === g ? 'on' : '', onclick: () => pick(g) },
            giftCardArt(g, { small: true }),
            h('div.gc-pend-meta', null, h('b', null, `${g.brand} · $${g.amount}`), h('small', null, `from ${g.from}`)),
            h('div.gc-pend-timer', null, ring(frac, 30), h('small', null, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)),
          ),
        );
      }
    };

    const draw = () => {
      drawLeft();
      clear(right);
      const g = selected && game.giftCards.includes(selected) ? selected : null;
      const b = BRANDS[brand] || BRANDS.Steam;
      if (won) {
        right.append(
          h('div.gc-won', null, h('div.gc-won-ring', { innerHTML: icon('check') }), h('b', null, `+${money(won)}`), h('small', null, 'Cashed out to the team'), h('button.gc-again', { onclick: () => ((won = 0), draw()) }, 'Done')),
        );
        return;
      }
      const card = h(
        'div.gc-flip',
        { class: flipped ? 'flipped' : '', onclick: () => ((flipped = !flipped), (card as HTMLElement).classList.toggle('flipped', flipped), flipped && setTimeout(() => segs[0].focus(), 350)) },
        h('div.gc-side.front', null, giftCardArt({ brand, amount: g?.amount ?? 0 })),
        h(
          'div.gc-side.back',
          { style: { background: b.bg, color: b.fg } },
          h('div.gc-strip'),
          h('small.gc-back-label', null, 'SCRATCH TO REVEAL CODE'),
          h('div.gc-codes', { onclick: (e: Event) => e.stopPropagation() }, segs[0], h('i'), segs[1], h('i'), segs[2]),
          h('small.gc-fine', null, `${b.mark} · ${'Not redeemable for cash'}`),
        ),
      );
      right.append(
        h('div.gc-title', null, h('h2', null, 'Redeem a card'), h('p', null, 'Pick the brand, flip the card over, and type the code exactly as it was read out.')),
        h('div.gc-stage', null, card),
        h('div.gc-brands', null, ...BRAND_LIST.map((x) => h('button.gc-brand', { class: brand === x ? 'on' : '', onclick: () => ((brand = x), draw()) }, h('i', { style: { background: BRANDS[x].bg } }), x))),
        h('button.gc-redeem', { onclick: redeem }, h('span', { innerHTML: icon('wallet') }), 'Redeem'),
        msg,
        g ? h('div.gc-hint', null, h('span', { innerHTML: icon('info') }), `Read out by ${g.from}: `, h('b.mono', null, g.code)) : '',
      );
    };

    if (arg) {
      const g = game.giftCards.find((x) => x.code === arg);
      if (g) pick(g);
      else draw();
    } else draw();
    win.el.addEventListener('app-arg', (e: Event) => {
      const g = game.giftCards.find((x) => x.code === (e as CustomEvent).detail);
      if (g) pick(g);
    });
    const t = setInterval(drawLeft, 1000);
    const offs = [bus.on('loot:changed', drawLeft), bus.on('job:changed', drawLeft), bus.on('call:changed', drawLeft)];
    return () => {
      clearInterval(t);
      offs.forEach((o) => o());
    };
  },
};

export const CustomerInfoApp: AppDef = {
  id: 'customer',
  title: 'Customer Info',
  icon: 'user',
  color: '#5e5ce6',
  color2: '#8e8cf8',
  w: 460,
  h: 560,
  evidence: true,
  render(win) {
    const root = h('div.cust');
    win.body.append(root);
    const draw = () => {
      clear(root);
      const call = game.call;
      if (!call) return root.append(noCall("The caller's file shows up here during a call."));
      const p = call.persona;
      const fact = (label: string, value: string, good?: boolean) => h('div.cust-fact', null, h('small', null, label), h('b', { class: good === undefined ? '' : good ? 'good' : 'bad' }, value));
      const best: JobKind = p.hasCard && !p.giftCardFriendly ? 'card' : 'gift';
      root.append(
        h('div.cust-head', null, h('div.cust-face', { innerHTML: portrait(p.look, call.mood) }), h('div', null, h('h2', null, p.name), h('small', null, `${p.age} · ${p.location}`))),
        h('p.cust-bio', { dir: 'auto' }, `${p.archetype[0].toUpperCase()}${p.archetype.slice(1)}. ${p.bio}`),
        h(
          'div.cust-grid',
          null,
          fact('Savings', `~${money(Math.round(p.savings / 100) * 100)}`),
          fact('Gullibility', `${Math.round(p.gullibility * 100)}%`, p.gullibility > 0.5),
          fact('Gift cards', p.giftCardFriendly ? ('Would buy') : 'Resists', p.giftCardFriendly),
          fact('Credit card', p.hasCard ? ('Has one') : 'None', p.hasCard),
        ),
        h('div.cust-sec', null, 'Quirks'),
        h('ul.cust-quirks', null, ...p.quirks.map((q) => h('li', { dir: 'auto' }, q))),
        h('div.cust-tip', null, h('span', { innerHTML: icon('bulb') }), `Best bet: the ${JOBS[best].title} scheme`),
      );
    };
    draw();
    return bus.on('call:changed', draw);
  },
};
