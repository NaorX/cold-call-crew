import type { CallerTurn, Line, Persona } from './types';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const has = (re: RegExp, s: string) => re.test(s);

const GREET = /^(hi|hello|hey|good (morning|afternoon|evening)|yes hello|hallo)\b/i;
const POLITE = /\b(please|thank you|thanks|sorry|ma'?am|sir|dear|my friend|no problem|don'?t worry|i understand|of course|happy to help)\b/i;
const RUDE = /(idiot|stupid|dumb|shut up|hurry up|moron|loser|old fool|listen to me|do it now|fuck\w*|shit|bitch|asshole|damn you)/i;
const CONFESS = /(i want to|i'?m going to|gonna|i will) (scam|rob|steal|hack|trick)|i am a scammer|i'?m a scammer/i;
const JOKE = /just kidding|i'?m joking|only joking|kidding/i;
const INFO = /e-?mail|gmail|password|date of birth|birthday|social security|ssn|home address|your address|mother'?s maiden/i;
const SCAM_WORD = /\bscam|fraud|trick you|steal\b/i;
const QUESTION = /\?\s*$|^(what|who|where|when|why|how|do you|are you|can you|is it|have you|did you)\b/i;

const ORG = /\b(?:from|with|at|calling from|this is .* from)\s+(?:the\s+)?([a-z][a-z .&'-]{2,40}?)(?:[,.!?]|\s+(?:and|we|department|team|support)|$)/i;
const NAME = /\b(?:my name is|this is|i am|i'm|it'?s)\s+(?:officer\s+|agent\s+|detective\s+)?([A-Z][a-z]+)/;

const STORIES: { key: string; re: RegExp; react: string[]; ask: string[] }[] = [
  {
    key: 'account',
    re: /hack\w* (your|my|the)? ?account|account (was|is|got|has been) (hack|compromis|lock|suspend)|your (google|gmail|email|facebook|bank) account|someone (got|broke) into/i,
    react: ['Hacked? My account? Oh no, I keep all my recipes in there!', "Someone's in my account? Is that why I keep getting emails about a prince?", 'My account got hacked? I knew I should not have used my dog as the password.'],
    ask: ['What should I do?', 'Can you lock them out?', 'Is my money safe?'],
  },
  {
    key: 'virus',
    re: /virus|hack|infect|malware|computer (is|has)|your (pc|computer|windows)|microsoft|windows|apple support|tech(nical)? support|security alert/i,
    react: ['Oh no, a virus? I knew something was wrong, it has been so slow!', "A virus? Is that why my screen keeps showing those pictures of cruises?", 'Oh dear. Is my computer going to explode? My grandson said they can do that.'],
    ask: ['What do I need to do to fix it?', 'Can you fix it from there?', 'Will I lose my photos of the cat?'],
  },
  {
    key: 'tax',
    re: /tax|irs|government|warrant|arrest|police|lawsuit|court|owe|penalt|federal/i,
    react: ['Arrest? For taxes? I always pay my taxes, I even pay them early!', "Oh my goodness, a warrant? I've never even had a parking ticket.", 'The government? What did I do? Is this about the library book?'],
    ask: ['How do I fix this before they come?', 'How much do I owe?', 'Can I just pay it and make it go away?'],
  },
  {
    key: 'family',
    re: /grand(son|daughter|ma|pa|kid|child)|nephew|niece|your (son|daughter)|it'?s me|in trouble|jail|bail|accident|hospital/i,
    react: ["Oh sweetheart, is that you? You sound different!", "What happened? Are you hurt?", "Oh no, oh no. Does your mother know?"],
    ask: ['What do you need me to do?', 'How much do you need?', 'Where are you right now?'],
  },
  {
    key: 'prize',
    re: /won|winner|prize|lottery|congratulation|free (cruise|trip|iphone|gift)|selected|sweepstake|reward/i,
    react: ['I won? I never win anything! I once won a ham.', 'A prize! Oh, wait until I tell the girls at bingo.', 'Really? Me? What did I win?'],
    ask: ['How do I collect it?', 'Is there a catch?', 'Do I need to pay anything?'],
  },
  {
    key: 'refund',
    re: /refund|overcharg|bank|account (is|was|has)|locked|suspend|transaction|subscription|renewal|charged/i,
    react: ['A refund? Oh, how nice, nobody ever gives money back.', 'My account? Is my money safe?', 'Charged? I did not order anything!'],
    ask: ['What do I have to do?', 'How do I get my money back?', 'Is my money going to be okay?'],
  },
];

const GIFT = /gift ?cards?|itunes|google play|steam (card|gift)|apple card|amazon card|voucher|scratch the back|the code on the back/i;
const CARD = /credit card|debit card|card number|card details|expir|cvv|three digits|security code/i;
const REMOTE = /download|install|anydesk|teamviewer|remote ?desk|remote access|screen ?share|six digit|6 digit|connect to your (computer|pc)/i;
const PAY = /\bpay|money|dollars|\$\d|transfer|wire|send (me|us)|bitcoin|crypto/i;

export function localTurn(p: Persona, history: Line[], trust: number, context: string): CallerTurn {
  const out: CallerTurn = { reply: '', trust_delta: 0, mood: 'calm', action: 'none', gift_card_brand: '', amount: 0, voice_style: '' };
  const said = history.filter((h) => h.who === 'player');
  const mine = history.filter((h) => h.who === 'caller').map((h) => h.text);
  const last = said[said.length - 1]?.text.trim() || '';
  const allPlayer = said.map((h) => h.text).join(' \n ');
  const g = p.gullibility;
  const say = (options: string[]) => {
    const fresh = options.filter((o) => !mine.includes(o));
    return pick(fresh.length ? fresh : options);
  };

  if (!last) {
    out.reply = say(['Hello? Is there someone I can speak to?', "Yes, hello? I got a message to call this number.", 'Hello? Who is this?', "Hi, um, I'm calling about the thing on my computer?"]);
    return out;
  }

  const story = STORIES.find((s) => s.re.test(last)) || null;
  const knownStory = STORIES.find((s) => s.re.test(allPlayer)) || null;
  const orgRaw = ORG.exec(last)?.[1]?.trim();
  const org = orgRaw && !/^(here|there|home|work|it|that|this|you|me|the phone|my phone|your computer|outside)$/i.test(orgRaw) ? orgRaw : undefined;
  const name = NAME.exec(last)?.[1];
  const wantsGift = has(GIFT, last);
  const wantsCard = has(CARD, last);
  const remoteOk = !/Do not use give_remote_code/.test(context);
  const cardOk = !/Do not use read_card/.test(context);
  const wantsRemote = has(REMOTE, last);
  const wantsMoney = has(PAY, last) || wantsGift || wantsCard;
  const turns = said.length;

  let d = 0;
  if (has(POLITE, last)) d += 3 + g * 4;
  if (story && (!knownStory || knownStory.key === story.key)) d += 4 + g * 6;
  if (story && knownStory && knownStory.key !== story.key && turns > 2) d -= 6;
  if (org || name) d += 3 + g * 3;
  if (last.split(/\s+/).length > 8) d += 2;
  if (last.split(/\s+/).length <= 2 && !GREET.test(last)) d -= 2;
  if (has(RUDE, last)) d -= 15 + (1 - g) * 10;
  if (has(SCAM_WORD, last)) d -= 22;
  if (wantsMoney && trust < 55 && !knownStory) d -= 14 + (1 - g) * 8;
  if (/fake refund/i.test(context) && /refund|too much|difference|send (it )?back/i.test(last)) d += 10;
  d = Math.round(Math.max(-30, Math.min(15, d)));
  const t = trust + d;
  out.trust_delta = d;

  if (p.baiter) {
    out.trust_delta = 5;
    out.mood = 'excited';
    if ((wantsGift || wantsCard || wantsRemote) && turns >= 3) {
      out.action = 'reveal_baiter';
      out.mood = 'happy';
      out.reply = say(["Hahaha! You've been on the phone with me for ten minutes, buddy. This is all going on my channel!", 'Oh honey, I knew from the very first word. Say hi to my two million subscribers!']);
      return out;
    }
    out.reply = say([
      "Oh I'd LOVE to help! Hold on, my printer is making that noise again.",
      'Could you say that one more time? My hearing aid is set to jazz.',
      "Okay! Wait, my cat just sat on the keyboard. Kevin! Off! Sorry, go on.",
      'Of course, of course. Just let me find my reading glasses... they were on my head this whole time!',
    ]);
    return out;
  }

  const tooSoon = t < 55;
  const confess = has(CONFESS, last);
  if (confess) {
    out.trust_delta = -30;
    out.mood = 'angry';
    out.reply = g < 0.4 ? "Excuse me?! That's it, I'm reporting this number." : say(['Scam me? What is that supposed to mean?!', "You want to WHAT? Oh, I don't like this one bit."]);
    if (g < 0.4 || trust - 30 <= 4) out.action = g < 0.4 ? 'call_police' : 'hang_up';
    return out;
  }
  if (has(JOKE, last)) {
    out.trust_delta = Math.min(d, 2);
    out.mood = 'suspicious';
    out.reply = say(["Ha. Very funny. So what do you actually want?", "Kidding, huh? You have a strange sense of humor. What is this call about?"]);
    return out;
  }
  if (has(INFO, last) && !wantsGift && !wantsCard) {
    const first = p.name.split(' ')[0].toLowerCase();
    if (t >= 55) {
      out.mood = 'calm';
      out.reply = /password/i.test(last)
        ? say([`My password? It's... ${first}${p.age > 60 ? '1948' : '123'}. Oh, should I not have said that?`, 'My password is the name of my first dog plus my birthday. Rover0412. Is that secure?'])
        : say([`My email is ${first}.${p.name.split(' ')[1]?.toLowerCase() || 'home'}${p.age > 60 ? '1948' : ''}@aol.com, all lowercase.`, `It's ${first}${Math.floor(Math.random() * 90 + 10)}@gmail.com. Do you need the password too?`]);
    } else {
      out.trust_delta = Math.min(d, -6);
      out.mood = 'suspicious';
      out.reply = say(["Why do you need that? You're the ones who should have it.", "I'm not giving that out to a stranger on the phone."]);
    }
    return out;
  }
  if (wantsRemote && !remoteOk) {
    out.mood = 'confused';
    out.reply = say(["Download? Oh, I don't know how to install anything, my grandson does all that.", "RemoteDesk? I can't find it. Is there another way?"]);
  } else if (wantsCard && !cardOk) {
    out.reply = say(["My card? I'd rather not read that over the phone.", 'I left my purse in the car, sorry.']);
  } else if (wantsRemote) {
    if (tooSoon) out.reply = say(["Install something? I don't know you well enough for that.", 'My son told me never to install things people tell me on the phone.']);
    else {
      out.action = 'give_remote_code';
      out.mood = 'happy';
      out.reply = say(['Okay, it downloaded... it says RemoteDesk... there is a little code here, let me read it to you.', "Alright, I clicked the green button. It's showing me some numbers, here they are."]);
    }
  } else if (wantsGift) {
    if (tooSoon) out.reply = say(['Gift cards? Why would the ' + (org || 'company') + ' want gift cards?', 'That sounds strange. Why not a check?']);
    else if (!p.giftCardFriendly) out.reply = say(["I don't even know where they sell gift cards. Can't I just mail a check?", "Gift cards? I'm not driving to the store, my knee is acting up."]);
    else if (t < 70) out.reply = say(['Gift cards... are you sure that is how this works?', "Hmm, okay, but which ones? And this will fix everything?"]);
    else {
      out.action = 'read_gift_card';
      out.gift_card_brand = (last.match(/steam|apple|google play|amazon|target/i)?.[0] || pick(['Steam', 'Apple', 'Google Play'])).replace(/^\w/, (c) => c.toUpperCase());
      out.amount = Math.max(50, Math.min(p.savings, Math.round((150 + Math.random() * 400) / 50) * 50));
      out.mood = 'happy';
      out.reply = say(["Okay, I'm back from the store. The cashier gave me a funny look. Let me scratch the back... here are the numbers.", 'Alright, I have the card right here. Reading it to you now.']);
    }
  } else if (wantsCard) {
    if (tooSoon) out.reply = say(['My card number? I really should not give that out.', 'Why do you need my card if you are the ' + (org || 'bank') + '?']);
    else if (!p.hasCard) out.reply = say(["I don't carry a card, I pay cash like a normal person.", 'My card? My daughter keeps it so I stop ordering from TV.']);
    else if (t < 72) out.reply = say(['Hmm. Can you prove you are really from ' + (org || 'there') + ' first?', "I'll get my purse, but I'm still not sure about this."]);
    else {
      out.action = 'read_card';
      out.reply = say(['Fine, let me get it out of my purse. Okay, reading it now.', 'Alright, here it is. The numbers are a bit worn but I can read them.']);
    }
  } else if (has(RUDE, last) || has(SCAM_WORD, last)) {
    out.mood = 'angry';
    out.reply = has(SCAM_WORD, last)
      ? say(['A scam? Wait... is this a scam?', "Why would you say scam? Now I'm worried."])
      : say(["Excuse me? Don't you talk to me like that!", "Well that's very rude. My late husband never spoke to me that way."]);
  } else if (story && story.key === 'virus' && !/virus|hack|infect|malware|danger|problem|alert/i.test(last)) {
    out.reply = say([`Oh, ${org || 'the computer people'}? Is something wrong with my computer?`, 'Tech support? I did not call anyone. Is something wrong?']);
  } else if (story) {
    out.mood = story.key === 'prize' ? 'excited' : story.key === 'refund' ? 'happy' : 'scared';
    out.reply = `${say(story.react)} ${say(story.ask)}`;
  } else if (org || name) {
    out.reply = say([
      `Oh, ${name ? name + ', ' : ''}${org ? 'from ' + org : 'hello'}. What is this about?`,
      `${org ? org + '?' : 'Okay.'} How can I help you${name ? ', ' + name : ''}?`,
    ]);
  } else if (GREET.test(last)) {
    out.reply = say(["Hello! Yes, it's " + p.name.split(' ')[0] + ' speaking. Who is this?', 'Hi there. Who am I speaking with?']);
  } else if (QUESTION.test(last)) {
    if (/name/i.test(last)) out.reply = `It's ${p.name}. And who are you?`;
    else if (/old|age/i.test(last)) out.reply = `I'm ${p.age}. Why do you ask?`;
    else if (/where|live|address|city/i.test(last)) out.reply = `I live in ${p.location}. Is that important?`;
    else if (/computer|screen|see|in front/i.test(last)) out.reply = say(["Yes, I'm sitting in front of it right now.", "I can see the screen, there's a picture of a boat on it."]);
    else if (/bank|money|savings|account/i.test(last)) out.reply = say(["I have a little saved up, why?", "I keep my savings at the bank, the one with the nice lady."]);
    else if (/understand|follow|there|hear/i.test(last)) out.reply = say(["Yes, yes, I'm listening.", "I think so. Go on."]);
    else out.reply = say(['Hmm, I suppose so. Why?', "I'm not sure. What do you think?", 'Yes, I think so.']);
  } else if (knownStory) {
    out.reply = say(knownStory.ask.concat(['Okay. And then what?', 'Alright, I am listening.', 'Mm-hm. Go on, dear.']));
  } else if (t > 60) {
    out.mood = 'happy';
    out.reply = say(['Okay, that sounds reasonable. What should I do?', 'Alright. You seem to know what you are doing.']);
  } else {
    out.mood = 'confused';
    const words = last.split(/\s+/).filter((w) => w.length > 3).slice(-2).join(' ');
    out.reply = say([
      "I'm sorry, what is this call about exactly?",
      'Sorry, who did you say you were with?',
      'I am a little lost. Can you start from the beginning?',
      words ? `${words.charAt(0).toUpperCase() + words.slice(1)}? What do you mean?` : 'Hello? Are you still there?',
      'Is this about my computer? It has been acting funny.',
    ]);
  }

  if (out.action === 'none' && t <= 4) {
    out.action = g < 0.3 ? 'call_police' : 'hang_up';
    out.mood = 'angry';
    out.reply = g < 0.3 ? "That's it. I'm reporting this number to the police." : "I don't like this one bit. Goodbye!";
  } else if (out.action === 'none' && turns > 60 && Math.random() < 0.1) {
    out.action = 'hang_up';
    out.reply = "I'm sorry, my show is starting. Goodbye!";
  }
  return out;
}
