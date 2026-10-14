import type { Look, Persona, HairStyle, Facial, Top, Body, Hat } from './types';
import { settings } from './settings';
import { LANGS } from './langs';

export const SKINS = ['#f2c9a0', '#e8b08a', '#d9966a', '#c27a4e', '#9a5a36', '#6e3f25', '#f08a3c', '#ffd2b0'];
export const HAIR_COLORS = ['#1d1612', '#4a2e1c', '#8a5a2b', '#c9a15a', '#e8e2d6', '#9a9a9a', '#b8452a', '#2a2a40'];
export const SHIRTS = ['#3f9b4a', '#2f6fb3', '#c8432f', '#e0a52d', '#7a4fb0', '#e8e8e0', '#2a2a2a', '#d06aa0', '#3aa3a3'];
export const HAIRS: HairStyle[] = ['bald', 'short', 'bun', 'curly', 'long', 'mohawk', 'cap', 'side'];
export const FACIALS: Facial[] = ['none', 'mustache', 'beard', 'goatee'];

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export type Temper =
  | 'sweet'
  | 'chatty'
  | 'grumpy'
  | 'angry'
  | 'skeptical'
  | 'paranoid'
  | 'impatient'
  | 'dreamy'
  | 'sad'
  | 'bummed'
  | 'euphoric'
  | 'rude'
  | 'drunk'
  | 'sleepy'
  | 'entitled'
  | 'nervous'
  | 'oversharer';
const ALL_TEMPERS: Temper[] = ['sweet', 'chatty', 'grumpy', 'angry', 'skeptical', 'paranoid', 'impatient', 'dreamy', 'sad', 'bummed', 'euphoric', 'rude', 'drunk', 'sleepy', 'entitled', 'nervous', 'oversharer'];

const SITUATIONS = [
  "at a cousin's wedding, loud music in the background, shouting over it",
  'stuck in traffic on the highway, on speakerphone, honking at people',
  'in the middle of a fight with their spouse, who keeps yelling things in the background',
  'at the supermarket checkout, juggling bags',
  'just woke up from a nap and is very groggy',
  'just got dumped an hour ago and is not okay',
  'just got fired today and is still processing it',
  'just won a little money on a scratch card and is on top of the world',
  'watching a big football game; their team is losing',
  'cooking a big family dinner, pots boiling over',
  "in a doctor's waiting room, whispering",
  'at the gym between sets, out of breath',
  'at home in pajamas, bored out of their mind',
  'walking the dog, who keeps barking at everything',
  'at a family barbecue, relatives interrupting',
  'in the bathroom (and will not admit it)',
  'babysitting the grandkids, who are screaming',
  'at work, hiding from their manager',
];
const SITUATIONS_IL = [
  'on reserve duty at an army base, bored at the gate',
  'at a Friday family dinner with the whole family talking at once',
  'in a shared taxi (sherut) on the way to Tel Aviv',
  'at the shuk, haggling with a vendor at the same time',
  'stuck at a checkpoint in traffic, sweating, AC is broken',
];
const SPEECH = [
  'talks fast and interrupts constantly',
  'mumbles and trails off mid-sentence',
  'SHOUTS almost everything',
  'takes long dramatic pauses',
  'laughs at their own jokes',
  'sighs heavily all the time',
  'repeats the important words twice',
  'very formal and stiff, like a letter from the bank',
  'super casual, slang everywhere',
  'asks "what?" a lot, half deaf',
  'answers questions with questions',
  'narrates what they are doing while talking',
];

interface Archetype {
  title: string;
  gender: 'f' | 'm';
  ages: [number, number];
  gull: [number, number];
  tech: [number, number];
  savings: [number, number];
  gift: number;
  card: number;
  tempers: Temper[];
  bio: string[];
  quirks: string[];
  hairs: HairStyle[];
  greyHair?: boolean;
  outfit: { tops: Top[]; colors: string[]; body?: Body[]; hats?: Hat[] };
  heTitle?: string;
}

