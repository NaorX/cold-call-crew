// Based on Agent Office (MIT, (c) 2026 AgentSystemLabs). See THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat, type Lamp, type NightParts } from './office';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';
export const WEATHERS: Weather[] = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow'];

const MAX_LAMPS = 24;
const DEG = Math.PI / 180;
const lerp = THREE.MathUtils.lerp;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (x: number, to: number, dt: number, secs: number) => x + (to - x) * (1 - Math.exp(-dt / secs));

const C = {
  day: new THREE.Color('#bfe3ff'),
  dayTop: new THREE.Color('#5ab6ff'),
  dusk: new THREE.Color('#ffb48c'),
  night: new THREE.Color('#0b1431'),
  nightTop: new THREE.Color('#03061a'),
  greyDay: new THREE.Color('#aab3bf'),
  greyNight: new THREE.Color('#11151d'),
  fogDay: new THREE.Color('#d7dce2'),
  fogNight: new THREE.Color('#3a414d'),
  flash: new THREE.Color('#e4e9ff'),
  sunHigh: new THREE.Color('#fff1d6'),
  sunLow: new THREE.Color('#ffa566'),
  moon: new THREE.Color('#a9bcff'),
  hemiSky: new THREE.Color('#fff5e6'),
  hemiGround: new THREE.Color('#b08e6a'),
  hemiSkyNight: new THREE.Color('#4b5b90'),
  hemiGroundNight: new THREE.Color('#1d1b29'),
  ambientNight: new THREE.Color('#8797cc'),
  white: new THREE.Color('#ffffff'),
  office: new THREE.Color('#fff2de'),
  officeNight: new THREE.Color('#ffd49c'),
  cloudGrey: new THREE.Color('#a3abb6'),
};

const uniforms = {
  skyOn: { value: 1 },
  skyOffice: { value: new THREE.Color(0, 0, 0) },
  skyBoxMin: { value: new THREE.Vector3() },
  skyBoxMax: { value: new THREE.Vector3() },
  skyLampCount: { value: 0 },
  skyLamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4()) },
  skyLampColors: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Color()) },
  skyLampMin: { value: new THREE.Vector3() },
  skyLampMax: { value: new THREE.Vector3() },
  skyWet: { value: 0 },
  skySnow: { value: 0 },
};

const PARS = `
varying vec3 vSkyWorld;
uniform float skyOn;
uniform vec3 skyOffice;
uniform vec3 skyBoxMin;
uniform vec3 skyBoxMax;
uniform int skyLampCount;
uniform vec4 skyLamps[${MAX_LAMPS}];
uniform vec3 skyLampColors[${MAX_LAMPS}];
uniform vec3 skyLampMin;
uniform vec3 skyLampMax;
uniform float skyWet;
uniform float skySnow;

float skyInOffice( vec3 p ) {
  vec3 d = max( skyBoxMin - p, p - skyBoxMax );
  return 1.0 - smoothstep( 0.0, 0.12, length( max( d, 0.0 ) ) );
}

vec3 skyLampsAt( vec3 p, vec3 n ) {
  vec3 sum = vec3( 0.0 );
  if ( any( lessThan( p, skyLampMin ) ) || any( greaterThan( p, skyLampMax ) ) ) return sum;
  for ( int i = 0; i < ${MAX_LAMPS}; i ++ ) {
    if ( i >= skyLampCount ) break;
    vec3 d = skyLamps[ i ].xyz - p;
    float r = length( d );
    float k = 1.0 - clamp( r / skyLamps[ i ].w, 0.0, 1.0 );
    sum += skyLampColors[ i ] * k * k * ( 0.3 + 0.7 * max( dot( n, d / max( r, 0.001 ) ), 0.0 ) );
  }
  return sum;
}
`;

const SURFACE = `
vec3 skyN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
float skyIndoor = skyOn * skyInOffice( vSkyWorld );
float skyUp = skyOn * ( 1.0 - skyIndoor ) * smoothstep( 0.45, 0.85, skyN.y );
material.diffuseColor *= 1.0 - 0.38 * skyWet * skyUp;
material.diffuseColor = mix( material.diffuseColor, vec3( 0.93, 0.96, 1.0 ), skySnow * skyUp );
`;

const LIGHT = `
if ( skyOn > 0.0 ) {
  vec3 skyLight = skyIndoor * skyOffice * ( 0.65 + 0.35 * skyN.y ) + skyLampsAt( vSkyWorld, skyN );
  reflectedLight.indirectDiffuse += skyLight * BRDF_Lambert( material.diffuseColor );
}
`;

