import { h } from '../ui/dom';
import { icon } from './icons';
import { sfx } from '../game/audio';

export interface AppDef {
  id: string;
  title: string;
  icon: string;
  color: string;
  color2?: string;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  evidence?: boolean;
  hidden?: boolean;
  noResize?: boolean;
  dark?: boolean;
  render(win: Win, arg?: any): void | (() => void);
}

export function appTile(app: Pick<AppDef, 'color' | 'color2' | 'icon'>, size = 'md') {
  return h(`span.app-tile.${size}`, { style: { background: `linear-gradient(160deg, ${app.color2 || app.color} 0%, ${app.color} 100%)` }, innerHTML: icon(app.icon) });
}

let zTop = 10;
let idSeq = 0;

export class Win {
  id = `w${idSeq++}`;
  el: HTMLElement;
  body: HTMLElement;
  titleEl: HTMLElement;
  minimized = false;
  maximized = false;
  private cleanup: void | (() => void);
  private prev: { left: string; top: string; width: string; height: string } | null = null;
  onClose: (() => void) | null = null;

  constructor(
    public app: AppDef,
    private wm: WindowManager,
    arg?: any,
  ) {
    this.titleEl = h('span.win-title', null, app.title);
    const light = (cls: string, label: string, glyph: string, fn: () => void) =>
      h(`button.tl.${cls}`, {
        title: label,
        'aria-label': label,
        innerHTML: icon(glyph),
        onpointerdown: (e: Event) => e.stopPropagation(),
        onclick: (e: Event) => {
          e.stopPropagation();
          fn();
        },
      });
    const bar = h(
      'div.win-bar',
      null,
      h('div.traffic', null, light('close', 'Close', 'close', () => this.close()), light('min', 'Minimize', 'minus', () => this.minimize()), app.noResize ? h('span.tl.off') : light('zoom', 'Zoom', 'plus', () => this.toggleMax())),
      this.titleEl,
      h('div.win-bar-spacer'),
    );
    this.body = h('div.win-body');
    this.el = h('div.win', { 'data-app': app.id, class: app.dark ? 'dark' : '' }, bar, this.body, app.noResize ? null : h('div.win-resize'));
    const area = wm.area.getBoundingClientRect();
    const w = Math.min(app.w, area.width - 24);
    const hh = Math.min(app.h, area.height - 24);
    const n = wm.windows.length;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${hh}px`;
    this.el.style.left = `${Math.max(12, Math.min(area.width - w - 12, (area.width - w) / 2 + (n % 5) * 28))}px`;
    this.el.style.top = `${Math.max(12, Math.min(area.height - hh - 12, (area.height - hh) / 2 + (n % 5) * 24 - 10))}px`;
    this.el.addEventListener('pointerdown', () => this.focus());
    this.drag(bar);
    if (!app.noResize) this.resizer(this.el.querySelector('.win-resize') as HTMLElement);
    bar.addEventListener('dblclick', () => !app.noResize && this.toggleMax());
    wm.area.appendChild(this.el);
    this.cleanup = app.render(this, arg);
    this.focus();
    this.el.animate([{ transform: 'scale(0.94) translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
  }

  setTitle(t: string) {
    this.titleEl.textContent = t;
  }

  focus() {
    this.el.style.zIndex = String(++zTop);
    for (const w of this.wm.windows) w.el.classList.toggle('focused', w === this);
    this.wm.focused = this;
    this.wm.refreshTaskbar();
  }

  minimize() {
    const a = this.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.6) translateY(40%)', opacity: 0 }], { duration: 180, easing: 'ease-in' });
    a.onfinish = () => {
      this.minimized = true;
      this.el.style.display = 'none';
      this.wm.refreshTaskbar();
    };
  }

  restore() {
    const was = this.minimized;
    this.minimized = false;
    this.el.style.display = '';
    if (was) this.el.animate([{ transform: 'scale(0.6) translateY(40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    this.focus();
  }

  toggleMax() {
    if (this.maximized && this.prev) {
      Object.assign(this.el.style, this.prev);
      this.maximized = false;
    } else {
      const s = this.el.style;
      this.prev = { left: s.left, top: s.top, width: s.width, height: s.height };
      Object.assign(s, { left: '8px', top: '8px', width: 'calc(100% - 16px)', height: 'calc(100% - 16px)' });
      this.maximized = true;
    }
    this.el.classList.toggle('maxed', this.maximized);
    window.dispatchEvent(new Event('resize'));
  }

  close() {
    if (!this.el.isConnected) return;
    this.cleanup?.();
    this.onClose?.();
    this.wm.windows = this.wm.windows.filter((w) => w !== this);
    if (this.wm.focused === this) this.wm.focused = null;
    this.wm.refreshTaskbar();
    sfx.close();
    const el = this.el;
    const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.95)', opacity: 0 }], { duration: 140, easing: 'ease-in' });
    a.onfinish = () => el.remove();
  }

  private drag(handle: HTMLElement) {
    handle.addEventListener('pointerdown', (e) => {
      if (this.maximized) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const left = this.el.offsetLeft;
      const top = this.el.offsetTop;
      const area = this.wm.area.getBoundingClientRect();
      this.el.classList.add('dragging');
      const move = (ev: PointerEvent) => {
        const x = Math.max(-this.el.offsetWidth + 100, Math.min(area.width - 100, left + ev.clientX - startX));
        const y = Math.max(0, Math.min(area.height - 40, top + ev.clientY - startY));
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
      };
      const up = () => {
        this.el.classList.remove('dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  private resizer(handle: HTMLElement) {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const sx = e.clientX;
      const sy = e.clientY;
      const w = this.el.offsetWidth;
      const hh = this.el.offsetHeight;
      const move = (ev: PointerEvent) => {
        this.el.style.width = `${Math.max(this.app.minW || 280, w + ev.clientX - sx)}px`;
        this.el.style.height = `${Math.max(this.app.minH || 200, hh + ev.clientY - sy)}px`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.dispatchEvent(new Event('resize'));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
}

export class WindowManager {
  windows: Win[] = [];
  focused: Win | null = null;
  apps = new Map<string, AppDef>();
  onTaskbar: () => void = () => {};

  constructor(public area: HTMLElement) {}

  register(app: AppDef) {
    this.apps.set(app.id, app);
  }

  open(id: string, arg?: any): Win | null {
    const app = this.apps.get(id);
    if (!app) return null;
    const existing = this.windows.find((w) => w.app.id === id);
    if (existing) {
      existing.restore();
      if (arg !== undefined) existing.el.dispatchEvent(new CustomEvent('app-arg', { detail: arg }));
      return existing;
    }
    sfx.open();
    const w = new Win(app, this, arg);
    this.windows.push(w);
    this.refreshTaskbar();
    return w;
  }

  get(id: string) {
    return this.windows.find((w) => w.app.id === id) || null;
  }

  closeAll(filter: (w: Win) => boolean = () => true) {
    for (const w of this.windows.slice()) if (filter(w)) w.close();
  }

  evidenceOpen() {
    return this.windows.filter((w) => w.app.evidence);
  }

  refreshTaskbar() {
    this.onTaskbar();
  }
}
