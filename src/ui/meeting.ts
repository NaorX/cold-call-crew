import { h, money } from './dom';
import { icon } from '../os/icons';
import { crew, send } from '../game/net';
import { settings } from '../game/settings';
import { sfx } from '../game/audio';
import { bossVoice, fetchVoice, playVoice, shutUp, speak } from '../game/voice';
import { portrait } from './portrait';
import type { World, MeetingShot } from '../engine/world';
import type { Look, ReviewInfo } from '../game/types';

interface Slide {
  shot: MeetingShot;
  line: string;
  anim: number;
  stamp?: number;
  draw: (c: CanvasRenderingContext2D, w: number, h: number, k: number) => void;
}

const FONT = '"Inter Variable", Inter, system-ui, sans-serif';
const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;
const ease = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SOURCE: Record<string, string> = {
  giftcard: 'Gift card',
  card: 'Credit card',
  remote: 'RemoteDesk',
  scammy: 'Scammy challenge',
  bounty: "Boss's bounty",
};
const SOURCE_SAY: Record<string, string> = {
  giftcard: 'in gift cards',
  card: 'off a credit card',
  remote: 'through RemoteDesk',
  scammy: 'on a Scammy challenge',
  bounty: 'on my bounty',
};

export function runMeeting(parent: HTMLElement, world: World, r: ReviewInfo, onQuit: () => void): { el: HTMLElement; stop: () => void } {
  const first = (n: string) => n.split(' ')[0];
  const pct = Math.round((r.team / Math.max(1, r.quota)) * 100);
  const ranked = [...r.crew].sort((a, b) => b.today - a.today);
  const top = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const moments = r.moments || [];
  const quotes = r.quotes || [];
  const runCrew = r.runCrew?.length ? r.runCrew : ranked.map((c) => ({ id: c.id, name: c.name, total: c.today }));

  const faces = new Map<string, HTMLImageElement>();
  const face = (id: string, look: Look | null | undefined) => {
    if (faces.has(id) || !look) return;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portrait(look))}`;
    faces.set(id, img);
  };
  for (const [id, look] of Object.entries(r.looks || {})) face(id, look);
  for (const p of crew.players) face(p.id, p.look);
  if (!faces.has(crew.me)) face(crew.me, settings.look);

  let slideNo = 0;
  let total = 0;
  const X = (_w: number, x: number, _width = 0) => x;
  const align = (a: CanvasTextAlign) => a;
  const text = (c: CanvasRenderingContext2D, w: number, s: string, x: number, y: number, f: string, color: string, a: CanvasTextAlign = 'left') => {
    c.font = f;
    c.fillStyle = color;
    c.textAlign = align(a);
    c.fillText(s, X(w, x), y);
  };
  const pill = (c: CanvasRenderingContext2D, x: number, y: number, s: string, bg: string, fg: string, size = 18) => {
    c.font = font(800, size);
    const tw = c.measureText(s).width + size * 1.4;
    c.fillStyle = bg;
    c.beginPath();
    c.roundRect(x, y, tw, size * 1.9, size);
    c.fill();
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.fillText(s, x + tw / 2, y + size * 1.32);
    return tw;
  };
  const pillW = (c: CanvasRenderingContext2D, s: string, size = 18) => {
    c.font = font(800, size);
    return c.measureText(s).width + size * 1.4;
  };
  const pillAt = (c: CanvasRenderingContext2D, w: number, x: number, y: number, s: string, bg: string, fg: string, size = 18) => pill(c, X(w, x, pillW(c, s, size)), y, s, bg, fg, size);
  const avatar = (c: CanvasRenderingContext2D, id: string, cx: number, cy: number, rad: number) => {
    c.save();
    c.beginPath();
    c.arc(cx, cy, rad, 0, Math.PI * 2);
    c.fillStyle = '#2c2c34';
    c.fill();
    c.clip();
    const img = faces.get(id);
    if (img?.complete && img.naturalWidth) c.drawImage(img, cx - rad, cy - rad, rad * 2, rad * 2);
    c.restore();
  };
  const wrap = (c: CanvasRenderingContext2D, s: string, max: number) => {
    const words = s.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const wd of words) {
      const next = cur ? `${cur} ${wd}` : wd;
      if (c.measureText(next).width > max && cur) {
        lines.push(cur);
        cur = wd;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const stamp = (c: CanvasRenderingContext2D, label: string, color: string, cx: number, cy: number, k: number) => {
    if (k <= 0) return;
    const s = 1 + (1 - ease(k)) * 0.9;
    c.save();
    c.globalAlpha = Math.min(1, k * 2.5) * 0.92;
    c.translate(cx, cy);
    c.rotate(-0.16);
    c.scale(s, s);
    c.font = font(900, 64);
    const tw = c.measureText(label).width + 64;
    c.strokeStyle = color;
    c.lineWidth = 9;
    c.beginPath();
    c.roundRect(-tw / 2, -58, tw, 116, 18);
    c.stroke();
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(-tw / 2 + 12, -46, tw - 24, 92, 10);
    c.stroke();
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, 0, 4);
    c.restore();
  };
  const frame = (c: CanvasRenderingContext2D, w: number, hh: number, title: string) => {
    c.textBaseline = 'alphabetic';
    c.direction = 'ltr';
    const g = c.createLinearGradient(0, 0, w, hh);
    g.addColorStop(0, '#15171d');
    g.addColorStop(1, '#0b0c10');
    c.fillStyle = g;
    c.fillRect(0, 0, w, hh);
    const glow = c.createRadialGradient(w * 0.15, 0, 10, w * 0.15, 0, w * 0.7);
    glow.addColorStop(0, 'rgba(10,132,255,0.16)');
    glow.addColorStop(1, 'rgba(10,132,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, hh);
    c.fillStyle = '#0a84ff';
    c.beginPath();
    c.roundRect(X(w, 64, 34), 48, 34, 34, 9);
    c.fill();
    c.fillStyle = '#fff';
    c.font = font(900, 15);
    c.textAlign = 'center';
    c.fillText('CC', X(w, 64, 34) + 17, 71);
    text(c, w, 'COLD CALL CREW', 112, 72, font(700, 17), '#8e8e93');
    text(c, w, `DAY ${r.day} · PERFORMANCE REVIEW`, w - 64, 72, font(700, 17), '#8e8e93', 'right');
    if (title) text(c, w, title, 64, 168, font(800, 60), '#ffffff');
    for (let i = 0; i < total; i++) {
      c.fillStyle = i === slideNo ? '#ffffff' : 'rgba(255,255,255,0.22)';
      c.beginPath();
      c.arc(w / 2 + (i - (total - 1) / 2) * 22, hh - 40, i === slideNo ? 5 : 4, 0, Math.PI * 2);
      c.fill();
    }
  };

  const slides: Slide[] = [];

  slides.push({
    shot: 'boss1',
    anim: 0.9,
    line: `Alright. Phones down, eyes up here. Day ${r.day} review. This won't take long, unless you make it take long.`,
    draw: (c, w, hh, k) => {
      frame(c, w, hh, '');
      const e = ease(k);
      c.globalAlpha = e;
      text(c, w, 'DAILY PERFORMANCE REVIEW', 64, 300 - (1 - e) * 20, font(800, 24), '#0a84ff');
      text(c, w, `Day ${r.day}`, 60, 440 - (1 - e) * 30, font(900, 150), '#ffffff');
      text(c, w, 'Attendance is mandatory. Snacks are not provided.', 64, 505, font(500, 30), '#8e8e93');
      const people = crew.players.length ? crew.players : [{ id: crew.me, name: 'You' }];
      people.slice(0, 8).forEach((p, i) => avatar(c, p.id, X(w, 64 + 30 + i * 70, 0), 600, 28));
      text(c, w, `${people.length} in the room`, 64 + Math.min(8, people.length) * 70 + 16, 610, font(600, 24), '#8e8e93');
      c.globalAlpha = 1;
    },
  });

  const short = Math.max(0, r.quota - r.team);
  slides.push({
    shot: 'slide',
    anim: 2.4,
    stamp: 0.72,
    line: r.pass
      ? pct >= 150
        ? `We made ${money(r.team)} against a quota of ${money(r.quota)}. That's ${pct} percent. I'm not going to cry. I'm going to raise the quota.`
        : `${money(r.team)} on a quota of ${money(r.quota)}. Quota met. Not impressive, but met.`
      : `${money(r.team)}. The quota was ${money(r.quota)}. That is ${money(short)} short. I want you to sit with that.`,
    draw: (c, w, hh, k) => {
      frame(c, w, hh, 'Team vs. quota');
      const e = ease(k / 0.62);
      text(c, w, money(r.team * e), 60, 360, font(900, 130), '#ffffff');
      text(c, w, `of ${money(r.quota)} quota`, 64, 418, font(600, 32), '#8e8e93');
      const bx = 64;
      const bw = w - 128;
      const fill = Math.min(1, r.team / Math.max(1, r.quota)) * e;
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.beginPath();
      c.roundRect(bx, 470, bw, 30, 15);
      c.fill();
      if (fill > 0) {
        const fg = c.createLinearGradient(X(w, bx, bw), 0, X(w, bx, bw) + bw, 0);
        fg.addColorStop(0, r.pass ? '#28c76f' : '#ff6b5f');
        fg.addColorStop(1, r.pass ? '#30d158' : '#ff453a');
        c.fillStyle = fg;
        c.beginPath();
        c.roundRect(X(w, bx, bw * fill), 470, Math.max(30, bw * fill), 30, 15);
        c.fill();
      }
      text(c, w, `${Math.round(pct * e)}%`, w - 64, 548, font(800, 30), r.pass ? '#30d158' : '#ff453a', 'right');
      text(c, w, r.pass ? 'Quota met' : `${money(short)} short`, 64, 548, font(600, 26), '#8e8e93');
      stamp(c, r.pass ? 'QUOTA MET' : 'MISSED', r.pass ? '#30d158' : '#ff453a', w - 330, 290, (k - 0.72) / 0.28);
    },
  });

  const lbLine = !top || top.today <= 0
    ? 'Employee of the day: nobody. Not one of you made a single dollar. Remarkable.'
    : !worst
      ? `Employee of the day is ${first(top.name)}, with ${money(top.today)}. Mostly because there was nobody else. Congratulations on winning a race of one.`
      : `Employee of the day: ${first(top.name)}, with ${money(top.today)}. And at the bottom, ${first(worst.name)}, with ${money(worst.today)}. ${first(worst.name)}, we'll talk.`;
  slides.push({
    shot: 'slide',
    anim: 1.4,
    line: lbLine,
    draw: (c, w, hh, k) => {
      frame(c, w, hh, "Today's leaderboard");
      const rows = ranked.slice(0, 6);
      const max = Math.max(1, ...rows.map((x) => x.today));
      const rowH = rows.length > 4 ? 66 : 80;
      rows.forEach((p, i) => {
        const e = ease(k * 1.6 - i * 0.12);
        if (e <= 0) return;
        const y = 220 + i * rowH;
        c.globalAlpha = e;
        const dx = (1 - e) * 40;
        c.save();
        c.translate(dx, 0);
        if (i === 0) {
          c.fillStyle = 'rgba(255,214,10,0.08)';
          c.beginPath();
          c.roundRect(48, y - 6, w - 96, rowH - 8, 16);
          c.fill();
        }
        text(c, w, String(i + 1), 76, y + rowH / 2 + 8, font(900, 28), i === 0 ? '#ffd60a' : '#636366');
        avatar(c, p.id, X(w, 140), y + rowH / 2 - 4, rowH / 2 - 10);
        const nameX = 190;
        text(c, w, p.name, nameX, y + rowH / 2 + 2, font(700, 30), '#ffffff');
        c.font = font(700, 30);
        const nw = c.measureText(p.name).width;
        const barW = (w - 560) * (p.today / max) * e;
        c.fillStyle = i === 0 ? '#ffd60a' : 'rgba(255,255,255,0.25)';
        c.beginPath();
        c.roundRect(X(w, nameX, Math.max(6, barW)), y + rowH / 2 + 14, Math.max(6, barW), 6, 3);
        c.fill();
        text(c, w, money(p.today), w - 76, y + rowH / 2 + 8, font(800, 32), i === 0 ? '#ffd60a' : '#ffffff', 'right');
        const badgeX = nameX + nw + 18;
        if (i === 0 && p.today > 0) pillAt(c, w, badgeX, y + rowH / 2 - 24, 'EMPLOYEE OF THE DAY', '#ffd60a', '#1d1d1f', 15);
        if (worst && p === worst && worst !== top && worst.today < top.today) pillAt(c, w, badgeX, y + rowH / 2 - 24, 'NEEDS IMPROVEMENT', '#ff453a', '#ffffff', 15);
        c.restore();
        c.globalAlpha = 1;
      });
    },
  });

  const m0 = moments[0];
  slides.push({
    shot: 'slide',
    anim: 1.3,
    line: m0
      ? `Top moments today. Number one: ${first(m0.name)} took ${money(m0.amount)} ${SOURCE_SAY[m0.source] || ''}. That's the energy I pay for.`
      : "Top moments of the day. There aren't any. I made a slide for nothing.",
    draw: (c, w, hh, k) => {
      frame(c, w, hh, 'Top 3 moments');
      if (!moments.length) {
        c.globalAlpha = ease(k);
        text(c, w, 'No highlights today.', w / 2, 380, font(800, 52), '#ffffff', 'center');
        text(c, w, 'Not one.', w / 2, 440, font(500, 30), '#8e8e93', 'center');
        c.globalAlpha = 1;
        return;
      }
      const n = Math.min(3, moments.length);
      const gap = 28;
      const cw = (w - 128 - gap * 2) / 3;
      moments.slice(0, 3).forEach((m, i) => {
        const e = ease(k * 1.5 - i * 0.15);
        if (e <= 0) return;
        const x = X(w, 64 + i * (cw + gap), cw);
        const y = 220 + (1 - e) * 40;
        c.globalAlpha = e;
        c.fillStyle = i === 0 ? 'rgba(48,209,88,0.1)' : 'rgba(255,255,255,0.05)';
        c.strokeStyle = i === 0 ? 'rgba(48,209,88,0.5)' : 'rgba(255,255,255,0.08)';
        c.lineWidth = 2;
        c.beginPath();
        c.roundRect(x, y, cw, 360, 24);
        c.fill();
        c.stroke();
        c.textAlign = 'left';
        c.font = font(900, 110);
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillText(`${i + 1}`, x + cw - 82, y + 112);
        c.font = font(900, 58);
        c.fillStyle = '#30d158';
        c.fillText(money(m.amount), x + 28, y + 92);
        avatar(c, m.id, x + 52, y + 158, 24);
        c.font = font(700, 26);
        c.fillStyle = '#ffffff';
        c.fillText(first(m.name), x + 88, y + 167);
        const src = SOURCE[m.source];
        if (src) pill(c, x + 28, y + 202, src, 'rgba(10,132,255,0.2)', '#64b5ff', 15);
        c.font = font(500, 21);
        c.fillStyle = '#8e8e93';
        c.textAlign = 'left';
        wrap(c, m.note, cw - 56).slice(0, 3).forEach((ln, j) => c.fillText(ln, x + 28, y + 276 + j * 28));
        c.globalAlpha = 1;
      });
      void n;
    },
  });

  if (quotes.length) {
    const q0 = quotes[0];
    slides.push({
      shot: 'slide',
      anim: 1.3,
      line: `Call analysis. ${first(q0.name)} said, quote, "${q0.text}". And ${first(q0.to)} bought it. Write that down.`,
      draw: (c, w, hh, k) => {
        frame(c, w, hh, 'Call analysis');
        const solo = quotes.length === 1;
        let y = solo ? 290 : 236;
        quotes.slice(0, 3).forEach((q, i) => {
          const e = ease(k * 1.5 - i * 0.18);
          if (e <= 0) return;
          c.globalAlpha = e;
          text(c, w, '“', 60, y + 58, font(900, 96), '#0a84ff');
          const fs = solo ? 46 : i === 0 ? 34 : 28;
          const lh = Math.round(fs * 1.25);
          c.font = font(600, fs);
          const lines = wrap(c, q.text, w - 260).slice(0, solo ? 3 : 2);
          lines.forEach((ln, j) => text(c, w, ln, 130, y + 34 + j * lh, font(600, fs), '#ffffff'));
          const by = y + 34 + lines.length * lh + 6;
          text(c, w, `${q.name} to ${q.to}  ·  +${q.gain} trust`, 130, by, font(600, 21), '#8e8e93');
          y = by + 40;
          c.globalAlpha = 1;
        });
      },
    });
  }

  if (r.pass) {
    const rise = Math.round((r.nextQuota / Math.max(1, r.quota) - 1) * 100);
    const list = r.next.join(' and ');
    slides.push({
      shot: 'slide',
      anim: 1.2,
      line: `Tomorrow is day ${r.day + 1}. The quota goes up to ${money(r.nextQuota)}.${r.next.length ? ` You also get ${list}. Don't break it.` : ''} Now get out of my office.`,
      draw: (c, w, hh, k) => {
        frame(c, w, hh, 'Tomorrow');
        const e = ease(k);
        c.globalAlpha = e;
        text(c, w, `Day ${r.day + 1}`, 60, 330, font(900, 110), '#ffffff');
        text(c, w, 'QUOTA', 64, 400, font(800, 20), '#8e8e93');
        text(c, w, money(r.nextQuota), 64, 462, font(900, 64), '#ffffff');
        c.font = font(900, 64);
        const qw = c.measureText(money(r.nextQuota)).width;
        if (rise > 0) pillAt(c, w, 64 + qw + 20, 420, `+${rise}%`, 'rgba(255,69,58,0.18)', '#ff6961', 20);
        text(c, w, 'NEW ON YOUR DESK', 64, 540, font(800, 20), '#8e8e93');
        if (r.next.length) {
          let x = 64;
          for (const n of r.next) {
            c.font = font(800, 22);
            const pw = c.measureText(n).width + 22 * 1.4;
            pill(c, X(w, x, pw), 562, n, 'rgba(10,132,255,0.2)', '#64b5ff', 22);
            x += pw + 12;
          }
        } else text(c, w, 'Nothing new. Earn it.', 64, 596, font(600, 28), '#ffffff');
        c.globalAlpha = 1;
      },
    });
  } else {
    slides.push({
      shot: 'slide',
      anim: 2.2,
      stamp: 0.75,
      line: `So. You worked ${r.day} day${r.day === 1 ? '' : 's'} and brought in ${money(r.total ?? r.team)} in total. That's not a career, that's a rounding error. You're fired. All of you. Security will walk you out.`,
      draw: (c, w, hh, k) => {
        frame(c, w, hh, '');
        c.fillStyle = '#ff453a';
        c.fillRect(0, 100, w, 6);
        text(c, w, 'TERMINATION REPORT', 64, 170, font(900, 54), '#ff453a');
        const e = ease(k * 1.4);
        c.globalAlpha = e;
        const rows: [string, string][] = [
          ['Days worked', String(r.day)],
          ['Total haul', money(r.total ?? r.team)],
          ['Last day', `${money(r.team)} / ${money(r.quota)}`],
          ['Top earner', runCrew[0] ? `${first(runCrew[0].name)} · ${money(runCrew[0].total)}` : '—'],
        ];
        rows.forEach(([a, b], i) => {
          const y = 250 + i * 76;
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fillRect(X(w, 64, 560), y + 26, 560, 1);
          text(c, w, a, 64, y, font(600, 24), '#8e8e93');
          text(c, w, b, 624, y, font(800, 30), '#ffffff', 'right');
        });
        text(c, w, 'FINAL RANKING', 700, 236, font(800, 20), '#8e8e93');
        runCrew.slice(0, 5).forEach((p, i) => {
          const y = 270 + i * 66;
          avatar(c, p.id, X(w, 724), y + 18, 22);
          text(c, w, `${i + 1}. ${p.name}`, 760, y + 28, font(700, 26), '#ffffff');
          text(c, w, money(p.total), w - 64, y + 28, font(800, 26), '#8e8e93', 'right');
        });
        c.globalAlpha = 1;
        stamp(c, 'FIRED', '#ff453a', w * 0.72, 300 + Math.min(5, runCrew.length) * 66 + 70, (k - 0.75) / 0.25);
      },
    });
  }
  total = slides.length;

  const bossFace = h('div.mtg-face', { innerHTML: portrait(world.boss.look, 'angry') });
  const caption = h('p.mtg-line', { dir: 'auto' });
  const pips = h('div.mtg-pips', null, ...slides.map(() => h('i')));
  const skipBtn = h('button.mtg-skip', { onclick: () => next(true) }, 'Skip', h('span', { innerHTML: icon('arrowRight') }));
  const actions = h('div.mtg-actions');
  const fade = h('div.mtg-fade');
  const el = h(
    'div.mtg',
    { class: r.pass ? 'pass' : 'fail' },
    fade,
    h('div.mtg-top', null, h('span.mtg-rec', null, h('i'), 'PERFORMANCE REVIEW'), h('span.mtg-day', null, `Day ${r.day}`), h('span.spacer'), skipBtn),
    h('div.mtg-cap', null, h('div.mtg-who', null, bossFace, h('div', null, h('b', null, 'The Boss'), h('small', null, 'Regional Manager'))), caption, pips),
    actions,
  );
  parent.append(el);

  const drawActions = (done: boolean) => {
    actions.replaceChildren();
    actions.classList.toggle('show', done);
    if (!done) return;
    const host = crew.isHost;
    const hostName = crew.players.find((p) => p.id === crew.host)?.name || 'the host';
    actions.append(
      h('button.mtg-btn.ghost', { onclick: onQuit }, 'Main menu'),
      host
        ? r.pass
          ? h('button.mtg-btn.primary', { onclick: () => send({ t: 'continue' }) }, `Start day ${r.day + 1}`, h('span', { innerHTML: icon('arrowRight') }))
          : h('button.mtg-btn.danger', { onclick: () => send({ t: 'restart' }) }, 'New run', h('span', { innerHTML: icon('refresh') }))
        : h('span.mtg-wait', null, h('span.spin'), `Waiting for ${first(hostName)}…`),
    );
  };
  drawActions(false);

  let stopped = false;
  let idx = -1;
  let shownAt = 0;
  let stamped = false;
  let settled = 0;
  const voice = bossVoice();
  const STYLE = 'A gruff, sarcastic, tired call-center boss giving the end-of-day performance review to his team in a meeting room. Deadpan, impatient, dry, a little theatrical.';
  const audioP: (Promise<AudioBuffer | null> | null)[] = slides.map(() => null);
  const pre = (i: number) => {
    if (i < slides.length && !audioP[i]) audioP[i] = fetchVoice(slides[i].line, voice, STYLE);
  };
  pre(0);
  pre(1);

  const board = world.office.boards.bossScreen;
  const paint = () => {
    if (stopped) return;
    const s = slides[idx];
    if (!s) return;
    const k = Math.min(1, (performance.now() - shownAt) / 1000 / s.anim);
    if (s.stamp !== undefined && !stamped && k >= s.stamp) {
      stamped = true;
      sfx.stamp();
    }
    if (k < 1) board.draw((c, w, hh) => s.draw(c, w, hh, k));
    else if (settled < 3) {
      settled++;
      board.draw((c, w, hh) => s.draw(c, w, hh, 1));
    }
  };

  let typer = 0;
  const typeLine = (line: string, secs: number) => {
    clearInterval(typer);
    const t0 = performance.now();
    caption.textContent = '';
    typer = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / 1000 / Math.max(0.6, secs * 0.92));
      caption.textContent = line.slice(0, Math.ceil(p * line.length));
      if (p >= 1) clearInterval(typer);
    }, 30);
  };
  const talking = (on: boolean) => {
    if (world.meeting) world.meeting.bossTalking = on;
    bossFace.classList.toggle('talking', on);
  };

  const show = async (i: number) => {
    if (stopped) return;
    idx = i;
    slideNo = i;
    shownAt = performance.now();
    stamped = false;
    settled = 0;
    pre(i + 1);
    pre(i + 2);
    const s = slides[i];
    pips.querySelectorAll('i').forEach((p, j) => p.classList.toggle('on', j <= i));
    world.meetingShot(s.shot);
    if (world.meeting) world.meeting.glance = 1.3;
    sfx.slide();
    caption.textContent = '';
    caption.classList.remove('done');
    const buf = await Promise.race([audioP[i]!, wait(7000).then(() => null)]);
    if (stopped || idx !== i) return;
    const secs = buf ? buf.duration / Math.max(0.85, Math.min(1.2, settings.ttsRate)) : Math.max(2.8, s.line.length * 0.058);
    typeLine(s.line, secs);
    if (buf) await playVoice(buf, talking);
    else if (settings.tts) await speak(s.line, { gender: 'm', pitch: 0.75, rate: 0.95, seed: 'the-boss', lang: 'en' }, talking);
    else {
      talking(true);
      await wait(secs * 1000);
      talking(false);
    }
    talking(false);
    if (stopped || idx !== i) return;
    caption.textContent = s.line;
    await wait(1100);
    if (stopped || idx !== i) return;
    next(false);
  };
  const next = (skip: boolean) => {
    if (stopped) return;
    if (skip) {
      shutUp();
      talking(false);
    }
    if (idx + 1 < slides.length) void show(idx + 1);
    else finish();
  };
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    skipBtn.style.visibility = 'hidden';
    clearInterval(typer);
    caption.textContent = slides[slides.length - 1].line;
    caption.classList.add('done');
    world.meetingShot('wide', 1.6);
    drawActions(true);
    if (r.pass) sfx.levelUp();
    else sfx.fired();
  };

  world.slidesOn = true;
  requestAnimationFrame(() => fade.classList.add('in'));
  setTimeout(() => {
    if (stopped) return;
    const order = crew.players.length ? crew.players.map((p) => p.id) : [crew.me];
    world.startMeeting(order, crew.me);
    board.draw((c, w, hh) => slides[0].draw(c, w, hh, 0));
    fade.classList.remove('in');
    fade.classList.add('out');
    world.meetingPaint = paint;
    setTimeout(() => show(0), 700);
  }, 650);

  const stop = () => {
    stopped = true;
    if (world.meetingPaint === paint) world.meetingPaint = null;
    clearInterval(typer);
    shutUp();
    talking(false);
    el.remove();
  };
  return { el, stop };
}
