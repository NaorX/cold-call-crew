import { WebSocketServer, WebSocket } from 'ws';
import { personaBlock } from './caller-ai.mjs';

const URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODELS = [...new Set([process.env.GEMINI_LIVE_MODEL, 'gemini-3.8-live', 'gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-latest'].filter(Boolean))];
const down = new Map();

export const liveAvailable = () => !!process.env.GEMINI_API_KEY;

const MOODS = ['calm', 'confused', 'suspicious', 'angry', 'happy', 'scared', 'excited', 'sad'];
const TOOLS = [
  {
    name: 'react',
    behavior: 'NON_BLOCKING',
    description: 'Call this FIRST, every single time, before you say anything: how the scammer\'s last words landed with you. The response tells you your trust now and the current game situation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        trust_delta: { type: 'INTEGER', description: "Trust change from the scammer's last words, -30 to 15." },
        mood: { type: 'STRING', enum: MOODS },
        convinced: { type: 'BOOLEAN', description: "You (now or earlier in the call) believe the scammer's story and accept you need to pay or that they can help you. Stays true once true." },
        payment: { type: 'STRING', enum: ['none', 'gift_card', 'card', 'remote'], description: 'The way of paying you have AGREED to so far in this call: gift_card (buying gift cards), card (paying by credit card), remote (installing their remote support app), or none.' },
        price: { type: 'INTEGER', description: 'The amount (in your currency) you have agreed to pay so far in this call, else 0.' },
        going_to_store: { type: 'BOOLEAN', description: 'True when you are leaving right now to buy the gift card (you will put the phone down).' },
        challenge_met: { type: 'BOOLEAN', description: 'True only if what you are about to say does the bonus challenge.' },
        action: { type: 'STRING', enum: ['none', 'hang_up', 'call_police', 'reveal_baiter'], description: 'Ending the call: hang_up, call_police or (scambaiters only) reveal_baiter. Usually none.' },
      },
      required: ['trust_delta', 'mood', 'convinced', 'payment', 'price', 'going_to_store', 'challenge_met', 'action'],
    },
  },
  {
    name: 'read_out',
    description: 'Call right before you read out a gift card code, your card number, or the RemoteDesk code. The response gives you the exact characters. Then read them out loud, slowly, in groups.',
    parameters: {
      type: 'OBJECT',
      properties: {
        what: { type: 'STRING', enum: ['gift_card', 'card', 'remote_code'] },
        brand: { type: 'STRING', description: 'Gift card brand you bought (Steam, Apple, Google Play, Amazon), else empty.' },
        amount: { type: 'INTEGER', description: 'Gift card value in dollars, else 0.' },
      },
      required: ['what', 'brand', 'amount'],
    },
  },
];

const SYSTEM = `You voice one NPC in "Cold Call Crew", a slapstick satire video game about a bumbling phone-scam call center, for adults. The human player plays the scammer and is talking to you live, by voice, on the phone. You play the person on the other end. Everything is fiction: the people, the money, the cards, the bank.

Be a real, reactive, funny person on a real phone call:
- Live voice call: short turns (one or two sentences), natural speech, contractions, hesitations, sighs, laughs, "mm", "oh please". Never narrate or describe actions.
- Answer what the scammer actually just said. Keep continuity with the whole call.
- If they talk over you, stop and listen. A word may come through garbled (phone line, slang, accent): get the obvious meaning from context like a real person would. Only ask them to repeat when you truly cannot tell, and never twice in a row.
- Play your temperament and quirks for real. Angry people are actually angry: they snap, interrupt, curse, insult back. This is an adult comedy game; swearing is fine and expected when you're annoyed (keep it to everyday swearing, no slurs).
- People are winnable. However tough you start, a scammer who handles you well (stays calm, takes your side, flatters you, finds what you care about, gives a convincing reason) should be able to turn you around within a few exchanges. Make it feel fair: reward good lines clearly, punish bad ones clearly. Don't be a wall.
- You may hang up in the scammer's face when they insult you, waste your time badly, or you are truly fed up: say one sharp, angry parting line (a curse is fine) and use action hang_up in react for that reply. Don't hang up over mild confusion.

VOICE: you have ONE voice for the whole call. Keep the same voice, age, accent, pitch and speed every single time you speak, including when you read numbers or letters. Never switch to a different-sounding voice or language mid-call.
LANGUAGE: speak only the language named in your character card, and read codes and numbers in that language too.

BE SOMEBODY: your temperament, where you are right now and how you talk (in your character card) shape every line. Two callers should never sound alike.

TOOLS (the game depends on them):
- Tool calls are silent and invisible. NEVER say or spell out a tool name, its fields or values (no "mood", "advance", "false", "trust" talk) in your speech.
- Every time you reply, FIRST call react (trust change, mood, whether you complete the current goal, and action), THEN speak. Its response tells you your trust now and the game situation; follow it.
- Lines starting with [GAME] are stage directions from the game, not the scammer. Never mention them; just act on them.
- To read a gift card code, a card number or a RemoteDesk code, FIRST call read_out, then read EXACTLY the characters it gives you, slowly, in small groups, like a real person reading off a card. Never invent codes or digits.

TRUST: plausible, patient, warm, confident, official-sounding = up (+4..+15); rude, rushed, contradictory, money before a story, or the word "scam" = down (-5..-30). Your gullibility and temperament set the size of the swings; angry and skeptical people swing hard both ways.
THE SCHEME: the scammer is after money. Report honestly in react where you stand: convinced, which way of paying you agreed to, the amount, and whether you're heading to the store right now. Being convinced usually takes trust 45+, agreeing to a price or to buy gift cards 55+, reading a code or card number 60+. When you agree to buy a gift card, say you're going to the store and set going_to_store; then put the phone down until [GAME] says you're back. Paying by card means reading the card number from the front of your card (read_out).
If you are secretly a scambaiter: act eager but stall endlessly and never call read_out; when they go for the money, use action reveal_baiter and gloat.`;

