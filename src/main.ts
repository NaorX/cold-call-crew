import '@fontsource/luckiest-guy';
import '@fontsource-variable/inter';
import '@fontsource/anton';
import '@fontsource-variable/jetbrains-mono';
import './style.css';
import * as THREE from 'three';
import { World } from './engine/world';
import { OSShell } from './os/desktop';
import { Menu } from './ui/menu';
import { Creator } from './ui/creator';
import { Hud, daySplash, crewTicker, toggleClockOut, reviewLeft } from './ui/hud';
import { runMeeting } from './ui/meeting';
import { PauseMenu } from './ui/pause';
import { h, money } from './ui/dom';
import { Hazards } from './game/hazards';
import { bus } from './game/bus';
import { crew, playSolo, hostCrew, joinCrew, leaveCrew, send } from './game/net';
import { game } from './game/game';
import { settings, saveSettings, onSettings, UPGRADES } from './game/settings';
import { audio, sfx, startAmbience, startMenuMusic, stopMenuMusic, stopRinging, stopSiren } from './game/audio';
import { micLevel, shutUp } from './game/voice';
import { listener } from './os/apps/phone';
import { checkBackend } from './game/ai';
import { voiceChat } from './game/voicechat';
import { isTyping } from './engine/player';
import { setupFun } from './game/fun';
import { live } from './game/live';
import { setupPranks } from './ui/pranks';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

const world = new World(canvas, settings.quality, settings.look);
const os = new OSShell(world, 'desk');
const laptop = new OSShell(world, 'laptop');
const hud = new Hud();
const creator = new Creator(world);
const hazards = new Hazards(os, world, ui);
let screen: 'splash' | 'menu' | 'creator' | 'game' = 'splash';
let meeting: { el: HTMLElement; stop: () => void } | null = null;
function closeMeeting() {
  hud.quiet = false;
  meeting?.stop();
  meeting = null;
  world.endMeeting();
}
let creatorReturn: 'menu' | 'game' = 'menu';

const menu = new Menu({
  solo: () => playSolo(),
  host: () =>
    hostCrew((t) => {
      hud.toast(t, 'bad');
      menu.play();
    }),
  join: (code) =>
    joinCrew(code, (t) => {
      hud.toast(t, 'bad');
      menu.joinCode();
    }),
  leave: () => quitToMenu(),
  setLook: () => world.setMyLook(settings.look),
  customize: () => openCreator('menu'),
});

const pause = new PauseMenu({
  resume: () => resumeGame(),
  customize: () => openCreator('game'),
  quit: () => quitToMenu(),
});
ui.append(menu.el, creator.el, hud.el, os.el, laptop.el, pause.el, hud.toasts);

function openPause() {
  if (screen !== 'game' || pause.open) return;
  world.player.enabled = false;
  world.player.clearKeys();
  pause.show();
  if (!crew.online) send({ t: 'pause', on: true });
}
function resumeGame() {
  pause.hide();
  if (!crew.online) send({ t: 'pause', on: false });
  if (world.mode === 'play') {
    world.player.enabled = true;
    world.player.lock();
  }
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && screen === 'game' && world.mode === 'play' && world.player.enabled && !pause.open && !fun.modalOpen()) openPause();
});
crewTicker(ui);

const splash = h(
  'div.splash',
  null,
  h('div.logo.big', null, h('div.logo-top', null, 'COLD CALL'), h('div.logo-bottom', null, 'CREW')),
  h('div.splash-hint', null, 'CLICK ANYWHERE TO CLOCK IN'),
  h('small.splash-legal', null, 'A satire game. All callers, companies and money are fictional.'),
);
ui.append(splash);
splash.addEventListener('click', () => {
  audio();
  startMenuMusic();
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 600);
  if (!settings.created) openCreator('menu');
  else {
    screen = 'menu';
    menu.show();
  }
});

world.start();
void checkBackend();
if (import.meta.env.DEV) Object.assign(window as any, { __world: world, __game: game, __crew: crew, __os: os, __send: send, __laptop: laptop });

function openCreator(from: 'menu' | 'game') {
  if (from === 'game' && world.seat !== null) standUp();
  creatorReturn = from;
  screen = 'creator';
  menu.hide();
  hud.hide();
  creator.show();
  world.setMode('creator', undefined, 1.2);
}
creator.onDone = () => {
  saveSettings({ created: true });
  creator.hide();
  send({ t: 'look', look: settings.look, name: settings.name });
  if (creatorReturn === 'game') {
    screen = 'game';
    world.spawn();
    world.setMode('play', undefined, 1);
    hud.show();
  } else {
    screen = 'menu';
    world.setMode('menu', undefined, 1.2);
    menu.show();
  }
};
onSettings(() => world.setMyLook(settings.look));

