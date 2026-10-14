export type HairStyle = 'bald' | 'short' | 'bun' | 'curly' | 'long' | 'mohawk' | 'cap' | 'side' | 'afro' | 'spiky' | 'ponytail' | 'buzz';
export type Facial = 'none' | 'mustache' | 'beard' | 'goatee';

export type Body = 'slim' | 'normal' | 'chubby';
export type Brows = 'thin' | 'normal' | 'bushy' | 'unibrow';
export type Top = 'tee' | 'polo' | 'hoodie' | 'shirtTie' | 'tank';
export type Hat = 'none' | 'beanie' | 'cap' | 'cowboy' | 'headband';

export interface Look {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  facial: Facial;
  glasses: boolean;
  shirt: string;
  body?: Body;
  height?: number;
  head?: number;
  nose?: number;
  eyes?: number;
  brows?: Brows;
  top?: Top;
  pants?: string;
  shoes?: string;
  headset?: string;
  hat?: Hat;
  hatColor?: string;
}

export interface Persona {
  id: string;
  name: string;
  age: number;
  gender: 'f' | 'm';
  location: string;
  archetype: string;
  bio: string;
  quirks: string[];
  gullibility: number;
  techSkill: number;
  savings: number;
  giftCardFriendly: boolean;
  hasCard: boolean;
  baiter: boolean;
  voice: { pitch: number; rate: number };
  voiceName?: string;
  temper?: string;
  situation?: string;
  speech?: string;
  look: Look;
  hook: string;
  custom?: boolean;
}

export type Who = 'player' | 'caller' | 'system';
export type LineKind = 'gift' | 'card' | 'remote' | 'baiter' | 'police' | 'refund' | 'info';
export interface Line {
  who: Who;
  text: string;
  kind?: LineKind;
  data?: any;
  live?: boolean;
}

export type CallerAction =
  | 'none'
  | 'hang_up'
  | 'read_gift_card'
  | 'read_card'
  | 'give_remote_code'
  | 'reveal_baiter'
  | 'call_police';

export interface CallerTurn {
  reply: string;
  voice_style?: string;
  trust_delta: number;
  mood: string;
  action: CallerAction;
  gift_card_brand: string;
  amount: number;
  advance?: boolean;
  price?: number;
  challenge_met?: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  look: Look | null;
  desk: number;
  ready: boolean;
  talking: boolean;
  onCall: string | null;
  personal: number;
  today: number;
  clockedOut?: boolean;
  pose: { x: number; z: number; y?: number; f: number; a: 'stand' | 'walk' | 'run' | 'sit'; s: number | null } | null;
}

export interface RunInfo {
  phase: 'lobby' | 'shift' | 'review' | 'fired';
  day: number;
  clock: number;
  shiftSeconds: number;
  quota: number;
  teamToday: number;
  heat: number;
  paused: boolean;
  unlocked: string[];
  bestDay: number;
  review: ReviewInfo | null;
  total?: number;
  reviewIn?: number;
}

export interface ReviewInfo {
  day: number;
  quota: number;
  team: number;
  pass: boolean;
  crew: { id: string; name: string; today: number }[];
  next: string[];
  nextQuota: number;
  moments?: { id: string; name: string; amount: number; source: string; note: string }[];
  quotes?: { id: string; name: string; text: string; to: string; gain: number }[];
  total?: number;
  runCrew?: { id: string; name: string; total: number }[];
  looks?: Record<string, Look | null>;
}