const ARCHETYPES: Archetype[] = [
  {
    gender: 'f',
    title: 'a sweet retired grandmother who bakes for the whole street',
    ages: [70, 88], gull: [0.6, 0.9], tech: [0, 0.15], savings: [800, 4000], gift: 0.9, card: 0.6,
    tempers: ['sweet', 'chatty'],
    bio: ['Widowed, lives with a cat called Sergeant.', 'Her grandson set up her computer and she is scared to touch it.', 'Watches every cooking show, calls everyone "sweetie".'],
    quirks: ['offers recipes mid-conversation', 'mishears numbers', 'puts the phone down to check the oven', 'thinks every company is "the computer people"'],
    hairs: ['bun', 'curly', 'short'], greyHair: true,
    outfit: { tops: ['polo', 'tee'], colors: ['#c7a2d6', '#e8a0b4', '#9fb8d9', '#d9c7a0'], body: ['chubby', 'normal'] },
    heTitle: 'סבתא',
  },
  {
    gender: 'm',
    title: 'a grumpy retired army veteran',
    ages: [64, 82], gull: [0.25, 0.5], tech: [0.1, 0.3], savings: [1500, 6000], gift: 0.4, card: 0.8,
    tempers: ['grumpy', 'angry'],
    bio: ['Hates small talk, loves rules and paperwork.', 'Tells war stories nobody asked for.'],
    quirks: ['demands your full name and rank', 'says "back in my day"', 'respects authority a lot', 'loses patience fast'],
    hairs: ['bald', 'short', 'cap'], greyHair: true,
    outfit: { tops: ['polo', 'shirtTie'], colors: ['#5b6b3a', '#6b5a43', '#4a5a6b'], hats: ['none', 'none', 'cap'] },
    heTitle: 'סבא',
  },
  {
    gender: 'f',
    title: 'a lonely retired school teacher',
    ages: [62, 80], gull: [0.5, 0.75], tech: [0.1, 0.3], savings: [1000, 5000], gift: 0.7, card: 0.7,
    tempers: ['chatty', 'skeptical'],
    bio: ['Corrects grammar automatically.', 'Lives alone and is thrilled someone called.'],
    quirks: ['corrects your grammar', 'wants to chat about her old students', 'asks you to spell things'],
    hairs: ['bun', 'short', 'side'], greyHair: true,
    outfit: { tops: ['shirtTie', 'polo'], colors: ['#7d9bb8', '#b88a7d', '#8a9a7a'] },
  },
  {
    gender: 'm',
    title: 'a hot-tempered small business owner (a car mechanic) who hates being bothered at work',
    ages: [38, 60], gull: [0.35, 0.6], tech: [0.2, 0.4], savings: [2000, 7000], gift: 0.5, card: 0.9,
    tempers: ['angry', 'impatient'],
    bio: ['Under a car when you called, hands covered in grease.', 'Has been ripped off by suppliers before and is sick of it.'],
    quirks: ['yells "WHAT?" a lot', 'calls you "buddy" when annoyed', 'secretly worried about the tax office', 'softens instantly if you sound like you are on his side'],
    hairs: ['buzz', 'short', 'bald'],
    outfit: { tops: ['tank', 'tee'], colors: ['#3a4a5a', '#2a2a2a', '#5a4a3a'], body: ['chubby', 'normal'] },
  },
  {
    gender: 'f',
    title: 'a suspicious, sharp-tongued neighborhood busybody',
    ages: [50, 72], gull: [0.3, 0.55], tech: [0.2, 0.4], savings: [1500, 5000], gift: 0.6, card: 0.7,
    tempers: ['skeptical', 'angry'],
    bio: ['Knows everyone on the street and their business.', 'Already got scammed once and has not forgotten it.'],
    quirks: ['interrogates you', 'threatens to call her son-in-law the lawyer', 'gossips the second you flatter her'],
    hairs: ['short', 'curly', 'side'], greyHair: true,
    outfit: { tops: ['polo', 'tee'], colors: ['#b84a6a', '#6a4ab8', '#4a8ab8'] },
  },
  {
    gender: 'm',
    title: 'a paranoid conspiracy-theory uncle',
    ages: [45, 65], gull: [0.35, 0.7], tech: [0.3, 0.6], savings: [500, 3000], gift: 0.6, card: 0.5,
    tempers: ['paranoid'],
    bio: ['Believes the government reads his toaster.', 'Has a bunker but forgot where he put the key.'],
    quirks: ['thinks you might be a government agent', 'easily convinced if you agree with his theories', 'whispers suddenly'],
    hairs: ['cap', 'long', 'mohawk'],
    outfit: { tops: ['hoodie', 'tee'], colors: ['#4a5a3a', '#3a3a3a', '#6a5a4a'], hats: ['none', 'beanie'] },
  },
  {
    gender: 'm',
    title: 'a rich, clueless heir who never worked a day',
    ages: [24, 40], gull: [0.55, 0.85], tech: [0.3, 0.5], savings: [4000, 12000], gift: 0.6, card: 0.95,
    tempers: ['dreamy', 'impatient'],
    bio: ['Calls from a yacht. Daddy pays for everything.', 'Treats every problem as something an assistant handles.'],
    quirks: ['mentions the yacht', 'very bored', 'tries to put you on hold for his "guy"', 'impressed by fancy titles'],
    hairs: ['side', 'short', 'long'],
    outfit: { tops: ['shirtTie', 'polo'], colors: ['#e8e8e0', '#9ad0e8', '#f0c8d0'], body: ['slim'] },
  },
  {
    gender: 'f',
    title: 'a stressed nurse on her ten minute break',
    ages: [28, 50], gull: [0.3, 0.55], tech: [0.4, 0.6], savings: [700, 2500], gift: 0.5, card: 0.85,
    tempers: ['impatient', 'angry'],
    bio: ['Has been awake for 20 hours.', 'Has zero patience but a big heart.'],
    quirks: ['in a hurry', 'yells to coworkers in the background', 'will hang up if you waste time'],
    hairs: ['bun', 'ponytail', 'curly'],
    outfit: { tops: ['tee'], colors: ['#5ab8a8', '#7aa0d8', '#9a8ad8'] },
  },
  {
    gender: 'm',
    title: 'a college gamer who lives with three roommates',
    ages: [19, 24], gull: [0.4, 0.8], tech: [0.6, 0.9], savings: [150, 900], gift: 0.95, card: 0.4,
    tempers: ['chatty', 'dreamy'],
    bio: ['Has a card saved for "emergencies" (skins).', 'Wants free in-game currency more than anything.'],
    quirks: ['uses gamer slang', 'asks if this gets him free skins', 'shouts at his roommates'],
    hairs: ['mohawk', 'spiky', 'afro', 'short'],
    outfit: { tops: ['hoodie', 'tee'], colors: ['#2a2a2a', '#c8432f', '#3a6ab8', '#7a4fb0'], body: ['slim', 'normal'], hats: ['none', 'cap', 'beanie'] },
  },
  {
    gender: 'm',
    title: 'a crypto bro who thinks he is the smartest man alive',
    ages: [22, 38], gull: [0.45, 0.8], tech: [0.5, 0.8], savings: [1200, 7000], gift: 0.5, card: 0.8,
    tempers: ['chatty', 'skeptical'],
    bio: ['Lost his savings twice on coins named after dogs.', 'Loves the word "alpha".'],
    quirks: ['pitches you his own coin', 'says "to the moon"', 'falls for anything that sounds like an investment'],
    hairs: ['side', 'short', 'spiky'],
    outfit: { tops: ['tank', 'polo', 'hoodie'], colors: ['#e0a52d', '#2a2a2a', '#e8e8e0'], hats: ['none', 'cap'] },
  },
  {
    gender: 'm',
    title: 'a retired police detective',
    ages: [58, 75], gull: [0.08, 0.25], tech: [0.3, 0.5], savings: [2000, 6000], gift: 0.2, card: 0.7,
    tempers: ['skeptical', 'grumpy'],
    bio: ['Thirty years in fraud squad. Bored in retirement.', 'Loves to "play along" a bit too long.'],
    quirks: ['asks for badge numbers', 'very calm', 'takes notes loudly'],
    hairs: ['bald', 'short'], greyHair: true,
    outfit: { tops: ['shirtTie'], colors: ['#c8c0a8', '#9aa8b8', '#e8e8e0'] },
  },
  {
    gender: 'm',
    title: 'a dreamy aspiring actor who works in a coffee shop',
    ages: [20, 34], gull: [0.5, 0.8], tech: [0.4, 0.6], savings: [300, 1500], gift: 0.7, card: 0.6,
    tempers: ['dreamy', 'chatty'],
    bio: ['Thinks every call might be his big break.', 'Always in the middle of an audition monologue.'],
    quirks: ['practices accents', 'dramatic gasps', 'asks if you are a casting agent'],
    hairs: ['long', 'curly', 'side'],
    outfit: { tops: ['tee', 'hoodie'], colors: ['#d06aa0', '#3aa3a3', '#e0a52d'], body: ['slim'], hats: ['none', 'beanie'] },
  },
  {
    gender: 'f',
    title: 'a busy single mom juggling two kids and a job',
    ages: [30, 44], gull: [0.35, 0.65], tech: [0.4, 0.6], savings: [600, 2500], gift: 0.6, card: 0.85,
    tempers: ['impatient', 'skeptical'],
    bio: ['Kids screaming in the background, dinner burning.', 'Has no time and no money for nonsense.'],
    quirks: ['yells at the kids mid-sentence', 'threatens to hang up every minute', 'melts if you are kind to her'],
    hairs: ['ponytail', 'long', 'bun'],
    outfit: { tops: ['tee', 'hoodie'], colors: ['#8ab8d8', '#d8a08a', '#9ad89a'] },
  },
];