for (const d of world.office.desks) {
  if (d.npc) continue;
  world.interactables.push({
    id: `desk${d.index}`,
    pos: d.chair,
    radius: 1.0,
    label: () => (world.occupied.has(d.index) ? null : 'Sit down'),
    act: () => sitDown(d.index),
  });
}
const lp = world.office.laptop.getWorldPosition(new THREE.Vector3());
world.interactables.push({ id: 'laptop', pos: new THREE.Vector3(lp.x, 0, lp.z + 0.6), radius: 1.5, label: () => 'Use the manager laptop', act: () => openLaptop() });
const cm = world.office.coffeeMachine.getWorldPosition(new THREE.Vector3());
let coffeeDay = 0;
world.interactables.push({
  id: 'coffee',
  pos: new THREE.Vector3(cm.x + 0.5, 0, cm.z),
  radius: 1.4,
  label: () => (coffeeDay === (crew.run?.day || 0) ? 'Coffee pot is empty' : 'Grab a coffee (free, once a day)'),
  act: () => {
    if (coffeeDay === (crew.run?.day || 0)) return hud.toast('Someone drank it all. Buy Industrial Coffee in the Bargain Bin.');
    coffeeDay = crew.run?.day || 0;
    game.coffee++;
    sfx.pickup();
    hud.toast('You grabbed a coffee. Press C during a call for +15 trust.', 'coffee');
  },
});
const bk = world.office.breaker.position;
world.interactables.push({ id: 'breaker', pos: new THREE.Vector3(bk.x - 0.4, 0, bk.z), radius: 1.6, label: () => (game.outage ? 'Flip the breaker' : null), act: () => hazards.fixPower() });

let smokedAt = -1e9;
let smokeBreakUntil = 0;
const SMOKE_BREAK_MS = 60_000;
function setSmoking(on: boolean) {
  if (on === world.smoking) return;
  smokeBreakUntil = on ? performance.now() + SMOKE_BREAK_MS : 0;
  world.setSmoking(on);
}
function onPatio() {
  const p = world.player.pos;
  return p.x > -11.6 && p.x < -1.9 && p.z > 15.7 && p.z < 22.2;
}
function checkSmokeBreak() {
  if (!world.smoking) return;
  if (!onPatio() || world.mode !== 'play') {
    setSmoking(false);
    hud.toast('No smoking inside, so you put it out.', 'info');
  } else if (performance.now() > smokeBreakUntil) {
    setSmoking(false);
    hud.toast("That one's done. Back to work!", 'info');
  }
}
world.interactables.push({
  id: 'smoke',
  pos: world.office.smokeSpot,
  radius: 2.2,
  label: () => (world.smoking ? 'Stub it out' : 'Take a smoke break'),
  act: () => {
    if (world.smoking) return setSmoking(false);
    setSmoking(true);
    sfx.whoosh();
    const fresh = performance.now() - smokedAt > 120_000;
    smokedAt = performance.now();
    if (fresh) {
      game.coffee++;
      hud.toast('Fresh air. You feel smooth again: +1 charm boost (press C on a call).', 'coffee');
    } else hud.toast('Another one already? The boss is counting.', 'info');
  },
});

const fun = setupFun(world, hud, ui);
setupPranks(ui, world);
world.interactables.push(...fun.interactables);

let satAt = 0;
function sitDown(index: number) {
  if (world.occupied.has(index)) return hud.toast('Someone is sitting there.');
  satAt = performance.now();
  sfx.click();
  world.sitAt(index);
  game.seated = true;
  game.nextLeadIn = Math.min(game.nextLeadIn, 3);
  sendPose(true);
}

function standUp() {
  if (world.mode !== 'seated') return;
  if (game.call) game.endCall('You walked away from your desk');
  world.standUp();
  game.seated = false;
  game.leads = [];
  bus.emit('leads:changed');
  sendPose(true);
}

function enterGame() {
  if (screen === 'game') return;
  screen = 'game';
  menu.hide();
  stopMenuMusic();
  startAmbience();
  os.reset();
  laptop.reset();
  world.drawMyScreen('boot');
  world.spawn();
  world.setMode('play', undefined, 1.4);
  hud.show();
  hud.toast(crew.online ? `Welcome to crew ${crew.code}. Walk around with WASD, click to look.` : 'Walk with WASD, click to look around. Start the shift on the laptop on the red table.', 'info');
  if (crew.online && settings.voiceChat) void voiceChat.start();
}

