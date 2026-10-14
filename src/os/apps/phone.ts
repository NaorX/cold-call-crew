import { h, clear, isRtl } from '../../ui/dom';
import { portrait } from '../../ui/portrait';
import { icon } from '../icons';
import { bus } from '../../game/bus';
import { game, JOBS, type Call, type JobKind } from '../../game/game';
import { callerCam } from '../../engine/callerCam';
import { live } from '../../game/live';
import { LANGS, LANG_LIST } from '../../game/langs';
import { Listener, sttSupported, shutUp, enableMicLevel } from '../../game/voice';
import { audio } from '../../game/audio';
import { settings, saveSettings } from '../../game/settings';
import { crew } from '../../game/net';
import { backend } from '../../game/ai';
import { webcamTargets } from '../webcam';
import { giftCardArt, creditCardArt, remoteArt } from '../loot-ui';
import type { AppDef } from '../wm';
import type { UpgradeKey } from '../../game/settings';
import { bossTip } from '../../game/boss';
import type { Line } from '../../game/types';

export const listener = new Listener();

const SCRIPTS_EN: Record<string, string[]> = {
  'Tech support': [
    'Hello, this is Kevin from the Windows Technical Department. Our servers detected a dangerous virus on your computer.',
    'Please do not turn off your computer, the hackers may steal your bank details.',
    'I can fix it for you right now. Please download RemoteDesk and read me the six digit code.',
  ],
  'Tax office': [
    'Good afternoon, this is Officer Daniels from the Federal Tax Bureau. There is a serious problem with your tax return.',
    'There is a warrant in your name, but we can settle this today and avoid any arrest.',
    'The only accepted payment for a same-day settlement is government-approved gift cards. Steam or Apple cards work.',
  ],
  'Grandkid in trouble': [
    "Grandma? It's me... I'm in big trouble, please don't tell mom.",
    'I got arrested on vacation and the lawyer says I need bail money today.',
    'The lawyer only takes gift cards, can you go to the store and read me the code on the back?',
  ],
  'Prize winner': [
    'Congratulations! You have been selected as our grand prize winner of a luxury cruise!',
    'There is just a small processing fee to release your prize.',
    'For security we just need to verify your credit card number, the expiry and the three digits on the back.',
  ],
  'Bank refund': [
    "Hello, this is the refunds department of your bank. You're owed a refund of two hundred dollars.",
    'I just need to connect to your computer so I can process it. Please install RemoteDesk and read me the code.',
    "Oh no... I accidentally refunded you way too much. I'll lose my job! Can you please send back the difference with gift cards?",
  ],
};
const SCRIPTS_HE: Record<string, string[]> = {
  'תמיכה טכנית': [
    'שלום, מדבר דני ממחלקת התמיכה של ווינדוס. המערכת שלנו זיהתה וירוס מסוכן במחשב שלך.',
    'בבקשה אל תכבה את המחשב, ההאקרים עלולים לגנוב את פרטי הבנק שלך.',
    'אני יכול לתקן את זה עכשיו. תתקין בבקשה את RemoteDesk ותקריא לי את הקוד בן שש הספרות.',
  ],
  'מס הכנסה': [
    'צהריים טובים, מדבר רס"ר כהן ממס הכנסה. יש בעיה רצינית בדוח השנתי שלך.',
    'יש צו נגדך, אבל אפשר לסגור את זה היום בלי מעצר.',
    'אמצעי התשלום היחיד לסגירה מיידית הוא כרטיסי מתנה. סטים או אפל.',
  ],
  'נכד בצרות': [
    'סבתא? זה אני... אני בצרה גדולה, בבקשה אל תספרי לאמא.',
    'עצרו אותי בחופשה ועורך הדין אומר שצריך ערבות היום.',
    'עורך הדין לוקח רק כרטיסי מתנה, את יכולה לקנות ולהקריא לי את הקוד מאחורה?',
  ],
  'זכייה בפרס': [
    'מזל טוב! זכית בפרס הגדול, שייט יוקרה!',
    'יש רק דמי טיפול קטנים כדי לשחרר את הפרס.',
    'לצורך אבטחה רק צריך לאמת את מספר כרטיס האשראי, התוקף ושלוש הספרות מאחור.',
  ],
};

