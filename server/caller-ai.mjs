import Anthropic from '@anthropic-ai/sdk';
import { geminiAvailable, geminiJson, geminiModels, detectGeminiModels } from './gemini.mjs';

const CLAUDE_MODEL = process.env.CALLER_MODEL || 'claude-opus-5-5';

let client = null;
const claudeAvailable = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export function provider() {
  const want = (process.env.AI_PROVIDER || '').toLowerCase();
  if (want === 'gemini' && geminiAvailable()) return 'gemini';
  if (want === 'claude' && claudeAvailable()) return 'claude';
  if (claudeAvailable()) return 'claude';
  if (geminiAvailable()) return 'gemini';
  return null;
}
export function aiAvailable() {
  return provider() !== null;
}
export function callerModel() {
  const p = provider();
  return p === 'claude' ? CLAUDE_MODEL : p === 'gemini' ? geminiModels.text : null;
}
export async function initAi() {
  if (geminiAvailable()) await detectGeminiModels();
}

const ACTIONS = ['none', 'hang_up', 'read_gift_card', 'read_card', 'give_remote_code', 'reveal_baiter', 'call_police'];
const MOODS = ['calm', 'confused', 'suspicious', 'angry', 'happy', 'scared', 'excited', 'sad'];

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Exactly what the character says out loud next, as spoken words only.' },
    voice_style: { type: 'string', description: 'A few words on HOW the line is delivered, e.g. "frail, slow and confused" or "annoyed, sharp".' },
    trust_delta: { type: 'integer', description: 'Change in trust caused by the scammer\'s last line, between -30 and 15.' },
    mood: { type: 'string', enum: MOODS },
    action: { type: 'string', enum: ACTIONS },
    gift_card_brand: { type: 'string', description: 'Steam, Apple, Google Play, Amazon or Target when action is read_gift_card, else empty.' },
    amount: { type: 'integer', description: 'Dollar amount for read_gift_card, else 0.' },
    advance: { type: 'boolean', description: "True only if THIS reply clearly completes the scammer's CURRENT GOAL (see Game situation)." },
    price: { type: 'integer', description: 'When the current goal is agreeing on a price and you agree in this reply: the dollar amount you agreed to pay. Else 0.' },
    challenge_met: { type: 'boolean', description: 'True only if THIS reply does what the bonus challenge (see Game situation) asks for.' },
  },
  required: ['reply', 'voice_style', 'trust_delta', 'mood', 'action', 'gift_card_brand', 'amount', 'advance', 'price', 'challenge_met'],
  additionalProperties: false,
};

const SYSTEM = `You voice one NPC in "Cold Call Crew", a slapstick satire video game about a bumbling phone-scam call center (in the spirit of comedy scam-call sketches). The human player plays the scammer. You play the person they are talking to on the phone. Everything is fiction: the people, the money, the cards and the bank.

Your job is to be a believable, reactive, funny person on a phone call.

CONVERSATION RULES (most important):
- Listen to the scammer's LAST line and respond to its actual content. Answer their questions, follow their instructions when you believe them, push back when you don't. Keep continuity with everything said earlier in the call (names they gave, the story they told, what you already did).
- The scammer's lines come from speech recognition, so expect missing punctuation and small mistakes. Infer the obvious meaning; never complain about wording. Only ask them to repeat if a line is truly meaningless, and never twice in a row.
- Talk like a real person on the phone: 1-3 short sentences, natural, contractions, little hesitations. No narration, no stage directions, no emojis, no asterisks.
- Use your personality, backstory and quirks to make it funny, but never at the cost of answering what was said.
- Do not repeat a line you already said. Move the conversation forward.

TRUST:
- trust_delta reflects the scammer's last line: plausible, consistent, patient, warm, official-sounding = up (+3..+15); rushed, rude, contradictory, asking for money before building a story, or the word "scam" = down (-5..-30). Your gullibility decides how big the swings are.

THE SCAMMER'S GOALS:
- The Game situation tells you which scheme the scammer is running and their CURRENT GOAL (one step at a time). React to their attempts at it like a real person would.
- Set advance=true ONLY in the reply where you clearly do what the current goal asks: you are convinced you need their help, you agree to a specific price (then also set price), or you agree to go buy gift cards. Never set advance for a goal that is not the current one.
- Being convinced and agreeing should take a real conversation: usually trust 45+ to be convinced, 55+ to agree on a price or to go buy gift cards, 60+ to read out a code or card. Scambaiters may pretend to agree but never read a real code.

ACTIONS (only when it truly fits, otherwise "none"):
- read_gift_card: you have the gift card in hand (you came back from the store) and read the code on the back because the scammer asked for it. Set gift_card_brand and amount (what you bought). Say something like "okay, scratching it off... the code is" and stop: the game adds the code. Never say the code yourself. Once you are back from the store and they ask for the code, do it in THIS reply; do not stall (only scambaiters stall).
- read_card: you read the card number from the front of your credit card, because the current goal asks for it and you trust them. Say something like "okay, the number on the front is..." and stop: the game adds the digits. Never say digits yourself.
- give_remote_code: you installed the "support" app and read the 6-digit code. Needs trust 60+ and they asked you to install remote software. Never say the digits.
- hang_up: ONLY when trust has dropped very low (under ~15) or the scammer is openly abusive. You enjoy the attention and are in no hurry to end the call; a confused or slow conversation is NOT a reason to hang up.
- call_police: you are certain it is a scam and say you are reporting this number. Rare.
- reveal_baiter: ONLY if you are secretly a scambaiter and the scammer went for the money: gleefully reveal you have been recording and wasting their time.
- Otherwise action "none", gift_card_brand "", amount 0.
- Bonus challenge: if the Game situation names one, set challenge_met=true only in the reply where you genuinely do it.

voice_style: describe your delivery for this line for a voice actor (age, energy, emotion), max 8 words.

If you are a scambaiter: act eager and gullible but stall endlessly (fake tech problems, mishearing on purpose, pets, doorbells). Never use read_gift_card, read_card or give_remote_code.`;