function quitToMenu() {
  voiceChat.stop();
  leaveCrew();
  shutUp();
  listener.stop();
  stopRinging();
  stopSiren();
  hazards.clearAll();
  game.resetRun();
  game.seated = false;
  os.hide();
  laptop.hide();
  os.reset();
  laptop.reset();
  world.frozen = false;
  world.seat = null;
  meeting?.stop();
  meeting = null;
  hud.quiet = false;
  world.meeting = null;
  world.slidesOn = false;
  hud.hide();
  world.syncCrew([], '');
  world.spawn();
  world.setMode('menu', undefined, 1.4);
  screen = 'menu';
  menu.show();
  startMenuMusic();
}

function enterScreen(after?: () => void) {
  if (world.mode !== 'seated') return;
  hud.hide();
  sfx.whoosh();
  world.setMode(
    'screen',
    () => {
      world.frozen = true;
      os.show(after);
      if (!game.outage) world.drawMyScreen('desktop');
    },
    0.7,
  );
}

function exitScreen() {
  if (world.mode === 'screen') {
    world.frozen = false;
    os.hide();
    sfx.whoosh();
    world.setMode('seated', () => hud.show(), 0.6);
  } else if (world.mode === 'laptop') {
    world.frozen = false;
    laptop.hide();
    sfx.whoosh();
    world.setMode('play', () => hud.show(), 0.6);
  }
}

function openLaptop() {
  hud.hide();
  sfx.whoosh();
  world.setMode(
    'laptop',
    () => {
      world.frozen = true;
      laptop.show();
    },
    0.8,
  );
}

os.onExit = exitScreen;
laptop.onExit = exitScreen;
os.onQuit = quitToMenu;
laptop.onQuit = quitToMenu;
hazards.onOutage = () => {
  if (world.mode === 'screen') setTimeout(exitScreen, 900);
};

bus.on('net:welcome', () => enterGame());
let lastBoards = 0;
function refreshBoards() {
  const run = crew.run;
  if (!run) return;
  world.updateBoards({
    day: run.day,
    quota: run.quota,
    team: run.teamToday,
    phase: run.phase,
    crew: crew.players.map((p) => ({ name: p.name, today: p.today })).sort((a, b) => b.today - a.today),
  });
}
const affordNotified = new Set<string>();
bus.on('net:state', () => {
  world.syncCrew(crew.players as any, crew.me);
  refreshBoards();
  const me = crew.self;
  if (me && crew.run?.phase === 'shift')
    for (const u of UPGRADES)
      if ('app' in u && !game.has(u.key) && me.personal >= u.price && !affordNotified.has(u.key) && (!('day' in u) || crew.run.day >= u.day)) {
        affordNotified.add(u.key);
        hud.toast(`You can now afford ${u.name} in the Bargain Bin.`, 'money');
      }
});
bus.on('net:dayStart', (m: any) => {
  if (meeting) {
    closeMeeting();
    hud.show();
  }
  if (m.day === 1) affordNotified.clear();
  daySplash(ui, m.day, m.quota, m.fresh || []);
  if (world.mode === 'laptop') exitScreen();
  if (!game.seated) hud.toast('The shift has started! Go through the red door and sit at a free desk.', 'boss');
  refreshBoards();
});
bus.on('net:review', (m: any) => {
  shutUp();
  listener.stop();
  stopRinging();
  if (game.call) game.endCall('The boss called everyone into his office');
  game.leads = [];
  bus.emit('leads:changed');
  os.hide();
  laptop.hide();
  world.frozen = false;
  if (world.seat !== null) {
    world.seat = null;
    game.seated = false;
  }
  world.player.unlock();
  hud.hide();
  pause.hide();
  meeting?.stop();
  hud.toasts.replaceChildren();
  hud.quiet = true;
  meeting = runMeeting(ui, world, m, quitToMenu);
  sendPose(true);
});
bus.on('net:pose', (m: any) => m.id !== crew.me && world.remotePose(m.id, m.pose, m.talking));
bus.on('net:boss', (m: any) => {
  hud.toast(`The Boss: ${m.text}`, 'boss');
  sfx.notify();
});
bus.on('net:earned', (m: any) => {
  if (m.id === crew.me && m.amount > 0) hud.toast(`+$${m.amount.toLocaleString()} · ${m.note}`, 'money');
});
bus.on('net:closed', () => {
  if (screen === 'game') {
    hud.toast('Lost connection to the crew server.', 'bad');
    quitToMenu();
  }
});
let talking = false;
bus.on('me:talking', (on: boolean) => {
  if (on === talking) return;
  talking = on;
  send({ t: 'talk', on });
});