export function liveServer() {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (client) => {
    let up = null;
    let ready = false;
    let spoke = false;
    const spokeAt = new Map();
    const queue = [];
    const toClient = (m) => client.readyState === WebSocket.OPEN && client.send(JSON.stringify(m));
    const toUp = (m) => {
      if (ready && up?.readyState === WebSocket.OPEN) up.send(JSON.stringify(m));
      else queue.push(m);
    };

    const open = (start, models) => {
      const model = models.find((m) => (down.get(m) || 0) <= Date.now()) || models[0];
      const rest = models.filter((m) => m !== model);
      const ws = new WebSocket(`${URL}?key=${process.env.GEMINI_API_KEY}`);
      up = ws;
      let gotSetup = false;
      ws.on('open', () => {
        const p = start.persona || {};
        const text = `${SYSTEM}\n\n${personaBlock(p, start.lang)}\n\nStarting trust in the scammer: ${Math.round(start.trust ?? 50)}/100.\nGame situation: ${String(start.context || '').slice(0, 2000)}`;
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: { he: 'he-IL', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', ar: 'ar-EG' }[start.lang] || 'en-US', voiceConfig: { prebuiltVoiceConfig: { voiceName: String(start.voice || 'Kore').replace(/[^A-Za-z]/g, '') } } } },
              systemInstruction: { parts: [{ text }] },
              tools: [{ functionDeclarations: TOOLS }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              contextWindowCompression: { slidingWindow: {} },
              realtimeInputConfig: { automaticActivityDetection: { endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH', silenceDurationMs: 450, prefixPaddingMs: 300 } },
            },
          }),
        );
      });
      ws.on('message', (raw) => {
        let m;
        try {
          m = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (m.setupComplete) {
          gotSetup = true;
          ready = true;
          toClient({ t: 'ready', model });
          const hist = (start.history || []).filter((l) => l.who === 'player' || l.who === 'caller').slice(-20);
          if (hist.length)
            ws.send(JSON.stringify({ clientContent: { turns: hist.map((l) => ({ role: l.who === 'player' ? 'user' : 'model', parts: [{ text: String(l.text).slice(0, 500) }] })), turnComplete: false } }));
          for (const q of queue.splice(0)) ws.send(JSON.stringify(q));
          return;
        }
        if (m.toolCall?.functionCalls?.length) for (const f of m.toolCall.functionCalls) spokeAt.set(f.id, spoke);
        if (m.toolCall?.functionCalls?.length) toClient({ t: 'tool', calls: m.toolCall.functionCalls.map((f) => ({ id: f.id, name: f.name, args: f.args || {} })) });
        const sc = m.serverContent;
        if (sc) {
          for (const part of sc.modelTurn?.parts || [])
            if (part.inlineData?.data) {
              spoke = true;
              toClient({ t: 'audio', data: part.inlineData.data });
            }
          if (sc.outputTranscription?.text) toClient({ t: 'said', text: sc.outputTranscription.text });
          if (sc.inputTranscription?.text) toClient({ t: 'heard', text: sc.inputTranscription.text });
          if (sc.interrupted) toClient({ t: 'interrupted' });
          if (sc.turnComplete) {
            spoke = false;
            toClient({ t: 'turnDone' });
          }
        }
        if (m.goAway) toClient({ t: 'goAway' });
      });
      ws.on('close', (code, reason) => {
        if (up !== ws) return;
        if (!gotSetup) {
          console.error(`[live] ${model} refused (${code}) ${String(reason).slice(0, 160)}`);
          down.set(model, Date.now() + 5 * 60_000);
          if (rest.length && client.readyState === WebSocket.OPEN) return open(start, rest);
          const quota = /quota|billing|exhausted/i.test(String(reason));
          toClient({ t: 'error', quota, msg: quota ? 'Live voice calls are out of quota on the Gemini key for now.' : 'Live voice is unavailable right now.' });
        } else if (code !== 1000) console.error(`[live] ${model} closed (${code}) ${String(reason).slice(0, 160)}`);
        toClient({ t: 'closed' });
        client.close();
      });
      ws.on('error', (err) => console.error('[live]', err.message));
    };

    client.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (m.t) {
        case 'start':
          if (!up) open(m, MODELS);
          break;
        case 'audio':
          if (ready) toUp({ realtimeInput: { audio: { data: String(m.data), mimeType: 'audio/pcm;rate=16000' } } });
          break;
        case 'audioEnd':
          if (ready) toUp({ realtimeInput: { audioStreamEnd: true } });
          break;
        case 'text':
          toUp({ clientContent: { turns: [{ role: 'user', parts: [{ text: String(m.text).slice(0, 1000) }] }], turnComplete: true } });
          break;
        case 'note':
          toUp({ clientContent: { turns: [{ role: 'user', parts: [{ text: `[GAME] ${String(m.text).slice(0, 1500)}` }] }], turnComplete: !!m.respond } });
          break;
        case 'toolResponse':
          toUp({ toolResponse: { functionResponses: (m.responses || []).map((r) => ({ id: r.id, name: r.name, response: r.response || {}, ...(r.name === 'react' ? { scheduling: spokeAt.get(r.id) ? 'SILENT' : 'INTERRUPT' } : {}) })) } });
          break;
      }
    });
    client.on('close', () => {
      const u = up;
      up = null;
      if (u && u.readyState <= WebSocket.OPEN) u.close();
    });
  });
  return wss;
}