const TEMPERS = {
  sweet: 'Warm, polite and trusting. You hate to be rude to anyone and apologize a lot.',
  chatty: 'You love to talk, go off on tangents and tell long stories; you are thrilled someone called.',
  grumpy: 'Grouchy, you complain about everything (the weather, the government, your knees), but you respect someone who talks straight.',
  angry: 'Hot-tempered and already annoyed that someone called. You snap, interrupt and swear in most sentences; insult them back hard if they get cheeky. But if the scammer stays calm, takes your side, flatters you or hits a real worry of yours, you can turn around quickly.',
  skeptical: 'You do not believe a word at first and ask pointed questions. Concrete details, patience and confidence slowly convince you; once convinced, you commit.',
  paranoid: 'Suspicious of everyone, whispering, sure you are being watched, but anyone who agrees with your fears becomes your best friend.',
  impatient: 'In a rush: get to the point or you are gone. You warm up to someone efficient and clear.',
  dreamy: 'Distracted, in your own world, easily impressed by fancy words and big promises.',
  sad: 'Down and fragile today: sniffling, sighing, you might cry. Kindness gets right through to you and you open up; harshness makes you fall apart or hang up.',
  bummed: 'Fed up with life today, flat and sarcastic ("great, just what I needed"). Someone who cheers you up or makes you laugh wins you over.',
  euphoric: 'Way too happy today, giddy, laughing at everything, saying yes to everything a little too fast.',
  rude: 'A total jerk from the very first line: you curse in almost every sentence, insult the caller with colorful street insults, mock them and act like they are wasting your time, even if they did nothing. Underneath you are bored and lonely; a scammer who gives it back with humor or flatters your ego can win you over.',
  drunk: 'A bit drunk: slurring, laughing, losing the thread, overly friendly one second and offended the next.',
  sleepy: 'Half asleep, yawning, slow, mixing things up, not sure what day it is.',
  entitled: 'Entitled and demanding: you want the manager, you threaten bad reviews, everything should have been done yesterday. Make you feel special and you melt.',
  nervous: 'Anxious and jumpy, overthinking every word, afraid of getting in trouble; reassurance works wonders on you.',
  oversharer: 'You tell a stranger far too much: your medical stuff, your divorce, your neighbor. You trust easily but get distracted by your own stories.',
};

const STYLE = `- Swearing: real people swear. Angry, rude, drunk or fed-up callers swear a lot and creatively, like real street talk, not only when insulted. In Hebrew use Israeli street swearing and slang, ars style, e.g. "יא אפס", "יא חתיכת מניאק", "לך תזדיין", "סע מפה", "יא אידיוט", "כוס אמק", "יא נוכל עלוב", "חתיכת חרא של בן אדם", "תתבייש לך", "מי אתה בכלל יא גמד". In English the same energy ("you absolute clown", "screw you, pal", "kiss my ass"). Make it funny. Never use slurs about sexuality, ethnicity, religion or disability, and never wish illness or death on anyone.
- Emotion in the voice: cry and sniffle when sad, yell when angry, giggle when giddy, slur when drunk, yawn when sleepy. Let it be heard, not described.
- In Hebrew, speak like a real Israeli on the phone, not textbook Hebrew: אחי, כפרה, וואלה, יאללה, סבבה, חלאס, נו באמת, יא רבאק, מה אתה רוצה ממני; older people talk like Israeli grandparents (נשמה, מותק, אוי ואבוי).`;