let lastPose = '';
function sendPose(force = false) {
  if (screen !== 'game') return;
  const pose = world.myPose();
  const key = JSON.stringify(pose);
  if (!force && key === lastPose) return;
  lastPose = key;
  send({ t: 'pose', pose });
}

world.player.onInteract = () => {
  if (!fun.holding()) world.focus?.act();
};
canvas.addEventListener('click', (e) => {
  if (screen !== 'game') return;
  if (world.mode === 'seated') {
    const what = world.pickSeated(e.clientX, e.clientY);
    if (what === 'monitor') enterScreen();
    else if (what === 'phone')
      enterScreen(() => {
        os.open('phone');
        if (!game.call && game.leads.length) game.answer(0);
      });
    else if (what === 'mug') drinkCoffee();
  }
});

bus.on('coffee:drink', () => drinkCoffee());
function drinkCoffee() {
  if (game.coffee <= 0) return hud.toast('No coffee. Grab one in the break room or buy Industrial Coffee.');
  game.coffee--;
  game.firePerk('coffee');
  sfx.levelUp();
  if (game.call) {
    game.call.trust = Math.min(100, game.call.trust + 15);
    bus.emit('call:changed');
  }
  hud.toast('Caffeine! Current caller +15 trust.', 'coffee');
}

let pttDown = false;
window.addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  if (screen !== 'game') return;
  if (e.code === 'Escape') {
    if (fun.modalOpen()) fun.closeModal();
    else if (pause.open) resumeGame();
    else if (world.mode === 'screen' || world.mode === 'laptop') exitScreen();
    else if (world.mode === 'seated' || world.mode === 'play') openPause();
  } else if (pause.open) return; else if (e.code === 'KeyO' && (world.mode === 'play' || world.mode === 'seated')) toggleClockOut();
  else if (e.code === 'KeyE' && world.mode === 'seated') {
    if (performance.now() - satAt > 300) enterScreen();
  }
  else if (world.mode === 'seated' && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) standUp();
  else if (e.code === 'Tab') {
    e.preventDefault();
    hud.showPlayers(
      true,
      crew.players.map((p) => ({ name: p.name, status: p.onCall ? `On a call · ${p.onCall}` : p.pose?.a === 'sit' ? 'at desk' : 'walking', money: money(p.today), host: p.id === crew.host })),
    );
  } else if (e.code === 'KeyM') voiceChat.toggleMute();
  else if (e.code === 'KeyV' && !pttDown && !e.repeat && game.call && !live.active) {
    pttDown = true;
    if (!listener.listening) listener.start();
  } else if (e.code === 'KeyC' && (world.mode === 'seated' || world.mode === 'play')) drinkCoffee();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') hud.showPlayers(false);
  if (e.code === 'KeyV' && pttDown) {
    pttDown = false;
    listener.stop();
  }
});
let lastKey = 0;
window.addEventListener('keydown', (e) => {
  if (isTyping(e)) {
    lastKey = performance.now();
    sfx.key();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!crew.online && screen === 'game') send({ t: 'pause', on: document.hidden });
});