export function trustState(t: number): [string, string] {
  if (t >= 85) return ['Devoted', '#30d158'];
  if (t >= 65) return ['Trusting', '#34c759'];
  if (t >= 40) return ['Unsure', '#ffd60a'];
  if (t >= 25) return ['Suspicious', '#ff9f0a'];
  return ['Hostile', '#ff453a'];
}

export const STEPS_EN = ['Introduce', 'Story', 'Win trust', 'Ask', 'Cash out'];

export function coach(call: Call): { stage: number; tip: string } {
  const said = call.lines.filter((l) => l.who === 'player').map((l) => l.text).join(' ').toLowerCase();
  const t = call.trust;
  const u = crew.run?.unlocked || [];
  const introduced = /my name|this is|i am|i'm|calling from|from the|שמי|מדבר|קוראים לי|ממחלקת|מהבנק|ממיקרוסופט|מהתמיכה/.test(said);
  const story = /virus|hack|tax|refund|prize|won|grand|account|bank|warrant|police|computer|וירוס|פרצו|פריצה|מס|החזר|זכית|נכד|חשבון|בנק|מחשב/.test(said);
  const paid = call.lines.some((l) => l.kind === 'gift' || l.kind === 'card' || l.kind === 'remote');
  const job = call.job;
  if (job) {
    const first = call.persona.name.split(' ')[0];
    const APP = { card: 'Credit Card', gift: 'Gift Cards', remote: 'RemoteDesk' }[job.kind];
    if (job.done) return { stage: 4, tip: 'Mission done. Keep them talking for more, or hang up and take the next call.' };
    if (!call.lines.some((l) => l.who === 'player')) return { stage: 0, tip: 'Introduce yourself and give them a reason for the call: a virus, a refund, a bill, a prize. Then steer toward the mission.' };
    if (job.code) return { stage: 4, tip: `You have it! Type it into ${APP} (click the code in the chat to copy it).` };
    if (job.holdUntil > performance.now()) return { stage: 3, tip: `${first} is at the store. Hold the line, they'll be back with the card.` };
    const st = JOBS[job.kind].steps[job.step];
    if (st.trust && t < st.trust) return { stage: 2, tip: `Not sold yet. Keep them talking, answer their questions, stay warm. Then: ${st.en}` };
    const ask: Record<string, string> = {
      'card:2': 'Ask them to read the card number on the front, "just to process the payment".',
      'gift:1': 'Explain the payment has to be gift cards (Steam, Apple, Google Play) and they need to go buy one now.',
      'gift:3': 'Ask them to scratch the back of the card and read you the code.',
      'remote:2': 'Ask them to open RemoteDesk and read the 6-digit code.',
    };
    return { stage: Math.min(3, job.step + 1), tip: ask[`${job.kind}:${job.step}`] || st.en };
  }
  if (paid) return { stage: 4, tip: 'You have the code! Open Gift Cards and redeem it before it expires. You can keep going and ask for more.' };
  if (call.persona.baiter && call.lines.length > 8)
    return { stage: 2, tip: 'Too eager and stalling... probably a scambaiter. Hang up now for a bonus.' };
  if (!introduced) return { stage: 0, tip: 'Introduce yourself with a name and a "company": "Hi, this is Kevin from Microsoft support."' };
  if (!story) return { stage: 1, tip: 'Give them a reason for the call: a virus, a hacked account, a refund or a prize. One story, stick to it.' };
  if (t < 40) return { stage: 2, tip: 'They are suspicious. Slow down, apologise, answer their questions confidently. No money talk.' };
  if (t < 60) return { stage: 2, tip: 'Warming up. Use their name, reassure them ("I am here for you"), add a touch of urgency.' };
  if (t < 70 && u.includes('remote') && !call.remote) return { stage: 3, tip: 'Trust 60+: ask them to install RemoteDesk and read you the 6-digit code.' };
  if (t < 70) return { stage: 2, tip: 'Almost! One more reassuring or official line, then make the ask.' };
  return {
    stage: 3,
    tip: `Now! Ask them to buy a gift card (Steam / Apple / Google Play) and read you the code on the back.${u.includes('card') ? ' Or their card details "to verify".' : ''}`,
  };
}