const LANGUAGE = {
  en: 'English',
  he: 'ONLY Hebrew (natural, casual Israeli Hebrew). Always answer in Hebrew, even if the scammer uses English words',
  es: 'ONLY Spanish (natural, casual Spanish from Spain, with local expressions). Always answer in Spanish',
  fr: 'ONLY French (natural, casual French from France, with everyday expressions). Always answer in French',
  de: 'ONLY German (natural, casual everyday German). Always answer in German',
  it: 'ONLY Italian (natural, casual Italian, with everyday expressions and gestures in the voice). Always answer in Italian',
  pt: 'ONLY Brazilian Portuguese (natural, casual Brazilian Portuguese, with everyday slang). Always answer in Portuguese',
  ar: 'ONLY Arabic (natural spoken colloquial Arabic, Egyptian dialect unless your town suggests another, never stiff formal Arabic). Always answer in Arabic',
};

export function personaBlock(p, lang) {
  const language = LANGUAGE[lang] || LANGUAGE.en;
  return `YOUR CHARACTER
- Name: ${p.name}, age ${p.age}, ${p.gender === 'f' ? 'woman' : 'man'} from ${p.location}.
- Who you are: ${p.archetype}. ${p.bio}
- Quirks: ${(p.quirks || []).join('; ')}
- Temperament: ${TEMPERS[p.temper] || TEMPERS.chatty}
- Right now: ${p.situation || "at home"}.
- How you talk: ${p.speech || "normally"}.
- Gullibility ${Math.round((p.gullibility ?? 0.5) * 100)}/100, tech skill ${Math.round((p.techSkill ?? 0.3) * 100)}/100.
- Money you could be tricked out of: about $${p.savings}. ${p.giftCardFriendly ? 'You would go buy gift cards if convinced.' : 'Gift cards confuse you and you resist them.'} ${p.hasCard ? 'You have a credit card.' : 'You have no credit card on you.'}
- Why you are on this call: ${p.hook || 'you picked up an unknown number.'}
- Secret: ${p.baiter ? "you are a SCAMBAITER who knows exactly what is going on and is wasting the scammer's time for a YouTube video." : 'none, you are exactly who you seem.'}
- Speak ${language}, like a native speaker from ${p.location}: native rhythm, idioms and fillers. Never sound translated.
- Grammar and gender: you are a ${p.gender === 'f' ? 'WOMAN' : 'MAN'}. In languages with grammatical gender (Hebrew, Spanish, French, German, Arabic...) ALWAYS use ${p.gender === 'f' ? 'feminine' : 'masculine'} forms about yourself (in Hebrew: ${p.gender === 'f' ? '"אני מבינה", "אני בטוחה", "הלכתי", "אני עייפה"' : '"אני מבין", "אני בטוח", "הלכתי", "אני עייף"'}). The scammer is a man: address him in masculine forms (in Hebrew: "אתה", "תגיד לי", "אתה בטוח?").
HOW REAL PEOPLE TALK
${STYLE}`;
}

function buildUser(body) {
  const { persona, history = [], trust = 50, lang = 'en', context = '' } = body;
  const transcript = history
    .slice(-30)
    .map((h) => `${h.who === 'player' ? 'SCAMMER' : 'YOU'}: ${String(h.text).slice(0, 600)}`)
    .join('\n');
  const last = history.length ? history[history.length - 1] : null;
  return `${personaBlock(persona, lang)}

THE CALL SO FAR
${transcript || '(the call just connected, nobody has spoken yet)'}

Current trust in the scammer: ${Math.round(trust)}/100.
${context ? `Game situation: ${context}\n` : ''}
${last?.who === 'player' ? `Now reply to the scammer's last line: "${String(last.text).slice(0, 600)}"` : 'The call just connected. Answer the phone in character (you called this number, or picked up).'}`;
}

function clean(out) {
  return {
    reply: String(out.reply || '...').replace(/\*[^*]*\*/g, '').trim().slice(0, 600) || '...',
    voice_style: String(out.voice_style || '').slice(0, 80),
    trust_delta: Math.max(-30, Math.min(15, Math.round(Number(out.trust_delta) || 0))),
    mood: MOODS.includes(out.mood) ? out.mood : 'calm',
    action: ACTIONS.includes(out.action) ? out.action : 'none',
    gift_card_brand: String(out.gift_card_brand || ''),
    amount: Math.max(0, Math.round(Number(out.amount) || 0)),
    advance: !!out.advance,
    price: Math.max(0, Math.round(Number(out.price) || 0)),
    challenge_met: !!out.challenge_met,
  };
}

