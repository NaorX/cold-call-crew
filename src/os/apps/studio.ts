import { h, clear } from '../../ui/dom';
import { portrait } from '../../ui/portrait';
import { icon } from '../icons';
import { loadCustom, saveCustom, randomPersona, SKINS, HAIR_COLORS, SHIRTS, HAIRS, FACIALS } from '../../game/personas';
import { bus } from '../../game/bus';
import { speak } from '../../game/voice';
import type { Persona } from '../../game/types';
import type { AppDef } from '../wm';

type Custom = Persona & { inRotation?: boolean };

export const StudioApp: AppDef = {
  id: 'studio',
  title: 'Caller Studio',
  icon: 'studio',
  color: '#30b0c7',
  w: 760,
  h: 560,
  minW: 560,
  render(win) {
    const root = h('div.studio');
    win.body.append(root);
    let status = 'Choose Create New Caller or Edit Existing Caller.';

    const home = () => {
      clear(root);
      root.append(
        h(
          'div.studio-home',
          null,
          h('h1', null, 'Caller Studio'),
          h(
            'div.studio-choices',
            null,
            h('button.studio-choice.primary', { onclick: () => edit(blank()) }, h('span', { innerHTML: icon('studio') }), 'CREATE NEW CALLER'),
            h('button.studio-choice', { onclick: () => manager(true) }, h('span', { innerHTML: icon('paint') }), 'EDIT EXISTING CALLER'),
          ),
          h('button.studio-manager', { onclick: () => manager(false) }, h('span', { innerHTML: icon('ledger') }), 'CALLER MANAGER'),
        ),
        h('div.studio-status', null, status),
      );
    };

    const blank = (): Custom => {
      const p = randomPersona();
      return { ...p, id: `c${Date.now().toString(36)}`, custom: true, inRotation: true, baiter: false };
    };

    const manager = (pickToEdit: boolean) => {
      clear(root);
      const list = loadCustom();
      const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } }) as HTMLInputElement;
      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const arr: Custom[] = Array.isArray(data) ? data : [data];
          const clean = arr.filter((p) => p && typeof p.name === 'string').map((p) => ({ ...blank(), ...p, id: `c${Math.random().toString(36).slice(2)}`, custom: true }));
          saveCustom([...loadCustom(), ...clean]);
          status = `Imported ${clean.length} caller(s).`;
        } catch {
          status = 'That file is not a valid caller JSON.';
        }
        manager(pickToEdit);
      });
      root.append(
        h(
          'div.studio-manager-view',
          null,
          h('div.studio-bar', null, h('button.btn.small', { onclick: home }, '← Back'), h('h2', null, pickToEdit ? 'Pick a caller to edit' : 'Caller Manager'), h('span.spacer'), h('button.btn.small', { onclick: () => file.click() }, 'Import JSON'), h('button.btn.small', { onclick: () => download(list, 'callers.json') }, 'Export all'), file),
          list.length
            ? h(
                'div.caller-grid',
                null,
                list.map((p, i) =>
                  h(
                    'div.caller-tile',
                    null,
                    h('div.tile-face', { innerHTML: portrait(p.look) }),
                    h('b', null, p.name),
                    h('small', null, `${p.age} · gullibility ${Math.round(p.gullibility * 100)}`),
                    h(
                      'label.check',
                      null,
                      h('input', {
                        type: 'checkbox',
                        checked: p.inRotation !== false,
                        onchange: (e: Event) => {
                          list[i].inRotation = (e.target as HTMLInputElement).checked;
                          saveCustom(list);
                        },
                      }),
                      'In call rotation',
                    ),
                    h(
                      'div.row',
                      null,
                      h('button.btn.small', { onclick: () => edit({ ...p }) }, 'Edit'),
                      h('button.btn.small', { onclick: () => download(p, `${p.name.replace(/\W+/g, '_')}.json`) }, 'Export'),
                      h(
                        'button.btn.small.danger',
                        {
                          onclick: () => {
                            list.splice(i, 1);
                            saveCustom(list);
                            manager(pickToEdit);
                          },
                        },
                        'Delete',
                      ),
                    ),
                  ),
                ),
              )
            : h('p.muted', null, 'No custom callers yet.'),
        ),
        h('div.studio-status', null, status),
      );
    };

    const edit = (p: Custom) => {
      clear(root);
      const face = h('div.studio-face', { innerHTML: portrait(p.look) });
      const refresh = () => (face.innerHTML = portrait(p.look));
      const text = (label: string, key: keyof Custom, multi = false) => {
        const el = (multi ? h('textarea', { value: String(p[key] ?? ''), rows: 3, dir: 'auto' }) : h('input', { value: String(p[key] ?? ''), dir: 'auto' })) as HTMLInputElement;
        el.addEventListener('keydown', (e) => e.stopPropagation());
        el.addEventListener('input', () => ((p as any)[key] = key === 'age' || key === 'savings' ? Number(el.value) || 0 : el.value));
        return h('label', null, label, el);
      };
      const slider = (label: string, key: 'gullibility' | 'techSkill') => {
        const val = h('b', null, `${Math.round(p[key] * 100)}`);
        return h('label', null, h('span', null, label, ' ', val), h('input', { type: 'range', min: 0, max: 100, value: Math.round(p[key] * 100), oninput: (e: Event) => ((p[key] = Number((e.target as HTMLInputElement).value) / 100), (val.textContent = String(Math.round(p[key] * 100)))) }));
      };
      const swatches = (label: string, key: 'skin' | 'hairColor' | 'shirt', options: string[]) =>
        h('div.swatch-row', null, h('small', null, label), ...options.map((c) => h('button.swatch', { style: { background: c }, class: p.look[key] === c ? 'active' : '', onclick: (e: Event) => ((p.look[key] = c), refresh(), markActive(e)) })));
      const markActive = (e: Event) => {
        const b = e.currentTarget as HTMLElement;
        b.parentElement!.querySelectorAll('.active').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      };
      const choice = <T extends string>(label: string, options: readonly T[], get: () => T, set: (v: T) => void) =>
        h('div.choice-row', null, h('small', null, label), ...options.map((o) => h('button.chip', { class: get() === o ? 'active' : '', onclick: (e: Event) => (set(o), refresh(), markActive(e)) }, o)));
      const quirks = h('input', { value: p.quirks.join('; '), dir: 'auto' }) as HTMLInputElement;
      quirks.addEventListener('keydown', (e) => e.stopPropagation());
      quirks.addEventListener('input', () => (p.quirks = quirks.value.split(';').map((s) => s.trim()).filter(Boolean)));

      root.append(
        h(
          'div.studio-edit',
          null,
          h(
            'div.studio-left',
            null,
            face,
            swatches('Skin', 'skin', SKINS),
            swatches('Hair', 'hairColor', HAIR_COLORS),
            swatches('Shirt', 'shirt', SHIRTS),
            choice('Hair style', HAIRS, () => p.look.hair, (v) => (p.look.hair = v)),
            choice('Facial hair', FACIALS, () => p.look.facial, (v) => (p.look.facial = v)),
            choice('Glasses', ['no', 'yes'] as const, () => (p.look.glasses ? 'yes' : 'no'), (v) => (p.look.glasses = v === 'yes')),
          ),
          h(
            'div.studio-right',
            null,
            h('div.row', null, text('Name', 'name'), text('Age', 'age')),
            h('div.row', null, text('Location', 'location'), text('Savings ($)', 'savings')),
            choice('Gender / voice', ['f', 'm'] as const, () => p.gender, (v) => (p.gender = v)),
            text('Who they are', 'archetype'),
            text('Backstory', 'bio', true),
            h('label', null, 'Quirks (separate with ;)', quirks),
            text('Why they are on the line', 'hook'),
            slider('Gullibility', 'gullibility'),
            slider('Tech skill', 'techSkill'),
            h(
              'div.row.checks',
              null,
              h('label.check', null, h('input', { type: 'checkbox', checked: p.giftCardFriendly, onchange: (e: Event) => (p.giftCardFriendly = (e.target as HTMLInputElement).checked) }), 'Buys gift cards'),
              h('label.check', null, h('input', { type: 'checkbox', checked: p.hasCard, onchange: (e: Event) => (p.hasCard = (e.target as HTMLInputElement).checked) }), 'Has a credit card'),
              h('label.check', null, h('input', { type: 'checkbox', checked: p.baiter, onchange: (e: Event) => (p.baiter = (e.target as HTMLInputElement).checked) }), 'Secretly a scambaiter'),
            ),
            h(
              'div.row',
              null,
              h('button.btn.small', { onclick: () => void speak(`Hello? Who is this? This is ${p.name}.`, { gender: p.gender, pitch: p.voice.pitch, rate: p.voice.rate, seed: p.id }) }, '🔊 Test voice'),
              h('span.spacer'),
              h('button.btn.small', { onclick: home }, 'Cancel'),
              h(
                'button.btn',
                {
                  onclick: () => {
                    const list = loadCustom();
                    const i = list.findIndex((x) => x.id === p.id);
                    if (i >= 0) list[i] = p;
                    else list.push(p);
                    saveCustom(list);
                    status = `Saved "${p.name}". They will start calling in.`;
                    bus.emit('toast', { text: `Caller "${p.name}" saved`, kind: 'good' });
                    home();
                  },
                },
                'Save caller',
              ),
            ),
          ),
        ),
      );
    };

    home();
  },
};

function download(data: unknown, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
