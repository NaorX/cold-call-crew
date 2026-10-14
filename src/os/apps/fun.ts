import { h, clear } from '../../ui/dom';
import { bus } from '../../game/bus';
import { game } from '../../game/game';
import { sfx } from '../../game/audio';
import type { AppDef, WindowManager } from '../wm';
import { icon } from '../icons';
import { appTile } from '../wm';

export function FolderApp(wm: WindowManager): AppDef {
  return {
    id: 'folder',
    title: 'Fun Random Apps',
    icon: 'folder',
    color: '#3d8bfd',
    color2: '#8cc4ff',
    w: 440,
    h: 280,
    render(win) {
      const items = ['camera', 'paint', 'mines', 'notes', 'defendr', 'freeram'];
      win.body.append(
        h(
          'div.folder',
          null,
          ...items.map((id) => {
            const a = wm.apps.get(id)!;
            let last = 0;
            return h('button.desk-icon.in-folder', {
              onclick: (e: Event) => {
                const now = performance.now();
                wm.open(id);
                last = now;
                (e.currentTarget as HTMLElement).classList.add('sel');
              },
            }, h('span.tile-wrap', null, appTile(a, 'lg')), h('span.label', null, a.title));
          }),
        ),
      );
    },
  };
}

export const PaintApp: AppDef = {
  id: 'paint',
  title: 'Doodle',
  icon: 'paint',
  color: '#ff2d55',
  color2: '#ff7aa2',
  w: 620,
  h: 480,
  hidden: true,
  render(win) {
    const c = h('canvas.paint-canvas', { width: 1000, height: 640 }) as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    let color = '#111';
    let size = 6;
    const colors = ['#111', '#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#fff'];
    const tools = h(
      'div.paint-tools',
      null,
      ...colors.map((col) => h('button.swatch', { style: { background: col }, onclick: () => (color = col) })),
      h('input', { type: 'range', min: 2, max: 40, value: 6, oninput: (e: Event) => (size = Number((e.target as HTMLInputElement).value)) }),
      h('button.btn.small', { onclick: () => ((ctx.fillStyle = '#fff'), ctx.fillRect(0, 0, c.width, c.height)) }, 'Clear'),
      h(
        'button.btn.small',
        {
          onclick: () => {
            const a = document.createElement('a');
            a.download = 'doodle.png';
            a.href = c.toDataURL('image/png');
            a.click();
          },
        },
        'Save PNG',
      ),
    );
    let last: [number, number] | null = null;
    const pos = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
    };
    c.addEventListener('pointerdown', (e) => {
      last = pos(e);
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = pos(e);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(...last);
      ctx.lineTo(...p);
      ctx.stroke();
      last = p;
    });
    c.addEventListener('pointerup', () => (last = null));
    win.body.append(h('div.paint', null, tools, h('div.paint-wrap', null, c)));
  },
};

export const MinesApp: AppDef = {
  id: 'mines',
  title: 'Mines',
  icon: 'mines',
  color: '#48484a',
  color2: '#8e8e93',
  w: 330,
  h: 400,
  hidden: true,
  noResize: true,
  render(win) {
    const N = 9;
    const MINES = 10;
    const root = h('div.mines');
    win.body.append(root);
    let cells: { mine: boolean; open: boolean; flag: boolean; n: number }[] = [];
    let over = false;
    const reset = () => {
      over = false;
      cells = Array.from({ length: N * N }, () => ({ mine: false, open: false, flag: false, n: 0 }));
      let placed = 0;
      while (placed < MINES) {
        const i = Math.floor(Math.random() * N * N);
        if (!cells[i].mine) {
          cells[i].mine = true;
          placed++;
        }
      }
      cells.forEach((c, i) => (c.n = around(i).filter((j) => cells[j].mine).length));
      draw();
    };
    const around = (i: number) => {
      const x = i % N;
      const y = Math.floor(i / N);
      const out: number[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N) out.push((y + dy) * N + x + dx);
      return out;
    };
    const open = (i: number) => {
      const c = cells[i];
      if (c.open || c.flag) return;
      c.open = true;
      if (c.mine) {
        over = true;
        sfx.error();
        cells.forEach((k) => k.mine && (k.open = true));
        return;
      }
      if (c.n === 0) around(i).forEach(open);
    };
    const draw = () => {
      clear(root);
      const won = !over && cells.every((c) => c.mine || c.open);
      const grid = h('div.mines-grid');
      cells.forEach((c, i) =>
        grid.append(
          h(
            'button.mcell',
            {
              class: `${c.open ? 'open' : ''} n${c.n}`,
              onclick: () => {
                if (over || won) return;
                open(i);
                sfx.click();
                draw();
              },
              oncontextmenu: (e: Event) => {
                e.preventDefault();
                if (!c.open) c.flag = !c.flag;
                draw();
              },
            },
            c.open ? (c.mine ? '✱' : c.n || '') : c.flag ? '⚑' : '',
          ),
        ),
      );
      root.append(h('div.mines-top', null, h('button.pill-btn.small', { onclick: reset }, over ? 'Retry' : won ? 'Again' : 'New'), h('small', null, over ? 'Boom. Back to work.' : won ? 'You win! Still behind on quota though.' : 'Right-click to flag')), grid);
    };
    reset();
  },
};