const HOOKS = [
  'Called the number from a pop-up saying their computer has a virus.',
  'Got a voicemail saying their tax return has a problem.',
  'Got a text about a package that could not be delivered.',
  'Clicked an ad promising a free cruise.',
  'Received an email saying their bank account was locked.',
  'Saw a pop-up saying they won a gift card.',
];

const VOICES = {
  f: { old: ['Gacrux', 'Sulafat', 'Vindemiatrix', 'Achernar'], young: ['Leda', 'Zephyr', 'Autonoe', 'Laomedeia', 'Aoede'], firm: ['Kore', 'Pulcherrima', 'Erinome'] },
  m: { old: ['Algenib', 'Charon', 'Rasalgethi', 'Sadaltager'], young: ['Puck', 'Fenrir', 'Zubenelgenubi', 'Sadachbia', 'Achird'], firm: ['Orus', 'Alnilam', 'Iapetus'] },
};
function voiceFor(gender: 'f' | 'm', age: number, temper: Temper): string {
  const v = VOICES[gender];
  if (['angry', 'grumpy', 'impatient', 'rude', 'entitled'].includes(temper)) return pick(age >= 60 ? [...v.old, ...v.firm] : v.firm);
  return pick(age >= 58 ? v.old : v.young);
}

export function randomLook(gender: 'f' | 'm', a?: Archetype, age = 40): Look {
  const greyChance = a?.greyHair || age >= 60 ? 0.85 : age >= 45 ? 0.25 : 0.02;
  const hair = a ? pick(a.hairs) : pick(HAIRS);
  const o = a?.outfit;
  return {
    skin: pick(SKINS),
    hair,
    hairColor: Math.random() < greyChance ? pick(['#e8e2d6', '#bdbdbd', '#9a9a9a']) : pick(HAIR_COLORS.slice(0, 4).concat(['#b8452a'])),
    facial: gender === 'm' ? (age >= 50 ? pick(['none', 'mustache', 'beard']) : pick(FACIALS)) : 'none',
    glasses: Math.random() < (age >= 60 ? 0.65 : 0.2),
    shirt: o ? pick(o.colors) : pick(SHIRTS),
    top: o ? pick(o.tops) : 'tee',
    body: o?.body ? pick(o.body) : age >= 60 ? pick(['normal', 'chubby'] as Body[]) : pick(['slim', 'normal', 'normal', 'chubby'] as Body[]),
    height: age >= 70 ? 0.93 : 0.97 + Math.random() * 0.08,
    hat: o?.hats ? pick(o.hats) : 'none',
    hatColor: pick(['#2a2a2a', '#c8432f', '#3a6ab8', '#5b6b3a']),
    pants: pick(['#3b5b8c', '#2b2b33', '#5a4a3a', '#6b6b70']),
    headset: a ? 'none' : '#1e1e1e',
  };
}

