import { h, clear } from './dom';
import { icon } from '../os/icons';
import { settingsPanel } from './settingsPanel';
import { crew } from '../game/net';
import { sfx } from '../game/audio';

export interface PauseActions {
  resume(): void;
  customize(): void;
  quit(): void;
}

export class PauseMenu {
  el: HTMLElement;
  private card: HTMLElement;
  open = false;

  constructor(private act: PauseActions) {
    this.card = h('div.pause-card');
    this.el = h('div.pause', { onpointerdown: (e: Event) => e.target === this.el && this.close() }, this.card);
  }

  show(view: 'main' | 'settings' = 'main') {
    this.open = true;
    this.el.classList.add('show');
    clear(this.card);
    if (view === 'settings') {
      this.card.className = 'pause-card wide';
      this.card.append(h('div.pause-head', null, h('button.back-btn', { onclick: () => this.show('main'), innerHTML: icon('arrowRight') }), h('h2', null, 'Settings')), settingsPanel());
      return;
    }
    this.card.className = 'pause-card';
    const item = (ico: string, label: string, sub: string, fn: () => void, cls = '') =>
      h(`button.pause-item${cls}`, { onclick: () => (sfx.click(), fn()), onmouseenter: () => sfx.key() }, h('span.pi-ico', { innerHTML: icon(ico) }), h('span.pi-text', null, h('b', null, label), h('small', null, sub)), h('span.pi-go', { innerHTML: icon('arrowRight') }));
    this.card.append(
      h('div.pause-brand', null, h('small', null, crew.online ? `CREW ${crew.code}` : 'SOLO SHIFT'), h('h1', null, 'Paused')),
      item('play', 'Resume', 'Back to work', () => this.close(), '.primary'),
      item('sliders', 'Settings', 'Language, audio, graphics, controls', () => this.show('settings')),
      item('user', 'Customize character', 'Change your look', () => (this.hide(), this.act.customize())),
      item('logout', crew.online ? 'Leave crew' : 'Quit to main menu', 'Your progress in this run is lost', () => (this.hide(), this.act.quit()), '.danger'),
      h('div.pause-foot', null, h('kbd', null, 'Esc'), 'to resume'),
    );
  }

  hide() {
    this.open = false;
    this.el.classList.remove('show');
  }

  close() {
    this.hide();
    this.act.resume();
  }
}
