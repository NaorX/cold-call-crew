import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { liveServer, liveAvailable, liveSpeak } from './live.mjs';
import { RoomLogic } from '../src/shared/room.js';
import { aiAvailable, bossAdvice, callerModel, callerTurn, initAi, provider } from './caller-ai.mjs';
import { geminiAvailable, geminiSpeak, geminiModels, VOICES } from './gemini.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'dist');
const PORT = Number(process.env.PORT) || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};

const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length <= 40;
}

function json(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req, limit = 64_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/api/status') {
    return json(res, 200, { ok: true, ai: aiAvailable(), provider: provider(), model: callerModel(), tts: geminiAvailable() ? geminiModels.tts : null, live: liveAvailable(), voices: geminiAvailable() ? VOICES : null, rooms: rooms.size });
  }
  if (url.pathname === '/api/caller/turn' && req.method === 'POST') {
    if (!aiAvailable()) return json(res, 503, { error: 'no-ai' });
    if (!allowed(req.socket.remoteAddress || '?')) return json(res, 429, { error: 'slow down' });
    try {
      const body = await readBody(req);
      if (!body?.persona?.name) return json(res, 400, { error: 'bad request' });
      const out = await callerTurn(body);
      return json(res, 200, out);
    } catch (err) {
      console.error('[ai]', err?.status || '', err?.message || err);
      const billing = err?.status === 402 || /credits|billing|quota/i.test(String(err?.message));
      return json(res, 502, { error: 'ai-failed', detail: billing ? 'Gemini says the project has no credits left (billing).' : 'The AI request failed.' });
    }
  }
  if (url.pathname === '/api/boss/advice' && req.method === 'POST') {
    if (!aiAvailable()) return json(res, 503, { error: 'no-ai' });
    if (!allowed(req.socket.remoteAddress || '?')) return json(res, 429, { error: 'slow down' });
    try {
      const body = await readBody(req, 20000);
      return json(res, 200, await bossAdvice(body));
    } catch (err) {
      console.error('[boss]', err?.status || '', err?.message || err);
      return json(res, 502, { error: 'ai-failed' });
    }
  }
  if (url.pathname === '/api/caller/voice' && req.method === 'POST') {
    if (!geminiAvailable()) return json(res, 503, { error: 'no-tts' });
    if (!allowed(req.socket.remoteAddress || '?')) return json(res, 429, { error: 'slow down' });
    try {
      const body = await readBody(req, 8000);
      const text = String(body.text || '').slice(0, 600);
      const voice = String(body.voice || 'Kore').replace(/[^A-Za-z]/g, '');
      const style = String(body.style || '').slice(0, 120);
      if (!text) return json(res, 400, { error: 'no text' });
      const audio = await geminiSpeak(text, voice, style).catch((err) => (console.error('[tts]', err?.status || '', 'falling back to Live'), liveSpeak(text, voice, style)));
      return json(res, 200, { audio, mime: 'audio/wav' });
    } catch (err) {
      console.error('[tts]', err?.status || '', err?.message || err);
      return json(res, 502, { error: 'tts-failed' });
    }
  }
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) return json(res, 403, { error: 'no' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('Cold Call Crew API is running. In development open http://localhost:5173');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const rooms = new Map();

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  while (rooms.has(c));
  return c;
}

function makeRoom() {
  const code = newCode();
  const sockets = new Map();
  const logic = new RoomLogic(code, (to, msg) => {
    const data = JSON.stringify(msg);
    if (to) sockets.get(to)?.send(data);
    else for (const s of sockets.values()) if (s.readyState === 1) s.send(data);
  });
  const room = { logic, sockets };
  rooms.set(code, room);
  return room;
}

const wss = new WebSocketServer({ noServer: true });
const live = liveServer();
server.on('upgrade', (req, socket, head) => {
  const p = new URL(req.url || '/', 'http://x').pathname;
  if (p === '/ws') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  else if (p === '/live' && liveAvailable()) live.handleUpgrade(req, socket, head, (ws) => live.emit('connection', ws, req));
  else socket.destroy();
});
wss.on('connection', (ws) => {
  const id = randomUUID().slice(0, 8);
  let room = null;
  ws.on('message', (raw) => {
    if (raw.length > 8000) return;
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!room) {
      if (msg.t === 'create') {
        room = makeRoom();
      } else if (msg.t === 'join') {
        room = rooms.get(String(msg.code || '').toUpperCase()) || null;
        if (!room) return ws.send(JSON.stringify({ t: 'error', text: 'No crew with that code.' }));
      } else return;
      room.sockets.set(id, ws);
      if (!room.logic.join(id, msg)) {
        room.sockets.delete(id);
        room = null;
      }
      return;
    }
    room.logic.handle(id, msg);
  });
  ws.on('close', () => {
    if (!room) return;
    room.sockets.delete(id);
    room.logic.leave(id);
    if (room.sockets.size === 0) rooms.delete(room.logic.code);
  });
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  for (const r of rooms.values()) r.logic.tick(dt);
}, 100);

await initAi();
server.listen(PORT, () => {
  console.log(`Cold Call Crew server on http://localhost:${PORT}`);
  console.log(aiAvailable() ? `AI callers: ON (${provider()} · ${callerModel()})` : 'AI callers: OFF - set GEMINI_API_KEY or ANTHROPIC_API_KEY in .env (offline brain is used)');
  console.log(geminiAvailable() ? `Caller voices: Gemini TTS (${geminiModels.tts})` : 'Caller voices: browser speech (set GEMINI_API_KEY for real voices)');
});
