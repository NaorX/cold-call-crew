const BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

export function geminiAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

const headers = () => ({ 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY });

export const geminiModels = { text: process.env.GEMINI_MODEL || '', tts: process.env.GEMINI_TTS_MODEL || '' };
const chains = { text: [], tts: [] };
const coolDown = new Map();
const thinkingFor = new Map();

function version(name) {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(name);
  return m ? Number(m[1]) : 0;
}

export async function detectGeminiModels() {
  if (!geminiAvailable()) return geminiModels;
  try {
    const r = await fetch(`${BASE}/models?pageSize=1000`, { headers: headers() });
    const j = await r.json();
    const names = (j.models || []).map((m) => String(m.name || '').replace(/^models\//, ''));
    const plain = names.filter((n) => /^gemini-[\d.]+-flash(-preview)?$/.test(n)).sort((a, b) => version(b) - version(a));
    const tts = names.filter((n) => /^gemini-[\d.]+-flash-tts(-preview)?$/.test(n)).sort((a, b) => version(b) - version(a));
    const ttsAny = names.filter((n) => /tts/.test(n)).sort((a, b) => version(b) - version(a));
    if (!geminiModels.text) geminiModels.text = plain[0] || 'gemini-3.8-flash';
    if (!geminiModels.tts) geminiModels.tts = tts[0] || ttsAny[0] || 'gemini-3.8-flash-tts';
    const lite = names.filter((n) => /^gemini-[\d.]+-flash-lite$/.test(n)).sort((a, b) => version(b) - version(a));
    chains.text = [...new Set([geminiModels.text, ...plain, ...lite, 'gemini-flash-latest'])].filter((n) => names.includes(n) || n === geminiModels.text);
    chains.tts = [...new Set([geminiModels.tts, ...ttsAny])].filter((n) => !/lite/.test(n));
  } catch (err) {
    console.error('[gemini] could not list models:', err?.message || err);
    if (!geminiModels.text) geminiModels.text = 'gemini-3.8-flash';
    if (!geminiModels.tts) geminiModels.tts = 'gemini-3.8-flash-tts';
  }
  return geminiModels;
}

async function post(path, body, timeoutMs = 15_000) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }).catch((err) => {
    const e = new Error(`gemini timeout/network: ${err?.message || err}`);
    e.status = 503;
    throw e;
  });
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
  }
  if (!r.ok) {
    const err = new Error(`gemini ${r.status}: ${data?.error?.message || text.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

function outputContent(data) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  return steps.filter((s) => s.type === 'model_output').flatMap((s) => s.content || []);
}

async function geminiJsonWith(model, system, user, schema) {
  try {
    const body = {
      model,
      system_instruction: system,
      input: user,
      response_format: { type: 'text', mime_type: 'application/json', schema },
      generation_config: { thinking_level: thinkingFor.get(model) || 'minimal', max_output_tokens: 1200 },
      store: false,
    };
    let data;
    try {
      data = await post('/interactions', body);
    } catch (err) {
      if (err.status !== 400 || !/thinking/i.test(err.message)) throw err;
      thinkingFor.set(model, 'low');
      body.generation_config.thinking_level = 'low';
      data = await post('/interactions', body);
    }
    const text = data.output_text || outputContent(data).filter((c) => c.type === 'text').map((c) => c.text).join('');
    return JSON.parse(text);
  } catch (err) {
    if (err.status && err.status !== 404 && err.status !== 400) throw err;
    const data = await post(`/models/${model}:generateContent`, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: stripForLegacy(schema), maxOutputTokens: 600 },
    });
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return JSON.parse(text);
  }
}

function stripForLegacy(schema) {
  const s = JSON.parse(JSON.stringify(schema));
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    delete o.additionalProperties;
    for (const v of Object.values(o)) walk(v);
  };
  walk(s);
  return s;
}

export const VOICES = {
  f: ['Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat', 'Zephyr'],
  m: ['Puck', 'Charon', 'Fenrir', 'Orus', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Algenib', 'Rasalgethi', 'Alnilam', 'Schedar', 'Achird', 'Zubenelgenubi', 'Sadachbia', 'Sadaltager'],
};

async function geminiSpeakWith(model, text, voice, style) {
  try {
    const data = await post('/interactions', {
      model,
      input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: style ? [{ type: 'speech_metadata', style }] : [] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
      store: false,
    });
    const audio = outputContent(data).filter((c) => c.type === 'audio').pop();
    if (!audio?.data) throw new Error('no audio in response');
    const mime = audio.mime_type || 'audio/wav';
    if (/l16|pcm/i.test(mime)) return pcmToWav(Buffer.from(audio.data, 'base64'), audio.sample_rate || 24000).toString('base64');
    return audio.data;
  } catch (err) {
    if (err.status && err.status !== 404 && err.status !== 400) throw err;
    const data = await post(`/models/${model}:generateContent`, {
      contents: [{ role: 'user', parts: [{ text: style ? `Say in a ${style} voice: ${text}` : text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    });
    const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!part) throw new Error('no audio in legacy response');
    return pcmToWav(Buffer.from(part.inlineData.data, 'base64'), 24000).toString('base64');
  }
}

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const lastGood = { text: '', tts: '' };
async function withFallback(kind, fn) {
  if (!chains[kind].length) await detectGeminiModels();
  const list = chains[kind].length ? chains[kind] : [geminiModels[kind]];
  const now = Date.now();
  const good = lastGood[kind];
  const ready = list.filter((m) => (coolDown.get(m) || 0) <= now);
  const order = [...new Set([...(good && (coolDown.get(good) || 0) <= now ? [good] : []), ...ready, ...list.filter((m) => (coolDown.get(m) || 0) > now)])];
  let last;
  for (const model of order) {
    try {
      const out = await fn(model);
      if (lastGood[kind] !== model) console.log(`[gemini] ${kind} now using ${model}`);
      lastGood[kind] = model;
      return out;
    } catch (err) {
      last = err;
      if (lastGood[kind] === model) lastGood[kind] = '';
      if (err.status === 503 || err.status === 429 || err.status === 404) {
        coolDown.set(model, Date.now() + (err.status === 429 ? 120_000 : 45_000));
        continue;
      }
      throw err;
    }
  }
  throw last;
}

export function geminiJson(system, user, schema) {
  return withFallback('text', (m) => geminiJsonWith(m, system, user, schema));
}

export function geminiSpeak(text, voice, style) {
  return withFallback('tts', (m) => geminiSpeakWith(m, text, voice, style));
}
