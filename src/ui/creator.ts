import { h, clear } from './dom';
import { portrait } from './portrait';
import { icon } from '../os/icons';
import { settings, saveSettings } from '../game/settings';
import { SKINS, HAIR_COLORS, SHIRTS } from '../game/personas';
import { fullLook } from '../engine/character';
import { sfx } from '../game/audio';
import type { Look, HairStyle, Facial, Body, Brows, Top, Hat } from '../game/types';
import type { World } from '../engine/world';

const HAIRS: HairStyle[] = ['short', 'buzz', 'curly', 'afro', 'spiky', 'side', 'mohawk', 'long', 'ponytail', 'bun', 'bald'];
const FACIALS: Facial[] = ['none', 'mustache', 'beard', 'goatee'];
const BODIES: Body[] = ['slim', 'normal', 'chubby'];
const BROWS: Brows[] = ['thin', 'normal', 'bushy', 'unibrow'];
const TOPS: Top[] = ['tee', 'polo', 'hoodie', 'shirtTie', 'tank'];
const HATS: Hat[] = ['none', 'cap', 'beanie', 'cowboy', 'headband'];
const PANTS = ['#3b5b8c', '#2f3346', '#1d1d22', '#6b5a43', '#7a7f87', '#8c2f2f', '#2f5d3a', '#c9b38a'];
const SHOES = ['#2b2b2b', '#f2f2f2', '#7a4a26', '#c8432f', '#2f6fb3', '#e0a52d'];
const ACCENTS = ['#1e1e1e', '#c8432f', '#2f6fb3', '#3f9b4a', '#e0a52d', '#7a4fb0', '#f2f2f2', '#d06aa0'];
const SKIN_ALL = ['#ffd2b0', '#f2c9a0', '#e8b08a', '#d9966a', '#c27a4e', '#9a5a36', '#6e3f25', '#f08a3c', '#ff9d5c', '#8fd16a', '#7ec8ff'];
const NAMES_A = ['Big', 'Lil', 'Sneaky', 'Smooth', 'Honest', 'Turbo', 'Sir', 'Captain', 'Cheap', 'Lucky', 'Shady', 'Polite'];
const NAMES_B = ['Kevin', 'Tony', 'Raj', 'Steve', 'Dave', 'Gary', 'Linda', 'Priya', 'Chad', 'Brenda', 'Dmitri', 'Nadia'];
const LABEL: Record<string, string> = { shirtTie: 'Shirt & tie', tee: 'T-shirt', tank: 'Tank top', none: 'None', polo: 'Polo', hoodie: 'Hoodie' };
const nice = (s: string) => LABEL[s] || s.charAt(0).toUpperCase() + s.slice(1);

type Cat = 'body' | 'face' | 'hair' | 'outfit' | 'extras';
const CATS: [Cat, string, string, string][] = [
  ['body', 'Body', 'body', 'Skin, build, height'],
  ['face', 'Face', 'smile', 'Eyes, nose, brows, beard'],
  ['hair', 'Hair', 'scissors', 'Style and color'],
  ['outfit', 'Outfit', 'shirt', 'Top, pants, shoes'],
  ['extras', 'Extras', 'crown', 'Hats and headset'],
];

export class Creator {
  el: HTMLElement;
  private panel: HTMLElement;
  private rail: HTMLElement;
  private cat: Cat = 'body';
  private nameIn: HTMLInputElement;
  onDone: () => void = () => {};

