import { h, clear, money } from '../../ui/dom';
import { icon } from '../icons';
import { bus } from '../../game/bus';
import { crew, send } from '../../game/net';
import { sfx } from '../../game/audio';
import type { AppDef } from '../wm';

type Tab = 'crash' | 'flip' | 'slots';
const wallet = () => crew.self?.personal ?? 0;

const session = { wagered: 0, net: 0, best: 0 };
const history = { crash: [] as number[], flip: [] as ('h' | 't')[] };
const remember = <T,>(list: T[], v: T) => {
  list.unshift(v);
  list.length = Math.min(list.length, 14);
};

function settle(bet: number, payout: number) {
  const net = Math.round(payout - bet);
  session.wagered += bet;
  session.net += net;
  session.best = Math.max(session.best, net);
  send({ t: 'earn', amount: net, source: 'casino', note: 'Rainbit' });
  bus.emit('casino:settled');
}

const SYMBOLS = [
  { id: 'seven', mult: 25, w: 1 },
  { id: 'crown', mult: 12, w: 2 },
  { id: 'trophy', mult: 8, w: 3 },
  { id: 'zap', mult: 5, w: 4 },
  { id: 'coin', mult: 3, w: 5 },
  { id: 'sparkles', mult: 2, w: 6 },
];
const pickSymbol = () => {
  const total = SYMBOLS.reduce((a, s) => a + s.w, 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) if ((r -= s.w) < 0) return s;
  return SYMBOLS[SYMBOLS.length - 1];
};
const symbolEl = (id: string) => (id === 'seven' ? h('span.sym.seven', null, '7') : h('span.sym', { class: id, innerHTML: icon(id) }));
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;

interface GameView {
  stage: HTMLElement;
  controls: HTMLElement | '';
  action: HTMLButtonElement;
  leave?: () => void;
}

