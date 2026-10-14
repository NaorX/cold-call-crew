import { h } from './dom';
import { bus } from '../game/bus';
import { crew } from '../game/net';
import { sfx, startSiren, stopSiren } from '../game/audio';
import type { World } from '../engine/world';

export function setupPranks(parent: HTMLElement, world: World) {
  const shake = (ms: number, big = false) => {
    const root = document.documentElement;
    root.classList.remove('shake', 'shake-big');
    void root.offsetWidth;
    root.classList.add(big ? 'shake-big' : 'shake');
    setTimeout(() => root.classList.remove('shake', 'shake-big'), ms);
  };
  const overlay = (cls: string, ms: number, ...kids: HTMLElement[]) => {
    const el = h(`div.prank-fx.${cls}`, null, ...kids);
    parent.append(el);
    setTimeout(() => el.classList.add('out'), ms - 600);
    setTimeout(() => el.remove(), ms);
  };
  const say = (text: string, kind = 'info') => bus.emit('toast', { text: `Scamazon: ${text}`, kind });

  bus.on('net:prank', (m: { kind: string; from: string; fromId: string; target: string | null; targetName: string | null }) => {
    const me = m.fromId === crew.me;
    const who = me ? 'You' : m.from;
    switch (m.kind) {
      case 'horn':
        sfx.horn();
        shake(700);
        say(`${who} blew an air horn across the floor.`);
        break;
      case 'confetti': {
        const colors = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'];
        const bits = Array.from({ length: 140 }, (_, i) =>
          h('i', {
            style: {
              left: `${Math.random() * 100}%`,
              background: colors[i % colors.length],
              animationDelay: `${Math.random() * 0.8}s`,
              animationDuration: `${2.2 + Math.random() * 1.6}s`,
              '--sway': `${(Math.random() - 0.5) * 160}px`,
              '--spin': `${360 + Math.random() * 720}deg`,
            },
          }),
        );
        overlay('confetti-rain', 4600, ...bits);
        sfx.cheer();
        say(`${who} fired a confetti cannon.`, 'good');
        break;
      }
      case 'stink':
        overlay('stink', 10000);
        say(`${who} set off a stink bomb. Breathe through your mouth.`);
        break;
      case 'siren':
        world.raid = 1;
        startSiren();
        setTimeout(() => {
          world.raid = 0;
          stopSiren();
          say(`False alarm. It was ${me ? 'your' : `${m.from}'s`} prank.`);
        }, 3200);
        break;
      case 'airstrike':
        world.blast(m.target, crew.me);
        if (m.target === crew.me) {
          sfx.boom();
          shake(1200, true);
          overlay('flash', 1400);
          say(`${m.from} called an airstrike on your desk!`, 'bad');
        } else {
          sfx.boom();
          shake(500);
          say(`${who} called an airstrike on ${m.targetName || 'a desk'}.`);
        }
        break;
    }
  });
}