  constructor(private world: World) {
    this.panel = h('div.cr-panel');
    this.rail = h('div.cr-rail');
    this.nameIn = h('input.cr-name', { maxLength: 18, value: settings.name, placeholder: 'Your name', spellcheck: false }) as HTMLInputElement;
    this.nameIn.addEventListener('keydown', (e) => e.stopPropagation());
    this.nameIn.addEventListener('input', () => saveSettings({ name: this.nameIn.value.trim() || 'Rookie' }));
    const stage = h('div.cr-stage', { title: 'Drag to turn' });
    let dragX: number | null = null;
    stage.addEventListener('pointerdown', (e) => {
      dragX = e.clientX;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      this.world.creatorDrag += (e.clientX - dragX) * 0.012;
      dragX = e.clientX;
    });
    stage.addEventListener('pointerup', () => (dragX = null));
    stage.addEventListener('wheel', (e) => {
      this.world.creatorZoom = Math.max(0, Math.min(1, this.world.creatorZoom + (e.deltaY > 0 ? -0.15 : 0.15)));
    });
    this.el = h(
      'div.creator',
      null,
      h('div.cr-vignette'),
      stage,
      h('div.cr-title', null, h('small', null, 'COLD CALL CREW'), h('h1', null, 'Create your character'), h('p', null, 'Every great scammer needs a face the boss will remember.')),
      h('div.cr-left', null, this.rail, this.panel),
      h(
        'div.cr-right',
        null,
        h('small.cr-cap', null, 'NAME'),
        h('div.cr-name-row', null, this.nameIn, h('button.cr-icon-btn', { title: 'Random name', innerHTML: icon('dice'), onclick: () => this.randomName() })),
        h('button.cr-btn', { onclick: () => this.randomize() }, h('span', { innerHTML: icon('dice') }), 'Randomize look'),
        h('button.cr-btn.primary', { onclick: () => (sfx.levelUp(), this.onDone()) }, 'Confirm', h('span', { innerHTML: icon('arrowRight') })),
      ),
      h('div.cr-hint', null, h('span', null, h('kbd', null, 'Drag'), 'rotate'), h('span', null, h('kbd', null, 'Scroll'), 'zoom')),
    );
    this.draw();
  }

  private get look() {
    return fullLook(settings.look);
  }
  private set(patch: Partial<Look>) {
    saveSettings({ look: { ...this.look, ...patch } });
    sfx.click();
    this.draw();
  }

  private randomName() {
    const n = `${NAMES_A[Math.floor(Math.random() * NAMES_A.length)]} ${NAMES_B[Math.floor(Math.random() * NAMES_B.length)]}`;
    this.nameIn.value = n;
    saveSettings({ name: n });
  }

  private randomize() {
    const p = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
    this.set({
      skin: p(SKIN_ALL.slice(0, 9)),
      hair: p(HAIRS),
      hairColor: p(HAIR_COLORS),
      facial: p(FACIALS),
      glasses: Math.random() < 0.3,
      shirt: p(SHIRTS),
      body: p(BODIES),
      height: 0.94 + Math.random() * 0.12,
      head: 0.95 + Math.random() * 0.2,
      nose: 0.8 + Math.random() * 0.5,
      eyes: 0.9 + Math.random() * 0.3,
      brows: p(BROWS),
      top: p(TOPS),
      pants: p(PANTS),
      shoes: p(SHOES),
      hat: Math.random() < 0.25 ? p(HATS.slice(1)) : 'none',
      hatColor: p(ACCENTS),
      headset: p(ACCENTS),
    });
  }

