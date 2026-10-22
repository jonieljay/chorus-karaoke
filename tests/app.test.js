'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { once } = require('node:events');
const { server, parseYoutubeId, encodeSvgQr } = require('../server');

async function start(t) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
async function call(base, endpoint, options = {}) {
  const response = await fetch(base + endpoint, {
    method: options.method || 'GET',
    headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json();
  return { status: response.status, result };
}

test('Recognizes permitted YouTube link forms and rejects unrelated URLs', () => {
  const id = 'dQw4w9WgXcQ';
  assert.equal(parseYoutubeId(`https://www.youtube.com/watch?v=${id}&t=10`), id);
  assert.equal(parseYoutubeId(`https://youtu.be/${id}`), id);
  assert.equal(parseYoutubeId(`https://music.youtube.com/watch?v=${id}`), id);
  assert.equal(parseYoutubeId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(parseYoutubeId(id), id);
  assert.equal(parseYoutubeId('https://notyoutube.example/watch?v=' + id), null);
  assert.equal(parseYoutubeId('https://www.youtube.com/watch?v=invalid'), null);
});

test('Generates standalone SVG QR graphics', () => {
  const svg = encodeSvgQr('http://192.168.1.2:3000/room/ABCDEF?join=1');
  assert.match(svg, /^<svg/);
  assert.match(svg, /<path d="M/);
  assert.match(svg, /viewBox="0 0/);
});

test('Hosts and phone guests collaborate in real time with a protected queue', async t => {
  const base = await start(t);
  const create = await call(base, '/api/rooms', { method: 'POST', body: { name: 'Unit Test Party' } });
  assert.equal(create.status, 201);
  const { code, hostToken } = create.result;
  const roomPath = `/api/rooms/${code}`;
  const guest = await call(base, roomPath + '/join', { method: 'POST', body: { name: 'Singer One' } });
  assert.equal(guest.status, 201);
  const guestToken = guest.result.guestToken;
  const guestHeaders = { 'x-guest-token': guestToken };
  const hostHeaders = { 'x-host-token': hostToken };
  const addBody = { videoId: 'dQw4w9WgXcQ', title: 'Karaoke Track', channel: 'Music Channel' };
  const add = await call(base, roomPath + '/queue', { method: 'POST', headers: guestHeaders, body: addBody });
  assert.equal(add.status, 201);
  assert.equal(add.result.song.addedBy, 'Singer One');
  const response = await call(base, roomPath);
  assert.equal(response.result.room.queue.length, 1);
  assert.equal(response.result.room.queue[0].title, 'Karaoke Track');
  assert.equal('hostToken' in response.result.room, false);
  const guestSkip = await call(base, roomPath + '/playback/next', { method: 'POST', headers: guestHeaders, body: {} });
  assert.equal(guestSkip.status, 403);
  const hostNext = await call(base, roomPath + '/playback/next', { method: 'POST', headers: hostHeaders, body: {} });
  assert.equal(hostNext.status, 200);
  assert.equal((await call(base, roomPath)).result.room.current.title, 'Karaoke Track');
  const hostPause = await call(base, roomPath + '/playback/toggle', { method: 'POST', headers: hostHeaders, body: {} });
  assert.equal(hostPause.status, 200);
  assert.equal((await call(base, roomPath)).result.room.paused, true);
  const hostLock = await call(base, roomPath + '/lock', { method: 'POST', headers: hostHeaders, body: {} });
  assert.equal(hostLock.result.locked, true);
  const blockedAdd = await call(base, roomPath + '/queue', { method: 'POST', headers: guestHeaders, body: addBody });
  assert.equal(blockedAdd.status, 423);
  const hostAdd = await call(base, roomPath + '/queue', { method: 'POST', headers: hostHeaders, body: addBody });
  assert.equal(hostAdd.status, 201);
  const qr = await fetch(base + roomPath + '/qr.svg');
  assert.equal(qr.status, 200);
  assert.match(await qr.text(), /<svg/);
  const invite = await call(base, roomPath + '/invite');
  assert.match(invite.result.url, /\/room\/[A-Z2-9]{6}\?join=1$/);
  const reaction = await call(base, roomPath + '/reactions', { method: 'POST', headers: guestHeaders, body: { type: 'heart' } });
  assert.equal(reaction.status, 200);
  assert.equal((await call(base, roomPath)).result.room.reactions, 1);
});

test('A connected phone receives live room state updates over SSE', async t => {
  const base = await start(t);
  const created = await call(base, '/api/rooms', { method: 'POST', body: { name: 'Live Updates Test' } });
  const { code, hostToken } = created.result;
  const controller = new AbortController();
  const response = await fetch(`${base}/api/rooms/${code}/events`, { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /connected/);
  const guest = await call(base, `/api/rooms/${code}/join`, { method: 'POST', body: { name: 'Remote Phone' } });
  const added = await call(base, `/api/rooms/${code}/queue`, {
    method: 'POST', headers: { 'x-guest-token': guest.result.guestToken },
    body: { videoId: 'dQw4w9WgXcQ', title: 'Song Received Live' }
  });
  assert.equal(added.status, 201);
  let events = '';
  for (let i = 0; i < 6; i++) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SSE event timed out')), 1800))
    ]);
    events += new TextDecoder().decode(chunk.value || new Uint8Array());
    if (events.includes('Song Received Live')) break;
  }
  assert.match(events, /Song Received Live/);
  controller.abort();
  try { await reader.cancel(); } catch (_) {}
});


test('The host player hides YouTube controls and keeps the live reaction rail outside the video', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
  assert.match(app, /playerVars: \{ autoplay: 0, controls: 0, fs: 0,/);
  assert.match(app, /<div class="video-surface"><div id="youtube-container">/);
  assert.match(app, /class="reactions-rail" id="reactions-layer"/);
  assert.match(css, /\.reactions-rail \{position:relative;/);
  assert.doesNotMatch(css, /\.reactions-layer \{position:absolute;inset:0;/);
});

test('Guest reactions are broadcast immediately to the host along with the updated count', async t => {
  const base = await start(t);
  const created = await call(base, '/api/rooms', { method: 'POST', body: { name: 'Live Reactions Test' } });
  const code = created.result.code;
  const controller = new AbortController();
  const stream = await fetch(`${base}/api/rooms/${code}/events`, { signal: controller.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  await reader.read(); // initial SSE comment
  const joined = await call(base, `/api/rooms/${code}/join`, { method: 'POST', body: { name: 'Live Guest' } });
  const posted = await call(base, `/api/rooms/${code}/reactions`, {
    method: 'POST', headers: { 'x-guest-token': joined.result.guestToken }, body: { type: 'fire' }
  });
  assert.equal(posted.status, 200);
  let events = '';
  for (let i = 0; i < 6; i++) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Reaction SSE timed out')), 1800))
    ]);
    events += new TextDecoder().decode(chunk.value || new Uint8Array());
    if (events.includes('event: reaction') && events.includes('"reactions":1')) break;
  }
  assert.match(events, /event: reaction/);
  assert.match(events, /"type":"fire"/);
  assert.match(events, /"name":"Live Guest"/);
  assert.match(events, /event: state/);
  assert.match(events, /"reactions":1/);
  controller.abort();
  try { await reader.cancel(); } catch (_) {}
});
