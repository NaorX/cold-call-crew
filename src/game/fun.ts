// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import type { World, Interactable } from '../engine/world';
import type { Hud } from '../ui/hud';
import { crew, send } from './net';
import { audio, masterNode, setRain, sfx } from './audio';
import { settings } from './settings';
import { TunePlayer } from '../ao/music';
import { Blocks, paintScreen, W as SW, H as SH } from '../ao/blocks';
import type { HighScore } from '../ao/cabinet-rules';
import { Basketball, idealThrow, type Shot } from '../engine/ball';
import type { Weather } from '../engine/environment';
import { h, clear, clockHour } from '../ui/dom';
import { icon } from '../os/icons';
import { bus } from './bus';

export const TRACKS = [
  { id: 'rainy-window', title: 'Rainy Window', mood: 'Slow and dreamy' },
  { id: 'coffee-break', title: 'Coffee Break', mood: 'Jazzy, easy swing' },
  { id: 'late-commit', title: 'Late Shift', mood: 'Minor key, 2 a.m.' },
  { id: 'green-build', title: 'Quota Made', mood: 'Bright and bouncy' },
];

export const TIMES = [
  { id: 'auto', label: 'Auto', icon: 'auto' },
  { id: 'morning', label: 'Morning', icon: 'sunrise' },
  { id: 'noon', label: 'Noon', icon: 'sun' },
  { id: 'sunset', label: 'Sunset', icon: 'sunset' },
  { id: 'night', label: 'Night', icon: 'moon' },
] as const;
export const WEATHER_OPTIONS = [
  { id: 'auto', label: 'Auto', icon: 'auto' },
  { id: 'clear', label: 'Clear', icon: 'sun' },
  { id: 'cloudy', label: 'Cloudy', icon: 'cloud' },
  { id: 'rain', label: 'Rain', icon: 'rain' },
  { id: 'storm', label: 'Storm', icon: 'storm' },
  { id: 'fog', label: 'Fog', icon: 'fog' },
  { id: 'snow', label: 'Snow', icon: 'snow' },
] as const;

const PRESET_HOUR: Record<string, number> = { morning: 8.5, noon: 13, sunset: 19.4, night: 23 };
const FORECAST: Weather[] = ['clear', 'cloudy', 'rain', 'clear', 'storm', 'fog', 'snow'];

export function youtubeId(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || undefined;
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return undefined;
    if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || undefined;
    return u.searchParams.get('v') || undefined;
  } catch {
    return undefined;
  }
}

let ytLoading: Promise<any> | null = null;
function loadYouTube(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!ytLoading)
    ytLoading = new Promise((ok) => {
      w.onYouTubeIframeAPIReady = () => ok(w.YT);
      const sc = document.createElement('script');
      sc.src = 'https://www.youtube.com/iframe_api';
      document.head.append(sc);
    });
  return ytLoading;
}

export function shiftHour(clockMinutes: number) {
  return 8 + (Math.max(0, Math.min(480, clockMinutes)) / 480) * 14;
}