let seq = 0;
export function randomPersona(opts: { baiter?: boolean } = {}): Persona {
  const a = pick(ARCHETYPES);
  const gender = a.gender;
  const lang = LANGS[settings.lang] ? settings.lang : 'en';
  const age = Math.round(rnd(...a.ages));
  const gen = age >= 58 ? 'old' : 'young';
  const base = pick(LANGS[lang].names[gender][gen]);
  const name = lang === 'he' && a.heTitle ? `${a.heTitle} ${base.split(' ')[0]}` : base;
  const baiter = !!opts.baiter;
  const temper: Temper = baiter ? 'chatty' : Math.random() < 0.55 ? pick(a.tempers) : pick(ALL_TEMPERS);
  const situation = pick(lang === 'he' && Math.random() < 0.4 ? SITUATIONS_IL : SITUATIONS);
  const speech = pick(SPEECH);
  return {
    id: `p${Date.now().toString(36)}${seq++}`,
    name,
    age,
    gender,
    location: pick(LANGS[lang].towns),
    archetype: a.title,
    bio: pick(a.bio),
    quirks: shuffle(a.quirks).slice(0, 2),
    temper,
    situation,
    speech,
    gullibility: baiter ? 0.95 : rnd(...a.gull),
    techSkill: rnd(...a.tech),
    savings: Math.round(rnd(...a.savings) / 50) * 50,
    giftCardFriendly: Math.random() < a.gift,
    hasCard: Math.random() < a.card,
    baiter,
    voice: {
      pitch: gender === 'f' ? rnd(1.05, 1.45) - (age > 60 ? 0.1 : 0) : rnd(0.6, 0.95),
      rate: age > 65 ? rnd(0.78, 0.9) : age < 20 ? rnd(1.1, 1.25) : rnd(0.95, 1.1),
    },
    voiceName: voiceFor(gender, age, temper),
    look: randomLook(gender, a, age),
    hook: pick(HOOKS),
  };
}

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const KEY = 'ccc.customCallers';
export function loadCustom(): (Persona & { inRotation?: boolean })[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}
export function saveCustom(list: (Persona & { inRotation?: boolean })[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
  }
}

export function nextLead(unlocked: string[]): Persona {
  const custom = loadCustom().filter((c) => c.inRotation !== false);
  if (custom.length && Math.random() < 0.3) {
    const c = pick(custom);
    return { ...c, id: `c${Date.now().toString(36)}${seq++}`, custom: true, hook: c.hook || pick(HOOKS) };
  }
  const baiter = unlocked.includes('baiters') && Math.random() < 0.14;
  return randomPersona({ baiter });
}
