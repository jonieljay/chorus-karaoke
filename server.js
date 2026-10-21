'use strict';

const http = require('node:http');

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const QRCode = require('./vendor/QRCode');
const ErrorLevel = require('./vendor/QRCode/QRErrorCorrectLevel');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_PATH = path.join(ROOT, 'data', 'rooms.json');
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_QUEUE = 80;
const MAX_GUESTS = 100;
const MAX_BODY_BYTES = 20_000;

// Minimal .env reader: this application deliberately needs no npm packages.
try {
  const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) {
      process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  }
} catch (_) { /* The .env file is optional. */ }

const PORT = Number(process.env.PORT || 3000);
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const rooms = new Map();
const streams = new Map();
const searchCache = new Map();
const rateBuckets = new Map();

function loadRooms() {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    for (const room of saved) {
      if (room.updatedAt > Date.now() - ROOM_TTL_MS && /^[A-Z2-9]{6}$/.test(room.code)) {
        room.guests ||= [];
        room.queue ||= [];
        room.history ||= [];
        room.current ||= null;
        room.paused ||= false;
        room.reactions ||= 0;
        rooms.set(room.code, room);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read saved rooms:', error.message);
  }
}

function saveRooms() {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    const tmp = DATA_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...rooms.values()], null, 2));
    fs.renameSync(tmp, DATA_PATH);
  } catch (error) {
    console.error('Unable to persist rooms:', error.message);
  }
}
loadRooms();

function touch(room) { room.updatedAt = Date.now(); saveRooms(); }
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    const data = crypto.randomBytes(6);
    code = [...data].map(x => chars[x % chars.length]).join('');
  } while (rooms.has(code));
  return code;
}
function token() { return crypto.randomBytes(24).toString('hex'); }
function truncate(value, max = 120) { return String(value || '').replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, max); }
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function getAuth(req, room) {
  if (safeEqual(req.headers['x-host-token'], room.hostToken)) return { role: 'host', name: 'Host', id: 'host' };
  const guest = room.guests.find(g => safeEqual(req.headers['x-guest-token'], g.token));
  if (guest) return { role: 'guest', name: guest.name, id: guest.id };
  return null;
}
function getPresence(code) { return streams.get(code)?.size || 0; }
function publicRoom(room) {
  const { code, name, createdAt, locked, queue, current, paused, history, reactions } = room;
  return { code, name, createdAt, locked, queue, current, paused, history: history.slice(-8), reactions, online: getPresence(code) };
}
function json(res, status, data) {
  const output = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(output),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  res.end(output);
}
function problem(res, status, message) { json(res, status, { error: message }); }
function broadcast(code, event, value) {
  const output = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
  for (const conn of (streams.get(code) || [])) {
    try { conn.write(output); } catch (_) { /* Disconnect cleanup will remove this response. */ }
  }
}
function announce(room) { broadcast(room.code, 'state', publicRoom(room)); }
function lanIp() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
function appOrigin(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const rawHost = req.headers.host || `localhost:${PORT}`;
  const host = /^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$|^\[::1\](?::\d+)?$/.test(rawHost)
    ? `${lanIp()}:${PORT}` : rawHost;
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0];
  const protocol = (forwarded === 'https' || req.socket.encrypted) ? 'https' : 'http';
  return `${protocol}://${host}`;
}
function roomUrl(req, code) { return `${appOrigin(req)}/room/${encodeURIComponent(code)}?join=1`; }
function encodeSvgQr(value) {
  const qr = new QRCode(-1, ErrorLevel.M);
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const offset = 4;
  let d = '';
  for (let y = 0; y < count; y++) {
    let x = 0;
    while (x < count) {
      if (!qr.isDark(y, x)) { x++; continue; }
      const start = x;
      while (x < count && qr.isDark(y, x)) x++;
      d += `M${start + offset} ${y + offset}h${x - start}v1h-${x - start}z`;
    }
  }
  const size = count + 2 * offset;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="320" height="320" role="img" aria-label="Scan to join karaoke room"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#181526"/></svg>`;
}
function parseYoutubeId(input) {
  const text = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/')[1] || '';
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch (_) { return null; }
}
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', chunk => {
      text += chunk;
      if (text.length > MAX_BODY_BYTES) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(text ? JSON.parse(text) : {}); }
      catch (_) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function requireAuth(req, res, room, hostOnly = false) {
  const auth = getAuth(req, room);
  if (!auth || (hostOnly && auth.role !== 'host')) {
    problem(res, 403, hostOnly ? 'Only the host can perform this action.' : 'Please join the room first.');
    return null;
  }
  return auth;
}
function roomNext(room) {
  if (room.current) room.history.push(room.current);
  room.history = room.history.slice(-15);
  room.current = room.queue.shift() || null;
  room.paused = false;
  touch(room); announce(room);
}
function rateLimit(req, label, max, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const key = label + ip;
  const now = Date.now();
  const record = rateBuckets.get(key);
  if (!record || record.reset < now) { rateBuckets.set(key, { hits: 1, reset: now + windowMs }); return false; }
  record.hits++;
  return record.hits > max;
}