let poseAcc = 0;
let lastTick = 0;
let uiAcc = 0;
world.player.setFirstPerson(settings.view === 'first');
world.player.onViewChange = (fp) => settings.view !== (fp ? 'first' : 'third') && saveSettings({ view: fp ? 'first' : 'third' });
onSettings(() => world.player.setFirstPerson(settings.view === 'first'));
world.onFrame = (dt) => {
  checkSmokeBreak();
  fun.update(dt);
  world.shiftMinutes = crew.run?.clock || 0;
  if (screen !== 'game') return;
  game.tick(dt);
  hazards.tick(dt);

  uiAcc += dt;
  if (uiAcc > 0.25) {
    uiAcc = 0;
    hud.update();
    const left = Math.ceil(reviewLeft());
    if (crew.run?.phase === 'shift' && left > 0 && left <= 10 && left !== lastTick) {
      lastTick = left;
      sfx.blip(left <= 3 ? 990 : 740);
    }
    if (os.visible) os.update();
    if (laptop.visible) laptop.update();
    lastBoards += 0.25;
    if (lastBoards > 2) {
      lastBoards = 0;
      refreshBoards();
    }
    const live = crew.run?.phase === 'shift';
    const k = (key: string, what: string) => `<span><kbd>${key}</kbd>${what}</span>`;
    if (world.mode === 'play') hud.setHint(world.player.locked ? `${k('WASD', 'Move')}${k('Shift', 'Run')}${k('E', 'Use')}${k('F', world.player.firstPerson ? 'Third person' : 'First person')}${k('Tab', 'Players')}${k('Esc', 'Menu')}` : `${k('Click', 'Look around')}${k('WASD', 'Move')}${k('Esc', 'Menu')}`);
    else if (world.mode === 'seated') hud.setHint(`${k('E', 'Use computer')}${k('WASD', 'Stand up')}${k('Esc', 'Menu')}`);
    const funHint = fun.hint();
    if (funHint) hud.setHint(funHint);
    if (game.call) hud.setAlert(world.mode === 'seated' ? `On a call with ${game.call.persona.name} · press E` : null, 'call');
    else if (live && game.seated && game.leads.length) hud.setAlert('Incoming call! Open your computer', 'call');
    else if (live && !game.seated && world.mode === 'play') hud.setAlert('Sit at a free desk to take calls');
    else if (crew.run?.phase === 'lobby' && world.mode === 'play') hud.setAlert(crew.isHost ? 'Use the laptop on the red table to start the shift' : 'Waiting for the host to start the shift');
    else hud.setAlert(null);
    hud.setVoice(!voiceChat.active ? 'off' : voiceChat.muted ? 'muted' : voiceChat.speaking ? 'talking' : 'on');
  }

  hud.setPrompt(world.mode === 'play' && world.focus ? world.focus.label() : null);

  world.me.typing = world.mode === 'screen' && performance.now() - lastKey < 800;
  world.me.talk = live.micOn ? Math.min(1, Math.max(0, live.level - 0.015) * 14) : listener.listening ? Math.min(1, micLevel() * 9) : voiceChat.speaking ? 0.6 : 0;

  poseAcc += dt;
  if (crew.online && poseAcc > 0.1) {
    poseAcc = 0;
    sendPose();
  }
  if (voiceChat.active) {
    const others = new Map<string, { x: number; z: number }>();
    for (const [id, r] of world.remotes) others.set(id, { x: r.avatar.root.position.x, z: r.avatar.root.position.z });
    voiceChat.update({ x: world.me.root.position.x, z: world.me.root.position.z, f: world.me.root.rotation.y }, others);
  }
};

if (import.meta.env.DEV)
  (window as any).__ccc = {
    world, game, os, crew, send, bus, sitDown, enterScreen, enterGame, hud,
    async solo() {
      const w = (ms: number) => new Promise((r) => setTimeout(r, ms));
      playSolo();
      await w(400);
      enterGame();
      send({ t: 'start', shiftSeconds: 300 });
      await w(600);
      document.querySelectorAll('.day-splash, .splash, .toast').forEach((e) => e.remove());
    },
    async quick(app = 'phone') {
      const w = (ms: number) => new Promise((r) => setTimeout(r, ms));
      if (screen !== 'game') {
        playSolo();
        await w(400);
        enterGame();
        send({ t: 'start', shiftSeconds: 300 });
        await w(600);
        sitDown(0);
      }
      document.querySelectorAll('.day-splash, .splash').forEach((e) => e.remove());
      if (!game.call) {
        game.nextLeadIn = 0;
        game.tick(0.1);
        game.answer(0);
      }
      world.frozen = true;
      os.show();
      os.open(app);
    },
    async review(fail = false) {
      const w = (ms: number) => new Promise((r) => setTimeout(r, ms));
      await this.quick();
      await w(300);
      if (!fail) {
        game.earn(350, 'giftcard', 'Google Play card from Harold Biggins');
        game.earn(249, 'card', "Margaret Pickles's card");
        game.earn(100, 'scammy', 'Scammy challenge with Frank');
        send({ t: 'quote', text: "Ma'am, I am here for you. Nobody else at Microsoft would stay on the line this long.", to: 'Margaret Pickles', gain: 9 });
      } else game.earn(120, 'giftcard', 'Steam card from Earl');
      game.endCall('test');
      game.giftCards = [];
      send({ t: 'loot', n: 0 });
      send({ t: 'onCall', name: null });
      send({ t: 'debugEnd' });
    },
  };