const WORLD = `
{
  vec4 skyW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    skyW = instanceMatrix * skyW;
  #endif
  vSkyWorld = ( modelMatrix * skyW ).xyz;
}
`;

THREE.Material.prototype.onBeforeCompile = function (shader) {
  if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkyWorld;').replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${PARS}`)
    .replace('#include <lights_fragment_begin>', `${SURFACE}\n#include <lights_fragment_begin>`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${LIGHT}`);
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function faceTextures(color: string, n: number, floors: number) {
  const day = canvasTexture(256, 256, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#bfe3ff';
    for (let i = 0; i < n; i++) c.fillRect(((i + 0.25) / n) * 256, 70, (0.5 / n) * 256, 120);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < n; i++) c.fillRect(((i + 0.25) / n) * 256, 70, (0.12 / n) * 256, 120);
  });
  day.repeat.set(1, floors);
  const lit = canvasTexture(64, 64 * floors, (c) => {
    c.fillStyle = '#000000';
    c.fillRect(0, 0, 64, 64 * floors);
    for (let f = 0; f < floors; f++)
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.45) continue;
        c.fillStyle = Math.random() < 0.15 ? '#9ec9ff' : Math.random() < 0.5 ? '#ffd27a' : '#ffe6b0';
        c.fillRect(((i + 0.25) / n) * 64, f * 64 + (70 / 256) * 64, (0.5 / n) * 64, (120 / 256) * 64);
      }
  });
  lit.wrapS = lit.wrapT = THREE.ClampToEdgeWrapping;
  return { day, lit };
}

function blobTexture(core: number) {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(core, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

function moonTexture() {
  return canvasTexture(256, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(120, 110, 130, ${0.12 + Math.random() * 0.2})`;
      g.beginPath();
      g.ellipse(Math.random() * 256, 20 + Math.random() * 88, 6 + Math.random() * 18, 5 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

type Neighbour = [number, number, number, number, number, string];

function sunAt(hour: number) {
  const day = (hour - 6.5) / 13.5;
  const el = day >= 0 && day <= 1 ? Math.sin(day * Math.PI) * 62 : -Math.sin(((((hour - 20 + 24) % 24) / 10.5) * Math.PI)) * 35;
  const az = 90 + 180 * day;
  return { el: el * DEG, az: az * DEG, elD: el };
}

export class Environment {
  group = new THREE.Group();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  lampsOn = 0;
  level = 1;
  onThunder: ((delay: number, loud: number) => void) | null = null;
  horizon = new THREE.Color('#bfe3ff');

  private hour = 10;
  private wantHour = 10;
  private weather: Weather = 'clear';
  private snap = true;
  private cover = 0;
  private rain = 0;
  private snow = 0;
  private fog = 0;
  private storm = 0;
  private wet = 0;
  private lying = 0;
  private flash = 0;
  private flashes: number[] = [];
  private nextFlash = 0;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private dome = new THREE.Group();
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private sunDisc: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private moonDisc: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private cloudMat: THREE.MeshToonMaterial;
  private clouds = new THREE.Group();
  private rainLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private drops: Float32Array;
  private flakes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private flakeState: Float32Array;
  private glass: WetGlass;
  private lamps: Lamp[];
  private litWindows: THREE.MeshToonMaterial[] = [];
  private lampGlass: THREE.MeshToonMaterial;
  private halos: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>[] = [];
  private camPos = new THREE.Vector3();
  private dir = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private quality: 'low' | 'medium' | 'high',
    private footprint: { x0: number; x1: number; z0: number; z1: number },
    private night: NightParts,
  ) {
    uniforms.skyBoxMin.value.set(footprint.x0, -0.1, footprint.z0);
    uniforms.skyBoxMax.value.set(footprint.x1, 6, footprint.z1);
    if (!(scene.fog instanceof THREE.Fog)) scene.fog = new THREE.Fog('#bfe3ff', 55, 190);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color('#5ab6ff') }, hor: { value: new THREE.Color('#bfe3ff') } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 hor; varying vec3 vDir;
          void main(){
            gl_FragColor = vec4(mix(hor, top, smoothstep(0.0, 0.6, vDir.y)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.material.userData.outlineParameters = { visible: false };
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    this.hemi = new THREE.HemisphereLight('#fff5e6', '#b08e6a', 1.1);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.35);
    this.sun = new THREE.DirectionalLight('#fff1d6', 1.6);
    this.sun.target.position.set(0, 0, 1);
    this.group.add(this.hemi, this.ambient, this.sun, this.sun.target);
    if (quality !== 'low') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(4096, 4096);
      Object.assign(this.sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 140 });
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.05;
      this.sun.shadow.radius = 3;
      this.sun.shadow.camera.layers.enable(2);
    }

    const starPos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const y = rand(0.08, 1);
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(1 - y * y);
      starPos.push(Math.cos(a) * r * 300, y * 300, Math.sin(a) * r * 300);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const disc = (r: number, color: string) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, fog: false, depthWrite: false }));
      m.material.userData.outlineParameters = { visible: false };
      return m;
    };
    this.sunDisc = disc(9, '#fff4c8');
    this.moonDisc = disc(6, '#f2f1ea');
    this.moonDisc.material.map = moonTexture();
    this.dome.add(this.stars, this.sunDisc, this.moonDisc);
    this.group.add(this.dome);

    this.cloudMat = toonMat({ color: '#ffffff' });
    this.cloudMat.fog = false;
    this.cloudMat.userData.outlineParameters = { visible: false };
    this.lampGlass = toonMat({ color: '#fff3d6', emissive: '#ffd49c', emissiveIntensity: 0.2 });
    this.lamps = [...night.lamps];
    this.buildStreet();

    const halo = blobTexture(0.25);
    const bySize = new Map<number, number[]>();
    for (const l of this.lamps) {
      if (!l.glow) continue;
      const list = bySize.get(l.glow.size) ?? [];
      list.push(l.glow.x, l.glow.y, l.glow.z);
      bySize.set(l.glow.size, list);
    }
    for (const [size, pos] of bySize) {
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const p = new THREE.Points(hg, new THREE.PointsMaterial({ size, map: halo, color: '#ffd89a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      p.visible = false;
      this.halos.push(p);
      this.group.add(p);
    }
    this.placeLamps();

    const RAIN = quality === 'low' ? 1500 : 3000;
    this.drops = new Float32Array(RAIN * 4);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#bcd0e6', transparent: true, opacity: 0.5, depthWrite: false }));
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    for (let i = 0; i < RAIN; i++) this.drops.set([rand(-24, 24), rand(0, 26), rand(-24, 24), rand(14, 20)], i * 4);
    this.group.add(this.rainLines);

    const SNOW = quality === 'low' ? 1500 : 3500;
    this.flakeState = new Float32Array(SNOW * 4);
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.flakes = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.14, map: blobTexture(0.5), transparent: true, depthWrite: false, color: '#ffffff' }));
    this.flakes.frustumCulled = false;
    this.flakes.visible = false;
    for (let i = 0; i < SNOW; i++) this.flakeState.set([rand(-20, 20), rand(0, 22), rand(-20, 20), rand(0.7, 1.3)], i * 4);
    this.group.add(this.flakes);

    this.glass = new WetGlass(night.wetGlass);
    scene.add(this.group);
  }

  set(hour: number, weather: Weather) {
    this.wantHour = ((hour % 24) + 24) % 24;
    this.weather = weather;
  }

  get currentHour() {
    return this.hour;
  }

  private sheltered(x: number, z: number) {
    const f = this.footprint;
    return x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1;
  }

  private placeLamps() {
    const lo = uniforms.skyLampMin.value.set(Infinity, Infinity, Infinity);
    const hi = uniforms.skyLampMax.value.set(-Infinity, -Infinity, -Infinity);
    this.lamps.slice(0, MAX_LAMPS).forEach((l, i) => {
      uniforms.skyLamps.value[i].set(l.x, l.y, l.z, l.reach);
      lo.min(new THREE.Vector3(l.x - l.reach, l.y - l.reach - 2, l.z - l.reach));
      hi.max(new THREE.Vector3(l.x + l.reach, l.y + l.reach, l.z + l.reach));
    });
  }

  private buildStreet() {
    const f = this.footprint;
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4) => {
      const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat)!.push(g);
    };
    const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    const sph = new THREE.SphereGeometry(1, 12, 10);
    const flat = (color: string, map?: THREE.Texture) => {
      const m = toonMat({ color, map });
      m.userData.outlineParameters = { visible: false };
      return m;
    };

    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), flat('#a7d98b'));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.04;
    lawn.receiveShadow = true;
    this.group.add(lawn);
    const paving = flat('#e3ddd0');
    const lot = flat('#9a9ea8');
    add(box, paving, M((f.x0 + f.x1) / 2, -0.035, (f.z0 + f.z1) / 2, f.x1 - f.x0 + 5, 0.04, f.z1 - f.z0 + 5));
    const roadZ = f.z0 - 9;
    const roadTex = canvasTexture(256, 128, (g) => {
      g.fillStyle = '#5b606c';
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#f1f1f1';
      g.fillRect(0, 6, 256, 4);
      g.fillRect(0, 118, 256, 4);
      g.fillStyle = '#ffd166';
      g.fillRect(0, 61, 150, 6);
    });
    roadTex.repeat.set(600 / 8, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(600, 9), flat('#ffffff', roadTex));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.025, roadZ);
    road.receiveShadow = true;
    this.group.add(road);
    add(box, paving, M(0, 0, roadZ + 6, 600, 0.08, 3));
    add(box, paving, M(0, 0, roadZ - 6, 600, 0.08, 3));
    add(box, paving, M(0.1, -0.02, (f.z0 + roadZ + 4.5) / 2, 3, 0.04, f.z0 - roadZ - 4.5));
    add(box, lot, M(f.x1 + 9, -0.035, (f.z0 + f.z1) / 2 + 2, 12, 0.02, f.z1 - f.z0 + 6));
    const white = flat('#f1f1f1');
    for (let z = f.z0 + 1; z < f.z1 + 4; z += 3) add(box, white, M(f.x1 + 9, -0.02, z, 9, 0.01, 0.12));

    const trunk = toonMat({ color: '#8a5a3b' });
    const leafA = toonMat({ color: '#5fb760' });
    const leafB = toonMat({ color: '#3f8f45' });
    const leafC = toonMat({ color: '#6fcf6a' });
    const tree = (x: number, z: number, s: number) => {
      add(cyl, trunk, M(x, 1.1 * s, z, 0.26 * s, 2.2 * s, 0.26 * s));
      add(sph, leafA, M(x, 3.2 * s, z, 1.6 * s, 1.6 * s, 1.6 * s));
      add(sph, leafB, M(x + 0.8 * s, 3.9 * s, z + 0.4 * s, 1.1 * s, 1.1 * s, 1.1 * s));
      add(sph, leafC, M(x - 0.7 * s, 3.8 * s, z - 0.3 * s, 1.0 * s, 1.0 * s, 1.0 * s));
    };
    const near = roadZ + 8.5 - 2.1;
    const trees: [number, number, number][] = [
      [-30, near, 1.0], [-18, near, 0.95], [-6, near, 0.9], [7, near, 0.9], [18, near, 1.0], [30, near, 1.0],
      [-36, roadZ - 8.5, 1.1], [-12, roadZ - 8.5, 1], [14, roadZ - 8.5, 1.15], [40, roadZ - 8.5, 1],
      [f.x0 - 6, -10, 1.2], [f.x0 - 7, 0, 1], [f.x0 - 5.5, 9, 0.9], [f.x0 - 6, 20, 1.1],
      [f.x1 + 19, -8, 1.1], [f.x1 + 18, 6, 1.25], [f.x1 + 19, 18, 1],
      [-14, f.z1 + 10, 1.2], [2, f.z1 + 12, 1], [16, f.z1 + 14, 1.1], [-26, f.z1 + 9, 1],
    ];
    for (const [x, z, s] of trees) tree(x, z, s);

    const ink = toonMat({ color: '#3d405b' });
    const shade = new THREE.CylinderGeometry(0.12, 0.42, 0.26, 12);
    let n = 0;
    for (const [z, toward] of [[roadZ + 5.4, -1], [roadZ - 5.4, 1]] as const)
      for (let x = -42; x <= 42; x += 12) {
        add(cyl, ink, M(x, 0.25, z, 0.22, 0.5, 0.22));
        add(cyl, ink, M(x, 2.5, z, 0.08, 5, 0.08));
        add(box, ink, M(x, 4.95, z + toward * 0.6, 0.08, 0.08, 1.3));
        add(shade, ink, M(x, 4.9, z + toward * 1.2));
        add(sph, this.lampGlass, M(x, 4.7, z + toward * 1.2, 0.22, 0.22, 0.22));
        if (Math.abs(x) <= 30 && n++ < 14) this.lamps.push({ x, y: 4.4, z: z + toward * 1.2, reach: 9, color: '#ffcf8a', power: 3, glow: { x, y: 4.68, z: z + toward * 1.2, size: 1.4 } });
      }

    const carCols = ['#ff8a5b', '#5bc0eb', '#ffd166', '#f7f3ea', '#9bc53d', '#b388eb'];
    const tyre = toonMat({ color: '#2b2d42' });
    const glassCar = toonMat({ color: '#bfe3ff' });
    let k = 0;
    for (let x = -34; x < 36; x += 9 + ((k * 7) % 5)) {
      const col = toonMat({ color: carCols[k++ % carCols.length] });
      const z = roadZ + 3;
      add(box, col, M(x, 0.6, z, 4.2, 0.7, 1.9));
      add(box, col, M(x - 0.2, 1.15, z, 2.4, 0.55, 1.7));
      add(box, glassCar, M(x - 0.2, 1.15, z, 2.3, 0.45, 1.74));
      for (const dx of [-1.3, 1.3]) for (const dz of [-0.92, 0.92]) add(cyl, tyre, M(x + dx, 0.34, z + dz, 0.34, 0.26, 0.34, 0, Math.PI / 2));
    }

    const NEIGHBOURS: Neighbour[] = [
      [-34, roadZ - 18, 14, 12, 10, '#8ecae6'],
      [-16, roadZ - 19, 14, 17, 11, '#ffb4a2'],
      [2, roadZ - 18, 12, 10, 10, '#ffd6a5'],
      [18, roadZ - 20, 16, 20, 12, '#cdb4db'],
      [36, roadZ - 18, 12, 11, 10, '#bde0fe'],
      [-46, roadZ - 40, 18, 26, 14, '#a2d2ff'],
      [-6, roadZ - 44, 20, 30, 14, '#f4acb7'],
      [30, roadZ - 42, 18, 24, 14, '#ffe5b4'],
      [f.x0 - 26, 2, 12, 13, 16, '#ffe5b4'],
      [f.x1 + 38, 4, 12, 15, 18, '#b9e3c6'],
      [-10, f.z1 + 34, 16, 14, 12, '#f1e3b3'],
      [16, f.z1 + 36, 14, 18, 12, '#a7c4d9'],
    ];
    const cap = toonMat({ color: '#fffaf3' });
    for (const [x, z, w, h, d, color] of NEIGHBOURS) {
      const floors = Math.max(1, Math.round(h / 3.2));
      const mat = (span: number) => {
        const t = faceTextures(color, Math.max(1, Math.round(span / 2.6)), floors);
        const m = toonMat({ color: '#ffffff', map: t.day, emissive: '#ffffff' });
        m.emissiveMap = t.lit;
        m.emissiveIntensity = 0;
        m.userData.outlineParameters = { visible: false };
        this.litWindows.push(m);
        return m;
      };
      const alongX = mat(w);
      const alongZ = mat(d);
      const top = flat(color);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [alongZ, alongZ, top, top, alongX, alongX]);
      b.position.set(x, h / 2, z);
      b.castShadow = b.receiveShadow = true;
      this.group.add(b);
      add(box, cap, M(x, h + 0.2, z, w + 0.4, 0.4, d + 0.4));
    }

    for (const [mat, list] of parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = this.quality !== 'low' && mat !== paving && mat !== lot && mat !== white;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }

    const puffs: THREE.BufferGeometry[] = [];
    for (const [x, y, z, s] of [
      [-70, 34, -60, 1.3], [-10, 40, -90, 1.6], [60, 36, -70, 1.2], [90, 30, 20, 1.4], [-95, 32, 30, 1.1], [30, 38, 95, 1.5], [-45, 36, 90, 1.2], [120, 44, -110, 1.7],
    ]) {
      for (const [dx, dy, r] of [[0, 0, 5], [5.5, -1, 3.8], [-5.5, -1.2, 3.6], [2.5, 2.4, 3.4]]) {
        const g = new THREE.SphereGeometry(r, 14, 10);
        g.scale(1, 0.75, 1);
        g.translate(dx, dy, 0).rotateY(Math.atan2(x, z)).scale(s, s, s).translate(x, y, z);
        puffs.push(g);
      }
    }
    this.clouds.add(new THREE.Mesh(mergeGeometries(puffs, false)!, this.cloudMat));
    this.group.add(this.clouds);
  }

  private lightning(t: number, dt: number) {
    if (this.storm > 0.5 && t >= this.nextFlash) {
      if (this.nextFlash > 0) {
        this.flashes.push(t, t + rand(0.1, 0.25));
        if (Math.random() < 0.5) this.flashes.push(t + rand(0.35, 0.6));
        this.onThunder?.(rand(0.3, 3), rand(0.5, 1));
      }
      this.nextFlash = t + rand(6, 20);
    }
    this.flash *= Math.exp(-dt * 10);
    while (this.flashes.length && this.flashes[0] <= t) {
      this.flashes.shift();
      this.flash = Math.max(this.flash, rand(0.7, 1));
    }
  }

  update(dt: number, t: number, camera: THREE.Camera, outage: boolean) {
    const snap = this.snap;
    this.snap = false;
    let dh = this.wantHour - this.hour;
    if (dh > 12) dh -= 24;
    if (dh < -12) dh += 24;
    this.hour = snap ? this.wantHour : (this.hour + (Math.abs(dh) > 0.5 ? dh * Math.min(1, dt * 0.9) : dh * Math.min(1, dt * 3)) + 24) % 24;
    const step = (x: number, to: number, secs: number) => (snap ? to : ease(x, to, dt, secs));
    const w = this.weather;
    this.cover = step(this.cover, { clear: 0, cloudy: 0.75, rain: 0.9, storm: 1, snow: 0.85, fog: 0.5 }[w], 4);
    this.rain = step(this.rain, w === 'rain' ? 0.85 : w === 'storm' ? 1 : 0, 3);
    this.snow = step(this.snow, w === 'snow' ? 0.85 : 0, 3);
    this.fog = step(this.fog, w === 'fog' ? 0.85 : w === 'rain' ? 0.12 : w === 'snow' ? 0.3 : 0, 4);
    this.storm = step(this.storm, w === 'storm' ? 1 : 0, 3);
    this.wet = step(this.wet, w === 'rain' || w === 'storm' ? 1 : 0, w === 'rain' || w === 'storm' ? 8 : 40);
    this.lying = step(this.lying, w === 'snow' ? 1 : 0, w === 'snow' ? 25 : 6);
    uniforms.skyWet.value = this.wet * (1 - this.lying);
    uniforms.skySnow.value = this.lying * 0.9;

    const { el, az, elD } = sunAt(this.hour);
    const day = smooth(-8, 4, elD);
    const dusk = Math.max(0, 1 - Math.abs(elD + 1) / 9) * (1 - this.cover);
    this.lightning(t, dt);
    const flash = this.flash;
    const sunI = 1.55 * smooth(-3, 10, elD) * (1 - 0.8 * this.cover) * (1 - 0.6 * this.fog);
    const moonI = 0.35 * smooth(-4, -12, elD) * (1 - 0.75 * this.cover);
    const hemiI = lerp(0.32, 1.1 * (1 - 0.25 * this.cover) * (1 - 0.35 * this.storm), day);
    const ambI = lerp(0.1, 0.35, day);
    const dim = outage ? 0.6 : 1;
    this.hemi.intensity = (hemiI + flash * 3) * dim;
    this.hemi.color.copy(C.hemiSkyNight).lerp(C.hemiSky, day);
    this.hemi.groundColor.copy(C.hemiGroundNight).lerp(C.hemiGround, day);
    this.ambient.intensity = (ambI + flash) * dim;
    this.ambient.color.copy(C.ambientNight).lerp(C.white, day);
    const moonlit = elD < -4;
    const lightEl = (moonlit ? 50 : 25 + Math.max(0, elD) * 0.6) * DEG;
    const lightAz = moonlit ? az + Math.PI : az;
    this.dir.set(Math.cos(lightEl) * Math.sin(lightAz), Math.sin(lightEl), -Math.cos(lightEl) * Math.cos(lightAz));
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.dir, 45);
    this.sun.intensity = moonlit ? moonI : sunI;
    if (moonlit) this.sun.color.copy(C.moon);
    else this.sun.color.copy(C.sunLow).lerp(C.sunHigh, smooth(0, 25, elD));
    this.level = clamp01((hemiI + ambI + 0.6 * (sunI + moonI)) / (1.1 + 0.35 + 0.6 * 1.55));

    const need = 1 - this.level;
    this.lampsOn = smooth(0.45, 0.62, need);
    uniforms.skyOffice.value.copy(C.office).lerp(C.officeNight, 1 - day).multiplyScalar(outage ? 0.05 : need * 3.0);
    const lamps = Math.min(this.lamps.length, MAX_LAMPS);
    uniforms.skyLampCount.value = this.lampsOn > 0.005 ? lamps : 0;
    for (let i = 0; i < lamps; i++) uniforms.skyLampColors.value[i].set(this.lamps[i].color).multiplyScalar(this.lamps[i].power * this.lampsOn);
    for (const b of this.night.bulbs) b.mat.emissiveIntensity = lerp(b.day, b.night, this.lampsOn);
    for (const m of this.litWindows) m.emissiveIntensity = this.lampsOn * 1.1;
    this.lampGlass.emissiveIntensity = lerp(0.2, 1.6, this.lampsOn);
    for (const h of this.halos) {
      h.visible = this.lampsOn > 0.01;
      h.material.opacity = this.lampsOn * 0.7;
    }

    const a = new THREE.Color();
    const hor = this.horizon.copy(C.night).lerp(C.day, day);
    hor.lerp(C.dusk, dusk * 0.55);
    hor.lerp(a.copy(C.greyNight).lerp(C.greyDay, day), this.cover * 0.85);
    hor.lerp(a.copy(C.fogNight).lerp(C.fogDay, day), this.fog);
    hor.lerp(C.flash, flash * 0.5);
    const top = a.copy(C.nightTop).lerp(C.dayTop, day).lerp(hor, this.cover * 0.6 + this.fog * 0.7);
    this.sky.material.uniforms.hor.value.copy(hor);
    this.sky.material.uniforms.top.value.copy(top);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(hor);
    const precip = Math.max(this.rain, this.snow);
    fog.near = lerp(55, 4, this.fog) * (1 - 0.4 * precip);
    fog.far = lerp(190, 32, this.fog) * (1 - 0.3 * precip);
    this.cloudMat.color.copy(C.white).lerp(C.cloudGrey, this.cover).multiplyScalar(lerp(0.25, 1, day));
    this.clouds.visible = this.fog < 0.6;
    this.clouds.rotation.y += dt * 0.004;

    camera.getWorldPosition(this.camPos);
    this.dome.position.copy(this.camPos);
    const clear = (1 - this.cover) * (1 - this.fog);
    this.stars.material.opacity = (1 - day) ** 2 * clear;
    this.stars.visible = this.stars.material.opacity > 0.01;
    const up = (e: number, az2: number, m: THREE.Mesh) => m.position.set(Math.cos(e) * Math.sin(az2) * 300, Math.sin(e) * 300, -Math.cos(e) * Math.cos(az2) * 300);
    up(el, az, this.sunDisc);
    this.sunDisc.material.color.copy(C.sunLow).lerp(C.white, smooth(0, 20, elD));
    this.sunDisc.material.opacity = smooth(-3, 0, elD) * clear;
    this.sunDisc.visible = this.sunDisc.material.opacity > 0.01;
    up(-el * 0.8 + 0.2, az + Math.PI, this.moonDisc);
    this.moonDisc.material.opacity = smooth(2, -2, elD) * (1 - 0.85 * this.cover) * (1 - this.fog);
    this.moonDisc.visible = this.moonDisc.material.opacity > 0.01;

    const lit = 0.3 + 0.7 * Math.max(this.level, this.lampsOn * 0.5);
    this.rainLines.material.color.set('#bcd0e6').multiplyScalar(lit);
    this.flakes.material.color.setScalar(lit);
    this.fall(dt, t);
    this.glass.update(dt, this.rain, lit);
  }

  private fall(dt: number, t: number) {
    const cx = this.camPos.x;
    const cz = this.camPos.z;
    const floor = 0;
    const wrap = (v: number, c: number, half: number) => (v - c > half ? v - 2 * half : v - c < -half ? v + 2 * half : v);
    const rainN = Math.round((this.drops.length / 4) * this.rain);
    this.rainLines.visible = rainN > 0;
    if (rainN > 0) {
      const pos = this.rainLines.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const slant = 0.1 + 0.3 * this.storm;
      for (let i = 0; i < rainN; i++) {
        const d = i * 4;
        const speed = this.drops[d + 3];
        let x = wrap(this.drops[d] + slant * speed * dt, cx, 24);
        let y = this.drops[d + 1] - speed * dt;
        let z = wrap(this.drops[d + 2], cz, 24);
        if (y < floor || y > floor + 26) {
          y = y < floor && y > floor - 1 ? y + 26 : floor + rand(0, 26);
          x = cx + rand(-24, 24);
          z = cz + rand(-24, 24);
        }
        this.drops[d] = x;
        this.drops[d + 1] = y;
        this.drops[d + 2] = z;
        const len = this.sheltered(x, z) ? 0 : 0.5;
        arr.set([x, y, z, x - slant * len, y + len, z], i * 6);
      }
      pos.needsUpdate = true;
      this.rainLines.geometry.setDrawRange(0, rainN * 2);
    }
    const snowN = Math.round((this.flakeState.length / 4) * this.snow);
    this.flakes.visible = snowN > 0;
    if (snowN > 0) {
      const pos = this.flakes.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < snowN; i++) {
        const f = i * 4;
        const speed = this.flakeState[f + 3];
        let x = wrap(this.flakeState[f] + Math.sin(t * 0.9 + i) * 0.3 * dt + 0.15 * dt, cx, 20);
        let y = this.flakeState[f + 1] - speed * dt;
        let z = wrap(this.flakeState[f + 2] + Math.cos(t * 0.7 + i * 1.3) * 0.3 * dt, cz, 20);
        if (y < floor || y > floor + 22) {
          y = y < floor && y > floor - 1 ? y + 22 : floor + rand(0, 22);
          x = cx + rand(-20, 20);
          z = cz + rand(-20, 20);
        }
        this.flakeState[f] = x;
        this.flakeState[f + 1] = y;
        this.flakeState[f + 2] = z;
        arr.set([x, this.sheltered(x, z) ? -1000 : y, z], i * 3);
      }
      pos.needsUpdate = true;
      this.flakes.geometry.setDrawRange(0, snowN);
    }
  }
}

interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
  trail: number;
  age: number;
  life: number;
}

class WetGlass {
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private drops: Drop[] = [];
  private since = 0;
  private spawn = 0;

  constructor(private mat: THREE.MeshBasicMaterial) {
    this.canvas.width = this.canvas.height = 256;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    mat.map = this.tex;
    mat.needsUpdate = true;
  }

  update(dt: number, rain: number, lit: number) {
    this.since += dt;
    this.spawn += rain * 70 * dt;
    for (; this.spawn >= 1; this.spawn--) if (this.drops.length < 220) this.drops.push({ x: rand(0, 256), y: rand(0, 256), r: rand(1.6, 4.4), vy: 0, trail: 0, age: 0, life: rand(4, 12) });
    for (const d of this.drops) {
      d.age += dt;
      if (!d.vy && d.r > 3.4 && Math.random() < dt * 0.4) d.vy = rand(50, 140);
      if (d.vy) {
        d.y += d.vy * dt;
        d.trail = Math.min(d.trail + d.vy * dt, 70);
      }
    }
    this.drops = this.drops.filter((d) => d.age < d.life && d.y < 256 + 80);
    this.mat.visible = this.drops.length > 0;
    if (!this.mat.visible || this.since < 0.08) return;
    this.since = 0;
    this.mat.color.setScalar(lit);
    const g = this.g;
    g.clearRect(0, 0, 256, 256);
    for (const d of this.drops) {
      const fade = Math.min(1, (d.life - d.age) / 1.5);
      for (const ox of d.x < 8 ? [0, 256] : d.x > 248 ? [0, -256] : [0]) {
        for (const oy of [0, -256]) {
          const x = d.x + ox;
          const y = d.y + oy;
          if (y + d.r < -80 || y - d.r - d.trail > 256) continue;
          if (d.trail > 0) {
            g.fillStyle = `rgba(225, 238, 255, ${0.22 * fade})`;
            g.fillRect(x - d.r * 0.35, y - d.trail, d.r * 0.7, d.trail);
          }
          g.fillStyle = `rgba(214, 230, 250, ${0.5 * fade})`;
          g.beginPath();
          g.ellipse(x, y, d.r, d.r * 1.15, 0, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = `rgba(30, 50, 80, ${0.5 * fade})`;
          g.lineWidth = 1;
          g.stroke();
          g.fillStyle = `rgba(255, 255, 255, ${0.85 * fade})`;
          g.beginPath();
          g.arc(x - d.r * 0.35, y - d.r * 0.4, d.r * 0.32, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    this.tex.needsUpdate = true;
  }
}