async function handleApi(req, res, pathname, url) {
  if (pathname === '/api/status' && req.method === 'GET') return json(res, 200, { ok: true, rooms: rooms.size, youtubeSearch: Boolean(YOUTUBE_API_KEY) });
  if (pathname === '/api/config' && req.method === 'GET') return json(res, 200, { searchEnabled: Boolean(YOUTUBE_API_KEY) });

  if (pathname === '/api/rooms' && req.method === 'POST') {
    if (rateLimit(req, 'create', 8, 60_000)) return problem(res, 429, 'Too many room requests. Try again shortly.');
    const body = await readBody(req);
    const code = randomCode();
    const room = {
      code,
      name: truncate(body.name, 58) || 'Friday Night Karaoke',
      hostToken: token(),
      createdAt: Date.now(), updatedAt: Date.now(),
      queue: [], current: null, paused: false, locked: false, history: [], guests: [], reactions: 0
    };
    rooms.set(code, room); saveRooms();
    return json(res, 201, { code, hostToken: room.hostToken });
  }

  if (pathname === '/api/search' && req.method === 'GET') {
    const q = truncate(url.searchParams.get('q'), 90);
    if (q.length < 2) return problem(res, 400, 'Enter at least two characters.');
    if (!YOUTUBE_API_KEY) return problem(res, 503, 'YouTube search requires a YouTube Data API key. You can paste YouTube links without a key.');
    if (rateLimit(req, 'search', 25, 60_000)) return problem(res, 429, 'Too many searches. Try again in a minute.');
    const cached = searchCache.get(q.toLowerCase());
    if (cached && cached.until > Date.now()) return json(res, 200, { results: cached.results });
    try {
      const params = new URLSearchParams({ key: YOUTUBE_API_KEY, part: 'snippet', maxResults: '12', q: q + ' karaoke', type: 'video', videoEmbeddable: 'true', safeSearch: 'moderate' });
      const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(9000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'YouTube search is currently unavailable.');
      const results = (data.items || []).filter(i => /^[A-Za-z0-9_-]{11}$/.test(i.id?.videoId || '')).map(item => ({
        videoId: item.id.videoId,
        title: truncate(item.snippet.title, 180),
        channel: truncate(item.snippet.channelTitle, 85),
        thumbnail: `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg`
      }));
      searchCache.set(q.toLowerCase(), { results, until: Date.now() + 5 * 60_000 });
      return json(res, 200, { results });
    } catch (error) { return problem(res, 502, truncate(error.message, 160)); }
  }

  if (pathname === '/api/resolve' && req.method === 'GET') {
    const id = parseYoutubeId(url.searchParams.get('url'));
    if (!id) return problem(res, 400, 'That does not look like a valid YouTube link or video ID.');
    let title = `YouTube karaoke video (${id})`, channel = 'YouTube';
    try {
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(3500) });
      if (response.ok) {
        const info = await response.json();
        title = truncate(info.title, 180) || title;
        channel = truncate(info.author_name, 85) || channel;
      }
    } catch (_) { /* Pasting a link remains usable even if metadata cannot be resolved. */ }
    return json(res, 200, { videoId: id, title, channel, thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(.*))?$/i);
  if (!roomMatch) return problem(res, 404, 'Route not found.');
  const code = roomMatch[1].toUpperCase();
  const action = roomMatch[2] || '';
  const room = rooms.get(code);
  if (!room) return problem(res, 404, 'This room does not exist or has expired.');

  if (req.method === 'GET' && !action) return json(res, 200, { room: publicRoom(room) });
  if (req.method === 'GET' && action === 'invite') return json(res, 200, { url: roomUrl(req, code) });
  if (req.method === 'GET' && action === 'qr.svg') {
    const svg = encodeSvgQr(roomUrl(req, code));
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(svg);
  }
  if (req.method === 'GET' && action === 'events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    if (!streams.has(code)) streams.set(code, new Set());
    streams.get(code).add(res);
    announce(room);
    const ping = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 20_000);
    req.on('close', () => {
      clearInterval(ping);
      streams.get(code)?.delete(res);
      if (!streams.get(code)?.size) streams.delete(code);
      announce(room);
    });
    return;
  }
  if (req.method === 'POST' && action === 'join') {
    if (rateLimit(req, 'join', 45, 60_000)) return problem(res, 429, 'Please try joining again later.');
    const body = await readBody(req);
    const name = truncate(body.name, 24);
    if (name.length < 2) return problem(res, 400, 'Enter a name with at least two characters.');
    if (room.guests.length >= MAX_GUESTS) return problem(res, 409, 'This room has reached the guest limit.');
    const guest = { id: crypto.randomUUID(), name, token: token() };
    room.guests.push(guest); touch(room);
    return json(res, 201, { guestId: guest.id, guestToken: guest.token, name });
  }
  if (req.method === 'POST' && action === 'identity') {
    const auth = requireAuth(req, res, room);
    if (!auth) return;
    return json(res, 200, { role: auth.role, name: auth.name });
  }
  if (req.method === 'POST' && action === 'queue') {
    const auth = requireAuth(req, res, room);
    if (!auth) return;
    if (room.locked && auth.role !== 'host') return problem(res, 423, 'The host has paused new song requests.');
    if (room.queue.length >= MAX_QUEUE) return problem(res, 409, 'The queue is full.');
    const body = await readBody(req);
    const id = parseYoutubeId(body.videoId);
    if (!id) return problem(res, 400, 'Invalid YouTube video ID.');
    const queuedByGuest = room.queue.filter(s => s.addedById === auth.id).length;
    if (auth.role === 'guest' && queuedByGuest >= 5) return problem(res, 409, 'You already have five songs waiting. Sing one before adding more.');
    const song = {
      id: crypto.randomUUID(), videoId: id,
      title: truncate(body.title, 180) || `YouTube video ${id}`,
      channel: truncate(body.channel, 85) || 'YouTube',
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      addedBy: auth.name, addedById: auth.id, addedAt: Date.now()
    };
    room.queue.push(song); touch(room); announce(room);
    return json(res, 201, { song });
  }
  const removeMatch = action.match(/^queue\/([a-f0-9-]{36})$/);
  if (req.method === 'DELETE' && removeMatch) {
    const auth = requireAuth(req, res, room);
    if (!auth) return;
    const index = room.queue.findIndex(s => s.id === removeMatch[1]);
    if (index < 0) return problem(res, 404, 'Song not found in the queue.');
    if (auth.role !== 'host' && room.queue[index].addedById !== auth.id) return problem(res, 403, 'You can only remove your own requests.');
    room.queue.splice(index, 1); touch(room); announce(room);
    return json(res, 200, { ok: true });
  }
  const moveMatch = action.match(/^queue\/([a-f0-9-]{36})\/move$/);
  if (req.method === 'POST' && moveMatch) {
    if (!requireAuth(req, res, room, true)) return;
    const body = await readBody(req);
    const index = room.queue.findIndex(s => s.id === moveMatch[1]);
    const target = index + (body.direction === -1 ? -1 : 1);
    if (index < 0 || target < 0 || target >= room.queue.length) return problem(res, 400, 'Cannot move the selected song in that direction.');
    [room.queue[index], room.queue[target]] = [room.queue[target], room.queue[index]];
    touch(room); announce(room); return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && action === 'playback/next') {
    if (!requireAuth(req, res, room, true)) return;
    roomNext(room); return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && action === 'playback/ended') {
    if (!requireAuth(req, res, room, true)) return;
    const body = await readBody(req);
    if (room.current && body.songId === room.current.id) roomNext(room);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && action === 'playback/toggle') {
    if (!requireAuth(req, res, room, true)) return;
    if (!room.current) return problem(res, 409, 'No song is on stage.');
    room.paused = !room.paused; touch(room); announce(room);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && action === 'lock') {
    if (!requireAuth(req, res, room, true)) return;
    room.locked = !room.locked; touch(room); announce(room);
    return json(res, 200, { locked: room.locked });
  }
  if (req.method === 'POST' && action === 'reactions') {
    const auth = requireAuth(req, res, room);
    if (!auth) return;
    if (rateLimit(req, 'react', 45, 60_000)) return problem(res, 429, 'A little less confetti, please!');
    const body = await readBody(req);
    const allowed = ['fire', 'heart', 'clap', 'mic', 'star', 'laugh'];
    if (!allowed.includes(body.type)) return problem(res, 400, 'Unknown reaction.');
    room.reactions++; touch(room);
    broadcast(code, 'reaction', { type: body.type, name: auth.name, time: Date.now() });
    announce(room); return json(res, 200, { ok: true });
  }
  return problem(res, 404, 'Route not found.');
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(res, pathname) {
  const file = (pathname === '/' || /^\/room\/[A-Z2-9]{6}\/?$/i.test(pathname)) ? 'index.html' : pathname.slice(1);
  const location = path.resolve(PUBLIC, file);
  if (!location.startsWith(PUBLIC + path.sep)) return problem(res, 403, 'Forbidden.');
  fs.readFile(location, (err, buffer) => {
    if (err) return problem(res, 404, 'Page not found.');
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(location)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': file === 'index.html' ? 'no-store' : 'public, max-age=3600' });
    res.end(buffer);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, url);
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(res, pathname);
    return problem(res, 405, 'Method not allowed.');
  } catch (error) {
    console.error('Request error:', error);
    if (!res.headersSent) problem(res, error.status || 500, error.status ? error.message : 'Something went wrong.');
    else res.end();
  }
});

const cleanupTimer = setInterval(() => {
  let changed = false;
  for (const [code, room] of rooms) {
    if (Date.now() - room.updatedAt > ROOM_TTL_MS) {
      broadcast(code, 'expired', { code });
      rooms.delete(code); changed = true;
    }
  }
  if (changed) saveRooms();
  for (const [key, value] of rateBuckets) if (value.reset < Date.now()) rateBuckets.delete(key);
  for (const [key, value] of searchCache) if (value.until < Date.now()) searchCache.delete(key);
}, 60 * 60 * 1000);
cleanupTimer.unref();

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chorus Karaoke running at http://localhost:${PORT}`);
    console.log(`For phones on your Wi-Fi: http://${lanIp()}:${PORT}`);
    if (!YOUTUBE_API_KEY) console.log('YouTube search is not configured; pasting YouTube links is enabled.');
  });
}
module.exports = { server, rooms, parseYoutubeId, encodeSvgQr, publicRoom };
