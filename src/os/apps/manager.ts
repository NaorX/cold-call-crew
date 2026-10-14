import { h, clear, money } from '../../ui/dom';
import { portrait } from '../../ui/portrait';
import { icon } from '../icons';
import { bus } from '../../game/bus';
import { crew, send } from '../../game/net';
import { settings, saveSettings } from '../../game/settings';
import type { AppDef } from '../wm';
import { skyControls } from '../../game/fun';

export const GameManagerApp: AppDef = {
  id: 'game',
  title: 'Game Manager',
  icon: 'settings',
  color: '#0a84ff',
  w: 520,
  h: 730,
  render(win) {
    const root = h('div.mgr');
    win.body.append(root);
    const draw = () => {
      clear(root);
      const run = crew.run;
      const phase = run?.phase || 'lobby';
      const status =
        phase === 'lobby' ? 'Shift not started' : phase === 'shift' ? `Day ${run?.day} in progress` : phase === 'review' ? `Day ${run?.day} is done` : 'Fired';
      root.append(
        h('div.mgr-ico', { innerHTML: icon(crew.online ? 'users' : 'user') }),
        h('h2.mgr-title', null, crew.online ? 'Your crew' : 'Solo shift'),
        h('p.mgr-sub', null, crew.online ? 'Friends join from the main menu with this code.' : 'Just you today. Host a crew from the main menu to play with friends.'),
        crew.online ? h('div.mgr-code', null, ...crew.code.split('').map((ch) => h('span', null, ch))) : '',
        h(
          'div.mgr-crew',
          null,
          crew.players.map((p) =>
            h(
              'div.mgr-member',
              null,
              h('div.mgr-face', { innerHTML: portrait((p.look as any) || settings.look, 'happy') }),
              h('b', null, p.name),
              h('small', null, p.id === crew.host ? 'Host' : money(p.personal)),
            ),
          ),
        ),
        h('div.mgr-status', { class: phase }, h('i'), status, phase === 'shift' && run ? h('span', null, `Quota ${money(run.quota)}`) : null),
      );
      if (!crew.isHost) {
        root.append(h('p.mgr-wait', null, 'Waiting for the host to start the shift.'));
        return;
      }
      root.append(skyControls());
      if (phase === 'lobby') {
        const minutes = Math.round(settings.shiftSeconds / 60);
        root.append(
          h('div.mgr-label', null, 'Shift length'),
          h(
            'div.mgr-seg',
            null,
            ...[10, 20, 30, 45].map((m) => h('button', { class: minutes === m ? 'on' : '', onclick: () => (saveSettings({ shiftSeconds: m * 60 }), draw()) }, `${m} min`)),
          ),
          h('button.mgr-go', { onclick: () => send({ t: 'start', shiftSeconds: settings.shiftSeconds }) }, h('span', { innerHTML: icon('play') }), 'Start shift'),
        );
      } else if (phase === 'review') root.append(h('button.mgr-go', { onclick: () => send({ t: 'continue' }) }, 'Start next day'));
      else if (phase === 'fired') root.append(h('button.mgr-go', { onclick: () => send({ t: 'restart' }) }, 'New run'));
    };
    draw();
    const offs = [bus.on('net:state', draw)];
    return () => offs.forEach((o) => o());
  },
};