export const NotesApp: AppDef = {
  id: 'notes',
  title: 'Notepad',
  icon: 'notes',
  color: '#e6a800',
  color2: '#ffd60a',
  w: 420,
  h: 380,
  hidden: true,
  render(win) {
    let text = '';
    try {
      text = localStorage.getItem('ccc.notes') ?? '';
    } catch {
    }
    if (!text)
      text = `TIPS FROM THE BOSS
- Be patient. Rushed = suspicious.
- Build trust FIRST, ask for money LATER.
- Gift card codes expire. Redeem fast.
- Hang up on people who are TOO eager. Baiters.
- Heat brings cops. When the siren goes:
  hang up + close Gift Cards / Card Terminal / RemoteDesk.
- Power out? Breaker box is on the right wall.
`;
    const ta = h('textarea.notes', { value: text, spellcheck: false, dir: 'auto' }) as HTMLTextAreaElement;
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    ta.addEventListener('input', () => {
      try {
        localStorage.setItem('ccc.notes', ta.value);
      } catch {
      }
    });
    win.body.append(ta);
  },
};

export const DefendrApp: AppDef = {
  id: 'defendr',
  title: 'DefendR Antivirus',
  icon: 'shield',
  color: '#0a84ff',
  color2: '#64d2ff',
  w: 420,
  h: 330,
  hidden: true,
  render(win) {
    const root = h('div.app-pad.defendr');
    win.body.append(root);
    let scanning = false;
    const draw = (pct = 0) => {
      clear(root);
      root.append(
        h('div.def-shield', { class: game.virus ? 'bad' : 'good', innerHTML: icon(game.virus ? 'alert' : 'shield') }),
        h('h3', null, game.virus ? 'THREAT DETECTED: Trojan.PopUpZilla' : 'Your PC is protected'),
        h('p.muted', null, game.has('antivirus') ? 'Pro license active: instant removal.' : 'Free version: scans are slow. Buy the Pro license in Bargain Bin.'),
        scanning ? h('div.quota-bar', null, h('i', { style: { width: `${pct}%` } }), h('span', null, `Scanning… ${Math.round(pct)}%`)) : h('button.btn.big', { onclick: scan }, 'Run full scan'),
      );
    };
    const scan = () => {
      scanning = true;
      const dur = game.has('antivirus') ? 600 : 14000;
      const start = performance.now();
      const step = () => {
        if (!win.el.isConnected) return;
        const p = Math.min(100, ((performance.now() - start) / dur) * 100);
        draw(p);
        if (p < 100) requestAnimationFrame(step);
        else {
          scanning = false;
          if (game.virus) bus.emit('virus:clean');
          draw();
        }
      };
      step();
    };
    draw();
    const off = bus.on('virus:changed', () => !scanning && draw());
    return off;
  },
};

export const FreeRamApp: AppDef = {
  id: 'freeram',
  title: 'FreeRAM.exe',
  icon: 'virus',
  color: '#5e5ce6',
  color2: '#d48cff',
  w: 360,
  h: 220,
  hidden: true,
  noResize: true,
  render(win) {
    win.body.append(h('div.app-pad', null, h('h3', null, 'Downloading more RAM…'), h('div.quota-bar', null, h('i.indeterminate', { style: { width: '40%' } }), h('span', null, '1,024 GB'))));
    setTimeout(() => {
      win.close();
      bus.emit('virus:start');
    }, 2500);
  },
};