  private draw() {
    clear(this.rail);
    for (const [k, label, ico, sub] of CATS)
      this.rail.append(
        h(
          'button.cr-cat',
          {
            class: this.cat === k ? 'on' : '',
            onclick: () => {
              this.cat = k;
              this.world.creatorZoom = k === 'face' || k === 'hair' ? 1 : k === 'extras' ? 0.6 : 0;
              sfx.click();
              this.draw();
            },
          },
          h('span.cr-cat-ico', { innerHTML: icon(ico) }),
          h('span.cr-cat-txt', null, h('b', null, label), h('small', null, sub)),
        ),
      );
    clear(this.panel);
    const L = this.look;
    const section = (title: string, ...kids: (HTMLElement | null)[]) => h('div.cr-sec', null, h('div.cr-sec-title', null, title), ...kids.filter(Boolean as any));
    const swatches = (cur: string, list: string[], key: keyof Look) =>
      h(
        'div.cr-swatches',
        null,
        ...list.map((c) => h('button.cr-sw', { style: { '--c': c }, class: cur.toLowerCase() === c.toLowerCase() ? 'on' : '', onclick: () => this.set({ [key]: c } as Partial<Look>) })),
        h('label.cr-sw.custom', { title: 'Custom color', innerHTML: icon('plus') }, h('input', { type: 'color', value: cur, oninput: (e: Event) => this.set({ [key]: (e.target as HTMLInputElement).value } as Partial<Look>) })),
      );
    const chips = <T extends string>(cur: T, list: readonly T[], key: keyof Look) =>
      h('div.cr-chips', null, ...list.map((v) => h('button.cr-chip', { class: cur === v ? 'on' : '', onclick: () => this.set({ [key]: v } as Partial<Look>) }, nice(v))));
    const thumbs = <T extends string>(cur: T, list: readonly T[], key: keyof Look) =>
      h(
        'div.cr-thumbs',
        null,
        ...list.map((v) => h('button.cr-thumb', { class: cur === v ? 'on' : '', onclick: () => this.set({ [key]: v } as Partial<Look>) }, h('span.cr-thumb-img', { innerHTML: portrait({ ...L, [key]: v } as Look, 'happy') }), h('span', null, nice(v)))),
      );
    const slider = (cur: number, min: number, max: number, key: keyof Look, l: string, r: string) => {
      const s = h('input.slider', { type: 'range', min: min * 100, max: max * 100, value: cur * 100 }) as HTMLInputElement;
      const paint = () => s.style.setProperty('--p', `${((Number(s.value) / 100 - min) / (max - min)) * 100}%`);
      paint();
      s.addEventListener('input', () => {
        saveSettings({ look: { ...this.look, [key]: Number(s.value) / 100 } });
        paint();
      });
      return h('div.cr-slider', null, s, h('div.cr-slider-labels', null, h('small', null, l), h('small', null, r)));
    };

    if (this.cat === 'body')
      this.panel.append(
        section('Skin tone', swatches(L.skin, SKIN_ALL, 'skin')),
        section('Build', chips(L.body, BODIES, 'body')),
        section('Height', slider(L.height, 0.88, 1.12, 'height', 'Short', 'Tall')),
        section('Head size', slider(L.head, 0.85, 1.25, 'head', 'Small', 'Big')),
      );
    else if (this.cat === 'face')
      this.panel.append(
        section('Facial hair', thumbs(L.facial, FACIALS, 'facial')),
        section('Eyebrows', chips(L.brows, BROWS, 'brows')),
        section('Eyes', slider(L.eyes, 0.75, 1.35, 'eyes', 'Small', 'Big')),
        section('Nose', slider(L.nose, 0.6, 1.6, 'nose', 'Button', 'Huge')),
        section('Glasses', h('div.cr-chips', null, ...(['no', 'yes'] as const).map((v) => h('button.cr-chip', { class: (L.glasses ? 'yes' : 'no') === v ? 'on' : '', onclick: () => this.set({ glasses: v === 'yes' }) }, v === 'yes' ? 'Glasses' : 'None')))),
      );
    else if (this.cat === 'hair') this.panel.append(section('Hairstyle', thumbs(L.hair, HAIRS, 'hair')), section('Hair color', swatches(L.hairColor, HAIR_COLORS.concat(['#e8e2d6', '#d62828', '#ff8fab', '#7a4fb0']), 'hairColor')));
    else if (this.cat === 'outfit')
      this.panel.append(section('Top', chips(L.top, TOPS, 'top')), section('Top color', swatches(L.shirt, SHIRTS, 'shirt')), section('Pants', swatches(L.pants, PANTS, 'pants')), section('Shoes', swatches(L.shoes, SHOES, 'shoes')));
    else this.panel.append(section('Hat', chips(L.hat, HATS, 'hat')), section('Hat color', swatches(L.hatColor, ACCENTS, 'hatColor')), section('Headset color', swatches(L.headset, ACCENTS, 'headset')));
    this.panel.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
  }

  show() {
    this.nameIn.value = settings.name;
    this.cat = 'body';
    this.world.creatorZoom = 0;
    this.draw();
    this.el.classList.add('show');
  }
  hide() {
    this.el.classList.remove('show');
  }
}