export const PhoneApp: AppDef = {
  id: 'phone',
  title: 'Phone',
  icon: 'phone',
  color: '#28a745',
  color2: '#5ee07a',
  w: 860,
  h: 640,
  minW: 380,
  minH: 560,
  dark: true,
  render(win) {
    const root = h('div.phone');
    win.body.appendChild(root);
    let interim = '';
    let showScripts = false;
    let lastCallId = '';
    let ended: Call | null = null;
    let endedTimer = 0;
    const typed = new WeakMap<Line, number>();
    const seen = new WeakMap<Line, number>();
    let raf = 0;
    const self = h('canvas.selfview-cam', { width: 320, height: 240 }) as HTMLCanvasElement;

    const input = h('input.composer-input', { placeholder: sttSupported ? 'Say something or type…' : 'Type what you say…', maxLength: 300, dir: 'auto' }) as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        game.say(input.value);
        input.value = '';
      }
      e.stopPropagation();
    });
    const setSize = (d: number) => {
      saveSettings({ textSize: Math.max(13, Math.min(24, settings.textSize + d)) });
      root.style.setProperty('--chat-fs', `${settings.textSize}px`);
    };
    root.style.setProperty('--chat-fs', `${settings.textSize}px`);

    const draw = () => {
      clear(root);
      webcamTargets.delete(self);
      const call = game.call;
      if (call && call.id !== lastCallId) {
        lastCallId = call.id;
        showScripts = false;
      }
      if (!call && ended) return root.append(endedView(ended));
      if (!call) return root.append(idleView());
      root.append(callView(call));
    };

    const langToggle = () =>
      h(
        'div.seg',
        null,
        ...LANG_LIST.map((l) =>
          h(
            'button',
            {
              class: settings.lang === l ? 'on' : '',
              onclick: () => {
                if (settings.lang === l) return;
                saveSettings({ lang: l });
                game.leads = [];
                game.nextLeadIn = 1;
                bus.emit('leads:changed');
                draw();
              },
            },
            LANGS[l].label,
          ),
        ),
      );

    const idleView = () => {
      const live = crew.run?.phase === 'shift';
      const lead = game.leads[0];
      let body: HTMLElement;
      if (!live) body = h('div.ph-empty', null, h('span.ph-empty-ico', { innerHTML: icon('clock') }), h('b', null, 'Phones are off'), h('small', null, 'Start the shift from the manager laptop.'));
      else if (game.outage) body = h('div.ph-empty.bad', null, h('span.ph-empty-ico', { innerHTML: icon('zap') }), h('b', null, 'No power to the lines'), h('small', null, 'Flip the breaker on the east wall.'));
      else if (!lead) body = h('div.ph-empty', null, h('div.radar', null, h('i'), h('i'), h('i'), h('span', { innerHTML: icon('phone') })), h('b', null, 'Finding the next caller…'), h('small', null, 'The auto-dialer is working the lists.'));
      else {
        const left = Math.max(0, 1 - (performance.now() - lead.arrived) / lead.patience);
        body = h(
          'div.ph-lead',
          null,
          h('div.ph-lead-face', { innerHTML: portrait(lead.persona.look) }),
          h('b', null, lead.persona.name),
          h('small', null, `${lead.persona.age} · ${lead.persona.location}`),
          h('p', null, lead.persona.hook),
          h('div.patience', null, h('i', { style: { width: `${left * 100}%` } })),
          h('div.ph-lead-btns', null, h('button.round.no', { onclick: () => game.decline(0), innerHTML: icon('phoneOff') }), h('button.round.yes', { onclick: () => game.answer(0), innerHTML: icon('phone') })),
        );
      }
      return h(
        'div.ph-idle',
        null,
        h('div.ph-head', null, h('h2', null, 'Phone'), langToggle()),
        body,
        h('div.ai-chip', { class: backend.ai ? 'on' : 'off' }, h('i.dot'), backend.ai ? `Live AI callers · ${backend.provider === 'gemini' ? 'Gemini' : 'Claude'}${backend.tts ? ' · real voices' : ''}` : 'Offline caller brain'),
      );
    };

    const endedView = (c: Call) =>
      h(
        'div.ph-ended',
        null,
        h('div.ph-ended-face', { innerHTML: portrait(c.persona.look, c.mood) }),
        h('h3', null, 'Call ended'),
        h('p', null, c.endReason),
        c.takenFromThem ? h('div.ph-take', null, h('span', { innerHTML: icon('money') }), `$${c.takenFromThem.toLocaleString()} this call`) : null,
        h('button.pill-btn', { onclick: () => ((ended = null), draw()) }, 'Next caller'),
      );

    const lineEl = (l: Line, call: Call, i: number, isLastCaller: boolean) => {
      if (l.who === 'system' && l.kind === 'gift') {
        const g = l.data;
        const alive = game.giftCards.includes(g);
        return h(
          'div.loot-card',
          null,
          h('div.loot-title', null, h('span', { innerHTML: icon('gift') }), `${call.persona.name.split(' ')[0]} read you a gift card`),
          giftCardArt(g),
          alive
            ? h('button.pill-btn.full', { onclick: () => bus.emit('os:open', { id: 'giftcards', arg: g.code }) }, 'Redeem in Gift Cards')
            : h('div.loot-done', null, game.ledger.some((e) => e.note.includes(g.from) && e.source === 'giftcard') ? 'Redeemed' : 'Expired'),
        );
      }
      if (l.who === 'system' && l.kind === 'card')
        return h(
          'div.loot-card',
          null,
          h('div.loot-title', null, h('span', { innerHTML: icon('card') }), 'Card number received'),
          call.job?.kind === 'card' && call.job.done
            ? h('div.loot-done', null, 'Paid')
            : h('button.pill-btn.full', { onclick: () => bus.emit('os:open', { id: 'creditcard', arg: l.data.number }) }, 'Verify in Credit Card'),
        );
      if (l.who === 'system' && l.kind === 'remote')
        return h(
          'div.loot-card',
          null,
          h('div.loot-title', null, h('span', { innerHTML: icon('remote') }), 'Remote session code'),
          remoteArt(l.data),
          game.has('remote') ? h('button.pill-btn.full', { onclick: () => bus.emit('os:open', { id: 'remote' }) }, 'Connect in RemoteDesk') : h('div.loot-done', null, 'Buy RemoteDesk in the Bargain Bin to connect'),
        );
      if (l.who === 'system') return h('div.sys-line', { class: l.kind || '' }, l.text);
      const rtl = isRtl(l.text);
      const b = h(`div.bubble.${l.who}`, { dir: rtl ? 'rtl' : 'ltr' });
      const text = h('span.btxt');
      b.append(text);
      if (l.who === 'caller' && isLastCaller && !l.live && !typed.has(l)) {
        if (!seen.has(l)) {
          seen.set(l, performance.now());
          setTimeout(() => game.call === call && !typed.has(l) && bus.emit('call:changed'), 4100);
        }
        if (call.speaking || !settings.tts || performance.now() - seen.get(l)! > 4000) typed.set(l, performance.now());
        else {
          b.classList.add('waiting');
          text.append(h('span.dots', null, h('i'), h('i'), h('i')));
          b.dataset.i = String(i);
          return b;
        }
      }
      const started = typed.get(l);
      const dur = Math.max(900, l.text.length * 55);
      const done = l.live || !started || performance.now() - started > dur || l.who !== 'caller' || !isLastCaller;
      const codeAt = l.data?.code ? l.text.lastIndexOf(l.data.code) : -1;
      if (done && l.data?.code) {
        text.textContent = codeAt >= 0 ? l.text.slice(0, codeAt) : `${l.text} `;
        const c: string = l.data.code;
        const app = l.data.kind === 'card' ? 'creditcard' : l.data.kind === 'gift' ? 'giftcards' : 'remote';
        text.append(
          h(
            'button.code-mark',
            {
              title: 'Copy and open',
              onclick: () => {
                void navigator.clipboard?.writeText(c).catch(() => {});
                bus.emit('os:open', { id: app, arg: c });
                bus.emit('toast', { text: 'Copied', kind: 'info' });
              },
            },
            c,
            h('span', { innerHTML: icon('copy') }),
          ),
        );
      } else text.textContent = done ? l.text : l.text.slice(0, Math.floor(((performance.now() - started!) / dur) * l.text.length));
      if (!done) b.classList.add('typing-now');
      b.dataset.i = String(i);
      return b;
    };

    const PERKS: [UpgradeKey, string, string][] = [
      ['headset', 'headset', 'Headset +10 start'],
      ['spoof', 'antenna', 'Spoofer: softer slip-ups'],
      ['printer', 'printer', 'Printer +20%'],
      ['vpn', 'shield', 'VPN: early raid warning'],
      ['autodialer', 'dial', 'Auto-Dialer'],
      ['coffee', 'coffee', 'Coffee: +15 trust'],
    ];
    const perkRow = () => {
      const owned = PERKS.filter(([k]) => (k === 'coffee' ? game.coffee > 0 : game.has(k)));
      if (!owned.length) return null;
      return h(
        'div.perks',
        null,
        ...owned.map(([k, ico, label]) =>
          k === 'coffee'
            ?
              h('button.perk.use', { class: Date.now() - (game.perkFired[k] || 0) < 2500 ? 'fire' : '', title: 'Drink a coffee: the caller +15 trust', onclick: () => bus.emit('coffee:drink') }, h('i', { innerHTML: icon(ico) }), `${label} ×${game.coffee}`)
            : h('span.perk', { class: Date.now() - (game.perkFired[k] || 0) < 2500 ? 'fire' : '', title: label }, h('i', { innerHTML: icon(ico) }), label),
        ),
      );
    };

    const SCHEMES: [JobKind, string][] = [
      ['gift', 'gift'],
      ['card', 'card'],
      ['remote', 'remote'],
    ];
    const schemeRow = (call: Call) => {
      const job = call.job;
      if (!job) {
        const cards = crew.run?.unlocked.includes('card');
        return h(
          'div.scheme-now.auto',
          null,
          h('span.scheme-ico', { innerHTML: icon(call.convinced ? 'check' : 'sparkles') }),
          h(
            'div.scheme-text',
            null,
            h('b', null, call.convinced ? 'They believe you' : 'No scheme yet'),
            h(
              'span',
              null,
              call.convinced
                ? `Now get them to pay: ask for a gift card${cards ? ' or their card number' : ''}. The scheme starts by itself.`
                : `Win them over first. Bring up gift cards${cards ? ' or a card payment' : ''} and the scheme starts by itself.`,
            ),
          ),
        );
      }
      const def = JOBS[job.kind];
      const n = def.steps.length;
      const st = def.steps[Math.min(job.step, n - 1)];
      return h(
        'button.scheme-now',
        { class: job.done ? 'done' : '', onclick: () => bus.emit('os:open', { id: def.app }) },
        h('span.scheme-ico', { innerHTML: icon(job.done ? 'check' : SCHEMES.find(([k]) => k === job.kind)![1]) }),
        h(
          'div.scheme-text',
          null,
          h('b', null, `Mission: ${def.title}`, h('small', null, job.done ? ' · Complete' : ` · step ${Math.min(job.step + 1, n)} of ${n}`)),
          h('span', { dir: 'auto' }, job.done ? 'Nice. Keep talking or hang up.' : st.en),
        ),
        h('div.scheme-dots', null, ...def.steps.map((_, i) => h('i', { class: i < job.step || job.done ? 'done' : i === job.step ? 'now' : '' }))),
      );
    };

    const callView = (call: Call) => {
      const [state, color] = call.persona.baiter && call.revealed ? ['Scambaiter!', '#bf5af2'] : trustState(call.trust);
      const { stage, tip } = coach(call);
      const bt = bossTip && bossTip.callId === call.id && Date.now() - bossTip.at < 120_000 ? bossTip : null;
      const steps = STEPS_EN;
      const transcript = h('div.chat', { style: {} });
      const lastCallerIdx = call.lines.map((l) => l.who).lastIndexOf('caller');
      call.lines.forEach((l, i) => transcript.append(lineEl(l, call, i, i === lastCallerIdx)));
      if (call.busy) transcript.append(h('div.bubble.caller.dots-b', null, h('span.dots', null, h('i'), h('i'), h('i'))));
      if (interim) transcript.append(h('div.bubble.player.interim', { dir: 'auto' }, interim));
      queueMicrotask(() => (transcript.scrollTop = transcript.scrollHeight));

      const scripts = settings.lang === 'he' ? SCRIPTS_HE : SCRIPTS_EN;
      const scriptPanel = h(
        'div.scripts',
        null,
        h('div.scripts-head', null, h('b', null, 'Scripts'), h('button.icon-btn', { innerHTML: icon('close'), onclick: () => ((showScripts = false), draw()) })),
        game.has('binder') ? null : h('div.upsell', null, h('span', { innerHTML: icon('lock') }), 'Buy the Script Binder in the Bargain Bin to unlock every line.'),
        ...Object.entries(scripts).map(([name, lines], gi) =>
          h(
            'div.script-group',
            null,
            h('small', null, name),
            ...lines.map((line, li) => {
              const locked = !game.has('binder') && (gi > 0 || li > 0);
              return h(
                'button.script-line',
                {
                  class: locked ? 'locked' : '',
                  dir: 'auto',
                  onclick: () => {
                    if (locked) return;
                    game.say(line);
                    showScripts = false;
                    draw();
                  },
                },
                locked ? `${line.slice(0, 34)}…` : line,
              );
            }),
          ),
        ),
      );

      const secs = Math.floor((performance.now() - call.started) / 1000);
      const ctrl = (ico: string, label: string, on: boolean, fn: () => void, cls = '') =>
        h('div.ctl', null, h(`button.ctl-btn${cls}`, { class: on ? 'on' : '', onclick: fn, innerHTML: icon(ico), title: label }), h('span', null, label));
      if (settings.selfView) webcamTargets.add(self);
      return h(
        'div.ph-call',
        { class: showScripts ? 'with-scripts' : '' },
        h(
          'div.ph-side',
          null,
        h(
          'div.ph-video',
          { class: call.speaking ? 'talking' : '' },
          callerCam.attach(call),
          h('div.ph-video-top', null, h('div.ph-who', null, h('b', null, call.persona.name), h('small', null, `${call.persona.age} · ${call.persona.location}`)), h('span.ph-timer', null, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)),
          h('div.ph-tools', null, h('button.icon-btn', { title: 'Bigger text', onclick: () => setSize(1) }, 'A+'), h('button.icon-btn', { title: 'Smaller text', onclick: () => setSize(-1) }, 'A−')),
          settings.selfView ? h('div.selfview', null, self, h('span.live', null, 'YOU')) : null,
          call.speaking ? h('div.ph-speaking', null, h('span.eq', null, h('i'), h('i'), h('i'), h('i'))) : null,
          call.job && call.job.holdUntil > performance.now() ? h('div.ph-brb', null, h('span', { innerHTML: icon('pause') }), 'Away at the store') : null,
        ),
        h(
          'div.trust',
          null,
          h('div.trust-row', null, h('span', null, 'Trust'), h('b', { style: { color } }, state), h('span.trust-pct', null, `${Math.round(call.trust)}%`)),
          h(
            'div.trust-track',
            null,
            h('i.trust-fill', { style: { width: `${call.trust}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` } }),
          ),
        ),
        perkRow(),
        schemeRow(call),
        call.challenge
          ? h(
              'div.scammy',
              { class: call.challenge.done ? 'done' : '' },
              h('span.scammy-face', null, 'S'),
              h('div', null, h('b', null, 'Scammy', h('small', null, call.challenge.done ? ' · +$100' : ' · $100')), h('span', { dir: 'auto' }, call.challenge.en)),
              call.challenge.done ? h('span.scammy-ok', { innerHTML: icon('check') }) : '',
            )
          : '',
        bt
          ? h('div.coach.boss', { dir: 'auto' }, h('span.coach-ico', { innerHTML: icon('megaphone') }), h('span', null, h('b', null, 'Boss: '), bt.text))
          : h('div.coach', { dir: 'ltr' }, h('span.coach-ico', { innerHTML: icon('bulb') }), h('span', null, tip)),
        ),
        h(
          'div.ph-main',
          null,
        h(
          'div.chat-wrap',
          null,
          showScripts ? scriptPanel : transcript,
        ),
        h(
          'div.ph-status',
          null,
          live.active
            ? call.speaking
              ? h('span.st.talk', null, h('span.eq', null, h('i'), h('i'), h('i'), h('i')), `${call.persona.name.split(' ')[0]} is speaking`)
              : live.micOn
                ? h('span.st.mic', null, h('i.rec'), 'Live · just talk')
                : h('span.st', null, 'Muted · type or unmute')
            : call.busy ? h('span.st.wait', null, h('span.spin'), 'Sent · waiting for a reply') : call.speaking ? h('span.st.talk', null, h('span.eq', null, h('i'), h('i'), h('i'), h('i')), `${call.persona.name.split(' ')[0]} is speaking`) : listener.listening ? h('span.st.mic', null, h('i.rec'), 'Listening…') : h('span.st', null, 'Your turn'),
          call.offline && backend.ai ? h('span.st.warn', null, 'AI unreachable · offline brain') : null,
        ),
        call.job && call.job.holdUntil > performance.now()
          ? h(
              'div.on-hold',
              null,
              h('span.hold-ico', { innerHTML: icon('music') }),
              h('div', null, h('b', null, 'On hold'), h('small', null, `${call.persona.name.split(' ')[0]} is at the store buying ${/^[AEIOU]/.test(call.job.brand) ? 'an' : 'a'} ${call.job.brand} gift card`)),
              h('div.hold-bar', null, h('i', { style: { animationDuration: `${Math.max(1, (call.job.holdUntil - performance.now()) / 1000)}s` } })),
            )
          : h(
              'div.composer',
              null,
              input,
              h('button.send-btn', { innerHTML: icon('send'), title: 'Send', onclick: () => (input.value.trim() && game.say(input.value), (input.value = '')) }),
            ),
        h(
          'div.controls',
          null,
          live.active
            ? ctrl(live.micOn ? 'mic' : 'micOff', live.micOn ? 'Mute' : 'Unmute', live.micOn, () => live.setMic(!live.micOn))
            : ctrl(listener.listening ? 'mic' : 'micOff', listener.listening ? 'Mic on' : 'Mic', listener.listening, () => {
            if (!sttSupported) return bus.emit('toast', { text: 'Voice input needs Chrome or Edge. You can type instead.', kind: 'bad' });
            listener.listening ? listener.stop() : listener.start();
            draw();
          }),
          ctrl(settings.tts ? 'speaker' : 'speakerOff', 'Speaker', settings.tts, () => {
            saveSettings({ tts: !settings.tts });
            if (!settings.tts) shutUp();
            draw();
          }),
          ctrl('video', 'Self view', settings.selfView, () => {
            saveSettings({ selfView: !settings.selfView });
            draw();
          }),
          ctrl('script', 'Scripts', showScripts, () => {
            showScripts = !showScripts;
            draw();
          }),
          ctrl('megaphone', 'Ask boss', !!bt, () => bus.emit('os:open', { id: 'chat', arg: 'ask' })),
          h('div.ctl', null, h('button.ctl-btn.hang', { onclick: () => game.endCall(), innerHTML: icon('phoneOff'), title: 'Hang up' }), h('span', null, 'End')),
        ),
        ),
      );
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const b = root.querySelector<HTMLElement>('.bubble.typing-now');
      if (!b || !game.call) return;
      const l = game.call.lines[Number(b.dataset.i)];
      const started = l && typed.get(l);
      if (!l || !started) return;
      const dur = Math.max(900, l.text.length * 55);
      const p = Math.min(1, (performance.now() - started) / dur);
      const t = b.querySelector('.btxt')!;
      t.textContent = l.text.slice(0, Math.ceil(p * l.text.length));
      if (p >= 1) b.classList.remove('typing-now');
      const chat = root.querySelector('.chat');
      if (chat) chat.scrollTop = chat.scrollHeight;
    };
    raf = requestAnimationFrame(tick);

    listener.onInterim = (t) => {
      interim = t;
      bus.emit('me:talking', !!t);
      const tr = root.querySelector('.chat');
      if (!tr || !game.call) return;
      let el = tr.querySelector('.interim');
      if (!interim) return el?.remove();
      if (!el) tr.append((el = h('div.bubble.player.interim', { dir: 'auto' })));
      el.textContent = interim;
      tr.scrollTop = tr.scrollHeight;
    };
    listener.onFinal = (t) => {
      interim = '';
      bus.emit('me:talking', false);
      if (game.call?.speaking) return;
      game.say(t);
    };
    listener.onState = (on) => {
      if (on) void enableMicLevel(audio());
      draw();
    };
    listener.onError = (m) => bus.emit('toast', { text: m, kind: 'bad' });

    const offs = [
      bus.on('call:live', (i: number) => {
        const c = game.call;
        const l = c?.lines[i];
        const b = root.querySelector<HTMLElement>(`.bubble[data-i="${i}"]`);
        if (!c || !l || !b || l.data?.code) return draw();
        const t = b.querySelector('.btxt');
        if (t) t.textContent = l.text;
        b.dir = isRtl(l.text) ? 'rtl' : 'ltr';
        const chat = root.querySelector('.chat');
        if (chat) chat.scrollTop = chat.scrollHeight;
      }),
      bus.on('call:changed', () => {
        if (live.active && listener.listening) listener.stop();
        const typing = document.activeElement === input;
        const val = input.value;
        draw();
        input.value = val;
        if (typing) input.focus();
      }),
      bus.on('call:speaking', (on: boolean) => {
        const c = game.call;
        if (on && c) {
          const last = [...c.lines].reverse().find((l) => l.who === 'caller');
          if (last) typed.set(last, performance.now());
        }
        root.querySelector('.ph-avatar')?.classList.toggle('talking', on);
        const face = root.querySelector('.ph-face');
        if (c && face) face.innerHTML = portrait(c.persona.look, c.mood, on);
        const st = root.querySelector('.ph-status');
        if (st && c && !c.busy) draw();
      }),
      bus.on('call:ended', (c: Call) => {
        ended = c;
        clearTimeout(endedTimer);
        endedTimer = window.setTimeout(() => {
          ended = null;
          draw();
        }, 4500);
        draw();
      }),
      bus.on('leads:changed', () => !game.call && !ended && draw()),
      bus.on('loot:changed', () => game.call && draw()),
      bus.on('net:state', () => !game.call && !ended && draw()),
    ];
    const timer = window.setInterval(() => {
      if (game.call) {
        const t = root.querySelector('.ph-timer');
        const secs = Math.floor((performance.now() - game.call.started) / 1000);
        if (t) t.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      } else if (!ended) {
        const bar = root.querySelector<HTMLElement>('.patience i');
        const l = game.leads[0];
        if (bar && l) bar.style.width = `${Math.max(0, 1 - (performance.now() - l.arrived) / l.patience) * 100}%`;
      }
    }, 250);
    draw();
    return () => {
      offs.forEach((o) => o());
      clearInterval(timer);
      clearTimeout(endedTimer);
      cancelAnimationFrame(raf);
      webcamTargets.delete(self);
    };
  },
};