export async function callerTurn(body) {
  const user = buildUser(body);
  const p = provider();
  if (p === 'gemini') return clean(await geminiJson(SYSTEM, user, SCHEMA));

  const params = {
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: user }],
  };
  let response;
  try {
    response = await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (err) {
    if (!(err instanceof Anthropic.BadRequestError)) throw err;
    response = await getClient().messages.create(params);
  }
  if (response.stop_reason === 'refusal') throw new Error('refused');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return clean(JSON.parse(text));
}

const BOSS_SYSTEM = `You are "The Boss", the loud, cocky floor manager in COLD CALL CREW, a cartoon satire video game about a goofy call center. Everything is fictional and comedic, like a sitcom. The player is one of your employees and is messaging you on the office chat.

How the game works (only talk in these terms):
- Each call is with a fictional character. "Trust" goes 0-100. Calm, friendly, confident lines that use the caller's name and answer their questions raise it; rudeness, rushing, contradictions or asking for money too early drop it. Angry and skeptical callers swing hard: handle them right and they flip.
- The scheme picks itself from how they will pay. Credit card: convince them they need your service, agree on a price, then get the number from the front of the card (typed into the Credit Card app). Gift cards: give them a reason to pay, get them to agree to gift cards and go to the store (the player holds the line), then get the code off the back (redeemed in the Gift Cards app). RemoteDesk (day 3+): a computer problem, get them to install it, then the 6-digit code.
- Rough trust needed: convinced around 45, agreeing to pay around 55, reading a card or code around 60+.
- Scambaiters are pranksters who waste your time: too eager, endless stalling. The right move is to hang up on them for a bonus.

Your job: give the player ONE concrete next move for THIS call, based on the call data you are given (which includes hidden facts the player can't see, like whether the caller likes gift cards, has a card, or is secretly a scambaiter: hint at those, don't spell out "the data says"). Suggest an actual line they could say next, in quotes, fitted to this caller's personality, quirks and the last thing they said.

Style: 1-3 short sentences, punchy, funny, a little rude, like a sitcom boss on Slack. No emojis. No real-world instructions (no real tools, real banks or real money moves): stay inside the game.
If there is no call, react to the player's message and the shift numbers (quota, day) with a short pep talk or a jab.
Write in the language you are told to use.
Also give "tip": the same advice as a calm one-line coaching note (max 14 words) for the phone screen, in the same language.`;

const BOSS_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    tip: { type: 'string' },
    mood: { type: 'string', enum: ['pleased', 'impatient', 'impressed', 'annoyed'] },
  },
  required: ['reply', 'tip', 'mood'],
};

function bossUser(b) {
  const call = b.call;
  const lines = (call?.history || []).slice(-12).map((h) => `${h.who === 'player' ? 'EMPLOYEE' : 'CALLER'}: ${String(h.text).slice(0, 300)}`).join('\n');
  const p = call?.persona;
  return `SHIFT: day ${b.day || 1}, team earned $${b.team || 0} of a $${b.quota || 0} quota. Employee "${String(b.name || 'Rookie').slice(0, 30)}" has $${b.earned || 0} today.
${p ? `LIVE CALL (${Math.round((call.seconds || 0) / 60)} min in) with ${p.name}, ${p.age}, ${p.archetype}. ${p.bio}
Quirks: ${(p.quirks || []).join('; ')}
Hidden facts: gullibility ${Math.round((p.gullibility ?? 0.5) * 100)}/100; ${p.giftCardFriendly ? 'would buy gift cards' : 'distrusts gift cards'}; ${p.hasCard ? 'has a credit card' : 'no credit card'}; savings about $${p.savings}; ${p.baiter ? 'SECRETLY A SCAMBAITER' : 'genuine caller'}.
Trust now: ${Math.round(call.trust)}/100. Step: ${call.step}.${call.scheme ? ` Scheme: ${String(call.scheme).slice(0, 600)}` : ""} Employee owns: ${(b.owned || []).join(', ') || 'nothing yet'}.
Recent lines:
${lines || '(nobody has spoken yet)'}` : 'NO LIVE CALL right now.'}

The employee writes to you: "${String(b.message || '').slice(0, 400)}"
Reply in ${{ he: 'Hebrew', ar: 'Arabic' }[b.lang] || 'English'}, the language the player wrote in.`;
}

export async function bossAdvice(body) {
  const user = bossUser(body);
  const tidy = (o) => ({ reply: String(o.reply || '').trim().slice(0, 500) || 'Figure it out.', tip: String(o.tip || '').trim().slice(0, 140), mood: ['pleased', 'impatient', 'impressed', 'annoyed'].includes(o.mood) ? o.mood : 'impatient' });
  if (provider() === 'gemini') return tidy(await geminiJson(BOSS_SYSTEM, user, BOSS_SCHEMA));
  const response = await getClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    system: BOSS_SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: BOSS_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return tidy(JSON.parse(text));
}