export const CasinoApp: AppDef = {
  id: 'casino',
  title: 'Rainbit',
  icon: 'coins',
  color: '#2c2c2e',
  color2: '#48484a',
  w: 900,
  h: 640,
  minW: 680,
  minH: 520,
  dark: true,
  render(win) {
    let tab: Tab = 'crash';
    let bet = 50;
    let busy = false;
    const root = h('div.rb');
    win.body.append(root);

    const balance = h('b.rb-bal');
    const tabs = h('div.rb-seg');
    const head = h('div.rb-head', null, h('div.rb-brand', null, h('span.rb-mark'), h('b', null, 'Rainbit')), tabs, h('div.rb-wallet', null, h('small', null, 'Wallet'), balance));
    const stageBox = h('div.rb-stagebox');
    const ticket = h('div.rb-ticket');
    root.append(head, h('div.rb-body', null, stageBox, ticket));

    const drawBalance = () => (balance.textContent = money(wallet()));
    const note = h('div.rb-note');
    const say = (text: string, kind: '' | 'good' | 'bad' = '') => {
      note.textContent = text;
      note.className = `rb-note ${kind}`;
    };
    const canBet = () => {
      if (crew.run?.phase !== 'shift') return say('The tables open with the shift.', 'bad'), false;
      if (bet < 1) return say('Enter an amount.', 'bad'), false;
      if (bet > wallet()) {
        sfx.error();
        return say("Your wallet can't cover that.", 'bad'), false;
      }
      return true;
    };

    const amount = h('input.rb-amount', { type: 'number', min: 1, value: String(bet), inputMode: 'numeric' }) as HTMLInputElement;
    amount.addEventListener('keydown', (e) => e.stopPropagation());
    amount.addEventListener('input', () => (bet = Math.max(0, Math.floor(Number(amount.value) || 0))));
    const setBet = (v: number) => {
      if (busy) return;
      bet = Math.max(1, Math.floor(v));
      amount.value = String(bet);
    };
    const quick = (label: string, fn: () => number) => h('button.rb-q', { onclick: () => setBet(fn()) }, label);
    const stat = (label: string) => {
      const v = h('b');
      return { el: h('div.rb-stat', null, h('small', null, label), v), v };
    };
    const sWag = stat('Wagered');
    const sNet = stat('Net');
    const sBest = stat('Best win');
    const drawStats = () => {
      sWag.v.textContent = money(session.wagered);
      sNet.v.textContent = signed(session.net);
      sNet.v.className = session.net > 0 ? 'up' : session.net < 0 ? 'down' : '';
      sBest.v.textContent = session.best > 0 ? `+${money(session.best)}` : '—';
    };

    const crashView = (): GameView => {
      const cv = h('canvas.rb-chart', { width: 1240, height: 640 }) as HTMLCanvasElement;
      const ctx = cv.getContext('2d')!;
      const big = h('div.rb-big', null, '1.00×');
      const caption = h('div.rb-cap', null, 'Cash out before the line breaks');
      const tape = h('div.rb-tape');
      const auto = h('input.rb-amount', { type: 'number', min: 1.01, step: 0.01, placeholder: 'Off' }) as HTMLInputElement;
      auto.addEventListener('keydown', (e) => e.stopPropagation());
      const action = h('button.rb-go', null, 'Place bet') as HTMLButtonElement;
      let raf = 0;
      let t0 = 0;
      let crashAt = 1;
      let state: 'idle' | 'run' | 'out' = 'idle';
      let cashed = 0;
      const curve = (t: number) => Math.exp(0.12 * t);
      const drawTape = () => {
        clear(tape);
        if (!history.crash.length) tape.append(h('span.rb-tape-empty', null, 'No rounds yet'));
        for (const m of history.crash) tape.append(h('span.rb-tick', { class: m >= 2 ? 'up' : 'down' }, `${m.toFixed(2)}×`));
      };
      let last: [number, number, 'run' | 'out' | 'crashed' | 'idle'] = [1, 0, 'idle'];
      const fit = new ResizeObserver(() => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.max(10, Math.round(cv.clientWidth * dpr));
        cv.height = Math.max(10, Math.round(cv.clientHeight * dpr));
        paint(...last);
      });
      fit.observe(cv);
      const paint = (m: number, t: number, phase: 'run' | 'out' | 'crashed' | 'idle') => {
        last = [m, t, phase];
        const k = Math.min(2, window.devicePixelRatio || 1);
        const W = cv.width;
        const H = cv.height;
        const padR = 56 * k;
        const padB = 22 * k;
        ctx.clearRect(0, 0, W, H);
        const span = Math.max(8, t * 1.18);
        const top = Math.max(2, curve(span) * 1.04);
        const X = (s: number) => 16 * k + (s / span) * (W - 16 * k - padR);
        const Y = (v: number) => H - padB - ((v - 1) / (top - 1)) * (H - padB - 28 * k);
        ctx.font = `600 ${11 * k}px "JetBrains Mono Variable", ui-monospace, monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const v of [1, 1.5, 2, 3, 5, 10, 20, 50].filter((x) => x <= top)) {
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = k;
          ctx.setLineDash(v === 1 ? [] : [3 * k, 4 * k]);
          ctx.beginPath();
          ctx.moveTo(16 * k, Y(v));
          ctx.lineTo(W - padR + 4 * k, Y(v));
          ctx.stroke();
          ctx.fillStyle = 'rgba(235,235,245,0.38)';
          ctx.fillText(`${v.toFixed(v < 10 ? 1 : 0)}×`, W - padR + 10 * k, Y(v));
        }
        ctx.setLineDash([]);
        if (phase === 'idle') return;
        const color = phase === 'crashed' ? '#ff453a' : '#30d158';
        ctx.beginPath();
        ctx.moveTo(X(0), Y(1));
        for (let i = 1; i <= 90; i++) {
          const s = (t * i) / 90;
          ctx.lineTo(X(s), Y(Math.min(m, curve(s))));
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5 * k;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.lineTo(X(t), H - padB);
        ctx.lineTo(X(0), H - padB);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, Y(m), 0, H - padB);
        fill.addColorStop(0, phase === 'crashed' ? 'rgba(255,69,58,0.22)' : 'rgba(48,209,88,0.2)');
        fill.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fill;
        ctx.fill();
        const tx = X(t);
        const ty = Y(m);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = k;
        ctx.setLineDash([2 * k, 3 * k]);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(W - padR + 4 * k, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(tx, ty, 4.5 * k, 0, Math.PI * 2);
        ctx.fill();
      };
      const setAction = () => {
        action.disabled = state === 'out';
        action.className = `rb-go ${state === 'run' ? 'cash' : ''}`;
        if (state !== 'run') action.textContent = state === 'out' ? 'Riding it out…' : 'Place bet';
      };
      const end = () => {
        cancelAnimationFrame(raf);
        remember(history.crash, crashAt);
        drawTape();
        big.textContent = `${crashAt.toFixed(2)}×`;
        big.className = `rb-big ${cashed ? 'up' : 'down'}`;
        caption.textContent = `Broke at ${crashAt.toFixed(2)}×`;
        if (!cashed) {
          settle(bet, 0);
          sfx.error();
          say(`Lost ${money(bet)}.`, 'bad');
        }
        paint(crashAt, Math.log(crashAt) / 0.12, cashed ? 'out' : 'crashed');
        busy = false;
        state = 'idle';
        setAction();
      };
      const cashOut = (m: number) => {
        cashed = Math.floor(bet * m);
        settle(bet, cashed);
        sfx.cash();
        state = 'out';
        say(`Cashed out at ${m.toFixed(2)}×: +${money(cashed - bet)}.`, 'good');
        big.classList.add('up');
        setAction();
      };
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        const m = curve(t);
        if (m >= crashAt) return end();
        if (!cashed) big.textContent = `${m.toFixed(2)}×`;
        const target = Number(auto.value);
        if (state === 'run' && target > 1 && m >= target) cashOut(target);
        if (state === 'run') action.textContent = `Cash out ${money(bet * m)}`;
        paint(m, t, 'run');
        raf = requestAnimationFrame(tick);
      };
      action.onclick = () => {
        if (state === 'run') {
          const m = curve((performance.now() - t0) / 1000);
          if (m < crashAt) cashOut(m);
          return;
        }
        say('');
        if (busy || !canBet()) return;
        busy = true;
        cashed = 0;
        crashAt = Math.min(60, Math.max(1, Math.floor((0.97 / Math.max(0.0001, 1 - Math.random())) * 100) / 100));
        t0 = performance.now();
        state = 'run';
        big.className = 'rb-big';
        caption.textContent = 'Live';
        setAction();
        sfx.click();
        raf = requestAnimationFrame(tick);
      };
      paint(1, 0, 'idle');
      drawTape();
      setAction();
      return {
        stage: h('div.rb-crash', null, tape, h('div.rb-chartwrap', null, cv, h('div.rb-readout', null, big, caption))),
        controls: h('label.rb-field', null, h('span', null, 'Auto cash-out'), h('div.rb-input', null, auto, h('em', null, '×'))),
        action,
        leave: () => {
          fit.disconnect();
          cancelAnimationFrame(raf);
          if (state === 'run' && !cashed) settle(bet, 0);
          busy = false;
        },
      };
    };

    const flipView = (): GameView => {
      let side: 'h' | 't' = 'h';
      let angle = 0;
      let face: 'h' | 't' = 'h';
      const coin = h('div.rb-coin', null, h('div.rb-face.h', null, h('b', null, 'H')), h('div.rb-face.t', null, h('b', null, 'T')));
      const caption = h('div.rb-cap', null, 'Even odds. Pays 1.96×.');
      const tape = h('div.rb-tape');
      const drawTape = () => {
        clear(tape);
        if (!history.flip.length) tape.append(h('span.rb-tape-empty', null, 'No flips yet'));
        for (const r of history.flip) tape.append(h('span.rb-dot', { class: r }, r.toUpperCase()));
      };
      const seg = h('div.rb-seg.full');
      const drawSeg = () => {
        clear(seg);
        for (const [s, label] of [['h', 'Heads'], ['t', 'Tails']] as const) seg.append(h('button', { class: s === side ? 'on' : '', onclick: () => !busy && ((side = s), drawSeg()) }, label));
      };
      drawSeg();
      const action = h('button.rb-go', null, 'Flip') as HTMLButtonElement;
      action.onclick = () => {
        say('');
        if (busy || !canBet()) return;
        busy = true;
        action.disabled = true;
        const land: 'h' | 't' = Math.random() < 0.5 ? 'h' : 't';
        angle += 1440 + (land !== face ? 180 : 0);
        face = land;
        coin.style.transform = `rotateY(${angle}deg)`;
        sfx.whoosh();
        caption.textContent = 'Flipping…';
        setTimeout(() => {
          const won = land === side;
          const pay = won ? Math.floor(bet * 1.96) : 0;
          settle(bet, pay);
          remember(history.flip, land);
          drawTape();
          if (won) sfx.cash();
          else sfx.error();
          caption.textContent = land === 'h' ? 'Heads' : 'Tails';
          say(won ? `Won +${money(pay - bet)}.` : `Lost ${money(bet)}.`, won ? 'good' : 'bad');
          busy = false;
          action.disabled = false;
        }, 1600);
      };
      drawTape();
      return {
        stage: h('div.rb-flip', null, tape, h('div.rb-coinstage', null, h('div.rb-coinwrap', null, coin), caption)),
        controls: h('label.rb-field', null, h('span', null, 'Your call'), seg),
        action,
      };
    };

    const slotsView = (): GameView => {
      const reels = [0, 1, 2].map(() => h('div.rb-reel', null, h('div.rb-strip')));
      const show = (i: number, ids: string[]) => {
        const strip = reels[i].firstElementChild as HTMLElement;
        clear(strip);
        for (const id of ids) strip.append(h('div.rb-cell', null, symbolEl(id)));
      };
      reels.forEach((_, i) => show(i, [SYMBOLS[(i * 2 + 1) % SYMBOLS.length].id]));
      const caption = h('div.rb-cap', null, 'Three of a kind on the line pays.');
      const table = h(
        'div.rb-pay',
        null,
        ...SYMBOLS.map((s) => h('div.rb-payrow', null, h('span.rb-trio', null, symbolEl(s.id), symbolEl(s.id), symbolEl(s.id)), h('b', null, `${s.mult}×`))),
        h('div.rb-payrow', null, h('span.rb-trio', null, symbolEl('seven'), symbolEl('seven'), h('small', null, 'any')), h('b', null, '2×')),
      );
      const action = h('button.rb-go', null, 'Spin') as HTMLButtonElement;
      action.onclick = () => {
        say('');
        if (busy || !canBet()) return;
        busy = true;
        action.disabled = true;
        const result = [pickSymbol(), pickSymbol(), pickSymbol()];
        reels.forEach((r) => r.classList.remove('hit'));
        sfx.click();
        const dur = (i: number) => 1.0 + i * 0.4;
        reels.forEach((reel, i) => {
          const ids = Array.from({ length: 16 + i * 5 }, () => pickSymbol().id);
          ids.push(result[i].id);
          show(i, ids);
          const strip = reel.firstElementChild as HTMLElement;
          strip.style.transition = 'none';
          strip.style.transform = 'translateY(0)';
          void strip.offsetHeight;
          strip.style.transition = `transform ${dur(i)}s cubic-bezier(0.12, 0.8, 0.22, 1)`;
          strip.style.transform = 'translateY(calc(-100% + var(--cell)))';
          setTimeout(() => sfx.blip(440 + i * 110), dur(i) * 1000);
        });
        setTimeout(() => {
          const [a, b, c] = result;
          let mult = 0;
          if (a.id === b.id && b.id === c.id) mult = a.mult;
          else if ([a, b, c].filter((s) => s.id === 'seven').length === 2) mult = 2;
          const pay = Math.floor(bet * mult);
          settle(bet, pay);
          if (pay) sfx.cash();
          caption.textContent = mult ? `${mult}× on the line` : 'No line';
          say(pay ? `Won +${money(pay - bet)}.` : `Lost ${money(bet)}.`, pay ? 'good' : 'bad');
          reels.forEach((r) => r.classList.toggle('hit', mult > 0));
          busy = false;
          action.disabled = false;
        }, dur(2) * 1000 + 120);
      };
      return {
        stage: h('div.rb-slots', null, h('div.rb-machine', null, h('div.rb-reels', null, ...reels), h('div.rb-line')), caption, table),
        controls: '',
        action,
      };
    };

    let view: GameView | null = null;
    const TABS: [Tab, string][] = [
      ['crash', 'Crash'],
      ['flip', 'Coinflip'],
      ['slots', 'Slots'],
    ];
    const draw = () => {
      view?.leave?.();
      clear(tabs);
      for (const [t, label] of TABS) tabs.append(h('button', { class: t === tab ? 'on' : '', onclick: () => !busy && t !== tab && ((tab = t), draw()) }, label));
      view = tab === 'crash' ? crashView() : tab === 'flip' ? flipView() : slotsView();
      clear(stageBox);
      stageBox.append(view.stage);
      clear(ticket);
      say('');
      ticket.append(
        h(
          'div.rb-card',
          null,
          h('label.rb-field', null, h('span', null, 'Amount'), h('div.rb-input', null, h('em.pre', null, '$'), amount)),
          h('div.rb-quick', null, quick('½', () => bet / 2), quick('2×', () => bet * 2), quick('$100', () => 100), quick('Max', () => wallet())),
          view.controls,
          view.action,
          note,
        ),
        h('div.rb-card', null, h('div.rb-card-title', null, 'This session'), h('div.rb-stats', null, sWag.el, sNet.el, sBest.el)),
        h('p.rb-fine', null, 'Wallet money only. It never touches the team quota.'),
      );
      drawBalance();
      drawStats();
    };
    draw();
    const offs = [bus.on('net:state', drawBalance), bus.on('casino:settled', drawStats)];
    return () => {
      view?.leave?.();
      offs.forEach((o) => o());
    };
  },
};