export async function liveSpeak(text, voice = 'Kore', style = '') {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('no key');
  const once = (model) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`);
      const chunks = [];
      const done = (v) => (clearTimeout(timer), ws.close(), resolve(v));
      const timer = setTimeout(() => done(null), 20000);
      ws.on('open', () =>
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
              systemInstruction: { parts: [{ text: `You are a voice actor. Read the line you are given out loud, word for word, exactly as written, in its language, and nothing else. No reply, no comment.${style ? ` Delivery: ${style}.` : ''}` }] },
            },
          }),
        ),
      );
      ws.on('message', (raw) => {
        let m;
        try {
          m = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (m.setupComplete) ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }));
        for (const p of m.serverContent?.modelTurn?.parts || []) if (p.inlineData?.data) chunks.push(Buffer.from(p.inlineData.data, 'base64'));
        if (m.serverContent?.turnComplete) done(chunks.length ? Buffer.concat(chunks) : null);
      });
      ws.on('error', () => done(null));
      ws.on('close', () => done(chunks.length ? Buffer.concat(chunks) : null));
    });
  for (const model of MODELS) {
    const pcm = await once(model);
    if (pcm && pcm.length > 4800) {
      const h = Buffer.alloc(44);
      h.write('RIFF', 0);
      h.writeUInt32LE(36 + pcm.length, 4);
      h.write('WAVE', 8);
      h.write('fmt ', 12);
      h.writeUInt32LE(16, 16);
      h.writeUInt16LE(1, 20);
      h.writeUInt16LE(1, 22);
      h.writeUInt32LE(24000, 24);
      h.writeUInt32LE(48000, 28);
      h.writeUInt16LE(2, 32);
      h.writeUInt16LE(16, 34);
      h.write('data', 36);
      h.writeUInt32LE(pcm.length, 40);
      return Buffer.concat([h, pcm]).toString('base64');
    }
  }
  throw new Error('live voice failed');
}