export function setupFun(world: World, hud: Hud, ui: HTMLElement) {
  const interactables: Interactable[] = [];
  let modal: HTMLElement | null = null;

  let rainLevel = -1;
  world.env.onThunder = (delay, loud) => setTimeout(() => sfx.thunder(loud), delay * 1000);
  const sky = () => {
    const w = crew.world;
    const run = crew.run;
    const hour = w.time !== 'auto' ? PRESET_HOUR[w.time] : run && run.phase !== 'lobby' ? shiftHour(run.clock) : 10;
    const weather: Weather = w.weather !== 'auto' ? (w.weather as Weather) : FORECAST[((run?.day || 1) - 1) % FORECAST.length];
    world.setSky(hour, weather);
    clockHour.fixed = w.time !== 'auto' ? hour : null;
    const level = weather === 'storm' ? 1 : weather === 'rain' ? 0.7 : 0;
    if (level !== rainLevel) {
      rainLevel = level;
      setRain(level);
    }
  };

  const jb = world.office.jukebox;
  const jbPos = new THREE.Vector3();
  jb.group.getWorldPosition(jbPos);
  let tune: TunePlayer | null = null;
  let tuneKey = '';
  let tuneStart = 0;
  let panner: PannerNode | null = null;
  let stream: { kind: 'yt' | 'audio'; el?: HTMLAudioElement; yt?: any; ready: boolean } | null = null;
  const stopStream = () => {
    if (!stream) return;
    stream.el?.pause();
    stream.el?.removeAttribute('src');
    try {
      stream.yt?.destroy();
    } catch {
    }
    document.getElementById('jb-yt')?.remove();
    stream = null;
  };
  const elapsed = () => Math.max(0, (Date.now() - tuneStart) / 1000);
  const playStream = (url: string) => {
    const id = youtubeId(url);
    if (id) {
      stream = { kind: 'yt', ready: false };
      const s0 = stream;
      void loadYouTube().then((YT) => {
        if (stream !== s0) return;
        const host = h('div#jb-yt', { style: { position: 'fixed', left: '-9999px', top: '0', width: '200px', height: '120px' } });
        host.append(h('div#jb-yt-player'));
        document.body.append(host);
        s0.yt = new YT.Player('jb-yt-player', {
          videoId: id,
          playerVars: { autoplay: 1, controls: 0, start: Math.floor(elapsed()), playsinline: 1 },
          events: {
            onReady: (e: any) => {
              s0.ready = true;
              e.target.setVolume(0);
              e.target.seekTo(elapsed(), true);
              e.target.playVideo();
            },
            onStateChange: (e: any) => {
              if (e.data === 0) e.target.seekTo(0, true);
            },
            onError: () => hud.toast("That YouTube video can't be played here. Try another link.", 'bad'),
          },
        });
      });
      return;
    }
    const el = new Audio(url);
    el.loop = true;
    el.volume = 0;
    el.addEventListener('loadedmetadata', () => {
      if (el.duration && isFinite(el.duration)) el.currentTime = elapsed() % el.duration;
    });
    el.addEventListener('error', () => hud.toast("Couldn't play that link. Use a direct audio file (mp3) or a YouTube link.", 'bad'));
    void el.play().catch(() => {});
    stream = { kind: 'audio', el, ready: true };
  };
  const music = () => {
    const j = crew.world.jukebox as { track: string | null; at: number; url?: string };
    const key = `${j.track}|${j.at}|${j.url ?? ''}`;
    if (key === tuneKey) return;
    tuneKey = key;
    tune?.stop();
    tune = null;
    stopStream();
    tuneStart = j.at + crew.skew;
    if (j.track === 'stream' && j.url) {
      jb.show(true, youtubeId(j.url) ? 'YouTube' : (j.url.split('/').pop() || 'A song').slice(0, 28));
      playStream(j.url);
      return;
    }
    const t = TRACKS.find((x) => x.id === j.track);
    jb.show(!!t, t?.title ?? '');
    if (!t) return;
    const ctx = audio();
    if (!panner) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2.5;
      panner.rolloffFactor = 1.3;
      panner.positionX.value = jbPos.x;
      panner.positionY.value = 1.2;
      panner.positionZ.value = jbPos.z;
      panner.connect(masterNode());
    }
    tune = new TunePlayer(ctx, panner, t.id);
  };
  const streamVolume = () => {
    const d = world.camera.position.distanceTo(jbPos);
    return Math.max(0, Math.min(1, 2.5 / Math.max(2.5, d))) * settings.volume;
  };
  const camDir = new THREE.Vector3();
  const listen = () => {
    const ctx = audio();
    const l = ctx.listener;
    const c = world.camera;
    c.getWorldDirection(camDir);
    if (l.positionX) {
      l.positionX.value = c.position.x;
      l.positionY.value = c.position.y;
      l.positionZ.value = c.position.z;
      l.forwardX.value = camDir.x;
      l.forwardY.value = camDir.y;
      l.forwardZ.value = camDir.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  };
  const closeModal = () => {
    modal?.remove();
    modal = null;
    if (world.mode === 'play') {
      world.player.enabled = true;
      world.player.lock();
    }
  };
  const openJukebox = () => {
    world.player.unlock();
    world.player.enabled = false;
    const j = crew.world.jukebox as { track: string | null; url?: string };
    const now = j.track;
    const link = h('input.fun-input', { placeholder: 'Paste a YouTube or MP3 link', value: now === 'stream' ? j.url ?? '' : '', spellcheck: false }) as HTMLInputElement;
    const playLink = () => {
      const url = link.value.trim();
      if (!/^https?:\/\//i.test(url)) return hud.toast('Paste a full link that starts with https://', 'bad');
      send({ t: 'jukebox', track: 'stream', url });
      sfx.click();
      closeModal();
    };
    link.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') playLink();
      if (e.key === 'Escape') closeModal();
    });
    modal = h(
      'div.fun-modal',
      { onclick: (e: Event) => e.target === modal && closeModal() },
      h(
        'div.fun-card',
        null,
        h('div.fun-head', null, h('span.fun-ico', { innerHTML: icon('music') }), h('div', null, h('b', null, 'Jukebox'), h('small', null, 'Everyone in the office hears it'))),
        h(
          'div.fun-list',
          null,
          ...TRACKS.map((t) =>
            h(
              'button.fun-row',
              { class: now === t.id ? 'on' : '', onclick: () => (send({ t: 'jukebox', track: t.id }), sfx.click(), closeModal()) },
              h('span.fun-row-ico', { innerHTML: icon(now === t.id ? 'speaker' : 'play') }),
              h('div', null, h('b', null, t.title), h('small', null, t.mood)),
            ),
          ),
        ),
        h('div.fun-label', null, 'Your own song'),
        h('div.fun-link', { class: now === 'stream' ? 'on' : '' }, link, h('button.fun-btn', { onclick: playLink }, 'Play')),
        h('div.fun-foot', null, now ? h('button.fun-btn.ghost', { onclick: () => (send({ t: 'jukebox', track: null }), closeModal()) }, 'Stop the music') : null, h('button.fun-btn.ghost', { onclick: closeModal }, 'Done')),
      ),
    );
    ui.append(modal);
    setTimeout(() => link.focus(), 50);
  };
  interactables.push({
    id: 'jukebox',
    pos: world.office.jukeboxSpot,
    radius: 1.8,
    label: () => (crew.world.jukebox.track ? 'Change the music' : 'Play some music'),
    act: openJukebox,
  });

  const canvas = document.createElement('canvas');
  canvas.width = SW;
  canvas.height = SH;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const screenMat = world.office.arcade.screen.material as THREE.MeshBasicMaterial;
  screenMat.map = tex;
  screenMat.color.set('#ffffff');
  screenMat.needsUpdate = true;
  const SCORES_KEY = 'ccc.blockfall';
  let scores: HighScore[] = [];
  try {
    scores = JSON.parse(localStorage.getItem(SCORES_KEY) || '[]');
  } catch {
    scores = [];
  }
  let blocks: Blocks | null = null;
  let recorded = false;
  let paintT = 0;
  let paintedVersion = -1;
  const paint = (t: number) => {
    paintScreen(g, {
      frame: blocks ? blocks.frame() : null,
      player: blocks ? settings.name : undefined,
      scores,
      mine: blocks?.id,
      prompt: blocks ? (blocks.over ? 'SPACE to play again · ESC to leave' : undefined) : 'Press E to play',
      t,
    });
    tex.needsUpdate = true;
  };
  const newGame = () => {
    blocks = new Blocks();
    blocks.id = `${Date.now()}`;
    blocks.onLand = (n) => (n > 0 ? sfx.blip(880 + n * 120) : sfx.blip(220));
    recorded = false;
  };
  const leaveArcade = () => {
    if (blocks && !blocks.over) blocks.pause(true);
    blocks = null;
    world.setMode('play', () => {
      world.player.enabled = true;
      world.player.lock();
    }, 0.6);
  };
  interactables.push({
    id: 'arcade',
    pos: world.office.arcade.spot,
    radius: 1.4,
    label: () => 'Play BLOCKFALL',
    act: () => {
      world.player.unlock();
      world.player.enabled = false;
      newGame();
      world.setMode('arcade', undefined, 0.7);
    },
  });
  const ARCADE_KEYS: Record<string, () => void> = {};
  window.addEventListener(
    'keydown',
    (e) => {
      if (world.mode !== 'arcade' || !blocks) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat && !['ArrowDown', 'KeyS'].includes(e.code)) return;
      const b = blocks;
      switch (e.code) {
        case 'Escape':
          return leaveArcade();
        case 'ArrowLeft':
        case 'KeyA':
          return b.press(-1);
        case 'ArrowRight':
        case 'KeyD':
          return b.press(1);
        case 'ArrowUp':
        case 'KeyW':
        case 'KeyX':
          return b.rotate(1);
        case 'KeyZ':
          return b.rotate(-1);
        case 'ArrowDown':
        case 'KeyS':
          return b.softDrop(true);
        case 'Space':
          if (b.over) return newGame();
          return b.hardDrop();
        case 'KeyC':
        case 'ShiftLeft':
        case 'ShiftRight':
          return b.hold();
        case 'KeyP':
          return b.pause(b.state !== 'paused');
      }
      void ARCADE_KEYS;
    },
    true,
  );
  window.addEventListener(
    'keyup',
    (e) => {
      if (world.mode !== 'arcade' || !blocks) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') blocks.release(-1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') blocks.release(1);
      if (e.code === 'ArrowDown' || e.code === 'KeyS') blocks.softDrop(false);
    },
    true,
  );
  const recordScore = () => {
    if (!blocks || recorded || blocks.score <= 0) return;
    recorded = true;
    scores = [...scores, { game: blocks.id, name: settings.name, color: '#4cc9f0', score: blocks.score, lines: blocks.lines, level: blocks.level, at: Date.now() }]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
    } catch {
    }
    if (scores[0]?.game === blocks.id) hud.toast(`New BLOCKFALL high score: ${blocks.score.toLocaleString()}!`, 'good');
  };

  const hoop = world.office.hoop;
  const ball = new Basketball(hoop);
  world.scene.add(ball.mesh);
  const near = (k: number) => {
    const d = world.camera.position.distanceTo(ball.pos);
    return k * Math.max(0, 1 - d / 18);
  };
  ball.onBounce = (k) => sfx.bounce(near(k));
  ball.onRim = () => near(1) > 0.1 && sfx.rim();
  ball.onScore = (shot: Shot) => {
    sfx.swish();
    if (shot.by === crew.me || (!crew.online && shot.by === 'me')) {
      const three = Math.hypot(shot.x - hoop.rim.x, shot.z - hoop.rim.z) > 5.5;
      send({ t: 'scored', three });
    }
  };
  bus.on('net:scored', (m: any) => {
    sfx.cheer();
    const mine = m.id === crew.me;
    hud.toast(mine ? (m.three ? 'Downtown! A long-range swish.' : 'Swish! Nothing but net.') : `${m.name} sank a shot.`, mine ? 'good' : 'info');
  });
  let shotKey = '';
  const applyBall = () => {
    const b = crew.world.ball;
    if (b.holder) {
      if (b.holder === crew.me && ball.state !== 'held') heldSince = performance.now();
      shotKey = '';
      ball.state = 'held';
      return;
    }
    if (b.shot) {
      const key = `${b.shot.at}`;
      if (key !== shotKey) {
        shotKey = key;
        ball.throw({ ...b.shot, at: b.shot.at + crew.skew });
      }
      return;
    }
    shotKey = '';
    if (ball.state !== 'home') ball.goHome();
  };
  const holdingIt = () => crew.world.ball.holder === crew.me && !!crew.me;
  let heldSince = 0;
  const fwd = new THREE.Vector3();
  const handPos = (out: THREE.Vector3) => {
    if (world.player.firstPerson && world.mode === 'play') return world.camera.localToWorld(out.set(0.2, -0.26, -0.5));
    const f = world.player.facing;
    return out.set(world.player.pos.x + Math.sin(f) * 0.38, world.player.pos.y + 1.05, world.player.pos.z + Math.cos(f) * 0.38);
  };
  interactables.push({
    id: 'ball',
    pos: ball.pos,
    radius: 1.3,
    label: () => (holdingIt() ? null : !crew.world.ball.holder && ball.state !== 'flying' ? 'Pick up the basketball' : null),
    act: () => {
      heldSince = performance.now();
      send({ t: 'ball', take: true });
      sfx.pickup();
    },
  });
  const meter = h('div.shot-meter', null, h('i.sweet'), h('i.fill'), h('span', null, 'Let go in the green'));
  ui.append(meter);
  let windFrom = 0;
  const power = () => {
    const held = (performance.now() - windFrom) / 1000 / 1.05;
    return 1 - Math.abs((held % 2) - 1);
  };
  const inRoom = () => {
    const p = world.player.pos;
    const r = hoop.room;
    return p.x > r.x0 - 0.8 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
  };
  const canShoot = () => holdingIt() && world.mode === 'play' && !modal && performance.now() - heldSince > 250;
  const windUp = () => {
    if (!canShoot() || windFrom) return;
    windFrom = performance.now();
    meter.classList.add('show');
  };
  const letFly = () => {
    if (!windFrom) return;
    const p = power();
    windFrom = 0;
    meter.classList.remove('show');
    if (!holdingIt()) return;
    const first = world.player.firstPerson;
    const facing = first ? world.player.camYaw + Math.PI : world.player.facing;
    const from = first ? world.camera.position.clone() : new THREE.Vector3(world.player.pos.x, world.player.pos.y + 1.75, world.player.pos.z);
    from.x += Math.sin(facing) * 0.3;
    from.z += Math.cos(facing) * 0.3;
    const toRim = new THREE.Vector3(hoop.rim.x - from.x, 0, hoop.rim.z - from.z);
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(toRim.x, toRim.z) - facing), Math.cos(Math.atan2(toRim.x, toRim.z) - facing)));
    world.camera.getWorldDirection(fwd);
    const camOff = fwd.clone().setY(0).normalize().angleTo(toRim.clone().normalize());
    const aimed = toRim.length() < 12 && toRim.length() > 0.4 && (off < (first ? 0.35 : 0.6) || (!first && camOff < 0.45));
    let v: THREE.Vector3 | null = null;
    if (aimed) {
      v = idealThrow(from, hoop.rim, 0.75 + toRim.length() * 0.06);
      const sweet = Math.abs(p - 0.78) <= 0.06;
      if (v && !sweet) v.multiplyScalar(1 + (p - 0.78) * 0.45);
      if (!first) world.player.facing = Math.atan2(toRim.x, toRim.z);
    }
    if (!v) {
      const pitch = first ? Math.max(0.15, -world.player.camPitch + 0.35) : 0.55;
      v = new THREE.Vector3(Math.sin(facing) * Math.cos(pitch), Math.sin(pitch), Math.cos(facing) * Math.cos(pitch)).multiplyScalar(3 + p * 7);
    }
    send({ t: 'ball', shot: { x: from.x, y: from.y, z: from.z, vx: v.x, vy: v.y, vz: v.z } });
    sfx.whoosh();
  };
  const dropBall = () => {
    if (!holdingIt()) return;
    windFrom = 0;
    meter.classList.remove('show');
    const from = handPos(new THREE.Vector3());
    const f = world.player.firstPerson ? world.player.camYaw + Math.PI : world.player.facing;
    send({ t: 'ball', shot: { x: from.x, y: from.y, z: from.z, vx: Math.sin(f) * 0.25, vy: 0, vz: Math.cos(f) * 0.25 } });
  };
  window.addEventListener('keydown', (e) => {
    if (!holdingIt() || e.repeat || world.mode !== 'play' || modal) return;
    if (e.code === 'KeyE') windUp();
    else if (e.code === 'KeyQ') dropBall();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') letFly();
  });
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || !canShoot()) return;
      e.stopPropagation();
      if (windFrom && !world.player.locked) letFly();
      else windUp();
    },
    true,
  );
  window.addEventListener(
    'pointerup',
    (e) => {
      if (e.button !== 0 || !windFrom || !world.player.locked) return;
      e.stopPropagation();
      letFly();
    },
    true,
  );

  bus.on('net:state', () => {
    music();
    applyBall();
  });
  bus.on('net:ball', applyBall);

  const tmp = new THREE.Vector3();
  const update = (dt: number) => {
    sky();
    listen();
    if (tune) {
      const at = (Date.now() - tuneStart) / 1000;
      tune.tick(at);
      world.jukeboxBeat = tune.beat(at);
    } else if (stream) {
      const v = streamVolume();
      if (stream.el) stream.el.volume = v;
      if (stream.yt && stream.ready) stream.yt.setVolume?.(Math.round(v * 100));
      world.jukeboxBeat = (1 - ((elapsed() * 2) % 1)) ** 2;
    } else world.jukeboxBeat = 0;
    paintT += dt;
    if (blocks && world.mode === 'arcade') {
      blocks.update(dt);
      if (blocks.over) recordScore();
      if (blocks.version !== paintedVersion || paintT > 0.25) {
        paintedVersion = blocks.version;
        paintT = 0;
        paint(world.t);
      }
    } else if (paintT > 0.5) {
      paintT = 0;
      paint(world.t);
    }
    const holder = crew.world.ball.holder;
    if (holder) {
      if (holder === crew.me) {
        if (!inRoom() || world.mode !== 'play') send({ t: 'ball', drop: true });
        ball.hold(handPos(tmp));
      } else {
        const r = world.remotes.get(holder);
        if (r) {
          const f = r.avatar.root.rotation.y;
          const p = r.avatar.root.position;
          ball.hold(tmp.set(p.x + Math.sin(f) * 0.38, p.y + 1.05, p.z + Math.cos(f) * 0.38));
        }
      }
    }
    ball.update(dt);
    if (windFrom) {
      const p = power();
      (meter.querySelector('.fill') as HTMLElement).style.width = `${p * 100}%`;
      meter.classList.toggle('sweet-now', Math.abs(p - 0.78) <= 0.06);
    }
  };

  const hint = (): string | null => {
    const k = (key: string, what: string) => `<kbd>${key}</kbd><span>${what}</span>`;
    if (world.mode === 'arcade') return `${k('← →', 'Move')}${k('↑', 'Rotate')}${k('↓', 'Soft drop')}${k('Space', 'Drop')}${k('C', 'Hold')}${k('Esc', 'Leave')}`;
    if (holdingIt() && world.mode === 'play') return `${k('Hold E', 'Shoot')}${k('Q', 'Drop')}${k('WASD', 'Move')}${k('Esc', 'Menu')}`;
    return null;
  };

  return { interactables, update, hint, modalOpen: () => !!modal, closeModal, holding: holdingIt };
}

export function skyControls(): HTMLElement {
  const root = h('div.sky-ctl');
  const draw = () => {
    clear(root);
    const w = crew.world;
    const seg = (items: readonly { id: string; label: string; icon: string }[], now: string, pick: (id: string) => void) =>
      h(
        'div.sky-seg',
        null,
        ...items.map((it) => h('button', { class: now === it.id ? 'on' : '', title: it.label, onclick: () => (pick(it.id), setTimeout(draw, 50)) }, h('span', { innerHTML: icon(it.icon) }), h('small', null, it.label))),
      );
    root.append(
      h('div.mgr-label', null, 'Time of day'),
      seg(TIMES, w.time, (id) => send({ t: 'sky', time: id })),
      h('div.mgr-label', null, 'Weather'),
      seg(WEATHER_OPTIONS, w.weather, (id) => send({ t: 'sky', weather: id })),
    );
  };
  draw();
  bus.on('net:state', () => root.isConnected && draw());
  return root;
}
