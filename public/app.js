'use strict';

const $ = selector => document.querySelector(selector);
const app = $('#app');
const storagePrefix = 'chorus-karaoke:';
const state = {
  code: null, room: null, role: null, name: '', guestId: '', hostToken: '', guestToken: '',
  config: { searchEnabled: false }, inviteUrl: '',
  stream: null, player: null, playerReady: false, playerSongId: null,
  playerError: '', songsById: new Map(), searchTimer: null, searchSequence: 0
};
const iconPaths = {
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  skip: '<path d="m5 4 10 8-10 8V4ZM19 4v16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v7h-7m4-4h3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/>',
  external: '<path d="M14 4h6v6M10 14 20 4M20 14v6H4V4h6"/>',
  lock: '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  sparkle: '<path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5ZM15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  arrow: '<path d="M4 12h16m-7-7 7 7-7 7"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8m12.8-12.8a9 9 0 0 1 0 12.8M8.8 8.8a4.5 4.5 0 0 0 0 6.4m6.4-6.4a4.5 4.5 0 0 1 0 6.4"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  headset: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 14v5a2 2 0 0 0 2 2h2v-9H5a2 2 0 0 0-2 2Zm18 0v5a2 2 0 0 1-2 2h-2v-9h2a2 2 0 0 1 2 2Z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.1 8.8-8.1a5.5 5.5 0 0 0 0-7.8Z"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 6 3-6 3z"/>',
  x: '<path d="M5 5 19 19M19 5 5 19"/>',
  screen: '<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8M12 18v4"/>',
  party: '<path d="m4 20 4-12 8 8-12 4ZM11 4h.01M20 7h.01M19 18h.01M13 3l2 3M19 10l3 2M4 3l2 2"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
};
const reactions = {
  fire: '\u{1F525}', heart: '\u{1F49C}', clap: '\u{1F44F}',
  mic: '\u{1F3A4}', star: '\u{1F31F}', laugh: '\u{1F602}'
};
function icon(name, size = '') { return `<svg class="icon ${size}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.music}</svg>`; }
function escapeHTML(text) { return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function brand() { return `<a class="brand" href="/" aria-label="Chorus home"><span class="brand-mark">${icon('mic')}</span>chorus<span class="brand-dot">.</span></a>`; }
let toastTimer;
function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = error ? 'visible error' : 'visible';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', 4000);
}
async function request(endpoint, { method = 'GET', body, headers = {} } = {}) {
  const options = { method, headers: { ...headers } };
  if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch(endpoint, options);
  let data;
  try { data = await response.json(); } catch (_) { data = {}; }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function identityHeaders() {
  return state.role === 'host' ? { 'x-host-token': state.hostToken } : { 'x-guest-token': state.guestToken };
}
async function roomRequest(path, { method = 'POST', body } = {}) {
  return request(`/api/rooms/${state.code}/${path}`, { method, body, headers: identityHeaders() });
}
async function clipboardCopy(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text); return true;
    }
    const temp = document.createElement('textarea');
    temp.value = text; temp.style.position = 'fixed'; temp.style.opacity = '0';
    document.body.appendChild(temp); temp.select();
    const done = document.execCommand('copy'); temp.remove();
    if (done) return true;
  } catch (_) { /* Tell the user about the failure below. */ }
  window.prompt('Copy the invite URL:', text);
  return false;
}
function home() {
  document.title = 'Chorus | Your Karaoke Night, Amplified';
  app.innerHTML = `
    <div class="site-bg"></div>
    <div class="container">
      <header class="topnav">${brand()}<nav class="navlinks"><a href="#how-it-works">How it works</a><a href="#features">Features</a><a class="nav-pill" href="#start">Start singing ${icon('arrow', 'small')}</a></nav></header>
      <main>
        <section class="hero" id="start">
          <div class="hero-copy">
            <div class="hero-kicker"><i></i> YOUR NIGHT. YOUR MIC. YOUR MUSIC.</div>
            <h1><span class="line">Turn up the</span><span class="line gradient-text">good times.</span></h1>
            <p>One screen. All your favorite songs. Everyone's a DJ. Create a karaoke room, let your friends scan the QR code, and keep the music going all night.</p>
            <div class="hero-bullets"><span>${icon('check')} No downloads</span><span>${icon('check')} YouTube-powered</span><span>${icon('check')} Everyone joins in</span></div>
            <div class="create-card">
              <form id="create-form"><p class="card-title">Give your party a name</p><div class="create-row"><input class="field" id="party-name" aria-label="Party name" placeholder="e.g. Friday Night Karaoke" maxlength="58" value="Friday Night Karaoke" required /><button type="submit" class="btn btn-primary" id="start-btn">Start a party ${icon('arrow')}</button></div></form>
              <div class="create-bottom"><span>No account. No app. Just karaoke.</span><span>Already invited? <button class="text-link" id="toggle-join">Join a room</button></span></div>
              <form id="join-inline" class="join-inline"><input id="join-code" class="field" maxlength="6" placeholder="ROOM CODE" aria-label="Six-character room code" required /><button class="btn btn-dark" type="submit">Join ${icon('arrow','small')}</button></form>
            </div>
          </div>
          <div class="hero-visual" aria-hidden="true">
            <div class="showcase"><div class="showcase-bar"><div class="mini-brand">${icon('mic','small')} chorus<span style="color:#e26da5">.</span></div><span class="live-badge">LIVE SESSION</span></div>
              <div class="showcase-grid"><div class="showcase-player"><i class="spot a"></i><i class="spot b"></i><div class="player-mock-icon">${icon('mic','big')}</div><div class="bottom-caption"><span>NOW ON STAGE</span><strong>Your next favorite song</strong></div></div>
              <div class="showcase-queue"><div class="queue-label">${icon('list','small')} Coming up</div><div class="mock-song"><div class="mock-art">01</div><div class="txt"><strong>Love on Top</strong><span>Requested by Alex</span></div></div><div class="mock-song"><div class="mock-art alt">02</div><div class="txt"><strong>Perfect</strong><span>Requested by Mia</span></div></div><div class="mock-song"><div class="mock-art third">03</div><div class="txt"><strong>APT.</strong><span>Requested by Sam</span></div></div><div class="mock-dots"><span>+ 5 more songs</span><span>${icon('heart','small')}</span></div></div></div>
              <div class="mock-footer"><span>${icon('users','small')} Everyone's in on the fun</span><b>ROOM #CH0RUS</b></div>
            </div>
            <div class="floating-tile tile-one"><span class="tile-icon">${icon('music')}</span><span>Song added to queue<small>From Alex's phone</small></span></div>
            <div class="floating-tile tile-two"><span class="tile-icon">${icon('phone')}</span><span>Phones are the remote<small>Scan. Pick. Sing.</small></span></div>
          </div>
        </section>
        <section class="section-center" id="how-it-works"><span class="section-overline">THREE SIMPLE STEPS</span><h2>Big karaoke energy. <span class="gradient-text">Zero hassle.</span></h2><p>From first song to final encore, we've made the whole thing as easy as picking your favorite track.</p>
          <div class="feature-grid" id="features"><article class="feature-card"><div class="feature-icon">${icon('screen','big')}</div><h3>01. Make your stage</h3><p>Start a room on a laptop or TV. This is your main stage where YouTube videos and lyrics play for the whole party.</p></article>
          <article class="feature-card"><div class="feature-icon purple">${icon('qr','big')}</div><h3>02. Scan and join</h3><p>Everyone scans your room's QR code on their phone. No installs, sign-ups, or awkward passing the remote.</p></article>
          <article class="feature-card"><div class="feature-icon green">${icon('list','big')}</div><h3>03. Queue the hits</h3><p>Guests add YouTube songs to a live shared queue. The host controls playback, while everyone sends reactions.</p></article></div>
        </section>
        <section class="cta-strip"><div><h2>Ready to steal the spotlight?</h2><p>Good songs. Great friends. Unforgettable karaoke nights.</p></div><a href="#start" class="btn btn-primary">Let's sing ${icon('arrow')}</a></section>
      </main><footer class="site-footer">${brand()}<span>Made for living-room legends and shower-singing superstars.</span><span>YouTube playback stays on the host screen.</span></footer>
    </div>`;
  $('#create-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#start-btn');
    button.disabled = true; button.textContent = 'Creating party...';
    try {
      const { code, hostToken } = await request('/api/rooms', { method: 'POST', body: { name: $('#party-name').value.trim() } });
      localStorage.setItem(`${storagePrefix}host:${code}`, hostToken);
      location.assign(`/room/${code}`);
    } catch (error) { toast(error.message, true); button.disabled = false; button.innerHTML = `Start a party ${icon('arrow')}`; }
  });
  $('#toggle-join').addEventListener('click', () => { $('#join-inline').classList.toggle('is-open'); $('#join-code').focus(); });
  $('#join-inline').addEventListener('submit', event => {
    event.preventDefault();
    const code = $('#join-code').value.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) return toast('Enter a valid 6-character room code.', true);
    location.assign(`/room/${code}?join=1`);
  });
}
function renderJoin(room) {
  state.room = room;
  document.title = `Join ${room.name} | Chorus Karaoke`;
  app.innerHTML = `<div class="site-bg"></div><div class="container join-page"><header class="topnav">${brand()}<a class="nav-pill" href="/">${icon('arrow','small')} Back to home</a></header>
    <main class="join-main"><div class="join-card"><div class="join-spotlight">${icon('mic','big')}</div><span class="section-overline">YOU'RE INVITED</span><h1>You're one song away from the spotlight.</h1><p>Join <strong>${escapeHTML(room.name)}</strong>, add karaoke hits to the queue, and cheer everyone on from your phone.</p>
    <form id="guest-form"><label for="guest-name">What should we call you?</label><input id="guest-name" class="field" placeholder="Your nickname" maxlength="24" autocomplete="nickname" required minlength="2" autofocus /><button class="btn btn-primary" id="join-button" type="submit">Join the party ${icon('arrow')}</button></form>
    <div class="join-room-detail">${icon('radio')} Room ${escapeHTML(room.code)} <span style="margin-left:auto" class="live-badge">PARTY ROOM</span></div></div></main></div>`;
  $('#guest-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#join-button'); button.disabled = true;
    const name = $('#guest-name').value.trim();
    if (name.length < 2) { button.disabled = false; return toast('Enter at least two characters.', true); }
    try {
      const response = await request(`/api/rooms/${room.code}/join`, { method: 'POST', body: { name } });
      state.role = 'guest'; state.guestId = response.guestId; state.guestToken = response.guestToken; state.name = response.name;
      localStorage.setItem(`${storagePrefix}guest:${room.code}`, JSON.stringify(response));
      renderRoomShell(); connectToRoom();
    } catch (error) { toast(error.message, true); button.disabled = false; }
  });
}
function searchPanel() {
  return `<section class="panel search-panel" id="find-songs"><div class="panel-header"><h2>${icon('search')} Find your next anthem</h2><small>YouTube karaoke</small></div><p class="search-description">Find a favorite song, or paste a YouTube karaoke video link below.</p>
    <div class="search-wrap">${icon('search')}<input id="song-search" type="search" autocomplete="off" placeholder="Search song, artist, or karaoke version..." aria-label="Search YouTube songs"/><button id="search-submit" class="search-button">Search</button></div>
    <div class="search-tips"><span>TRY:</span><button class="topic-chip" data-action="fill-search" data-query="OPM classics">OPM classics</button><button class="topic-chip" data-action="fill-search" data-query="90s hits">90s hits</button><button class="topic-chip" data-action="fill-search" data-query="Duet songs">Duet songs</button></div>
    <div class="search-results" id="search-results"></div>
    <form class="paste-group" id="paste-form"><span class="link-mark">${icon('link')}</span><input id="youtube-link" class="field" autocomplete="off" placeholder="Or paste a YouTube video URL here..." aria-label="Paste YouTube video link" required /><button type="submit" id="paste-button" class="btn btn-dark">${icon('plus','small')} Add</button></form>
    <p class="search-footnote">Only the host screen plays sound. Guest phones request songs and send reactions.</p></section>`;
}
function reactionPanel() {
  return `<section class="panel reaction-panel"><div class="panel-header"><h2>${icon('sparkle')} Hype the singer</h2><small>Live reactions</small></div><p>Send some love to the big screen!</p><div class="reaction-buttons">${Object.entries(reactions).map(([type, emoji]) => `<button class="react-button" data-action="react" data-type="${type}" aria-label="Send ${type} reaction">${emoji}</button>`).join('')}</div><div class="react-count" id="reaction-count">The crowd is warming up...</div></section>`;
}
function queuePanel() {
  return `<section class="panel queue-panel"><div class="panel-header"><h2>${icon('list')} Up next <span class="queue-counter" id="queue-count">0</span></h2><small id="queue-summary">The lineup</small></div><div id="queue-list" aria-live="polite"></div><div id="queue-host-controls"></div></section>`;
}
function invitePanel() {
  return `<section class="panel invite-panel"><div class="panel-header"><h2>${icon('qr')} Invite your crew</h2><small>Scan to join</small></div><p class="invite-description">Let everyone add songs and reactions using their own phone.</p>
    <div class="qr-block"><div class="qr-shell"><img src="/api/rooms/${state.code}/qr.svg" alt="QR code to join this karaoke room" width="160" height="160" /></div></div>
    <div class="invite-room-code">${state.code}</div><div class="invite-small">or enter this room code</div><button class="btn btn-dark" data-action="copy-invite">${icon('copy','small')} Copy invite link</button><div class="invite-hint" id="invite-hint">Connect phones to the same Wi-Fi for local hosting.</div></section>`;
}
function roomNavigation() {
  return `<header class="room-nav">${brand()}<div class="room-name"><span class="live-badge">LIVE</span><span class="name" id="nav-party-name">${escapeHTML(state.room.name)}</span></div><div class="room-nav-actions"><span class="online" id="online-count">${icon('users')} 1 connected</span>
    <span class="code-chip"><span>ROOM</span>${state.code}</span><button class="btn btn-dark btn-sm" data-action="copy-invite">${icon('link','small')} <span class="btn-label">Invite friends</span></button>
    <button class="btn btn-ghost btn-sm" data-action="home" title="Back to home">${icon('x','small')} <span class="btn-label">Exit</span></button></div></header>`;
}
function renderRoomShell() {
  document.title = `${state.room.name} | Chorus Karaoke`;
  const isHost = state.role === 'host';
  app.innerHTML = `<div class="site-bg"></div><div class="container room-root">${roomNavigation()}
    <main class="room-content"><div class="room-titlebar"><div><div class="room-eyebrow"><i></i>${isHost ? 'HOST DASHBOARD' : 'YOUR PARTY REMOTE'}</div><h1>${isHost ? 'Your stage is ready.' : `Hey, ${escapeHTML(state.name)}!`}</h1><p>${isHost ? 'Own the spotlight. Your friends handle the song requests.' : `You're connected to ${escapeHTML(state.room.name)}. Pick your next hit!`}</p></div>${isHost ? `<div class="guest-info"><button data-action="lock" id="lock-top">${icon('unlock','small')} Lock queue</button></div>` : `<div class="guest-info"><span class="live-badge">CONNECTED</span></div>`}</div>
    <div class="room-grid ${isHost ? '' : 'guest-grid'}"><div class="room-left">
      ${isHost ? `<section class="panel stage-panel"><div class="stage-player" id="stage-player"><div id="youtube-container"></div><div class="stage-empty" id="stage-empty"><div class="empty-mic">${icon('mic','big')}</div><h3>The stage is yours</h3><p>Queue a song, hit play, and let the good times roll.</p><button class="btn btn-primary" data-action="focus-search">${icon('plus','small')} Find your first song</button></div><div class="reactions-layer" id="reactions-layer"></div><div class="stage-error" id="stage-error"><span id="stage-error-text">Player needs a click to start.</span><div class="actions"><button data-action="retry-play" id="play-retry" class="btn btn-primary btn-sm">${icon('play','small')} Play</button><button data-action="open-youtube" id="open-youtube" class="btn btn-dark btn-sm" hidden>Open on YouTube</button></div></div></div>
        <div class="nowplaying-row"><div id="song-now" class="song-now"></div><div class="host-actions"><button class="btn btn-dark btn-circle" data-action="toggle-play" id="toggle-play" aria-label="Pause or resume" title="Pause or resume">${icon('pause')}</button><button class="btn btn-primary" data-action="play-next" id="play-next">${icon('skip','small')} Next</button><div class="volume">${icon('volume','small')}<input id="volume-control" type="range" min="0" max="100" value="82" aria-label="Volume" /></div><button class="btn btn-dark btn-circle" data-action="fullscreen" title="Fullscreen video" aria-label="Fullscreen video">${icon('expand','small')}</button></div></div></section>` : `<div class="guest-welcome"><span class="guest-icon">${icon('mic','big')}</span><div><h2>It's your turn to DJ.</h2><p>Your song requests appear instantly on the host screen.</p></div></div>`}
      ${searchPanel()}
      ${!isHost ? reactionPanel() : ''}
    </div><aside class="room-right">
      ${isHost ? invitePanel() : `<section class="panel panel-pad"><div class="panel-header"><h2>${icon('radio')} On stage now</h2><span class="live-badge">LIVE</span></div><div id="guest-current" class="guest-current empty"></div></section><section class="panel panel-pad"><div class="panel-header"><h2>${icon('link')} Invite a friend</h2></div><p class="invite-description">More friends, more hits. Share this party room.</p><button class="btn btn-dark" data-action="copy-invite">${icon('copy','small')} Copy invite link</button></section>`}
      ${queuePanel()}
      ${isHost ? reactionPanel() : ''}
    </aside></div></main></div>`;
  app.addEventListener('click', handleRoomClick);
  $('#song-search').addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(searchSongs, 450); });
  $('#song-search').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(state.searchTimer); searchSongs(); } });
  $('#search-submit').addEventListener('click', () => { clearTimeout(state.searchTimer); searchSongs(); });
  $('#paste-form').addEventListener('submit', addPastedSong);
  if (isHost) {
    $('#volume-control').addEventListener('input', event => { try { state.player?.setVolume(Number(event.target.value)); } catch (_) { /* Not ready yet. */ } });
    ensurePlayer();
  }
  renderState();
  renderSearchPlaceholder();
  fetch(`/api/rooms/${state.code}/invite`).then(r => r.json()).then(data => {
    state.inviteUrl = data.url;
    const hint = $('#invite-hint');
    if (hint) hint.textContent = data.url + '  |  Scan this QR to join';
  }).catch(() => {});
}
function renderSearchPlaceholder() {
  const target = $('#search-results');
  if (!target) return;
  if (state.config.searchEnabled) {
    target.innerHTML = `<div class="search-placeholder">${icon('music','big')}<strong>The perfect song is one search away</strong>Try an artist, song title, or your favorite throwback.</div>`;
  } else {
    target.innerHTML = `<div class="search-placeholder">${icon('youtube','big')}<strong>Paste any YouTube karaoke link</strong>To search inside Chorus, configure a YouTube Data API key. Until then, <a class="text-link" href="https://www.youtube.com/results?search_query=karaoke+songs" target="_blank" rel="noopener noreferrer">find karaoke songs on YouTube ${icon('external','small')}</a> and paste their links below.</div>`;
  }
}
async function searchSongs() {
  const target = $('#search-results');
  const query = $('#song-search').value.trim();
  const seq = ++state.searchSequence;
  if (!query) { renderSearchPlaceholder(); return; }
  if (!state.config.searchEnabled) {
    const link = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' karaoke')}`;
    target.innerHTML = `<div class="search-placeholder"><strong>Search on YouTube, then paste the link here.</strong><a href="${link}" class="btn btn-primary btn-sm" target="_blank" rel="noopener noreferrer">${icon('youtube','small')} Find "${escapeHTML(query)}" on YouTube ${icon('external','small')}</a></div>`;
    return;
  }
  if (query.length < 2) return;
  target.innerHTML = `<div class="search-placeholder"><span class="spinner" style="display:inline-block"></span><strong style="margin-top:9px">Finding your next hit...</strong></div>`;
  try {
    const { results } = await request(`/api/search?q=${encodeURIComponent(query)}`);
    if (seq !== state.searchSequence) return;
    state.songsById = new Map(results.map(item => [item.videoId, item]));
    target.innerHTML = results.length ? results.map(song => `<article class="search-entry"><img src="${song.thumbnail}" alt="" loading="lazy"/><div class="entry-copy"><strong>${escapeHTML(song.title)}</strong><small>${escapeHTML(song.channel)}</small></div><button class="btn btn-primary" data-action="add-result" data-video="${song.videoId}" aria-label="Add ${escapeHTML(song.title)} to queue">${icon('plus','small')} Add</button></article>`).join('') : `<div class="search-placeholder"><strong>No songs found</strong>Try a different artist or title.</div>`;
  } catch (error) {
    if (seq !== state.searchSequence) return;
    target.innerHTML = `<div class="search-placeholder"><strong>Search isn't available right now</strong>${escapeHTML(error.message)}<br/>You can still paste a YouTube URL below.</div>`;
  }
}
async function addSong(video) {
  await roomRequest('queue', { body: video });
  toast("Song added! You're on the list.");
}
async function addPastedSong(event) {
  event.preventDefault();
  const input = $('#youtube-link'); const button = $('#paste-button');
  const url = input.value.trim();
  if (!url) return;
  button.disabled = true; button.innerHTML = `<span class="spinner"></span>`;
  try {
    const info = await request(`/api/resolve?url=${encodeURIComponent(url)}`);
    await addSong(info);
    input.value = '';
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.innerHTML = `${icon('plus','small')} Add`; }
}
function renderQueue() {
  const room = state.room;
  $('#queue-count').textContent = room.queue.length;
  $('#queue-summary').textContent = room.locked ? 'Requests paused' : `${room.queue.length} queued`;
  const target = $('#queue-list');
  if (!room.queue.length) {
    target.innerHTML = `<div class="queue-empty">${icon('list','big')}<strong>It's quiet in here...</strong>Queue the first track and get the party started!</div>`;
  } else {
    target.innerHTML = room.queue.map((song, index) => {
      const own = state.role === 'host' || (state.role === 'guest' && song.addedById === state.guestId);
      return `<div class="queue-row"><span class="queue-position">${index + 1}</span><img class="queue-thumb" src="${song.thumbnail}" alt="" loading="lazy"/><div class="queue-text"><strong title="${escapeHTML(song.title)}">${escapeHTML(song.title)}</strong><small>${icon('mic','small')} ${escapeHTML(song.addedBy)}</small></div><div class="queue-tools">${state.role === 'host' ? `<button data-action="move-up" data-id="${song.id}" title="Move song up" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>${icon('up','small')}</button><button data-action="move-down" data-id="${song.id}" title="Move song down" aria-label="Move down" ${index === room.queue.length - 1 ? 'disabled' : ''}>${icon('down','small')}</button>` : ''}${own ? `<button class="danger" data-action="remove-song" data-id="${song.id}" title="Remove song" aria-label="Remove song">${icon('x','small')}</button>` : ''}</div></div>`;
    }).join('');
  }
  $('#queue-host-controls').innerHTML = state.role === 'host' ? `<div class="queue-lockline"><span>${icon(room.locked ? 'lock' : 'unlock')} ${room.locked ? 'New requests paused' : 'Guests can add songs'}</span><button class="btn btn-ghost btn-sm" data-action="lock">${icon(room.locked ? 'unlock' : 'lock', 'small')} ${room.locked ? 'Unlock' : 'Lock'}</button></div>` : `<p class="queue-hint">You can remove your own requests before they play. The host controls the order.</p>`;
  if (state.role === 'host' && $('#lock-top')) $('#lock-top').innerHTML = `${icon(room.locked ? 'lock' : 'unlock','small')} ${room.locked ? 'Unlock queue' : 'Lock queue'}`;
  const searchButton = $('#paste-button');
  if (searchButton) searchButton.disabled = room.locked && state.role !== 'host';
  if (room.locked && state.role !== 'host' && !$('#request-locked')) {
    $('#find-songs').insertAdjacentHTML('afterbegin', `<div id="request-locked" class="flag" style="margin-bottom:11px">${icon('lock','small')} The host has paused new requests</div>`);
  } else if (!room.locked) $('#request-locked')?.remove();
}
function renderCurrent() {
  const room = state.room;
  if (state.role === 'guest') {
    const target = $('#guest-current');
    if (room.current) {
      target.classList.remove('empty');
      target.innerHTML = `<img src="${room.current.thumbnail}" alt=""/><div><span class="eyebrow">${room.paused ? 'PAUSED' : 'NOW PLAYING'}</span><strong>${escapeHTML(room.current.title)}</strong><small>Sing it, ${escapeHTML(room.current.addedBy)}!</small></div>`;
    } else { target.classList.add('empty'); target.innerHTML = `${icon('mic','big')} Waiting for the host to start a song.`; }
    return;
  }
  const container = $('#stage-player'); const empty = $('#stage-empty');
  const now = $('#song-now'); const next = $('#play-next'); const toggle = $('#toggle-play');
  if (room.current) {
    container.classList.add('active'); empty.hidden = true; empty.style.display = 'none';
    now.innerHTML = `<img class="playing-art" src="${room.current.thumbnail}" alt=""/><div class="meta"><span class="eyebrow">${room.paused ? 'PAUSED' : 'NOW PLAYING'}</span><h2>${escapeHTML(room.current.title)}</h2><p>${icon('mic','small')} Up on stage: ${escapeHTML(room.current.addedBy)}</p></div>`;
  } else {
    container.classList.remove('active'); empty.hidden = false; empty.style.display = 'flex';
    empty.querySelector('h3').textContent = room.queue.length ? 'The first song is ready' : 'The stage is yours';
    empty.querySelector('p').textContent = room.queue.length ? 'Hit Start queue below to begin your karaoke party.' : 'Queue a song, hit play, and let the good times roll.';
    empty.querySelector('button').innerHTML = room.queue.length ? `${icon('play','small')} Start first song` : `${icon('plus','small')} Find your first song`;
    empty.querySelector('button').dataset.action = room.queue.length ? 'play-next' : 'focus-search';
    now.innerHTML = `<div class="meta"><span class="eyebrow">STAGE STATUS</span><h2>${room.queue.length ? 'Ready for the first song' : 'Waiting for requests'}</h2><p>Pick a karaoke song to start singing.</p></div>`;
  }
  const canNext = Boolean(room.current || room.queue.length);
  next.disabled = !canNext;
  next.innerHTML = `${icon(room.current ? 'skip' : 'play','small')} ${room.current ? 'Next' : 'Start queue'}`;
  toggle.disabled = !room.current;
  toggle.innerHTML = icon(room.paused ? 'play' : 'pause');
  toggle.setAttribute('aria-label', room.paused ? 'Resume playback' : 'Pause playback');
  syncPlayer();
}
function renderState() {
  if (!state.room || !$('#queue-list')) return;
  $('#online-count').innerHTML = `${icon('users')} ${state.room.online} connected`;
  renderQueue(); renderCurrent();
  $('#reaction-count').textContent = `${state.room.reactions || 0} cheers sent to the big screen`;
}
function connectToRoom() {
  state.stream?.close();
  const stream = new EventSource(`/api/rooms/${state.code}/events`);
  state.stream = stream;
  stream.addEventListener('state', event => {
    state.room = JSON.parse(event.data);
    renderState();
  });
  stream.addEventListener('reaction', event => {
    const reaction = JSON.parse(event.data);
    if (state.role === 'host') launchEmoji(reaction.type);
  });
  stream.addEventListener('expired', () => { stream.close(); toast('This party room has expired.', true); setTimeout(() => location.assign('/'), 1400); });
  stream.addEventListener('error', () => { /* EventSource reconnects itself after network changes. */ });
}
function launchEmoji(type) {
  const layer = $('#reactions-layer');
  if (!layer) return;
  const element = document.createElement('span');
  element.className = 'flying-emoji';
  element.textContent = reactions[type] || reactions.heart;
  element.style.left = `${10 + Math.random() * 77}%`;
  element.style.animationDuration = `${2.5 + Math.random() * 1.5}s`;
  layer.appendChild(element);
  setTimeout(() => element.remove(), 4600);
}
function playerMessage(text, error = false) {
  const bar = $('#stage-error'); if (!bar) return;
  const label = $('#stage-error-text'); label.textContent = text;
  bar.classList.add('visible');
  $('#play-retry').hidden = error;
  $('#open-youtube').hidden = !error;
}
function hidePlayerMessage() { $('#stage-error')?.classList.remove('visible'); }
let ytPromise = null;
function ensurePlayer() {
  if (state.role !== 'host' || state.player) return;
  if (!ytPromise) {
    ytPromise = new Promise((resolve, reject) => {
      if (window.YT?.Player) return resolve(window.YT);
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => reject(new Error('Could not load the YouTube player. Check your internet connection.'));
      document.head.appendChild(script);
      setTimeout(() => { if (!window.YT?.Player) reject(new Error('The YouTube player did not respond.')); }, 14000);
    });
  }
  ytPromise.then(YT => {
    if (!$('#youtube-container') || state.player) return;
    state.player = new YT.Player('youtube-container', {
      width: '100%', height: '100%',
      playerVars: { autoplay: 0, controls: 1, rel: 0, playsinline: 1, origin: location.origin },
      events: {
        onReady(event) {
          state.playerReady = true;
          event.target.setVolume(Number($('#volume-control')?.value || 82));
          syncPlayer();
        },
        onStateChange(event) {
          if (event.data === YT.PlayerState.ENDED && state.room?.current) {
            roomRequest('playback/ended', { body: { songId: state.room.current.id } }).catch(error => toast(error.message, true));
          }
          if (event.data === YT.PlayerState.PLAYING) hidePlayerMessage();
        },
        onError(event) {
          const code = event.data;
          playerMessage(`YouTube couldn't embed this video (error ${code}). Skip it or open it on YouTube.`, true);
        },
        onAutoplayBlocked() { playerMessage('Your browser needs one click to play the karaoke video.'); }
      }
    });
  }).catch(error => playerMessage(error.message, true));
}
function syncPlayer() {
  if (state.role !== 'host' || !state.playerReady || !state.player || !state.room) return;
  const current = state.room.current;
  if (!current) {
    if (state.playerSongId) { try { state.player.stopVideo(); } catch (_) {} }
    state.playerSongId = null;
    hidePlayerMessage();
    return;
  }
  if (current.id !== state.playerSongId) {
    state.playerSongId = current.id;
    hidePlayerMessage();
    try { state.player.loadVideoById(current.videoId); if (state.room.paused) state.player.pauseVideo(); }
    catch (error) { playerMessage('Press play to begin the karaoke video.'); }
  } else {
    try {
      const status = state.player.getPlayerState();
      if (state.room.paused && status === 1) state.player.pauseVideo();
      else if (!state.room.paused && (status === 2 || status === 5)) state.player.playVideo();
    } catch (_) { /* The player may still be loading. */ }
  }
}
async function handleRoomClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'focus-search') return $('#song-search')?.focus();
    if (action === 'home') return location.assign('/');
    if (action === 'copy-invite') { await clipboardCopy(state.inviteUrl || `${location.origin}/room/${state.code}?join=1`); toast('Invite link ready to share!'); return; }
    if (action === 'fill-search') { $('#song-search').value = button.dataset.query; searchSongs(); $('#song-search').focus(); return; }
    if (action === 'add-result') {
      const song = state.songsById.get(button.dataset.video);
      if (!song) return;
      button.disabled = true;
      try { await addSong(song); } finally { button.disabled = false; }
      return;
    }
    if (action === 'remove-song') return await roomRequest(`queue/${button.dataset.id}`, { method: 'DELETE' });
    if (action === 'move-up' || action === 'move-down') return await roomRequest(`queue/${button.dataset.id}/move`, { body: { direction: action === 'move-up' ? -1 : 1 } });
    if (action === 'play-next') return await roomRequest('playback/next', { body: {} });
    if (action === 'toggle-play') return await roomRequest('playback/toggle', { body: {} });
    if (action === 'lock') { await roomRequest('lock', { body: {} }); return toast(state.room.locked ? 'Queue settings updated.' : 'Queue settings updated.'); }
    if (action === 'react') { await roomRequest('reactions', { body: { type: button.dataset.type } }); return; }
    if (action === 'retry-play') { state.player?.playVideo(); hidePlayerMessage(); return; }
    if (action === 'open-youtube') { if (state.room.current) window.open(`https://www.youtube.com/watch?v=${state.room.current.videoId}`, '_blank', 'noopener,noreferrer'); return; }
    if (action === 'fullscreen') {
      const stage = $('#stage-player');
      if (stage?.requestFullscreen) return await stage.requestFullscreen();
      return toast('Fullscreen is not available on this browser.', true);
    }
  } catch (error) { toast(error.message, true); }
}
async function openRoom(code) {
  app.innerHTML = `<div class="loading-page"><span class="spinner"></span> Preparing your karaoke room...</div>`;
  try {
    const response = await Promise.all([request(`/api/rooms/${code}`), request('/api/config')]);
    state.code = code;
    state.room = response[0].room;
    state.config = response[1];
    const hostToken = localStorage.getItem(`${storagePrefix}host:${code}`);
    if (hostToken) {
      try {
        await request(`/api/rooms/${code}/identity`, { method: 'POST', headers: { 'x-host-token': hostToken }, body: {} });
        state.role = 'host'; state.hostToken = hostToken; state.name = 'Host';
      } catch (_) { localStorage.removeItem(`${storagePrefix}host:${code}`); }
    }
    if (!state.role) {
      try {
        const saved = JSON.parse(localStorage.getItem(`${storagePrefix}guest:${code}`) || 'null');
        if (saved?.guestToken) {
          const data = await request(`/api/rooms/${code}/identity`, { method: 'POST', headers: { 'x-guest-token': saved.guestToken }, body: {} });
          state.role = 'guest'; state.guestId = saved.guestId; state.guestToken = saved.guestToken; state.name = data.name;
        }
      } catch (_) { localStorage.removeItem(`${storagePrefix}guest:${code}`); }
    }
    if (!state.role) renderJoin(state.room);
    else { renderRoomShell(); connectToRoom(); }
  } catch (error) {
    app.innerHTML = `<div class="container join-page"><header class="topnav">${brand()}</header><main class="join-main"><div class="join-card"><div class="join-spotlight">${icon('x','big')}</div><h1>We couldn't find that room.</h1><p>${escapeHTML(error.message)} Check the six-character room code, or create a new party.</p><a class="btn btn-primary" href="/">Back to homepage ${icon('arrow')}</a></div></main></div>`;
  }
}
const roomMatch = location.pathname.match(/^\/room\/([A-Z2-9]{6})\/?$/i);
if (roomMatch) {
  // Load the remote song-browser enhancement before creating the room interface.
  const songBrowser = document.createElement('script');
  songBrowser.src = '/chorus-search-v2.js?v=1.1.0';
  songBrowser.onload = () => openRoom(roomMatch[1].toUpperCase());
  songBrowser.onerror = () => openRoom(roomMatch[1].toUpperCase());
  document.head.appendChild(songBrowser);
} else home();
